#!/usr/bin/env node
// 실시간 웹 대시보드 서버 (Node.js 빌트인 http만 사용, 외부 의존성 0)
//
// 엔드포인트:
//   GET  /                 → live.html (자동 새로고침 대시보드)
//   GET  /dashboard.html   → 정적 대시보드 (run.js가 생성한 파일)
//   GET  /api/state        → 현재 페이퍼트레이딩 상태 + 백테스트 요약 JSON
//   GET  /api/paper/:key   → 특정 paper state 파일
//   GET  /api/onchain      → 온체인 bias 시그널
//   GET  /api/run?step=... → 파이프라인 단계 트리거 (비동기)
//   GET  /events           → SSE (Server-Sent Events) — 5초마다 state push
//
// 실행: node src/server.js [port]
//   기본 포트 3000

const http = require('http');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { URL } = require('url');

const ROOT = path.join(__dirname, '..');
const DATA = path.join(ROOT, 'data');
const PORT = parseInt(process.argv[2] || '3000', 10);

// ------------------ state 수집 ------------------
function readJson(p, fallback = null) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return fallback; }
}

function collectState() {
  const state = {
    ts: new Date().toISOString(),
    paper: {},
    onchain: readJson(path.join(DATA, 'onchain_signal.json')),
    results: {
      optimize: readJson(path.join(ROOT, 'optimize_result.json')),
      walkforward: readJson(path.join(ROOT, 'walkforward_result.json')),
      multiAsset: readJson(path.join(ROOT, 'multi_asset_result.json')),
    },
  };
  // paper_*.json 모아서 요약
  if (fs.existsSync(DATA)) {
    for (const f of fs.readdirSync(DATA)) {
      if (!f.startsWith('paper_') || !f.endsWith('.json')) continue;
      const key = f.replace('paper_', '').replace('.json', '');
      const s = readJson(path.join(DATA, f));
      if (!s) continue;
      const lastEq = s.equityHistory?.at(-1);
      const curPx = lastEq?.price ?? 0;
      const equity = s.cash + s.coin * curPx;
      const unrlz = s.coin > 0 ? ((curPx - s.entry) / s.entry) * 100 : 0;
      state.paper[key] = {
        equity: +equity.toFixed(0),
        retPct: +((equity / 1_000_000 - 1) * 100).toFixed(2),
        position: s.coin > 0 ? 'LONG' : 'FLAT',
        coin: s.coin,
        entry: s.entry,
        curPx,
        unrealizedPct: +unrlz.toFixed(2),
        trades: s.trades?.length ?? 0,
        lastTs: s.lastTs ? new Date(s.lastTs).toISOString() : null,
      };
    }
  }
  return state;
}

