// Coin-by-coin strategy lab
// 1) Fetch ~5y of daily klines per coin from HTX (fallback: OKX)
// 2) Compute regime metrics
// 3) Grid-search each base strategy, pick best by Sharpe
// 4) Write JSON result + coin_presets.ts + xlsx report
//
// Run:  node scripts/coin_strategy_lab.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'data', 'coin_lab');
fs.mkdirSync(OUT_DIR, { recursive: true });

const COINS = [
  { id: 'BTC',  htx: 'btcusdt',  okx: 'BTC-USDT'  },
  { id: 'ETH',  htx: 'ethusdt',  okx: 'ETH-USDT'  },
  { id: 'XRP',  htx: 'xrpusdt',  okx: 'XRP-USDT'  },
  { id: 'SOL',  htx: 'solusdt',  okx: 'SOL-USDT'  },
  { id: 'TRX',  htx: 'trxusdt',  okx: 'TRX-USDT'  },
  { id: 'DOGE', htx: 'dogeusdt', okx: 'DOGE-USDT' },
  { id: 'BCH',  htx: 'bchusdt',  okx: 'BCH-USDT'  },
  { id: 'XMR',  htx: 'xmrusdt',  okx: 'XMR-USDT'  },
  { id: 'ZEC',  htx: 'zecusdt',  okx: 'ZEC-USDT'  },
  { id: 'LTC',  htx: 'ltcusdt',  okx: 'LTC-USDT'  },
];

// ───────────────────── data fetchers ─────────────────────
async function fetchHtx(symbol) {
  const url = `https://api.huobi.pro/market/history/kline?symbol=${symbol}&period=1day&size=2000`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTX ${symbol} HTTP ${r.status}`);
  const j = await r.json();
  if (j.status !== 'ok' || !j.data?.length) throw new Error(`HTX ${symbol} no data`);
  return j.data
    .map(k => ({ ts: k.id * 1000, open: +k.open, high: +k.high, low: +k.low, close: +k.close, volume: +k.amount }))
    .sort((a, b) => a.ts - b.ts);
}

async function fetchOkx(instId) {
  // OKX /api/v5/market/history-candles, max 100 per call. We page back ~5y (1825 days → 19 calls)
  const out = [];
  let after = ''; // ms ts cursor (older than)
  for (let page = 0; page < 25; page++) {
    const u = `https://www.okx.com/api/v5/market/history-candles?instId=${instId}&bar=1Dutc&limit=100${after ? `&after=${after}` : ''}`;
    const r = await fetch(u);
    if (!r.ok) throw new Error(`OKX ${instId} HTTP ${r.status}`);
    const j = await r.json();
    if (j.code !== '0' || !j.data?.length) break;
    for (const k of j.data) out.push({ ts: +k[0], open: +k[1], high: +k[2], low: +k[3], close: +k[4], volume: +k[5] });
    after = j.data[j.data.length - 1][0];
    if (j.data.length < 100) break;
  }
  return out.sort((a, b) => a.ts - b.ts);
}

async function fetchCandles(coin) {
  try {
    const c = await fetchHtx(coin.htx);
    if (c.length >= 365) return { source: 'htx', candles: c };
    throw new Error('htx too short');
  } catch (e) {
    console.log(`  HTX failed (${e.message}), trying OKX…`);
    const c = await fetchOkx(coin.okx);
    return { source: 'okx', candles: c };
  }
}

// ───────────────────── indicators ─────────────────────
const sma = (a, p) => a.map((_, i) => i < p - 1 ? NaN : a.slice(i - p + 1, i + 1).reduce((s, x) => s + x, 0) / p);
const ema = (a, p) => {
  const k = 2 / (p + 1); const out = []; let e = a[0];
  for (let i = 0; i < a.length; i++) { e = i === 0 ? a[0] : a[i] * k + e * (1 - k); out.push(i < p - 1 ? NaN : e); }
  return out;
};
function rsi(close, p = 14) {
  const out = new Array(close.length).fill(NaN);
  let g = 0, l = 0;
  for (let i = 1; i <= p; i++) { const d = close[i] - close[i - 1]; if (d >= 0) g += d; else l -= d; }
  let ag = g / p, al = l / p;
  out[p] = al === 0 ? 100 : 100 - 100 / (1 + ag / al);
  for (let i = p + 1; i < close.length; i++) {
    const d = close[i] - close[i - 1];
    ag = (ag * (p - 1) + Math.max(d, 0)) / p;
    al = (al * (p - 1) + Math.max(-d, 0)) / p;
    out[i] = al === 0 ? 100 : 100 - 100 / (1 + ag / al);
  }
  return out;
}
function stdev(a, p) {
  return a.map((_, i) => {
    if (i < p - 1) return NaN;
    const slice = a.slice(i - p + 1, i + 1);
    const m = slice.reduce((s, x) => s + x, 0) / p;
    return Math.sqrt(slice.reduce((s, x) => s + (x - m) ** 2, 0) / p);
  });
}

