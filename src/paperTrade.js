// 페이퍼트레이딩 실시간 루프
// - 주기적으로 HTX에서 최근 캔들 폴링
// - 지정 전략의 시그널 평가 → 가상 포지션/잔고 갱신
// - 체결 로그, PnL, 현재 포지션을 state.json / trades.log 에 기록
// - dryRun 모드: 실제 주문 안 나감. 실거래 승격 시 htxTrader.marketOrder 호출만 교체.
//
// 실행: node src/paperTrade.js btcusdt 60min ma
//   symbol: btcusdt / ethusdt 등
//   period: 1min/5min/15min/30min/60min/4hour/1day
//   strategy: ma | rsi | bb | vb
//
// 종료: Ctrl+C (state는 파일에 지속 저장되므로 재시작 시 이어짐)

const fs = require('fs');
const path = require('path');
const S = require('./strategies');

const FEE = 0.002;
const SLIP = 0.0005;
const STOP = -0.03;
const INITIAL = 1_000_000;

const STRATEGY_MAP = {
  ma:  { name: 'MA Cross (20/60)',     fn: c => S.maCross(c) },
  rsi: { name: 'RSI 역추세',           fn: c => S.rsiReversal(c) },
  bb:  { name: '볼린저밴드 스퀴즈',    fn: c => S.bbSqueeze(c) },
  vb:  { name: '변동성 돌파 (k=0.5)',  fn: c => S.volatilityBreakout(c) },
  // 1min 튜닝 버전
  rsif: { name: 'RSI-fast (1min)',     fn: c => S.rsiReversalFast(c) },
  bbf:  { name: 'BB-fast (1min)',      fn: c => S.bbSqueezeFast(c) },
  vbf:  { name: 'Volatility-fast (1min)', fn: c => S.volatilityBreakoutFast(c) },
};

const PERIOD_MS = {
  '1min': 60_000, '5min': 300_000, '15min': 900_000, '30min': 1_800_000,
  '60min': 3_600_000, '4hour': 14_400_000, '1day': 86_400_000,
};

function stateFile(symbol, period, strat) {
  return path.join(__dirname, '..', 'data', `paper_${symbol}_${period}_${strat}.json`);
}
function logFile(symbol, period, strat) {
  return path.join(__dirname, '..', 'data', `paper_${symbol}_${period}_${strat}.log`);
}

function loadState(file) {
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  return { cash: INITIAL, coin: 0, entry: 0, lastTs: 0, trades: [], equityHistory: [] };
}
function saveState(file, state) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(state, null, 2));
}
function appendLog(file, line) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, line + '\n');
}

async function fetchRecent(symbol, period, size = 300) {
  const { fetchKlines } = require('./fetchData');
  return fetchKlines(symbol, period, size);
}

function step(state, candles, strategyFn, logger) {
  const sigs = strategyFn(candles);
  const last = candles.length - 1;
  const lastCandle = candles[last];
  if (lastCandle.ts <= state.lastTs) return; // 새 봉 없음
  const px = lastCandle.close;

  // 손절 체크
  if (state.coin > 0) {
    const ret = (px - state.entry) / state.entry;
    if (ret <= STOP) {
      const proceeds = state.coin * px * (1 - FEE - SLIP);
      state.trades.push({ ts: lastCandle.ts, side: 'sell', px, reason: 'stop', ret });
      logger(`[STOP] ${new Date(lastCandle.ts).toISOString()} sell @${px} ret=${(ret*100).toFixed(2)}%`);
      state.cash += proceeds; state.coin = 0; state.entry = 0;
    }
  }

  const sig = sigs[last];
  if (sig === 1 && state.coin === 0) {
    const buyPx = px * (1 + SLIP);
    state.coin = (state.cash * (1 - FEE)) / buyPx;
    state.entry = buyPx;
    const spent = state.cash;
    state.cash = 0;
    state.trades.push({ ts: lastCandle.ts, side: 'buy', px: buyPx, spent });
    logger(`[BUY ] ${new Date(lastCandle.ts).toISOString()} @${buyPx.toFixed(2)} size=${state.coin.toFixed(6)}`);
  } else if (sig === -1 && state.coin > 0) {
    const proceeds = state.coin * px * (1 - FEE - SLIP);
    const ret = (px - state.entry) / state.entry;
    state.trades.push({ ts: lastCandle.ts, side: 'sell', px, reason: 'signal', ret });
    logger(`[SELL] ${new Date(lastCandle.ts).toISOString()} @${px} ret=${(ret*100).toFixed(2)}%`);
    state.cash += proceeds; state.coin = 0; state.entry = 0;
  }

  state.lastTs = lastCandle.ts;
  const equity = state.cash + state.coin * px;
  state.equityHistory.push({ ts: lastCandle.ts, equity, price: px });
  // 히스토리 과다 방지
  if (state.equityHistory.length > 5000) state.equityHistory = state.equityHistory.slice(-3000);
}

