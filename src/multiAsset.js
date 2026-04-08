// 멀티 종목 백테스트
// 여러 코인에 동일 전략을 동시 적용하여 종목별 성과, 상관관계, 포트폴리오 효과 분석
//
// 실행: node src/multiAsset.js
//   기본 종목: BTC, ETH, SOL, XRP, DOGE (USDT 페어, 1h)
//
// 출력:
//   1. 종목×전략 성과 매트릭스 (수익률/MDD)
//   2. 종목간 수익률 상관계수 (종가 기반)
//   3. 동일비중 포트폴리오 합산 성과 (단일 종목 대비 MDD 감소 확인)

const fs = require('fs');
const path = require('path');
const S = require('./strategies');
const { runBacktest, metrics } = require('./backtest');
const { ensembleSignals } = require('./ensemble');

const DEFAULT_SYMBOLS = ['btcusdt', 'ethusdt', 'solusdt', 'xrpusdt', 'dogeusdt'];
const PERIOD = '60min';
const INITIAL = 1_000_000;

function loadOrSynth(symbol, period, seed) {
  const f = path.join(__dirname, '..', 'data', `${symbol}_${period}.json`);
  if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, 'utf8'));
  // 랜덤워크 합성 (종목마다 seed 다르게 → 상관계수 테스트 가능)
  const rows = [];
  let rng = seed;
  const rand = () => { rng = (rng * 1664525 + 1013904223) % 4294967296; return rng / 4294967296; };
  let p = 50000 * (0.5 + (seed % 100) / 100);
  const start = Date.UTC(2026, 0, 1);
  for (let i = 0; i < 1500; i++) {
    const o = p;
    const h = p * (1 + rand() * 0.015);
    const l = p * (1 - rand() * 0.015);
    const c = p * (1 + (rand() - 0.49) * 0.02);
    rows.push({ ts: start + i * 3600e3, open: o, high: h, low: l, close: c, volume: 1 });
    p = c;
  }
  return rows;
}

function pearson(a, b) {
  const n = Math.min(a.length, b.length);
  let sa = 0, sb = 0;
  for (let i = 0; i < n; i++) { sa += a[i]; sb += b[i]; }
  const ma = sa / n, mb = sb / n;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) {
    const x = a[i] - ma, y = b[i] - mb;
    num += x * y; da += x * x; db += y * y;
  }
  const denom = Math.sqrt(da * db);
  return denom === 0 ? 0 : num / denom;
}

function logReturns(closes) {
  const out = [];
  for (let i = 1; i < closes.length; i++) out.push(Math.log(closes[i] / closes[i - 1]));
  return out;
}

function parseMetric(m) {
  return {
    ret: parseFloat(String(m.totalReturn).replace('%', '')),
    mdd: parseFloat(String(m.mdd).replace('%', '')),
    trades: m.trades,
  };
}

