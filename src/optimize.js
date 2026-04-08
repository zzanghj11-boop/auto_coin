// 파라미터 그리드서치 최적화
// 각 전략별로 파라미터 조합을 전수 탐색 → MDD 기준 정렬, 상위 10개 출력
// 실행: node src/optimize.js btcusdt 60min
// 결과: auto_coin/optimize_result.json + 콘솔 테이블
//
// ⚠️ 중요: 그리드서치는 과최적화(overfit) 위험이 큽니다.
//   - 반드시 train/test 분할: 앞쪽 70%로 최적화 → 뒤쪽 30%로 검증
//   - MDD가 너무 낮은데 거래수가 5회 미만이면 통계적으로 무의미 → 필터링
//   - 최종 선정은 train/test 성과 차이가 작은 "강건한" 파라미터로
const fs = require('fs');
const path = require('path');
const S = require('./strategies');
const { runBacktest, metrics } = require('./backtest');

function loadCandles(symbol, period) {
  const f = path.join(__dirname, '..', 'data', `${symbol}_${period}.json`);
  if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, 'utf8'));
  console.log('⚠️  실데이터 없음 — 랜덤워크 샘플로 최적화 (참고용)');
  const rows = []; let p = 50000;
  const start = Date.UTC(2026, 0, 1);
  for (let i = 0; i < 1500; i++) {
    const o = p, h = p * (1 + Math.random() * 0.015), l = p * (1 - Math.random() * 0.015);
    const c = p * (1 + (Math.random() - 0.49) * 0.02);
    rows.push({ ts: start + i * 3600_000, open: o, high: h, low: l, close: c, volume: 1 });
    p = c;
  }
  return rows;
}

// 그리드 정의
const GRID = {
  'MA Cross': {
    fn: (c, p) => S.maCross(c, p),
    params: { fast: [5, 10, 15, 20, 30], slow: [30, 50, 60, 100, 150] },
    constraint: p => p.fast < p.slow,
  },
  'RSI 역추세': {
    fn: (c, p) => S.rsiReversal(c, p),
    params: { period: [7, 14, 21], lower: [20, 25, 30], upper: [70, 75, 80], trendPeriod: [100, 200] },
    constraint: p => p.lower < p.upper,
  },
  '볼린저 스퀴즈': {
    fn: (c, p) => S.bbSqueeze(c, p),
    params: { period: [14, 20, 30], mult: [1.5, 2, 2.5], window: [60, 120, 200] },
  },
  '변동성 돌파': {
    fn: (c, p) => S.volatilityBreakout(c, p),
    params: { k: [0.3, 0.4, 0.5, 0.6, 0.7, 0.8] },
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

function parseMetric(str) {
  return parseFloat(String(str).replace('%', ''));
}

function evalParams(candles, strategyName, params) {
  const g = GRID[strategyName];
  if (g.constraint && !g.constraint(params)) return null;
  const sig = g.fn(candles, params);
  const res = runBacktest(candles, sig);
  const m = metrics(1_000_000, res);
  return {
    params,
    trades: m.trades,
    totalReturn: parseMetric(m.totalReturn),
    mdd: parseMetric(m.mdd),
    winRate: parseMetric(m.winRate),
    profitFactor: m.profitFactor === 'inf' ? 999 : parseFloat(m.profitFactor),
  };
}

// 강건성 점수: 수익률이 양수이고 MDD가 작으며 거래수가 충분할수록 높음
// score = totalReturn / |mdd| (Calmar-ish), 거래수<5는 탈락
function robustnessScore(r) {
  if (r.trades < 5) return -Infinity;
  if (r.mdd === 0) return r.totalReturn;
  return r.totalReturn / Math.abs(r.mdd);
}

function gridSearch(candles, strategyName) {
  const g = GRID[strategyName];
  const results = [];
  for (const p of cartesian(g.params)) {
    const r = evalParams(candles, strategyName, p);
    if (r) results.push(r);
  }
  return results;
}

function splitTrainTest(candles, ratio = 0.7) {
  const cut = Math.floor(candles.length * ratio);
  return { train: candles.slice(0, cut), test: candles.slice(cut) };
}

function main() {
  const symbol = process.argv[2] || 'btcusdt';
  const period = process.argv[3] || '60min';
  const candles = loadCandles(symbol, period);
  const { train, test } = splitTrainTest(candles, 0.7);
  console.log(`\n=== ${symbol.toUpperCase()} / ${period} / ${candles.length} candles ===`);
  console.log(`Train: ${train.length}봉, Test: ${test.length}봉\n`);

  const output = {};
  for (const name of Object.keys(GRID)) {
    console.log(`\n▶ ${name} 그리드서치...`);
    const trainResults = gridSearch(train, name)
      .map(r => ({ ...r, score: robustnessScore(r) }))
      .sort((a, b) => b.score - a.score);

    const top = trainResults.slice(0, 5);
    // 상위 후보를 test 구간에서 재검증
    const validated = top.map(t => {
      const testRes = evalParams(test, name, t.params);
      return {
        params: t.params,
        train: { ret: t.totalReturn, mdd: t.mdd, trades: t.trades, score: t.score.toFixed(2) },
        test: testRes ? { ret: testRes.totalReturn, mdd: testRes.mdd, trades: testRes.trades } : null,
      };
    });
    output[name] = validated;

    console.log('Top 5 (train 기준 Calmar):');
    console.table(validated.map(v => ({
      params: JSON.stringify(v.params),
      'train ret%': v.train.ret, 'train mdd%': v.train.mdd, 'train trades': v.train.trades,
      'test ret%': v.test?.ret ?? '-', 'test mdd%': v.test?.mdd ?? '-', 'test trades': v.test?.trades ?? '-',
    })));

    // 강건 파라미터: test에서도 수익이 양수이고 train/test ret 차이가 가장 작은 것
    const robust = validated
      .filter(v => v.test && v.test.ret > 0 && v.test.trades >= 3)
      .sort((a, b) => Math.abs(a.train.ret - a.test.ret) - Math.abs(b.train.ret - b.test.ret))[0];
    if (robust) {
      console.log(`  ✔ 강건 파라미터 추천: ${JSON.stringify(robust.params)} (train ${robust.train.ret}% / test ${robust.test.ret}%)`);
    } else {
      console.log('  ✗ 강건 파라미터 없음 — 이 전략은 현 데이터에 부적합');
    }
  }

  const out = path.join(__dirname, '..', 'optimize_result.json');
  fs.writeFileSync(out, JSON.stringify(output, null, 2));
  console.log(`\n✓ 결과 저장 → ${out}`);
  console.log('\n⚠️ 주의: 그리드서치는 과최적화 위험이 있습니다. 강건 파라미터만 실거래 후보로 고려하세요.');
}

if (require.main === module) main();
module.exports = { gridSearch, evalParams, robustnessScore };
