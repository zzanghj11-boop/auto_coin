// 페이퍼트레이딩 라이브 대시보드
// - paperTrade.js 가 쓰는 state 파일을 1초마다 읽어 SSE로 브라우저에 푸시
// - 실행 중인 페이퍼트레이드 프로세스와 독립적으로 동작 (파일 기반 IPC)
//
// 사용법:
//   1) 한 터미널:  node src/paperTrade.js btcusdt 60min ma
//   2) 다른 터미널: node src/liveDashboard.js btcusdt 60min ma 8788
//   3) 브라우저:   http://localhost:8788
//
// 화면 구성: equity 곡선 · 가격+진입/청산 마커 · 현재 포지션 · 최근 트레이드 · 실시간 로그 tail

const http = require('http');
const fs = require('fs');
const path = require('path');

const symbol   = process.argv[2] || 'btcusdt';
const period   = process.argv[3] || '60min';
const stratKey = process.argv[4] || 'ma';
const PORT     = parseInt(process.argv[5] || '8788', 10);

const stateFile = path.join(__dirname, '..', 'data', `paper_${symbol}_${period}_${stratKey}.json`);
const logPath   = path.join(__dirname, '..', 'data', `paper_${symbol}_${period}_${stratKey}.log`);

function readState() {
  try { return JSON.parse(fs.readFileSync(stateFile, 'utf8')); }
  catch { return { cash: 1000000, coin: 0, entry: 0, lastTs: 0, trades: [], equityHistory: [] }; }
}
function readLogTail(n = 50) {
  try {
    const raw = fs.readFileSync(logPath, 'utf8').trim().split('\n');
    return raw.slice(-n);
  } catch { return []; }
}

