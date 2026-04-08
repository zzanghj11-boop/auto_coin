// 백테스트 결과 → 단일 HTML 대시보드 생성
// 실행: node src/dashboard.js btcusdt 60min
// 산출: auto_coin/dashboard.html (Chart.js CDN, 오프라인 열람 가능한 단일 파일)
const fs = require('fs');
const path = require('path');
const S = require('./strategies');
const { runBacktest, metrics } = require('./backtest');

function loadCandles(symbol, period) {
  const f = path.join(__dirname, '..', 'data', `${symbol}_${period}.json`);
  if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, 'utf8'));
  // 데이터 없으면 샘플 랜덤워크 500봉 생성 (오프라인 프리뷰용)
  console.log('⚠️  실데이터 없음 — 랜덤워크 샘플로 대시보드 생성');
  const rows = []; let p = 50000;
  const start = Date.UTC(2026, 0, 1);
  for (let i = 0; i < 800; i++) {
    const o = p, h = p * (1 + Math.random() * 0.015), l = p * (1 - Math.random() * 0.015);
    const c = p * (1 + (Math.random() - 0.49) * 0.02);
    rows.push({ ts: start + i * 3600_000, open: o, high: h, low: l, close: c, volume: 1 });
    p = c;
  }
  return rows;
}

function drawdownSeries(equity) {
  const dd = []; let peak = equity[0];
  for (const e of equity) { if (e > peak) peak = e; dd.push((e / peak - 1) * 100); }
  return dd;
}