function main() {
  const symbols = DEFAULT_SYMBOLS;
  console.log(`\n=== Multi-Asset Backtest · ${symbols.join(', ').toUpperCase()} · ${PERIOD} ===\n`);

  // 1. 종목별 캔들 로드
  const data = {};
  symbols.forEach((s, i) => { data[s] = loadOrSynth(s, PERIOD, i * 7919 + 1); });
  const missing = symbols.filter(s => {
    const f = path.join(__dirname, '..', 'data', `${s}_${PERIOD}.json`);
    return !fs.existsSync(f);
  });
  if (missing.length) console.log(`⚠️  실데이터 없음(샘플 사용): ${missing.join(', ')}\n`);

  // 2. 종목×전략 성과 매트릭스
  const strategies = {
    'MA':  c => S.maCross(c),
    'RSI': c => S.rsiReversal(c),
    'BB':  c => S.bbSqueeze(c),
    'VB':  c => S.volatilityBreakout(c),
    'ENS': c => ensembleSignals(c, { threshold: 1 }).sig,
  };

  const matrix = [];
  const equityBySymbol = {}; // 앙상블 기준 포트폴리오 합산용

  for (const sym of symbols) {
    const row = { symbol: sym.toUpperCase() };
    const candles = data[sym];
    const bh = (candles.at(-1).close / candles[0].close - 1) * 100;
    row['B&H %'] = bh.toFixed(1);

    for (const [name, fn] of Object.entries(strategies)) {
      const res = runBacktest(candles, fn(candles));
      const m = parseMetric(metrics(INITIAL, res));
      row[`${name} %`] = m.ret.toFixed(1);
      row[`${name} MDD`] = m.mdd.toFixed(1);
      if (name === 'ENS') equityBySymbol[sym] = res.equityCurve;
    }
    matrix.push(row);
  }

  console.log('▶ 종목×전략 성과 (수익률% / MDD%)');
  console.table(matrix);

  // 3. 수익률 상관계수 매트릭스 (종가 로그수익률 기반)
  console.log('\n▶ 종목간 수익률 상관계수 (Pearson)');
  const returns = {};
  for (const sym of symbols) returns[sym] = logReturns(data[sym].map(c => c.close));
  const corrTable = [];
  for (const a of symbols) {
    const row = { symbol: a.toUpperCase() };
    for (const b of symbols) row[b.toUpperCase()] = pearson(returns[a], returns[b]).toFixed(2);
    corrTable.push(row);
  }
  console.table(corrTable);

  const corrValues = [];
  for (let i = 0; i < symbols.length; i++)
    for (let j = i + 1; j < symbols.length; j++)
      corrValues.push(pearson(returns[symbols[i]], returns[symbols[j]]));
  const avgCorr = corrValues.reduce((a, b) => a + b, 0) / corrValues.length;
  console.log(`평균 상관계수: ${avgCorr.toFixed(3)} (낮을수록 분산 효과↑)`);

  // 4. 동일비중 포트폴리오 (앙상블 전략 기준) — 각 종목에 자본 1/N씩 배분
  console.log('\n▶ 동일비중 포트폴리오 (앙상블 t=1, 각 종목 1/N 배분)');
  const n = symbols.length;
  const perAsset = INITIAL / n;
  // 각 종목 equity curve를 per-asset 스케일로 정규화
  const len = Math.min(...symbols.map(s => equityBySymbol[s].length));
  const portfolio = new Array(len).fill(0);
  for (const sym of symbols) {
    const eq = equityBySymbol[sym];
    const scale = perAsset / INITIAL;
    for (let i = 0; i < len; i++) portfolio[i] += eq[i] * scale;
  }
  let peak = portfolio[0], mdd = 0;
  for (const e of portfolio) {
    if (e > peak) peak = e;
    const dd = e / peak - 1;
    if (dd < mdd) mdd = dd;
  }
  const pfRet = (portfolio.at(-1) / INITIAL - 1) * 100;
  console.log(`  총수익률: ${pfRet.toFixed(2)}%`);
  console.log(`  최대낙폭: ${(mdd * 100).toFixed(2)}%`);
  // 단일 종목 평균과 비교
  const ensRows = matrix.map(r => parseFloat(r['ENS %']));
  const ensMdds = matrix.map(r => parseFloat(r['ENS MDD']));
  const avgRet = ensRows.reduce((a, b) => a + b, 0) / ensRows.length;
  const avgMdd = ensMdds.reduce((a, b) => a + b, 0) / ensMdds.length;
  console.log(`  (참고) 단일종목 평균: ret ${avgRet.toFixed(2)}% / MDD ${avgMdd.toFixed(2)}%`);
  // MDD는 음수. 포트폴리오 MDD 크기(|mdd|)가 단일종목 평균보다 작으면 개선.
  const pfMddAbs = Math.abs(mdd * 100);
  const avgMddAbs = Math.abs(avgMdd);
  const deltaAbs = avgMddAbs - pfMddAbs;  // 양수 = 개선
  console.log(`  → 분산효과: MDD 크기 ${deltaAbs >= 0 ? '감소' : '증가'} ${Math.abs(deltaAbs).toFixed(2)}%p (${deltaAbs >= 0 ? '개선 ✔' : '악화 ✗'})`);

  // 결과 JSON 저장
  const out = path.join(__dirname, '..', 'multi_asset_result.json');
  fs.writeFileSync(out, JSON.stringify({ matrix, corrTable, avgCorr, portfolio: { ret: pfRet, mdd: mdd * 100 } }, null, 2));
  console.log(`\n✓ 결과 저장 → ${out}`);
  console.log('\n해석: 상관계수가 낮은 종목을 묶을수록 포트폴리오 MDD가 단일종목 평균보다 작아야 성공.');
}

if (require.main === module) main();
module.exports = { pearson, logReturns };