function summary(state, currentPx) {
  const equity = state.cash + state.coin * currentPx;
  const ret = ((equity / INITIAL - 1) * 100).toFixed(2);
  const wins = state.trades.filter(t => t.ret > 0).length;
  const losses = state.trades.filter(t => t.ret != null && t.ret <= 0).length;
  const positionStr = state.coin > 0
    ? `LONG ${state.coin.toFixed(6)} @${state.entry.toFixed(2)} (unrlz ${(((currentPx-state.entry)/state.entry)*100).toFixed(2)}%)`
    : 'FLAT';
  return `equity=${equity.toFixed(0)} (${ret}%) | pos=${positionStr} | trades=${state.trades.length} W/L=${wins}/${losses}`;
}

async function main() {
  const symbol = process.argv[2] || 'btcusdt';
  const period = process.argv[3] || '60min';
  const stratKey = process.argv[4] || 'ma';
  const strat = STRATEGY_MAP[stratKey];
  if (!strat) { console.error(`unknown strategy: ${stratKey}`); process.exit(1); }
  const intervalMs = PERIOD_MS[period] || 60_000;
  // 폴링 주기: 캔들 주기의 1/5, 최소 10초, 최대 5분
  const pollMs = Math.max(10_000, Math.min(300_000, Math.floor(intervalMs / 5)));

  const sfile = stateFile(symbol, period, stratKey);
  const lfile = logFile(symbol, period, stratKey);
  const state = loadState(sfile);
  const logger = (msg) => { console.log(msg); appendLog(lfile, msg); };

  logger(`\n▶ paper-trade start · ${symbol} ${period} ${strat.name} · poll every ${pollMs/1000}s`);
  logger(`  state file: ${sfile}`);
  logger(`  resumed: equity=${(state.cash + state.coin * (state.equityHistory.at(-1)?.price ?? 0)).toFixed(0)} lastTs=${state.lastTs ? new Date(state.lastTs).toISOString() : 'none'}`);

  // ─── jarvis 연동 (텔레그램 알림 + 시장 데이터) ──────────
  let jarvis = null;
  try {
    jarvis = require('./jarvis');
    logger('[jarvis] 모듈 로드 성공 — 텔레그램 알림 + 시장 모니터링 활성');
  } catch (e) {
    logger('[jarvis] 모듈 없음 — 알림 없이 진행');
  }
  let _lastMonitorCheck = 0;
  const MONITOR_INTERVAL = 300_000; // 5분

  const tick = async () => {
    try {
      const candles = await fetchRecent(symbol, period, 300);
      const prevCoin = state.coin;
      step(state, candles, strat.fn, logger);
      saveState(sfile, state);
      const px = candles.at(-1).close;
      console.log(`  · ${new Date().toISOString()} px=${px}  ${summary(state, px)}`);

      // ─── jarvis 연동: 매매 발생 시 텔레그램 알림 ───────
      if (jarvis) {
        // 매매 시그널 발생 시 알림
        if (prevCoin === 0 && state.coin > 0) {
          await jarvis.telegram.notifyTrade({
            action: 'BUY', symbol, price: state.entry,
            strategy: strat.name, reason: `paper-trade (${period})`,
          });
        } else if (prevCoin > 0 && state.coin === 0) {
          const lastTrade = state.trades.at(-1);
          await jarvis.telegram.notifyTrade({
            action: 'SELL', symbol, price: px,
            strategy: strat.name,
            reason: `${lastTrade?.reason || 'signal'} | 수익: ${((lastTrade?.ret || 0) * 100).toFixed(2)}%`,
          });
        }

        // 5분마다 시장 모니터링 체크
        if (Date.now() - _lastMonitorCheck > MONITOR_INTERVAL) {
          _lastMonitorCheck = Date.now();
          jarvis.monitor.checkAll().catch(e =>
            console.warn('[jarvis] 모니터 체크 실패:', e.message)
          );
        }
      }
    } catch (e) {
      logger(`[ERR] ${new Date().toISOString()} ${e.message}`);
    }
  };

  await tick();
  const timer = setInterval(tick, pollMs);
  process.on('SIGINT', () => {
    clearInterval(timer);
    logger(`\n▶ stopped. final state saved to ${sfile}`);
    process.exit(0);
  });
}

if (require.main === module) main();
module.exports = { step, loadState, saveState };