// ------------------ live.html ------------------
const LIVE_HTML = `<!doctype html>
<html lang="ko"><head><meta charset="utf-8">
<title>auto_coin · Live Dashboard</title>
<style>
  :root{--bg:#0b0e14;--fg:#e6edf3;--mut:#7d8590;--card:#151a22;--bd:#30363d;--red:#ff6b6b;--grn:#51cf66;--yel:#f0c674;--blu:#58a6ff}
  *{box-sizing:border-box}body{margin:0;font-family:-apple-system,Segoe UI,Pretendard,sans-serif;background:var(--bg);color:var(--fg)}
  header{padding:20px 28px;border-bottom:1px solid var(--bd);display:flex;justify-content:space-between;align-items:center}
  h1{margin:0;font-size:18px;font-weight:600}
  .dot{display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--grn);margin-right:6px;animation:pulse 2s infinite}
  @keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}
  .sub{color:var(--mut);font-size:12px}
  main{padding:20px 28px;max-width:1600px;margin:0 auto}
  .grid{display:grid;gap:16px;grid-template-columns:repeat(auto-fill,minmax(340px,1fr))}
  .card{background:var(--card);border:1px solid var(--bd);border-radius:10px;padding:18px}
  .card h2{margin:0 0 10px;font-size:12px;color:var(--mut);text-transform:uppercase;letter-spacing:.5px;font-weight:600}
  .big{font-size:28px;font-weight:600}
  .row{display:flex;justify-content:space-between;padding:6px 0;font-size:13px;border-bottom:1px dashed #222}
  .row:last-child{border:0}
  .row span:first-child{color:var(--mut)}
  .pos{color:var(--grn)} .neg{color:var(--red)} .neu{color:var(--mut)}
  .bull{background:#1a3a1e;color:var(--grn);padding:2px 8px;border-radius:4px;font-size:11px}
  .bear{background:#3a1a1e;color:var(--red);padding:2px 8px;border-radius:4px;font-size:11px}
  .neutral{background:#2a2a2a;color:var(--mut);padding:2px 8px;border-radius:4px;font-size:11px}
  .empty{color:var(--mut);font-style:italic;font-size:12px;padding:8px 0}
  a{color:var(--blu);text-decoration:none}
  a:hover{text-decoration:underline}
  table{width:100%;font-size:12px;border-collapse:collapse}
  th,td{padding:6px 4px;text-align:right;border-bottom:1px solid #222}
  th:first-child,td:first-child{text-align:left}
  th{color:var(--mut);font-weight:500;font-size:10px;text-transform:uppercase}
</style></head><body>
<header>
  <div>
    <h1><span class="dot"></span>auto_coin · Live</h1>
    <div class="sub" id="updated">connecting...</div>
  </div>
  <div class="sub">
    <a href="/dashboard.html">정적 대시보드 →</a> &nbsp;·&nbsp;
    SSE <span id="sse">pending</span>
  </div>
</header>
<main>
  <div class="grid">
    <div class="card" id="paper-card">
      <h2>페이퍼트레이딩</h2>
      <div id="paper-body"><div class="empty">paper state 없음 — <code>node src/paperTrade.js btcusdt 60min ma</code> 로 시작</div></div>
    </div>

    <div class="card">
      <h2>온체인 시그널</h2>
      <div id="onchain-body"><div class="empty">데이터 없음</div></div>
    </div>

    <div class="card">
      <h2>Walk-Forward 성과 (OOS)</h2>
      <div id="wf-body"><div class="empty">데이터 없음</div></div>
    </div>

    <div class="card">
      <h2>멀티 종목</h2>
      <div id="multi-body"><div class="empty">데이터 없음</div></div>
    </div>
  </div>
</main>
<script>
function cls(n){return n>0?'pos':n<0?'neg':'neu'}
function fmt(n,d=2){return (n>=0?'+':'')+n.toFixed(d)+'%'}
function num(n){return Number(n).toLocaleString('ko-KR')}

function render(state){
  document.getElementById('updated').textContent = '최종 갱신: ' + new Date(state.ts).toLocaleTimeString('ko-KR');

  // paper
  const paperKeys = Object.keys(state.paper);
  if (paperKeys.length === 0) {
    document.getElementById('paper-body').innerHTML = '<div class="empty">paper state 없음</div>';
  } else {
    let html = '';
    for (const k of paperKeys) {
      const p = state.paper[k];
      html += '<div style="margin-bottom:14px;padding-bottom:10px;border-bottom:1px solid #222">';
      html += '<div style="font-size:11px;color:var(--mut);margin-bottom:4px">'+k+'</div>';
      html += '<div class="big '+cls(p.retPct)+'">'+num(p.equity)+' <span style="font-size:14px">('+fmt(p.retPct)+')</span></div>';
      html += '<div class="row"><span>포지션</span><span>'+p.position+(p.position==='LONG'?' @'+p.entry.toFixed(2):'')+'</span></div>';
      if (p.position==='LONG') html += '<div class="row"><span>미실현</span><span class="'+cls(p.unrealizedPct)+'">'+fmt(p.unrealizedPct)+'</span></div>';
      html += '<div class="row"><span>체결수</span><span>'+p.trades+'</span></div>';
      html += '<div class="row"><span>마지막 봉</span><span>'+(p.lastTs?new Date(p.lastTs).toLocaleString('ko-KR'):'-')+'</span></div>';
      html += '</div>';
    }
    document.getElementById('paper-body').innerHTML = html;
  }

  // onchain
  if (state.onchain) {
    const b = state.onchain.bias;
    const badge = b==='bullish'?'bull':b==='bearish'?'bear':'neutral';
    let html = '<div class="big"><span class="'+badge+'">'+b.toUpperCase()+'</span></div>';
    html += '<div class="row"><span>스테이블 순유입</span><span>'+num(Math.round(state.onchain.signals.stable_netflow_usd))+' USD</span></div>';
    html += '<div class="row"><span>코인 순유입</span><span>'+num(Math.round(state.onchain.signals.coin_netflow_usd))+' USD</span></div>';
    html += '<div class="row"><span>결합 스코어</span><span>'+num(Math.round(state.onchain.signals.combined_score))+'</span></div>';
    html += '<div class="row"><span>갱신</span><span>'+new Date(state.onchain.updated).toLocaleString('ko-KR')+'</span></div>';
    document.getElementById('onchain-body').innerHTML = html;
  }

  // walkforward
  if (state.results.walkforward) {
    const rows = state.results.walkforward.summary || [];
    let html = '<table><thead><tr><th>전략</th><th>OOS ret%</th><th>MDD%</th><th>안정성</th></tr></thead><tbody>';
    for (const r of rows) {
      html += '<tr><td>'+r.strategy+'</td><td class="'+cls(r['OOS ret%'])+'">'+r['OOS ret%']+'</td><td class="neg">'+r['OOS MDD%']+'</td><td>'+r['param stab%']+'%</td></tr>';
    }
    html += '</tbody></table>';
    document.getElementById('wf-body').innerHTML = html;
  }

  // multi
  if (state.results.multiAsset) {
    const rows = state.results.multiAsset.matrix || [];
    let html = '<table><thead><tr><th>종목</th><th>B&amp;H</th><th>ENS</th><th>MDD</th></tr></thead><tbody>';
    for (const r of rows) {
      html += '<tr><td>'+r.symbol+'</td><td>'+r['B&H %']+'%</td><td class="'+cls(parseFloat(r['ENS %']))+'">'+r['ENS %']+'%</td><td class="neg">'+r['ENS MDD']+'%</td></tr>';
    }
    html += '</tbody></table>';
    if (state.results.multiAsset.portfolio) {
      const pf = state.results.multiAsset.portfolio;
      html += '<div style="margin-top:8px;padding-top:8px;border-top:1px solid #30363d;font-size:12px">포트폴리오: <span class="'+cls(pf.ret)+'">'+pf.ret.toFixed(2)+'%</span> · MDD '+pf.mdd.toFixed(2)+'%</div>';
    }
    document.getElementById('multi-body').innerHTML = html;
  }
}

// SSE 연결
const es = new EventSource('/events');
es.onopen = () => { document.getElementById('sse').textContent = '✓ connected'; document.getElementById('sse').style.color = 'var(--grn)'; };
es.onerror = () => { document.getElementById('sse').textContent = '✗ disconnected'; document.getElementById('sse').style.color = 'var(--red)'; };
es.onmessage = (e) => {
  try { render(JSON.parse(e.data)); } catch(err) { console.error(err); }
};

// 초기 로딩용 fallback
fetch('/api/state').then(r=>r.json()).then(render);
</script>
</body></html>`;

