// 멀티 전략 런처
// - 4개 전략의 paperTrade + (옵션) 개별 liveDashboard + 통합 compareDashboard 를 동시에 띄운다
// - 자식 프로세스 stdout/stderr 는 태그 붙여 병합 출력
// - Ctrl+C 한 번으로 모두 종료
//
// 사용법:
//   node src/launchAll.js [symbol] [period] [--individual]
//   예: node src/launchAll.js btcusdt 60min
//       node src/launchAll.js btcusdt 1min --individual
//
// 포트:
//   compare   : 8790
//   ma        : 8791  (--individual 일 때만)
//   rsi       : 8792
//   bb        : 8793
//   vb        : 8794

const { spawn } = require('child_process');
const path = require('path');

const symbol = process.argv[2] || 'btcusdt';
const period = process.argv[3] || '60min';
const individual = process.argv.includes('--individual');
const fast = process.argv.includes('--fast');   // 1min 튜닝 버전

const STRAT_POOL = {
  ma:   { port: 8791, color: '\x1b[34m' },
  rsi:  { port: 8792, color: '\x1b[35m' },
  bb:   { port: 8793, color: '\x1b[33m' },
  vb:   { port: 8794, color: '\x1b[32m' },
  rsif: { port: 8795, color: '\x1b[95m' },
  bbf:  { port: 8796, color: '\x1b[93m' },
  vbf:  { port: 8797, color: '\x1b[92m' },
};
const STRATS = (fast ? ['ma', 'rsif', 'bbf', 'vbf'] : ['ma', 'rsi', 'bb', 'vb'])
  .map(k => ({ key: k, ...STRAT_POOL[k] }));
const RST = '\x1b[0m';
const COMPARE_PORT = 8790;

const children = [];
function launch(tag, color, script, args) {
  const child = spawn('node', [path.join(__dirname, script), ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
  const prefix = `${color}[${tag}]${RST}`;
  const pipe = (stream) => stream.on('data', (buf) => {
    buf.toString().split('\n').forEach(line => { if (line) console.log(`${prefix} ${line}`); });
  });
  pipe(child.stdout); pipe(child.stderr);
  child.on('exit', (code) => console.log(`${prefix} exited code=${code}`));
  children.push(child);
}

console.log(`\n▶ launching 4 strategies · ${symbol} ${period}`);
STRATS.forEach(s => launch(`paper-${s.key}`, s.color, 'paperTrade.js', [symbol, period, s.key]));

// 통합 비교 대시보드
setTimeout(() => {
  // compareDashboard 에 STRATS 환경변수로 추적 목록 전달
  const env = { ...process.env, STRATS: STRATS.map(s => s.key).join(',') };
  const cc = spawn('node', [path.join(__dirname, 'compareDashboard.js'), symbol, period, String(COMPARE_PORT)], { stdio: ['ignore', 'pipe', 'pipe'], env });
  const cprefix = `\x1b[36m[compare]${RST}`;
  cc.stdout.on('data', b => b.toString().split('\n').forEach(l => l && console.log(`${cprefix} ${l}`)));
  cc.stderr.on('data', b => b.toString().split('\n').forEach(l => l && console.log(`${cprefix} ${l}`)));
  children.push(cc);
  if (individual) {
    STRATS.forEach(s => launch(`dash-${s.key}`, s.color, 'liveDashboard.js', [symbol, period, s.key, String(s.port)]));
  }
  console.log(`\n  📊 Compare : http://localhost:${COMPARE_PORT}`);
  if (individual) STRATS.forEach(s => console.log(`  📊 ${s.key.padEnd(3)}    : http://localhost:${s.port}`));
  console.log(`\n  Ctrl+C 로 모두 종료\n`);
}, 800);

process.on('SIGINT', () => {
  console.log('\n▶ shutting down…');
  children.forEach(c => { try { c.kill('SIGINT'); } catch {} });
  setTimeout(() => process.exit(0), 300);
});
