// Walk-Forward 최적화
//
// 문제: optimize.js의 단일 train/test 분할은 한 구간의 우연에 의존한다.
// 해법: 데이터를 여러 구간으로 나눠 "최적화 → 다음 구간 검증"을 연쇄 반복하고,
//       out-of-sample(OOS) 검증 구간만 이어붙여 "진짜 운용 시나리오"를 재현한다.
//
//   [----train----][test]
//        [----train----][test]
//             [----train----][test]
//                  [----train----][test]
//
// 각 윈도우마다: train 구간에서 최적 파라미터 선정(Calmar) → test 구간에 적용.
// 모든 test 구간의 수익을 순차 합성한 OOS equity curve가 최종 성과.
//
// Anchored vs Rolling:
//   - Anchored: train 시작점 고정, 갈수록 윈도우 길어짐 (누적 학습)
//   - Rolling: train 길이 고정, 창이 앞으로 밀려감 (시장 체제 변화 추종)
// 기본: Rolling (최근 시장 반영)
//
// 실행: node src/walkForward.js btcusdt 60min

const fs = require('fs');
const path = require('path');
const S = require('./strategies');
const { runBacktest, metrics } = require('./backtest');

const INITIAL = 1_000_000;

// 전략별 그리드 (optimize.js보다 조금 더 좁게 — 속도 목적)
const GRID = {
  'MA Cross': {
    fn: (c, p) => S.maCross(c, p),
    params: { fast: [10, 20, 30], slow: [50, 100, 150] },
    constraint: p => p.fast < p.slow,
  },
  'RSI': {
    fn: (c, p) => S.rsiReversal(c, p),
    params: { period: [7, 14, 21], lower: [25, 30], upper: [70, 75], trendPeriod: [200] },
  },
  'BB Squeeze': {
    fn: (c, p) => S.bbSqueeze(c, p),
    params: { period: [14, 20], mult: [1.5, 2, 2.5], window: [60, 120] },
  },
  'Volatility Breakout': {
    fn: (c, p) => S.volatilityBreakout(c, p),
    params: { k: [0.3, 0.5, 0.7, 0.9] },
  },
};

function* cartesian(obj) {
  const keys = Object.keys(obj);
  const vals = keys.map(k => obj[k]);
  const idx = new Array(keys.length).fill(0);
  while (true) {
    const o = {}; keys.forEach((k, i) => { o[k] = vals[i][idx[i]]; });
    yield o;
    let i = keys.length - 1;
    while (i >= 0 && ++idx[i] >= vals[i].length) { idx[i] = 0; i--; }
    if (i < 0) return;
  }
}

const parse = s => parseFloat(String(s).replace('%', ''));

function scoreParams(candles, stratName, params) {
  const g = GRID[stratName];
  if (g.constraint && !g.constraint(params)) return null;
  const sig = g.fn(candles, params);
  const r = runBacktest(candles, sig);
  const m = metrics(INITIAL, r);
  const ret = parse(m.totalReturn);
  const mdd = Math.abs(parse(m.mdd));
  if (m.trades < 3) return null;
  // Calmar ratio
  const calmar = mdd === 0 ? ret : ret / mdd;
  return { params, calmar, ret, mdd, trades: m.trades };
}

function bestParams(candles, stratName) {
  const g = GRID[stratName];
  let best = null;
  for (const p of cartesian(g.params)) {
    const s = scoreParams(candles, stratName, p);
    if (s && (!best || s.calmar > best.calmar)) best = s;
  }
  return best;
}

function walkForward(candles, stratName, { trainBars = 500, testBars = 150, mode = 'rolling' } = {}) {
  const g = GRID[stratName];
  const windows = [];
  let trainStart = 0;
  while (true) {
    const trainEnd = trainStart + trainBars;
    const testEnd = trainEnd + testBars;
    if (testEnd > candles.length) break;
    const train = candles.slice(mode === 'anchored' ? 0 : trainStart, trainEnd);
    const test = candles.slice(trainEnd, testEnd);
    const best = bestParams(train, stratName);
    if (best) {
      const sig = g.fn(test, best.params);
      const res = runBacktest(test, sig, { initial: INITIAL });
      const m = metrics(INITIAL, res);
      windows.push({
        trainRange: [trainStart, trainEnd],
        testRange: [trainEnd, testEnd],
        params: best.params,
        trainCalmar: best.calmar.toFixed(2),
        testRet: parse(m.totalReturn),
        testMdd: parse(m.mdd),
        testTrades: m.trades,
      });
    }
    trainStart += testBars;
  }
  // OOS equity 합성: 각 테스트 창에서 (1 + ret/100)을 누적
  let oosEquity = INITIAL;
  const oosRets = [];
  for (const w of windows) {
    oosEquity *= (1 + w.testRet / 100);
    oosRets.push(w.testRet);
  }
  const oosTotalRet = (oosEquity / INITIAL - 1) * 100;
  // OOS 최대낙폭 (창 단위 근사): 누적 equity 계열의 MDD
  let peak = INITIAL, cum = INITIAL, oosMdd = 0;
  for (const r of oosRets) {
    cum *= (1 + r / 100);
    if (cum > peak) peak = cum;
    const dd = cum / peak - 1;
    if (dd < oosMdd) oosMdd = dd;
  }
  return {
    windows,
    oosEquity,
    oosTotalRet: +oosTotalRet.toFixed(2),
    oosMdd: +(oosMdd * 100).toFixed(2),
    winRateOfWindows: +(windows.filter(w => w.testRet > 0).length / windows.length * 100).toFixed(1),
  };
}

