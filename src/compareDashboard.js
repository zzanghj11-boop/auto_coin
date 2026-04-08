// 멀티 전략 비교 대시보드
// - 여러 paperTrade 상태 파일을 동시에 읽어 한 화면에서 나란히 비교
// - SSE 1s 푸시, 하나의 포트로 전체 비교
//
// 사용법:
//   1) 전략별 페이퍼트레이드 각각 실행 (터미널 4개):
//        node src/paperTrade.js btcusdt 60min ma
//        node src/paperTrade.js btcusdt 60min rsi
//        node src/paperTrade.js btcusdt 60min bb
//        node src/paperTrade.js btcusdt 60min vb
//      또는 한 번에:
//        node src/launchAll.js btcusdt 60min
//   2) 비교 대시보드:
//        node src/compareDashboard.js btcusdt 60min 8790
//      브라우저: http://localhost:8790

const http = require('http');
const fs = require('fs');
const path = require('path');

const symbol = process.argv[2] || 'btcusdt';
const period = process.argv[3] || '60min';
const PORT   = parseInt(process.argv[4] || '8790', 10);

// 환경변수 STRATS="ma,rsif,bbf,vbf" 로 추적 목록 교체 가능 (기본은 원본 4개)
const STRAT_DEFS = {
  ma:   { label: 'MA Cross',        color: '#58a6ff' },
  rsi:  { label: 'RSI 역추세',      color: '#d2a8ff' },
  bb:   { label: 'BB Squeeze',      color: '#f0b72f' },
  vb:   { label: 'Volatility BO',   color: '#3fb950' },
  rsif: { label: 'RSI-fast',        color: '#ff7b72' },
  bbf:  { label: 'BB-fast',         color: '#ffa657' },
  vbf:  { label: 'Volatility-fast', color: '#7ee787' },
};
const STRATS = (process.env.STRATS || 'ma,rsi,bb,vb').split(',')
  .map(k => k.trim()).filter(k => STRAT_DEFS[k])
  .map(k => ({ key: k, ...STRAT_DEFS[k] }));
const INITIAL = 1_000_000;

function stateFile(k) { return path.join(__dirname, '..', 'data', `paper_${symbol}_${period}_${k}.json`); }
function readState(k) {
  try { return JSON.parse(fs.readFileSync(stateFile(k), 'utf8')); }
  catch { return { cash: INITIAL, coin: 0, entry: 0, trades: [], equityHistory: [] }; }
}

function snapshot() {
  return STRATS.map(s => {
    const st = readState(s.key);
    const last = st.equityHistory?.at(-1) || { equity: INITIAL, price: 0 };
    const equity = last.equity;
    const px = last.price;
    const ret = ((equity / INITIAL - 1) * 100);
    const trades = st.trades || [];
    const closed = trades.filter(t => t.ret != null);
    const wins = closed.filter(t => t.ret > 0).length;
    const losses = closed.length - wins;
    const winRate = closed.length ? (wins / closed.length * 100) : 0;
    // MDD
    let peak = INITIAL, mdd = 0;
    for (const h of (st.equityHistory || [])) {
      if (h.equity > peak) peak = h.equity;
      const dd = (h.equity - peak) / peak;
      if (dd < mdd) mdd = dd;
    }
    const pos = st.coin > 0
      ? { side: 'LONG', size: st.coin, entry: st.entry, unrealized: ((px - st.entry) / st.entry * 100) }
      : { side: 'FLAT' };
    return {
      key: s.key, label: s.label, color: s.color,
      equity, ret, mdd: mdd * 100, trades: trades.length, wins, losses, winRate, pos,
      history: (st.equityHistory || []).map(h => ({ ts: h.ts, equity: h.equity, price: h.price })),
      recentTrades: trades.slice(-5).reverse(),
    };
  });
}