// ------------------ HTTP handlers ------------------
function sendJson(res, obj, code = 200) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(body);
}
function sendText(res, text, type = 'text/html; charset=utf-8', code = 200) {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(text);
}
function sendFile(res, file, type) {
  if (!fs.existsSync(file)) { res.writeHead(404); res.end('not found'); return; }
  res.writeHead(200, { 'Content-Type': type });
  fs.createReadStream(file).pipe(res);
}

const sseClients = new Set();
function broadcast() {
  const state = collectState();
  const payload = `data: ${JSON.stringify(state)}\n\n`;
  for (const res of sseClients) {
    try { res.write(payload); } catch {}
  }
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const p = url.pathname;

  if (p === '/' || p === '/live.html') return sendText(res, LIVE_HTML);
  if (p === '/dashboard.html') return sendFile(res, path.join(ROOT, 'dashboard.html'), 'text/html; charset=utf-8');
  if (p === '/api/state') return sendJson(res, collectState());
  if (p === '/api/onchain') return sendJson(res, readJson(path.join(DATA, 'onchain_signal.json'), { bias: 'neutral', reason: 'no-file' }));

  if (p === '/api/run') {
    const step = url.searchParams.get('step') || 'backtest';
    const symbol = url.searchParams.get('symbol') || 'btcusdt';
    const period = url.searchParams.get('period') || '60min';
    execFile('node', [path.join(__dirname, 'run.js'), '--steps', step, '--symbol', symbol, '--period', period], { cwd: ROOT }, (err, stdout, stderr) => {
      sendJson(res, { ok: !err, step, stdout: stdout?.slice(-2000), stderr: stderr?.slice(-500) });
    });
    return;
  }

  if (p === '/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-store',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });
    res.write(`: connected\n\n`);
    // 첫 state 즉시 push
    res.write(`data: ${JSON.stringify(collectState())}\n\n`);
    sseClients.add(res);
    req.on('close', () => sseClients.delete(res));
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('not found');
});

server.listen(PORT, () => {
  console.log(`\n◈ auto_coin live server`);
  console.log(`  URL:  http://localhost:${PORT}/`);
  console.log(`  SSE:  http://localhost:${PORT}/events`);
  console.log(`  API:  http://localhost:${PORT}/api/state`);
  console.log(`  (Ctrl+C 종료)\n`);
});

// 5초마다 모든 SSE 클라이언트에 state 푸시
setInterval(broadcast, 5000);

module.exports = { collectState, server };
