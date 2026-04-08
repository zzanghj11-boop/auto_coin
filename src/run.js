#!/usr/bin/env node
// 통합 CLI 러너
// 전체 파이프라인을 한 명령으로 실행하거나, 특정 단계만 골라서 실행
//
// 사용법:
//   node src/run.js                          # 전체 파이프라인 (기본: btcusdt 60min)
//   node src/run.js --symbol ethusdt         # 다른 종목
//   node src/run.js --period 4hour           # 다른 타임프레임
//   node src/run.js --steps fetch,backtest   # 특정 단계만
//   node src/run.js --skip fetch             # 일부 단계 제외
//   node src/run.js --help                   # 도움말

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const SCRIPT_DIR = __dirname;
const ROOT = path.join(SCRIPT_DIR, '..');

const STEPS = [
  { name: 'fetch',       label: '데이터 수집',         script: 'fetchData.js',    args: true },
  { name: 'backtest',    label: '기본 백테스트',       script: 'backtest.js',     args: true },
  { name: 'optimize',    label: '파라미터 그리드서치', script: 'optimize.js',     args: true },
  { name: 'walkforward', label: 'Walk-Forward 최적화', script: 'walkForward.js',  args: true },
  { name: 'ensemble',    label: '앙상블 비교',         script: 'ensemble.js',     args: true },
  { name: 'multi',       label: '멀티 종목 백테스트',  script: 'multiAsset.js',   args: false },
  { name: 'risk',        label: '리스크엔진 적용',     script: 'backtestRisk.js', args: true },
  { name: 'dashboard',   label: '대시보드 생성',       script: 'dashboard.js',    args: true },
];

function parseArgs() {
  const argv = process.argv.slice(2);
  const out = { symbol: 'btcusdt', period: '60min', steps: null, skip: [], help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') out.help = true;
    else if (a === '--symbol') out.symbol = argv[++i];
    else if (a === '--period') out.period = argv[++i];
    else if (a === '--steps') out.steps = argv[++i].split(',').map(s => s.trim());
    else if (a === '--skip') out.skip = argv[++i].split(',').map(s => s.trim());
  }
  return out;
}

function printHelp() {
  console.log(`
auto_coin 통합 파이프라인

사용법:
  node src/run.js [옵션]

옵션:
  --symbol <sym>   거래쌍 (기본: btcusdt)
  --period <p>     타임프레임 (기본: 60min)   1min/5min/15min/30min/60min/4hour/1day
  --steps <list>   실행할 단계만 쉼표로 (기본: 전체)
  --skip <list>    제외할 단계
  --help           이 도움말

단계 목록:
${STEPS.map((s, i) => `  ${String(i + 1).padStart(2)}. ${s.name.padEnd(12)} — ${s.label}`).join('\n')}

예시:
  node src/run.js
  node src/run.js --symbol ethusdt --period 4hour
  node src/run.js --steps backtest,dashboard
  node src/run.js --skip fetch,walkforward
`);
}

function fmtDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
}

function runStep(step, { symbol, period }) {
  const bar = '─'.repeat(72);
  console.log(`\n${bar}`);
  console.log(`▶ [${step.name}] ${step.label}`);
  console.log(bar);
  const scriptPath = path.join(SCRIPT_DIR, step.script);
  const cmdArgs = step.args ? ` ${symbol} ${period}` : '';
  const start = Date.now();
  try {
    execSync(`node "${scriptPath}"${cmdArgs}`, { stdio: 'inherit', cwd: ROOT });
    return { ok: true, duration: Date.now() - start };
  } catch (e) {
    return { ok: false, duration: Date.now() - start, error: e.message };
  }
}

function main() {
  const opts = parseArgs();
  if (opts.help) { printHelp(); return; }

  // 실행할 단계 필터링
  let steps = STEPS;
  if (opts.steps) {
    const requested = new Set(opts.steps);
    const unknown = [...requested].filter(s => !STEPS.find(x => x.name === s));
    if (unknown.length) { console.error(`알 수 없는 단계: ${unknown.join(', ')}`); process.exit(1); }
    steps = STEPS.filter(s => requested.has(s.name));
  }
  if (opts.skip.length) {
    const skipSet = new Set(opts.skip);
    steps = steps.filter(s => !skipSet.has(s.name));
  }

  console.log('╔════════════════════════════════════════════════════════════════════╗');
  console.log('║ auto_coin 통합 파이프라인                                           ║');
  console.log('╚════════════════════════════════════════════════════════════════════╝');
  console.log(`Symbol: ${opts.symbol}  ·  Period: ${opts.period}  ·  Steps: ${steps.length}개`);
  console.log(`실행할 단계: ${steps.map(s => s.name).join(' → ')}`);
  const runStart = Date.now();

  // 실행 전 데이터 파일 체크 → fetch 단계 없으면 경고
  const dataFile = path.join(ROOT, 'data', `${opts.symbol}_${opts.period}.json`);
  if (!fs.existsSync(dataFile) && !steps.find(s => s.name === 'fetch')) {
    console.warn(`\n⚠️  데이터 파일 없음: ${dataFile}`);
    console.warn('   일부 단계가 샘플 데이터(랜덤워크)로 폴백될 수 있습니다.');
    console.warn('   실데이터로 실행하려면 --steps에 fetch를 포함하세요.\n');
  }

  const results = [];
  for (const step of steps) {
    const r = runStep(step, opts);
    results.push({ step: step.name, ...r });
    if (!r.ok) {
      console.error(`\n✗ ${step.name} 실패 — 파이프라인 중단`);
      break;
    }
  }

  // 최종 요약
  const totalMs = Date.now() - runStart;
  const bar = '═'.repeat(72);
  console.log(`\n${bar}`);
  console.log('◈ 파이프라인 완료');
  console.log(bar);
  console.table(results.map(r => ({
    step: r.step,
    status: r.ok ? '✓ ok' : '✗ fail',
    duration: fmtDuration(r.duration),
  })));
  console.log(`총 소요시간: ${fmtDuration(totalMs)}`);

  const okCount = results.filter(r => r.ok).length;
  console.log(`성공: ${okCount}/${results.length}`);

  // 생성된 아티팩트 목록
  const artifacts = [
    ['dashboard.html',          '대시보드 HTML'],
    ['optimize_result.json',    '그리드서치 결과'],
    ['walkforward_result.json', 'Walk-Forward 결과'],
    ['multi_asset_result.json', '멀티종목 결과'],
  ];
  console.log('\n◈ 생성된 아티팩트');
  for (const [f, label] of artifacts) {
    const p = path.join(ROOT, f);
    if (fs.existsSync(p)) {
      const size = (fs.statSync(p).size / 1024).toFixed(1);
      console.log(`  ✓ ${f.padEnd(28)} ${size} KB  (${label})`);
    }
  }
  console.log();

  if (okCount < results.length) process.exit(1);
}

if (require.main === module) main();
