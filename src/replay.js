// 리플레이 모드
// - 과거 캔들 N개를 가져와 "마치 실시간으로 들어오는 것처럼" 한 봉씩 state 파일에 주입
// - 4개 전략을 동시에 진행 → compareDashboard 가 실시간으로 채워지는 걸 눈으로 확인
// - paperTrade.js 의 step() 을 그대로 재사용 → 체결 로직 100% 동일
//
// 사용법:
//   node src/replay.js [symbol] [period] [bars] [speedMs]
//   예: node src/replay.js btcusdt 1min 500 50
//       (500봉을 50ms 간격으로 재생 → 25초면 끝)
//
// 실행 전: compareDashboard 를 다른 터미널에 먼저 띄워두세요
//   node src/compareDashboard.js btcusdt 1min 8790

const fs = require('fs');
const path = require('path');
const { step, loadState, saveState } = require('./paperTrade');
const S = require('./strategies');

const symbol  = process.argv[2] || 'btcusdt';
const period  = process.argv[3] || '1min';
const BARS    = parseInt(process.argv[4] || '500', 10);
const SPEED   = parseInt(process.argv[5] || '50', 10);
// --fast 또는 STRATS=ma,rsif,bbf,vbf 환경변수로 선택
const fastMode = process.argv.includes('--fast');

const STRAT_POOL = {
  ma:   { name: 'MA Cross',        fn: c => S.maCross(c) },
  rsi:  { name: 'RSI 역추세',      fn: c => S.rsiReversal(c) },
  bb:   { name: 'BB Squeeze',      fn: c => S.bbSqueeze(c) },
  vb:   { name: 'Volatility BO',   fn: c => S.volatilityBreakout(c) },
  rsif: { name: 'RSI-fast',        fn: c => S.rsiReversalFast(c) },
  bbf:  { name: 'BB-fast',         fn: c => S.bbSqueezeFast(c) },
  vbf:  { name: 'Volatility-fast', fn: c => S.volatilityBreakoutFast(c) },
};
const keys = process.env.STRATS
  ? process.env.STRATS.split(',').map(k => k.trim())
  : (fastMode ? ['ma', 'rsif', 'bbf', 'vbf'] : ['ma', 'rsi', 'bb', 'vb']);
const STRATS = keys.filter(k => STRAT_POOL[k]).map(k => ({ key: k, ...STRAT_POOL[k] }));

function stateFile(k) { return path.join(__dirname, '..', 'data', `paper_${symbol}_${period}_${k}.json`); }
function logFile(k)   { return path.join(__dirname, '..', 'data', `paper_${symbol}_${period}_${k}.log`); }

function resetState(file, logPath) {
  const fresh = { cash: 1_000_000, coin: 0, entry: 0, lastTs: 0, trades: [], equityHistory: [] };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(fresh, null, 2));
  fs.writeFileSync(logPath, `# replay started ${new Date().toISOString()}\n`);
  return fresh;
}

async function fetchHistory() {
  try {
    const { fetchKlines } = require('./fetchData');
    const candles = await fetchKlines(symbol, period, BARS);
    console.log(`  ✓ HTX에서 ${candles.length}봉 수신`);
    return candles;
  } catch (e) {
    console.log(`  ⚠ HTX 실패 (${e.message}) → 랜덤워크 합성 데이터로 진행`);
    const rows = [];
    let p = 70000;
    const now = Date.now();
    for (let i = BARS - 1; i >= 0; i--) {
      const drift = (Math.random() - 0.48) * 0.004 + Math.sin(i / 20) * 0.002;
      p = p * (1 + drift);
      rows.push({
        ts: now - i * 60_000,
        open: p * (1 - 0.0005),
        high: p * (1 + 0.002),
        low:  p * (1 - 0.002),
        close: p,
        volume: 100 + Math.random() * 50,
      });
    }
    return rows;
  }
}

async function main() {
  console.log(`\n▶ replay · ${symbol} ${period} · ${BARS}봉 · speed=${SPEED}ms/bar`);
  const all = await fetchHistory();
  if (all.length < 70) {
    console.error('데이터 부족 (최소 70봉 필요)'); process.exit(1);
  }

  // 4전략 state 초기화
  const states = {};
  const loggers = {};
  for (const s of STRATS) {
    const sf = stateFile(s.key), lf = logFile(s.key);
    states[s.key] = resetState(sf, lf);
    loggers[s.key] = (msg) => fs.appendFileSync(lf, msg + '\n');
    loggers[s.key](`[REPLAY] ${s.name} reset`);
  }

  // 워밍업: 첫 60봉은 상태만 먼저 축적 (step은 계산에 충분한 과거 필요)
  const WARM = 60;
  console.log(`  워밍업 ${WARM}봉...`);

  let i = WARM;
  const timer = setInterval(() => {
    if (i >= all.length) {
      clearInterval(timer);
      console.log(`\n▶ replay 완료 · ${BARS - WARM}봉 처리됨`);
      for (const s of STRATS) {
        const st = states[s.key];
        const lastPx = all[all.length - 1].close;
        const equity = st.cash + st.coin * lastPx;
        const ret = ((equity / 1_000_000 - 1) * 100).toFixed(2);
        console.log(`  ${s.name.padEnd(16)} equity=₩${equity.toFixed(0).padStart(10)} (${ret}%) trades=${st.trades.length}`);
      }
      process.exit(0);
    }
    const window = all.slice(0, i + 1);
    for (const s of STRATS) {
      step(states[s.key], window, s.fn, loggers[s.key]);
      saveState(stateFile(s.key), states[s.key]);
    }
    if (i % 20 === 0) process.stdout.write(`\r  진행 ${i - WARM}/${BARS - WARM}  `);
    i++;
  }, SPEED);

  process.on('SIGINT', () => { clearInterval(timer); console.log('\n중단됨'); process.exit(0); });
}

main();