function buildHTML({ symbol, period, candles, results }) {
  const labels = candles.map(c => new Date(c.ts).toISOString().slice(0, 16).replace('T', ' '));
  const price = candles.map(c => c.close);
  const strategies = Object.keys(results);
  const equityDatasets = strategies.map((name, i) => ({
    label: name,
    data: results[name].equityCurve,
    borderColor: `hsl(${(i * 90) % 360},70%,50%)`,
    backgroundColor: 'transparent',
    borderWidth: 2,
    pointRadius: 0,
    tension: 0.1,
  }));
  const ddDatasets = strategies.map((name, i) => ({
    label: name,
    data: drawdownSeries(results[name].equityCurve),
    borderColor: `hsl(${(i * 90) % 360},70%,50%)`,
    backgroundColor: `hsla(${(i * 90) % 360},70%,50%,0.1)`,
    borderWidth: 1.5,
    pointRadius: 0,
    fill: true,
    tension: 0.1,
  }));

  // 진입/청산 마커 (첫 번째 전략 기준 가격 차트 위에 표시)
  const firstName = strategies[0];
  const firstTrades = results[firstName].trades || [];
  const markerDataset = {
    label: `${firstName} 진입/청산`,
    data: price.map((_, i) => null),
    pointBackgroundColor: [],
    pointRadius: [],
    borderColor: 'transparent',
    showLine: false,
  };

  const metricsRows = strategies.map(name => {
    const m = results[name].metrics;
    return `<tr><td>${name}</td><td>${m.trades}</td><td>${m.totalReturn}</td><td class="mdd">${m.mdd}</td><td>${m.winRate}</td><td>${m.profitFactor}</td></tr>`;
  }).join('');

  const bh = ((candles.at(-1).close / candles[0].close - 1) * 100).toFixed(2);

  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8">
<title>auto_coin 백테스트 대시보드 · ${symbol.toUpperCase()} ${period}</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
<style>
  :root{--bg:#0b0e14;--fg:#e6edf3;--mut:#7d8590;--card:#151a22;--bd:#30363d;--red:#ff6b6b;--grn:#51cf66}
  *{box-sizing:border-box}body{margin:0;font-family:-apple-system,Segoe UI,Pretendard,sans-serif;background:var(--bg);color:var(--fg)}
  header{padding:24px 32px;border-bottom:1px solid var(--bd)}
  h1{margin:0;font-size:20px;font-weight:600}
  .sub{color:var(--mut);font-size:13px;margin-top:4px}
  main{padding:24px 32px;max-width:1400px;margin:0 auto}
  .grid{display:grid;gap:20px;grid-template-columns:1fr 1fr}
  .card{background:var(--card);border:1px solid var(--bd);border-radius:10px;padding:20px}
  .card h2{margin:0 0 12px;font-size:14px;color:var(--mut);text-transform:uppercase;letter-spacing:.5px;font-weight:600}
  .full{grid-column:1/-1}
  table{width:100%;border-collapse:collapse;font-size:13px}
  th,td{padding:10px 8px;text-align:right;border-bottom:1px solid var(--bd)}
  th:first-child,td:first-child{text-align:left}
  th{color:var(--mut);font-weight:500;font-size:11px;text-transform:uppercase}
  .mdd{color:var(--red)}
  .bench{color:var(--mut);font-size:12px;margin-top:12px}
  canvas{max-height:320px}
  .warn{background:#3a2818;border:1px solid #6e4922;padding:10px 14px;border-radius:8px;font-size:12px;color:#f0c674;margin-bottom:16px}
</style></head><body>
<header>
  <h1>auto_coin · 백테스트 대시보드</h1>
  <div class="sub">${symbol.toUpperCase()} · ${period} · ${candles.length} candles · ${labels[0]} ~ ${labels.at(-1)}</div>
</header>
<main>
  <div class="warn">⚠️ 백테스트는 과거 데이터 기반입니다. MDD가 가장 낮은 전략을 1순위로 고려하세요.</div>

  <div class="card full">
    <h2>성과 비교</h2>
    <table><thead><tr><th>전략</th><th>거래수</th><th>총수익률</th><th>MDD</th><th>승률</th><th>PF</th></tr></thead>
    <tbody>${metricsRows}</tbody></table>
    <div class="bench">벤치마크 · Buy &amp; Hold: <b>${bh}%</b></div>
  </div>

  <div class="card full" style="margin-top:20px">
    <h2>에쿼티 곡선 (₩1,000,000 시작)</h2>
    <canvas id="eq"></canvas>
  </div>

  <div class="grid" style="margin-top:20px">
    <div class="card"><h2>드로우다운 (%)</h2><canvas id="dd"></canvas></div>
    <div class="card"><h2>가격 차트 (${firstName} 진입/청산)</h2><canvas id="px"></canvas></div>
  </div>
</main>
<script>
const LABELS = ${JSON.stringify(labels)};
const PRICE = ${JSON.stringify(price)};
const EQ = ${JSON.stringify(equityDatasets)};
const DD = ${JSON.stringify(ddDatasets)};
const TRADES = ${JSON.stringify(firstTrades)};

const baseOpts = {
  responsive: true, maintainAspectRatio: false,
  interaction: { mode: 'index', intersect: false },
  plugins: { legend: { labels: { color: '#e6edf3', boxWidth: 12, font: { size: 11 } } } },
  scales: {
    x: { ticks: { color: '#7d8590', maxTicksLimit: 8 }, grid: { color: '#22272e' } },
    y: { ticks: { color: '#7d8590' }, grid: { color: '#22272e' } }
  }
};

new Chart(document.getElementById('eq'), { type: 'line', data: { labels: LABELS, datasets: EQ }, options: baseOpts });
new Chart(document.getElementById('dd'), { type: 'line', data: { labels: LABELS, datasets: DD }, options: baseOpts });

// 가격 차트 + 진입/청산 마커 (첫 번째 전략)
const entryPts = LABELS.map(() => null);
const exitPts = LABELS.map(() => null);
// 단순히 최근접 인덱스에 진입가/청산가를 표시 (근사)
for (const t of TRADES) {
  // entry/exit 가격을 price 배열에서 가장 가까운 값 인덱스에 매핑
  let ei = -1, xi = -1, ed = Infinity, xd = Infinity;
  for (let i = 0; i < PRICE.length; i++) {
    const de = Math.abs(PRICE[i] - t.entry); if (de < ed) { ed = de; ei = i; }
    const dx = Math.abs(PRICE[i] - t.exit);  if (dx < xd) { xd = dx; xi = i; }
  }
  if (ei >= 0) entryPts[ei] = t.entry;
  if (xi >= 0) exitPts[xi] = t.exit;
}
new Chart(document.getElementById('px'), {
  type: 'line',
  data: {
    labels: LABELS,
    datasets: [
      { label: '종가', data: PRICE, borderColor: '#58a6ff', backgroundColor: 'transparent', borderWidth: 1.5, pointRadius: 0, tension: 0.1 },
      { label: '매수', data: entryPts, showLine: false, pointBackgroundColor: '#51cf66', pointRadius: 5, pointStyle: 'triangle' },
      { label: '매도', data: exitPts, showLine: false, pointBackgroundColor: '#ff6b6b', pointRadius: 5, pointStyle: 'rectRot' }
    ]
  },
  options: baseOpts
});
</script>
</body></html>`;
}

function main() {
  const symbol = process.argv[2] || 'btcusdt';
  const period = process.argv[3] || '60min';
  const candles = loadCandles(symbol, period);
  const strategyFns = {
    'MA Cross (20/60)':    S.maCross(candles),
    'RSI 역추세':          S.rsiReversal(candles),
    '볼린저밴드 스퀴즈':   S.bbSqueeze(candles),
    '변동성 돌파 (k=0.5)': S.volatilityBreakout(candles),
  };
  const initial = 1_000_000;
  const results = {};
  for (const [name, sig] of Object.entries(strategyFns)) {
    const r = runBacktest(candles, sig, { initial });
    results[name] = { ...r, metrics: metrics(initial, r) };
  }
  const html = buildHTML({ symbol, period, candles, results });
  const out = path.join(__dirname, '..', 'dashboard.html');
  fs.writeFileSync(out, html);
  console.log(`✓ dashboard written → ${out} (${(html.length / 1024).toFixed(1)} KB)`);
}

if (require.main === module) main();
module.exports = { buildHTML };