// ───────────────────── regime metrics ─────────────────────
function logReturns(close) {
  const out = [];
  for (let i = 1; i < close.length; i++) out.push(Math.log(close[i] / close[i - 1]));
  return out;
}
function annualVol(close) {
  const r = logReturns(close);
  const m = r.reduce((s, x) => s + x, 0) / r.length;
  const v = r.reduce((s, x) => s + (x - m) ** 2, 0) / (r.length - 1);
  return Math.sqrt(v) * Math.sqrt(365);
}
function trendStrength(close) {
  // r^2 of linear fit on log-price
  const y = close.map(Math.log);
  const n = y.length;
  let sx = 0, sy = 0, sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { sx += i; sy += y[i]; sxy += i * y[i]; sxx += i * i; syy += y[i] * y[i]; }
  const num = n * sxy - sx * sy;
  const den = Math.sqrt((n * sxx - sx * sx) * (n * syy - sy * sy));
  return den === 0 ? 0 : (num / den) ** 2;
}
function hurst(close) {
  // R/S Hurst exponent (rough)
  const r = logReturns(close);
  const lags = [10, 20, 40, 80, 160];
  const xs = [], ys = [];
  for (const lag of lags) {
    if (r.length < lag * 2) continue;
    const tau = [];
    for (let i = 0; i + lag <= r.length; i += lag) {
      const seg = r.slice(i, i + lag);
      const m = seg.reduce((s, x) => s + x, 0) / lag;
      const dev = seg.map(x => x - m);
      const cum = []; let acc = 0;
      for (const d of dev) { acc += d; cum.push(acc); }
      const R = Math.max(...cum) - Math.min(...cum);
      const S = Math.sqrt(seg.reduce((s, x) => s + (x - m) ** 2, 0) / lag);
      if (S > 0) tau.push(R / S);
    }
    if (tau.length > 0) {
      xs.push(Math.log(lag));
      ys.push(Math.log(tau.reduce((s, x) => s + x, 0) / tau.length));
    }
  }
  if (xs.length < 2) return 0.5;
  const n = xs.length;
  const sx = xs.reduce((a, b) => a + b, 0), sy = ys.reduce((a, b) => a + b, 0);
  const sxy = xs.reduce((a, b, i) => a + b * ys[i], 0);
  const sxx = xs.reduce((a, b) => a + b * b, 0);
  return (n * sxy - sx * sy) / (n * sxx - sx * sx);
}
function maxDrawdown(equity) {
  let peak = equity[0], mdd = 0;
  for (const v of equity) { if (v > peak) peak = v; const dd = (peak - v) / peak; if (dd > mdd) mdd = dd; }
  return mdd;
}

