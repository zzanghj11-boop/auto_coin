// 리스크 관리 고도화 백테스트
// 기존 backtest.js와 동일한 전략들을 사용하되, 리스크 엔진 on/off 비교.
//
// 리스크 엔진 = (ATR 동적 손절) + (켈리 포지션 사이징) + (서킷브레이커)
//
// 실행: node src/backtestRisk.js btcusdt 60min

const fs = require('fs');
const path = require('path');
const S = require('./strategies');
const { ensembleSignals } = require('./ensemble');
const { runBacktest, metrics } = require('./backtest');
const { atr, rollingKelly, atrStops, CircuitBreaker } = require('./risk');

const FEE = 0.002;
const SLIP = 0.0005;
const INITIAL = 1_000_000;

function runRiskBacktest(candles, signals, opts = {}) {
  const {
    atrPeriod = 14,
    atrStopMult = 2,
    atrTargetMult = 3,
    useKelly = true,
    useCircuitBreaker = true,
    kellyCap = 0.25,
    kellyFraction = 0.5,
    fallbackPct = 0.20, // 초기(거래 이력 없을 때)에는 20% 투입
  } = opts;

  const atrArr = atr(candles, atrPeriod);
  const cb = new CircuitBreaker({ dailyLossLimit: 0.05, lookbackBars: 24 });

  let cash = INITIAL, coin = 0, entry = 0, stop = 0, target = 0, entryATR = 0;
  const trades = [];
  const equityCurve = [];
  let tripCount = 0;

  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const px = c.close;

    // 포지션 보유 중: 당봉 high/low에서 스톱·타겟 체크 (우선순위: 스톱)
    if (coin > 0) {
      let exitPx = null, reason = '';
      if (c.low <= stop) { exitPx = stop; reason = 'atr-stop'; }
      else if (c.high >= target) { exitPx = target; reason = 'atr-target'; }
      if (exitPx != null) {
        const proceeds = coin * exitPx * (1 - FEE - SLIP);
        const ret = (exitPx - entry) / entry;
        trades.push({ entry, exit: exitPx, ret, reason });
        cash += proceeds; coin = 0; entry = 0; stop = 0; target = 0;
      }
    }

    // 서킷브레이커 업데이트 (진입 차단 목적)
    const equityNow = cash + coin * px;
    const blocked = useCircuitBreaker && cb.update(c.ts, equityNow);
    if (blocked && coin === 0) { // 트립 중이면 진입 금지
      equityCurve.push(equityNow);
      continue;
    }

    // 시그널 처리
    const sig = signals[i];
    if (sig === 1 && coin === 0 && !isNaN(atrArr[i])) {
      // 포지션 사이즈: 켈리 or 폴백
      let fraction = fallbackPct;
      if (useKelly) {
        const k = rollingKelly(trades, { window: 30, cap: kellyCap, fraction: kellyFraction });
        if (k > 0) fraction = k;
      }
      const capital = cash * fraction;
      if (capital < 1) { equityCurve.push(equityNow); continue; } // 자본 부족
      const buyPx = px * (1 + SLIP);
      const size = (capital * (1 - FEE)) / buyPx;
      coin = size;
      entry = buyPx;
      entryATR = atrArr[i];
      const st = atrStops(entry, entryATR, { stopMult: atrStopMult, targetMult: atrTargetMult });
      stop = st.stop; target = st.target;
      cash -= capital;
    } else if (sig === -1 && coin > 0) {
      const proceeds = coin * px * (1 - FEE - SLIP);
      const ret = (px - entry) / entry;
      trades.push({ entry, exit: px, ret, reason: 'signal' });
      cash += proceeds; coin = 0; entry = 0; stop = 0; target = 0;
    }

    equityCurve.push(cash + coin * px);
    if (cb.tripped && cb.trippedAt === c.ts) tripCount++;
  }

  // 강제 청산
  if (coin > 0) {
    const px = candles.at(-1).close;
    const proceeds = coin * px * (1 - FEE - SLIP);
    trades.push({ entry, exit: px, ret: (px - entry) / entry, reason: 'final' });
    cash += proceeds; coin = 0;
  }
  return { finalEquity: cash, equityCurve, trades, tripCount };
}

