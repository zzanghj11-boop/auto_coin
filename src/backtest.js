// 단순 롱-온리 백테스트 엔진 + 4개 전략 비교
const fs = require('fs');
const path = require('path');
const S = require('./strategies');

const FEE = 0.002;      // 테이커 0.2%
const SLIP = 0.0005;    // 슬리피지 0.05%
const STOP = -0.03;     // 공통 -3% 손절

function runBacktest(candles, signals, { initial = 1_000_000 } = {}) {
  let cash = initial, coin = 0, entry = 0;
  const equityCurve = [];
  const trades = [];
  for (let i = 0; i < candles.length; i++) {
    const px = candles[i].close;
    // 손절 체크
    if (coin > 0) {
      const ret = (px - entry) / entry;
      if (ret <= STOP) {
        const proceeds = coin * px * (1 - FEE - SLIP);
        trades.push({ entry, exit: px, ret, reason: 'stop' });
        cash += proceeds; coin = 0; entry = 0;
      }
    }
    if (signals[i] === 1 && coin === 0) {
      const buyPx = px * (1 + SLIP);
      coin = (cash * (1 - FEE)) / buyPx;
      entry = buyPx;
      cash = 0;
    } else if (signals[i] === -1 && coin > 0) {
      const proceeds = coin * px * (1 - FEE - SLIP);
      trades.push({ entry, exit: px, ret: (px - entry) / entry, reason: 'signal' });
      cash += proceeds; coin = 0; entry = 0;
    }
    equityCurve.push(cash + coin * px);
  }
  // 강제 청산
  if (coin > 0) {
    const px = candles.at(-1).close;
    cash += coin * px * (1 - FEE - SLIP);
    trades.push({ entry, exit: px, ret: (px - entry) / entry, reason: 'final' });
    coin = 0;
  }
  return { finalEquity: cash, equityCurve, trades };
}

function metrics(initial, result) {
  const { equityCurve, trades, finalEquity } = result;
  const totalReturn = finalEquity / initial - 1;
  let peak = equityCurve[0], mdd = 0;
  for (const e of equityCurve) {
    if (e > peak) peak = e;
    const dd = e / peak - 1;
    if (dd < mdd) mdd = dd;
  }
  const wins = trades.filter(t => t.ret > 0);
  const losses = trades.filter(t => t.ret <= 0);
  const winRate = trades.length ? wins.length / trades.length : 0;
  const pf = losses.length
    ? wins.reduce((a, b) => a + b.ret, 0) / Math.abs(losses.reduce((a, b) => a + b.ret, 0))
    : Infinity;
  return {
    trades: trades.length,
    totalReturn: (totalReturn * 100).toFixed(2) + '%',
    mdd: (mdd * 100).toFixed(2) + '%',
    winRate: (winRate * 100).toFixed(1) + '%',
    profitFactor: isFinite(pf) ? pf.toFixed(2) : 'inf',
  };
}

async function loadCandles(symbol, period) {
  const f = path.join(__dirname, '..', 'data', `${symbol}_${period}.json`);
  if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, 'utf8'));
  console.log('데이터 없음 → HTX에서 다운로드 시도...');
  let rows;
  try {
    const { fetchKlines } = require('./fetchData');
    rows = await fetchKlines(symbol, period, 2000);
  } catch (e) {
    console.warn(`  HTX fetch 실패 (${e.message}) — 랜덤워크 샘플로 폴백`);
    rows = []; let p = 50000;
    for (let i = 0; i < 1500; i++) {
      const o = p, h = p * (1 + Math.random() * 0.015), l = p * (1 - Math.random() * 0.015);
      const c = p * (1 + (Math.random() - 0.49) * 0.02);
      rows.push({ ts: Date.UTC(2026, 0, 1) + i * 3600e3, open: o, high: h, low: l, close: c, volume: 1 });
      p = c;
    }
  }
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, JSON.stringify(rows));
  return rows;
}

async function main() {
  const symbol = process.argv[2] || 'btcusdt';
  const period = process.argv[3] || '60min';
  const candles = await loadCandles(symbol, period);
  console.log(`\n=== ${symbol.toUpperCase()} / ${period} / ${candles.length} candles ===`);
  console.log(`기간: ${new Date(candles[0].ts).toISOString()} ~ ${new Date(candles.at(-1).ts).toISOString()}\n`);

  const strategies = {
    'MA Cross (20/60)':   S.maCross(candles),
    'RSI 역추세':         S.rsiReversal(candles),
    '볼린저밴드 스퀴즈':  S.bbSqueeze(candles),
    '변동성 돌파 (k=0.5)': S.volatilityBreakout(candles),
  };
  const initial = 1_000_000;
  const rows = [];
  for (const [name, sig] of Object.entries(strategies)) {
    const res = runBacktest(candles, sig, { initial });
    rows.push({ strategy: name, ...metrics(initial, res) });
  }
  // Buy & Hold 벤치마크
  const bh = candles.at(-1).close / candles[0].close - 1;
  console.table(rows);
  console.log(`\n[벤치마크] Buy & Hold: ${(bh * 100).toFixed(2)}%`);
  console.log('\n주의: 백테스트 결과가 미래 수익을 보장하지 않습니다. 페이퍼트레이딩으로 2차 검증 후 소액 실거래로 승격하세요.');
}

if (require.main === module) main().catch(e => { console.error(e); process.exit(1); });

module.exports = { runBacktest, metrics };