// ───────────────────── strategies (signals: 1=enter long, -1=exit, 0=hold) ─────────────────────
function maCross(c, { fast, slow }) {
  const close = c.map(x => x.close);
  const f = ema(close, fast), s = ema(close, slow);
  const sig = new Array(c.length).fill(0);
  for (let i = 1; i < c.length; i++) {
    if (isNaN(f[i]) || isNaN(s[i]) || isNaN(f[i-1]) || isNaN(s[i-1])) continue;
    if (f[i-1] <= s[i-1] && f[i] > s[i]) sig[i] = 1;
    else if (f[i-1] >= s[i-1] && f[i] < s[i]) sig[i] = -1;
  }
  return sig;
}
function rsiRev(c, { p, lo, hi, tp }) {
  const close = c.map(x => x.close);
  const r = rsi(close, p), t = ema(close, tp);
  const sig = new Array(c.length).fill(0);
  for (let i = 1; i < c.length; i++) {
    if (isNaN(r[i]) || isNaN(r[i-1]) || isNaN(t[i])) continue;
    if (close[i] > t[i] && r[i-1] < lo && r[i] >= lo) sig[i] = 1;
    if (r[i-1] > hi && r[i] <= hi) sig[i] = -1;
  }
  return sig;
}
function bbBreak(c, { p, mult, win }) {
  const close = c.map(x => x.close);
  const m = sma(close, p), sd = stdev(close, p);
  const upper = m.map((v, i) => v + mult * sd[i]);
  const lower = m.map((v, i) => v - mult * sd[i]);
  const width = upper.map((u, i) => u - lower[i]);
  const sig = new Array(c.length).fill(0);
  for (let i = win; i < c.length; i++) {
    if (isNaN(width[i])) continue;
    let mn = Infinity;
    for (let j = i - win + 1; j <= i; j++) if (width[j] < mn) mn = width[j];
    if (width[i] <= mn * 1.1 && close[i] > upper[i]) sig[i] = 1;
    if (close[i] < m[i]) sig[i] = -1;
  }
  return sig;
}
function donchian(c, { entryWin, exitWin }) {
  const sig = new Array(c.length).fill(0);
  let inPos = false;
  for (let i = Math.max(entryWin, exitWin); i < c.length; i++) {
    if (!inPos) {
      let hi = -Infinity;
      for (let j = i - entryWin; j < i; j++) if (c[j].high > hi) hi = c[j].high;
      if (c[i].close > hi) { sig[i] = 1; inPos = true; }
    } else {
      let lo = Infinity;
      for (let j = i - exitWin; j < i; j++) if (c[j].low < lo) lo = c[j].low;
      if (c[i].close < lo) { sig[i] = -1; inPos = false; }
    }
  }
  return sig;
}
function zscore(c, { p, entryZ, exitZ }) {
  const close = c.map(x => x.close);
  const m = sma(close, p);
  const sig = new Array(c.length).fill(0);
  let inPos = false;
  for (let i = p; i < c.length; i++) {
    if (isNaN(m[i])) continue;
    let v = 0;
    for (let j = i - p + 1; j <= i; j++) v += (close[j] - m[i]) ** 2;
    const sd = Math.sqrt(v / p);
    if (sd === 0) continue;
    const z = (close[i] - m[i]) / sd;
    if (!inPos && z < -entryZ) { sig[i] = 1; inPos = true; }
    else if (inPos && z > -exitZ) { sig[i] = -1; inPos = false; }
  }
  return sig;
}
function momVol(c, { win, volMult, sl, tp }) {
  const sig = new Array(c.length).fill(0);
  let inPos = false, entry = 0;
  for (let i = win; i < c.length; i++) {
    let hi = -Infinity, vs = 0;
    for (let j = i - win; j < i; j++) { if (c[j].high > hi) hi = c[j].high; vs += c[j].volume; }
    const av = vs / win;
    if (!inPos && c[i].close > hi && c[i].volume > av * volMult) { sig[i] = 1; inPos = true; entry = c[i].close; }
    else if (inPos && (c[i].close < entry * (1 - sl) || c[i].close > entry * (1 + tp))) { sig[i] = -1; inPos = false; }
  }
  return sig;
}

// ───────────────────── backtester (long-only, all-in) ─────────────────────
function backtest(candles, signals, fee = 0.001) {
  let cash = 10000, coins = 0, inPos = false;
  const equity = [];
  let trades = 0, wins = 0, entryEq = 0;
  for (let i = 0; i < candles.length; i++) {
    const px = candles[i].close;
    if (!inPos && signals[i] === 1) {
      coins = (cash * (1 - fee)) / px; cash = 0; inPos = true; entryEq = coins * px;
    } else if (inPos && signals[i] === -1) {
      cash = coins * px * (1 - fee); coins = 0; inPos = false;
      const exitEq = cash; trades++; if (exitEq > entryEq) wins++;
    }
    equity.push(cash + coins * px);
  }
  // close at end
  if (inPos) { cash = coins * candles[candles.length - 1].close * (1 - fee); coins = 0; trades++; if (cash > entryEq) wins++; }

  const final = equity[equity.length - 1];
  const totalReturn = final / 10000 - 1;
  const days = candles.length;
  const cagr = Math.pow(final / 10000, 365 / days) - 1;
  const dailyRet = [];
  for (let i = 1; i < equity.length; i++) dailyRet.push((equity[i] - equity[i-1]) / equity[i-1]);
  const m = dailyRet.reduce((s, x) => s + x, 0) / dailyRet.length;
  const v = dailyRet.reduce((s, x) => s + (x - m) ** 2, 0) / (dailyRet.length - 1);
  const sd = Math.sqrt(v);
  const sharpe = sd === 0 ? 0 : (m / sd) * Math.sqrt(365);
  const mdd = maxDrawdown(equity);
  const calmar = mdd === 0 ? 0 : cagr / mdd;
  return { totalReturn, cagr, sharpe, mdd, calmar, trades, winRate: trades > 0 ? wins / trades : 0, finalEq: final };
}