function compare(candles, label) {
  const signals = ensembleSignals(candles, { threshold: 1 }).sig;
  const baseline = runBacktest(candles, signals);
  const risked = runRiskBacktest(candles, signals);
  const bm = metrics(INITIAL, baseline);
  const rm = metrics(INITIAL, risked);
  return {
    dataset: label,
    baseRet: bm.totalReturn, baseMDD: bm.mdd, baseTrades: bm.trades,
    riskRet: rm.totalReturn, riskMDD: rm.mdd, riskTrades: rm.trades,
    trips: risked.tripCount,
  };
}

function main() {
  const symbol = process.argv[2] || 'btcusdt';
  const period = process.argv[3] || '60min';
  const f = path.join(__dirname, '..', 'data', `${symbol}_${period}.json`);
  let candles;
  if (fs.existsSync(f)) candles = JSON.parse(fs.readFileSync(f, 'utf8'));
  else {
    console.log('⚠️  실데이터 없음 — 랜덤워크 2000봉 샘플');
    candles = []; let p = 50000;
    for (let i = 0; i < 2000; i++) {
      const vol = 0.015 + 0.01 * Math.sin(i / 80); // 변동성 주기적 변화
      const o = p, h = p * (1 + Math.random() * vol), l = p * (1 - Math.random() * vol);
      const c = p * (1 + (Math.random() - 0.49) * vol * 1.3);
      candles.push({ ts: Date.UTC(2026, 0, 1) + i * 3600e3, open: o, high: h, low: l, close: c, volume: 1 });
      p = c;
    }
  }

  console.log(`\n=== ${symbol.toUpperCase()} / ${period} / ${candles.length} candles ===\n`);

  // 전략별 리스크 on/off 비교
  const rows = [];
  const bases = {
    'MA':  S.maCross(candles),
    'RSI': S.rsiReversal(candles),
    'BB':  S.bbSqueeze(candles),
    'VB':  S.volatilityBreakout(candles),
    'ENS': ensembleSignals(candles, { threshold: 1 }).sig,
  };
  for (const [name, sig] of Object.entries(bases)) {
    const base = runBacktest(candles, sig);
    const risked = runRiskBacktest(candles, sig);
    const bm = metrics(INITIAL, base);
    const rm = metrics(INITIAL, risked);
    rows.push({
      strategy: name,
      'base ret': bm.totalReturn, 'base mdd': bm.mdd, 'base #': bm.trades,
      'risk ret': rm.totalReturn, 'risk mdd': rm.mdd, 'risk #': rm.trades,
      'CB trips': risked.tripCount,
    });
  }
  console.table(rows);

  // 평균 MDD 개선폭
  const parse = s => parseFloat(String(s).replace('%', ''));
  const avgBase = rows.reduce((a, r) => a + Math.abs(parse(r['base mdd'])), 0) / rows.length;
  const avgRisk = rows.reduce((a, r) => a + Math.abs(parse(r['risk mdd'])), 0) / rows.length;
  console.log(`\n평균 MDD: 기본 ${avgBase.toFixed(2)}% → 리스크엔진 ${avgRisk.toFixed(2)}% (${(avgBase - avgRisk >= 0 ? '개선' : '악화')} ${Math.abs(avgBase - avgRisk).toFixed(2)}%p)`);
  console.log('\n리스크엔진 구성: ATR(14) 2σ 손절/3σ 익절 + 하프켈리(30건 롤링, 캡 25%) + 5% 일일 서킷브레이커');
}

if (require.main === module) main();
module.exports = { runRiskBacktest };