// 파라미터 안정성: 윈도우 간에 같은 파라미터가 얼마나 자주 선정되는지
function stability(windows) {
  const counts = {};
  for (const w of windows) {
    const k = JSON.stringify(w.params);
    counts[k] = (counts[k] || 0) + 1;
  }
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const modeCount = sorted[0]?.[1] || 0;
  return {
    uniqueCombos: sorted.length,
    mostFrequent: sorted[0]?.[0],
    mostFrequentShare: windows.length ? +(modeCount / windows.length * 100).toFixed(1) : 0,
  };
}

function loadCandles(symbol, period) {
  const f = path.join(__dirname, '..', 'data', `${symbol}_${period}.json`);
  if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, 'utf8'));
  console.log('⚠️  실데이터 없음 — 랜덤워크 2000봉 샘플');
  const rows = []; let p = 50000;
  for (let i = 0; i < 2000; i++) {
    const vol = 0.015 + 0.008 * Math.sin(i / 100);
    const o = p, h = p*(1+Math.random()*vol), l = p*(1-Math.random()*vol);
    const c = p*(1+(Math.random()-0.49)*vol*1.3);
    rows.push({ ts: Date.UTC(2026,0,1)+i*3600e3, open:o, high:h, low:l, close:c, volume:1 });
    p = c;
  }
  return rows;
}

function main() {
  const symbol = process.argv[2] || 'btcusdt';
  const period = process.argv[3] || '60min';
  const mode = process.argv[4] || 'rolling'; // or 'anchored'
  const candles = loadCandles(symbol, period);
  console.log(`\n=== Walk-Forward Optimization · ${symbol.toUpperCase()} / ${period} / ${candles.length} candles / mode=${mode} ===`);
  console.log(`Window: train=500 / test=150 (bar 단위)\n`);

  const summary = [];
  const details = {};
  for (const name of Object.keys(GRID)) {
    const wf = walkForward(candles, name, { trainBars: 500, testBars: 150, mode });
    const stab = stability(wf.windows);
    summary.push({
      strategy: name,
      windows: wf.windows.length,
      'OOS ret%': wf.oosTotalRet,
      'OOS MDD%': wf.oosMdd,
      'win win%': wf.winRateOfWindows,
      'param stab%': stab.mostFrequentShare,
      'unique': stab.uniqueCombos,
    });
    details[name] = { wf, stab };
  }

  console.log('▶ 전략별 Walk-Forward 성과');
  console.table(summary);

  // 각 전략의 가장 자주 선정된 파라미터 출력
  console.log('\n▶ 파라미터 안정성 (최다 선정 조합)');
  for (const [name, d] of Object.entries(details)) {
    console.log(`  ${name}: ${d.stab.mostFrequent} (${d.stab.mostFrequentShare}% · ${d.stab.uniqueCombos}종 후보)`);
  }

  // 단순 train/test 1회 최적화와 비교
  console.log('\n해석:');
  console.log('  - OOS ret%: Walk-Forward 방식의 순수 out-of-sample 수익률. 낙관편향 없음.');
  console.log('  - param stab%: 같은 파라미터가 얼마나 자주 선정됐는지. 낮으면 과최적화(시장 체제마다 다른 값).');
  console.log('  - 실거래 승격 기준: OOS ret>0, OOS MDD<단일 최적화 MDD, param stab>40% 권장.');

  const out = path.join(__dirname, '..', 'walkforward_result.json');
  fs.writeFileSync(out, JSON.stringify({ summary, details }, null, 2));
  console.log(`\n✓ 결과 저장 → ${out}`);
}

if (require.main === module) main();
module.exports = { walkForward, bestParams, stability };