// ───────────────────── grid search ─────────────────────
const GRIDS = {
  ma: () => {
    const out = [];
    for (const fast of [10, 20, 30, 50]) for (const slow of [50, 100, 150, 200]) if (slow > fast) out.push({ fast, slow });
    return out;
  },
  rsi: () => {
    const out = [];
    for (const p of [9, 14, 21]) for (const lo of [25, 30, 35]) for (const hi of [65, 70, 75]) for (const tp of [100, 150, 200]) out.push({ p, lo, hi, tp });
    return out;
  },
  bb: () => {
    const out = [];
    for (const p of [10, 20, 30]) for (const mult of [1.5, 2, 2.5]) for (const win of [60, 120, 180]) out.push({ p, mult, win });
    return out;
  },
  donchian: () => {
    const out = [];
    for (const e of [10, 20, 40, 55]) for (const x of [5, 10, 20]) if (x < e) out.push({ entryWin: e, exitWin: x });
    return out;
  },
  zscore: () => {
    const out = [];
    for (const p of [10, 20, 30]) for (const ez of [1.5, 2, 2.5]) for (const xz of [0, 0.3, 0.5]) out.push({ p, entryZ: ez, exitZ: xz });
    return out;
  },
  momvol: () => {
    const out = [];
    for (const win of [10, 20, 40]) for (const vm of [1.5, 2, 3]) for (const sl of [0.02, 0.04]) for (const tp of [0.05, 0.10, 0.15]) out.push({ win, volMult: vm, sl, tp });
    return out;
  },
};
const STRATS = {
  ma: maCross,
  rsi: rsiRev,
  bb: bbBreak,
  donchian: donchian,
  zscore: zscore,
  momvol: momVol,
};
const STRAT_LABELS = {
  ma: 'MA Cross',
  rsi: 'RSI Reversal',
  bb: 'Bollinger Squeeze',
  donchian: 'Donchian Breakout',
  zscore: 'Z-Score Reversion',
  momvol: 'Momentum + Volume',
};

function searchBest(candles) {
  const results = [];
  for (const [key, fn] of Object.entries(STRATS)) {
    const grid = GRIDS[key]();
    let best = null;
    for (const params of grid) {
      const sig = fn(candles, params);
      const m = backtest(candles, sig);
      if (m.trades < 5) continue; // skip pathological
      if (!best || m.sharpe > best.metrics.sharpe) best = { params, metrics: m };
    }
    if (best) results.push({ strategy: key, label: STRAT_LABELS[key], ...best });
  }
  results.sort((a, b) => b.metrics.sharpe - a.metrics.sharpe);
  return results;
}

// ───────────────────── main ─────────────────────
async function main() {
  const all = {};
  for (const coin of COINS) {
    console.log(`\n=== ${coin.id} ===`);
    let bundle;
    try {
      bundle = await fetchCandles(coin);
    } catch (e) {
      console.log(`  ✗ fetch failed: ${e.message}`);
      continue;
    }
    const c = bundle.candles;
    console.log(`  source=${bundle.source} candles=${c.length} from ${new Date(c[0].ts).toISOString().slice(0,10)} to ${new Date(c[c.length-1].ts).toISOString().slice(0,10)}`);
    const close = c.map(x => x.close);
    const metrics = {
      annualVol: annualVol(close),
      trendR2: trendStrength(close),
      hurst: hurst(close),
      buyHoldReturn: close[close.length-1] / close[0] - 1,
      buyHoldMdd: maxDrawdown(close),
    };
    console.log(`  vol=${(metrics.annualVol*100).toFixed(1)}% trendR2=${metrics.trendR2.toFixed(2)} hurst=${metrics.hurst.toFixed(2)} bh=${(metrics.buyHoldReturn*100).toFixed(0)}%`);
    const ranked = searchBest(c);
    console.log(`  top 3:`);
    for (const r of ranked.slice(0, 3)) {
      console.log(`    ${r.strategy.padEnd(10)} sharpe=${r.metrics.sharpe.toFixed(2)} cagr=${(r.metrics.cagr*100).toFixed(1)}% mdd=${(r.metrics.mdd*100).toFixed(1)}% trades=${r.metrics.trades}`);
    }
    all[coin.id] = { source: bundle.source, candles: c.length, span: { from: c[0].ts, to: c[c.length-1].ts }, metrics, ranked };
  }
  fs.writeFileSync(path.join(OUT_DIR, 'lab_result.json'), JSON.stringify(all, null, 2));
  console.log(`\n→ ${path.join(OUT_DIR, 'lab_result.json')}`);
}

main().catch(e => { console.error(e); process.exit(1); });