const HTML = `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<title>Auto-Coin · Strategy Compare</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
<style>
  :root{--bg:#0b1020;--fg:#e6edf3;--mut:#8b949e;--grn:#3fb950;--red:#f85149;--brd:#21262d}
  *{box-sizing:border-box} body{margin:0;background:var(--bg);color:var(--fg);font-family:-apple-system,BlinkMacSystemFont,'Pretendard','Apple SD Gothic Neo',sans-serif}
  header{padding:14px 20px;border-bottom:1px solid var(--brd);display:flex;justify-content:space-between;align-items:center}
  h1{margin:0;font-size:18px}
  .dot{display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--grn);margin-right:6px;animation:p 1.4s infinite}
  @keyframes p{0%,100%{opacity:1}50%{opacity:.3}}
  .wrap{padding:14px}
  .card{background:#0f1629;border:1px solid var(--brd);border-radius:10px;padding:14px;margin-bottom:14px}
  .card h3{margin:0 0 10px;font-size:13px;color:var(--mut);text-transform:uppercase;letter-spacing:.6px}
  table{width:100%;border-collapse:collapse;font-size:13px}
  th,td{text-align:right;padding:8px 10px;border-bottom:1px solid var(--brd)}
  th:first-child,td:first-child{text-align:left}
  th{color:var(--mut);font-weight:500;font-size:11px;text-transform:uppercase}
  tr.rank1 td:first-child{color:#f0b72f;font-weight:700}
  .buy{color:var(--grn)} .sell{color:var(--red)}
  .grid{display:grid;grid-template-columns:repeat(2,1fr);gap:14px}
  canvas{max-height:240px}
  .pill{display:inline-block;padding:2px 8px;border-radius:10px;font-size:11px;border:1px solid var(--brd)}
</style></head><body>
<header>
  <h1><span class="dot"></span> Strategy Compare · <span id="hdr"></span></h1>
  <div id="hb" style="color:var(--mut);font-size:12px">—</div>
</header>
<div class="wrap">
  <div class="card"><h3>Leaderboard</h3><div id="board"></div></div>
  <div class="card"><h3>Equity Curves (normalized)</h3><canvas id="eq"></canvas></div>
  <div class="grid" id="cards"></div>
</div>
<script>
const hdr=document.getElementById('hdr'),board=document.getElementById('board'),cards=document.getElementById('cards'),hb=document.getElementById('hb');
function fmt(n,d=0){return n==null?'-':Number(n).toLocaleString(undefined,{maximumFractionDigits:d,minimumFractionDigits:d})}
let eqChart;
function initEq(strats){
  eqChart=new Chart(document.getElementById('eq'),{type:'line',
    data:{labels:[],datasets:strats.map(s=>({label:s.label,data:[],borderColor:s.color,backgroundColor:s.color+'20',fill:false,tension:.2,pointRadius:0}))},
    options:{responsive:true,animation:false,scales:{x:{ticks:{color:'#8b949e',maxTicksLimit:6}},y:{ticks:{color:'#8b949e',callback:v=>v.toFixed(1)+'%'}}},plugins:{legend:{labels:{color:'#c9d1d9'}}}}});
}
function render(data){
  hdr.textContent=data.meta.symbol+' '+data.meta.period;
  hb.textContent='updated '+new Date().toLocaleTimeString();
  const s=data.strats;
  if(!eqChart)initEq(s);
  // leaderboard
  const sorted=[...s].sort((a,b)=>b.ret-a.ret);
  board.innerHTML='<table><thead><tr><th>Strategy</th><th>Return</th><th>MDD</th><th>Trades</th><th>Win%</th><th>Position</th></tr></thead><tbody>'+
    sorted.map((x,i)=>\`<tr class="\${i===0?'rank1':''}"><td><span class="pill" style="color:\${x.color};border-color:\${x.color}">\${x.label}</span></td><td class="\${x.ret>=0?'buy':'sell'}">\${x.ret.toFixed(2)}%</td><td class="sell">\${x.mdd.toFixed(2)}%</td><td>\${x.trades} (W\${x.wins}/L\${x.losses})</td><td>\${x.winRate.toFixed(1)}%</td><td>\${x.pos.side==='LONG'?'LONG '+(x.pos.unrealized>=0?'+':'')+x.pos.unrealized.toFixed(2)+'%':'FLAT'}</td></tr>\`).join('')+'</tbody></table>';
  // equity curves — union of timestamps, normalized to % return
  const allTs=new Set();
  s.forEach(x=>x.history.forEach(h=>allTs.add(h.ts)));
  const lbl=[...allTs].sort();
  eqChart.data.labels=lbl.map(t=>new Date(t).toLocaleString().slice(5,16));
  s.forEach((x,i)=>{
    const m={};x.history.forEach(h=>m[h.ts]=h.equity);
    let last=1000000;
    eqChart.data.datasets[i].data=lbl.map(t=>{if(m[t]!=null)last=m[t];return (last/1000000-1)*100});
  });
  eqChart.update('none');
  // per-strategy cards (recent trades)
  cards.innerHTML=s.map(x=>\`<div class="card"><h3 style="color:\${x.color}">\${x.label}</h3>
    <div style="font-size:12px;color:var(--mut);margin-bottom:8px">Equity ₩\${fmt(x.equity,0)} · \${x.ret.toFixed(2)}% · MDD \${x.mdd.toFixed(2)}%</div>
    <table><thead><tr><th>Time</th><th>Side</th><th>Price</th><th>Ret</th></tr></thead><tbody>\${
      x.recentTrades.length?x.recentTrades.map(t=>\`<tr><td>\${new Date(t.ts).toLocaleString().slice(5,16)}</td><td class="\${t.side}">\${t.side.toUpperCase()}\${t.reason==='stop'?' ⛔':''}</td><td>\${fmt(t.px,2)}</td><td class="\${t.ret>0?'buy':'sell'}">\${t.ret!=null?(t.ret*100).toFixed(2)+'%':'-'}</td></tr>\`).join(''):'<tr><td colspan="4" style="color:var(--mut);text-align:center">대기 중…</td></tr>'
    }</tbody></table></div>\`).join('');
}
const es=new EventSource('/events');
es.onmessage=e=>{try{render(JSON.parse(e.data))}catch(err){console.error(err)}};
</script></body></html>`;

const server = http.createServer((req, res) => {
  if (req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(HTML);
  }
  if (req.url === '/events') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' });
    const send = () => {
      const payload = { meta: { symbol, period }, strats: snapshot() };
      res.write('data: ' + JSON.stringify(payload) + '\n\n');
    };
    send();
    const iv = setInterval(send, 1000);
    req.on('close', () => clearInterval(iv));
    return;
  }
  res.writeHead(404); res.end('not found');
});

server.listen(PORT, () => {
  console.log(`\n▶ Compare dashboard : http://localhost:${PORT}`);
  console.log(`  symbol=${symbol} period=${period}`);
  console.log(`  tracking: ${STRATS.map(s => s.key).join(', ')}`);
  console.log(`  (각 전략별 paperTrade 가 먼저 실행되어 있어야 합니다)\n`);
});