const HTML = `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<title>Auto-Coin · Live Paper Trade</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
<style>
  :root{--bg:#0b1020;--fg:#e6edf3;--mut:#8b949e;--grn:#3fb950;--red:#f85149;--brd:#21262d}
  *{box-sizing:border-box} body{margin:0;background:var(--bg);color:var(--fg);font-family:-apple-system,BlinkMacSystemFont,'Pretendard','Apple SD Gothic Neo',sans-serif}
  header{padding:14px 20px;border-bottom:1px solid var(--brd);display:flex;justify-content:space-between;align-items:center}
  h1{margin:0;font-size:18px}
  .dot{display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--grn);margin-right:6px;animation:p 1.4s infinite}
  @keyframes p{0%,100%{opacity:1}50%{opacity:.3}}
  .grid{display:grid;grid-template-columns:2fr 1fr;gap:14px;padding:14px}
  .card{background:#0f1629;border:1px solid var(--brd);border-radius:10px;padding:14px}
  .card h3{margin:0 0 10px;font-size:13px;color:var(--mut);text-transform:uppercase;letter-spacing:.6px}
  .kpi{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}
  .kpi .b{background:#0f1629;border:1px solid var(--brd);border-radius:10px;padding:12px}
  .kpi .v{font-size:20px;font-weight:600} .kpi .l{font-size:11px;color:var(--mut)}
  .pos{font-size:14px;margin-top:8px}
  table{width:100%;border-collapse:collapse;font-size:12px}
  th,td{text-align:left;padding:6px 8px;border-bottom:1px solid var(--brd)}
  th{color:var(--mut);font-weight:500}
  .buy{color:var(--grn)} .sell{color:var(--red)}
  pre{background:#050812;border:1px solid var(--brd);border-radius:8px;padding:10px;max-height:220px;overflow:auto;font-size:11px;color:#c9d1d9}
  canvas{max-height:260px}
</style></head><body>
<header>
  <h1><span class="dot"></span> Auto-Coin Live · <span id="hdr"></span></h1>
  <div id="hb" style="color:var(--mut);font-size:12px">—</div>
</header>
<div style="padding:0 14px"><div class="kpi" id="kpi"></div></div>
<div class="grid">
  <div class="card"><h3>Equity Curve</h3><canvas id="eq"></canvas></div>
  <div class="card"><h3>Price & Trades</h3><canvas id="px"></canvas></div>
  <div class="card"><h3>Recent Trades</h3><div id="tr"></div></div>
  <div class="card"><h3>Log Tail</h3><pre id="lg"></pre></div>
</div>
<script>
const hdr=document.getElementById('hdr'), kpiEl=document.getElementById('kpi'), trEl=document.getElementById('tr'), lgEl=document.getElementById('lg'), hb=document.getElementById('hb');
const INITIAL=1000000;
function fmt(n,d=0){return n==null?'-':Number(n).toLocaleString(undefined,{maximumFractionDigits:d,minimumFractionDigits:d})}
function kpi(label,val,cls){return \`<div class="b"><div class="l">\${label}</div><div class="v \${cls||''}">\${val}</div></div>\`}
const eqChart=new Chart(document.getElementById('eq'),{type:'line',data:{labels:[],datasets:[{label:'Equity',data:[],borderColor:'#58a6ff',backgroundColor:'rgba(88,166,255,.12)',fill:true,tension:.2,pointRadius:0}]},options:{responsive:true,animation:false,scales:{x:{ticks:{color:'#8b949e',maxTicksLimit:6}},y:{ticks:{color:'#8b949e'}}},plugins:{legend:{display:false}}}});
const pxChart=new Chart(document.getElementById('px'),{type:'line',data:{labels:[],datasets:[{label:'Price',data:[],borderColor:'#d2a8ff',pointRadius:0,tension:.2},{label:'Buy',data:[],borderColor:'#3fb950',backgroundColor:'#3fb950',pointRadius:6,pointStyle:'triangle',showLine:false},{label:'Sell',data:[],borderColor:'#f85149',backgroundColor:'#f85149',pointRadius:6,pointStyle:'rectRot',showLine:false}]},options:{responsive:true,animation:false,scales:{x:{ticks:{color:'#8b949e',maxTicksLimit:6}},y:{ticks:{color:'#8b949e'}}},plugins:{legend:{labels:{color:'#c9d1d9'}}}}});
function render(s){
  hdr.textContent=s.meta.symbol+' '+s.meta.period+' '+s.meta.strategy;
  hb.textContent='updated '+new Date().toLocaleTimeString();
  const hist=s.equityHistory||[]; const last=hist.at(-1)||{equity:INITIAL,price:0};
  const equity=last.equity, px=last.price;
  const ret=((equity/INITIAL-1)*100);
  const wins=(s.trades||[]).filter(t=>t.ret>0).length;
  const losses=(s.trades||[]).filter(t=>t.ret!=null&&t.ret<=0).length;
  const pos=s.coin>0?\`LONG \${s.coin.toFixed(6)} @\${fmt(s.entry,2)} (\${(((px-s.entry)/s.entry)*100).toFixed(2)}%)\`:'FLAT';
  kpiEl.innerHTML=kpi('Equity','₩'+fmt(equity,0),ret>=0?'buy':'sell')+kpi('Return',ret.toFixed(2)+'%',ret>=0?'buy':'sell')+kpi('Trades',(s.trades||[]).length+' (W'+wins+'/L'+losses+')')+kpi('Position',pos);
  // charts
  const lbl=hist.map(h=>new Date(h.ts).toLocaleString().slice(5,16));
  eqChart.data.labels=lbl; eqChart.data.datasets[0].data=hist.map(h=>h.equity); eqChart.update('none');
  pxChart.data.labels=lbl; pxChart.data.datasets[0].data=hist.map(h=>h.price);
  const buyMap={},sellMap={};
  (s.trades||[]).forEach(t=>{const k=new Date(t.ts).toLocaleString().slice(5,16); if(t.side==='buy')buyMap[k]=t.px; else sellMap[k]=t.px;});
  pxChart.data.datasets[1].data=lbl.map(k=>buyMap[k]??null);
  pxChart.data.datasets[2].data=lbl.map(k=>sellMap[k]??null);
  pxChart.update('none');
  // trades table
  const recent=(s.trades||[]).slice(-12).reverse();
  trEl.innerHTML='<table><thead><tr><th>Time</th><th>Side</th><th>Price</th><th>Return</th></tr></thead><tbody>'+recent.map(t=>\`<tr><td>\${new Date(t.ts).toLocaleString().slice(5,16)}</td><td class="\${t.side}">\${t.side.toUpperCase()}\${t.reason==='stop'?' ⛔':''}</td><td>\${fmt(t.px,2)}</td><td class="\${t.ret>0?'buy':'sell'}">\${t.ret!=null?(t.ret*100).toFixed(2)+'%':'-'}</td></tr>\`).join('')+'</tbody></table>';
  lgEl.textContent=(s.logTail||[]).join('\\n');
  lgEl.scrollTop=lgEl.scrollHeight;
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
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });
    const send = () => {
      const s = readState();
      s.meta = { symbol, period, strategy: stratKey };
      s.logTail = readLogTail(50);
      res.write('data: ' + JSON.stringify(s) + '\n\n');
    };
    send();
    const iv = setInterval(send, 1000);
    req.on('close', () => clearInterval(iv));
    return;
  }
  if (req.url === '/api/state') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(readState()));
  }
  res.writeHead(404); res.end('not found');
});

server.listen(PORT, () => {
  console.log(`\n▶ Live dashboard : http://localhost:${PORT}`);
  console.log(`  state file     : ${stateFile}`);
  console.log(`  (상태는 1초마다 SSE로 푸시됩니다. 페이퍼트레이드를 먼저 실행하세요.)\n`);
});
