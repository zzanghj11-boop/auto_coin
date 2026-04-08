// Composite (signal-mining) strategy lab.
//
// 1) Fetch ~5y daily klines per coin from HTX
// 2) Label "rise start" (swing-low confirmed by +20% subsequent rise after 5% drawdown)
//    and "peak" (swing-high confirmed by -10% subsequent drop)
// 3) Compute raw buy signals from all 8 base strategies on every bar
// 4) For each strategy, measure precision/recall against swing-low labels within ±k bars
// 5) Walk-forward: train on first 80% (learn weights = train precision, optimize vote threshold N)
//    Evaluate on last 20%
// 6) Build per-coin composite spec + train/test backtest stats
//
// Output: data/coin_lab/composite_result.json
//
// Run:  node scripts/composite_strategy_lab.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'data', 'coin_lab');
fs.mkdirSync(OUT, { recursive: true });

const COINS = [
  { id: 'BTC',  htx: 'btcusdt'  },
  { id: 'ETH',  htx: 'ethusdt'  },
  { id: 'XRP',  htx: 'xrpusdt'  },
  { id: 'SOL',  htx: 'solusdt'  },
  { id: 'TRX',  htx: 'trxusdt'  },
  { id: 'DOGE', htx: 'dogeusdt' },
  { id: 'XMR',  htx: 'xmrusdt'  },
  { id: 'LTC',  htx: 'ltcusdt'  },
];
// BCH, ZEC dropped (poor results)

// Periods to learn. HTX kline endpoint max size=2000 per request and has no historical pagination,
// so each period below covers a different time span:
//   1day  → ~5.5y   4hour → ~333d   60min → ~83d
const PERIODS = [
  { key: '1day',  exitBars: 60 },  // 60 days
  { key: '4hour', exitBars: 60 },  // 10 days
  { key: '60min', exitBars: 48 },  // 2 days
];

const WINDOW = 3;          // ±k bars to count a signal as "matching" a label
const RISE_PCT = 0.20;     // confirm a swing low if subsequent rise >= 20%
const DROP_PCT = 0.05;     // pre-low drawdown >= 5%
const PEAK_DROP = 0.10;    // confirm a swing high if subsequent drop >= 10%
const TRAIN_FRAC = 0.8;

// ───────── data fetch ─────────
async function fetchHtx(symbol, period = '1day') {
  const url = `https://api.huobi.pro/market/history/kline?symbol=${symbol}&period=${period}&size=2000`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTX ${symbol} HTTP ${r.status}`);
  const j = await r.json();
  if (j.status !== 'ok' || !j.data?.length) throw new Error(`HTX ${symbol} no data`);
  return j.data
    .map(k => ({ ts: k.id * 1000, open: +k.open, high: +k.high, low: +k.low, close: +k.close, volume: +k.amount }))
    .sort((a, b) => a.ts - b.ts);
}

// ───────── indicators ─────────
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

// ───────── 8 strategies (return BUY signal at bar i: 1 / 0) ─────────
function maCross(c, fast = 20, slow = 60) {
  const close = c.map(x => x.close); const f = ema(close, fast), s = ema(close, slow);
  return c.map((_, i) => i > 0 && !isNaN(f[i]) && !isNaN(s[i-1]) && f[i-1] <= s[i-1] && f[i] > s[i] ? 1 : 0);
}
function rsiRev(c, p = 14, lo = 30, tp = 200) {
  const close = c.map(x => x.close); const r = rsi(close, p), t = ema(close, tp);
  return c.map((_, i) => i > 0 && !isNaN(r[i]) && close[i] > t[i] && r[i-1] < lo && r[i] >= lo ? 1 : 0);
}
function rsiFast(c) {
  return rsiRev(c, 9, 45, 30);
}
function bbBreak(c, p = 20, mult = 2, win = 120) {
  const close = c.map(x => x.close); const m = sma(close, p), sd = stdev(close, p);
  const upper = m.map((v, i) => v + mult * sd[i]); const lower = m.map((v, i) => v - mult * sd[i]);
  const width = upper.map((u, i) => u - lower[i]);
  const out = new Array(c.length).fill(0);
  for (let i = win; i < c.length; i++) {
    if (isNaN(width[i])) continue;
    let mn = Infinity;
    for (let j = i - win + 1; j <= i; j++) if (width[j] < mn) mn = width[j];
    if (width[i] <= mn * 1.1 && close[i] > upper[i]) out[i] = 1;
  }
  return out;
}
function bbFast(c) { return bbBreak(c, 10, 2, 30); }
function donchian20(c) {
  const out = new Array(c.length).fill(0);
  for (let i = 20; i < c.length; i++) {
    let hi = -Infinity;
    for (let j = i - 20; j < i; j++) if (c[j].high > hi) hi = c[j].high;
    if (c[i].close > hi) out[i] = 1;
  }
  return out;
}
function vbFast(c, win = 20) {
  const out = new Array(c.length).fill(0);
  for (let i = win; i < c.length; i++) {
    let hi = -Infinity;
    for (let j = i - win; j < i; j++) if (c[j].close > hi) hi = c[j].close;
    if (c[i].close > hi) out[i] = 1;
  }
  return out;
}
function zReversion(c, p = 20, ez = 2) {
  const close = c.map(x => x.close); const m = sma(close, p);
  const out = new Array(c.length).fill(0);
  for (let i = p; i < c.length; i++) {
    if (isNaN(m[i])) continue;
    let v = 0; for (let j = i - p + 1; j <= i; j++) v += (close[j] - m[i]) ** 2;
    const sd = Math.sqrt(v / p); if (sd === 0) continue;
    const z = (close[i] - m[i]) / sd;
    if (z < -ez) out[i] = 1;
  }
  return out;
}
function momVol(c, win = 20, vm = 2) {
  const out = new Array(c.length).fill(0);
  for (let i = win; i < c.length; i++) {
    let hi = -Infinity, vs = 0;
    for (let j = i - win; j < i; j++) { if (c[j].high > hi) hi = c[j].high; vs += c[j].volume; }
    if (c[i].close > hi && c[i].volume > (vs / win) * vm) out[i] = 1;
  }
  return out;
}

const STRATS = {
  ma:        maCross,
  rsi:       rsiRev,
  rsif:      rsiFast,
  bb:        bbBreak,
  bbf:       bbFast,
  donchian:  donchian20,
  vbf:       vbFast,
  zscore:    zReversion,
  momvol:    momVol,
};

// ───────── swing labeling ─────────
// returns: { lows: number[], highs: number[] }  bar indices of confirmed swing lows/highs
function labelSwings(c) {
  const lows = [];
  const highs = [];
  let mode = 'seek_low'; // start by looking for an entry
  let pivotIdx = 0;
  let pivotVal = c[0].close;

  for (let i = 1; i < c.length; i++) {
    const px = c[i].close;
    if (mode === 'seek_low') {
      // We are searching for a confirmed low. Track running min after a 5%+ drop from any prior high.
      // Approach: track running min; if price rises RISE_PCT above the running min, confirm the low.
      if (px < pivotVal) { pivotVal = px; pivotIdx = i; }
      else if (px >= pivotVal * (1 + RISE_PCT)) {
        // confirm low at pivotIdx — but only if there was at least DROP_PCT drop into it
        // find max in window [pivotIdx-30 .. pivotIdx]
        let preMax = -Infinity;
        for (let j = Math.max(0, pivotIdx - 60); j <= pivotIdx; j++) if (c[j].high > preMax) preMax = c[j].high;
        if ((preMax - pivotVal) / preMax >= DROP_PCT) {
          lows.push(pivotIdx);
        }
        // switch to seek_high, reset pivot to current bar (running high)
        mode = 'seek_high';
        pivotVal = px;
        pivotIdx = i;
      }
    } else {
      if (px > pivotVal) { pivotVal = px; pivotIdx = i; }
      else if (px <= pivotVal * (1 - PEAK_DROP)) {
        highs.push(pivotIdx);
        mode = 'seek_low';
        pivotVal = px;
        pivotIdx = i;
      }
    }
  }
  return { lows, highs };
}

// ───────── precision / recall per strategy ─────────
function evalSignals(signals, labels, n, k = WINDOW) {
  // signals: array of {0|1} length n
  // labels: indices of true positives (swing lows)
  // For each fired signal at bar i, we count it as TP if any label j is within |i-j| <= k
  // Recall: fraction of labels that have at least one signal within ±k
  const labelSet = new Set();
  for (const j of labels) for (let d = -k; d <= k; d++) labelSet.add(j + d);
  let fires = 0, tp = 0;
  for (let i = 0; i < n; i++) if (signals[i]) { fires++; if (labelSet.has(i)) tp++; }
  const precision = fires === 0 ? 0 : tp / fires;
  // recall = labels with at least one signal in ±k
  let hit = 0;
  for (const j of labels) {
    let any = false;
    for (let d = -k; d <= k && !any; d++) if (signals[j + d]) any = true;
    if (any) hit++;
  }
  const recall = labels.length === 0 ? 0 : hit / labels.length;
  return { precision, recall, fires, tp, f1: precision + recall === 0 ? 0 : 2 * precision * recall / (precision + recall) };
}

// ───────── composite scoring + backtest ─────────
function compositeFire(signalArr, weights, threshold, n) {
  // signalArr: { stratKey: number[] }, weights: { stratKey: number }
  // Composite score at bar i = sum(weights[k] * signal[k][i])  (within window aggregated by max in [i-WINDOW, i])
  // Fire when score >= threshold
  const scores = new Array(n).fill(0);
  const fires = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (const [k, w] of Object.entries(weights)) {
      // recent any-fire in [i-WINDOW, i]
      let any = 0;
      for (let d = 0; d <= WINDOW; d++) if (i - d >= 0 && signalArr[k][i - d]) { any = 1; break; }
      if (any) s += w;
    }
    scores[i] = s;
    if (s >= threshold) fires[i] = 1;
  }
  return { scores, fires };
}

function backtestComposite(c, fires, exitBars = 60, fee = 0.001) {
  let cash = 10000, coins = 0, inPos = false, entryIdx = -1, entryEq = 0;
  const equity = [];
  let trades = 0, wins = 0;
  for (let i = 0; i < c.length; i++) {
    const px = c[i].close;
    if (!inPos && fires[i]) {
      coins = (cash * (1 - fee)) / px; cash = 0; inPos = true; entryIdx = i; entryEq = coins * px;
    } else if (inPos) {
      // exit by trailing stop -10% from peak since entry, or after exitDays
      let peak = -Infinity;
      for (let j = entryIdx; j <= i; j++) if (c[j].high > peak) peak = c[j].high;
      const stopExit = c[i].close < peak * 0.90;
      const timeExit = i - entryIdx >= exitBars;
      if (stopExit || timeExit) {
        cash = coins * px * (1 - fee); coins = 0; inPos = false;
        trades++; if (cash > entryEq) wins++;
      }
    }
    equity.push(cash + coins * px);
  }
  if (inPos) { cash = coins * c[c.length - 1].close * (1 - fee); coins = 0; trades++; if (cash > entryEq) wins++; }
  const final = equity[equity.length - 1];
  // bars per year inferred from candle ts spacing
  const dtMs = c.length > 1 ? (c[c.length-1].ts - c[0].ts) / (c.length - 1) : 86400000;
  const barsPerYear = (365 * 86400000) / dtMs;
  const cagr = Math.pow(final / 10000, barsPerYear / c.length) - 1;
  const ret = [];
  for (let i = 1; i < equity.length; i++) ret.push((equity[i] - equity[i-1]) / equity[i-1]);
  const m = ret.reduce((s, x) => s + x, 0) / ret.length;
  const v = ret.reduce((s, x) => s + (x - m) ** 2, 0) / (ret.length - 1);
  const sd = Math.sqrt(v);
  const sharpe = sd === 0 ? 0 : (m / sd) * Math.sqrt(barsPerYear);
  let peak = equity[0], mdd = 0;
  for (const e of equity) { if (e > peak) peak = e; const dd = (peak - e) / peak; if (dd > mdd) mdd = dd; }
  return { totalReturn: final / 10000 - 1, cagr, sharpe, mdd, trades, winRate: trades > 0 ? wins / trades : 0 };
}

// ───────── per-coin processing ─────────
async function processCoin(coin, period) {
  console.log(`\n=== ${coin.id} [${period.key}] ===`);
  const c = await fetchHtx(coin.htx, period.key);
  console.log(`  candles=${c.length}`);
  const { lows, highs } = labelSwings(c);
  console.log(`  swings: ${lows.length} lows, ${highs.length} highs`);

  // Compute all 8 strategy signals on full series
  const signals = {};
  for (const [k, fn] of Object.entries(STRATS)) signals[k] = fn(c);

  // Train/test split
  const trainEnd = Math.floor(c.length * TRAIN_FRAC);
  const trainLows = lows.filter(i => i < trainEnd);
  const testLows = lows.filter(i => i >= trainEnd);

  // Per-strategy precision on train (used as weight)
  const strategyStats = {};
  for (const k of Object.keys(STRATS)) {
    const trainSig = signals[k].slice(0, trainEnd);
    const testSig = signals[k].slice(trainEnd);
    strategyStats[k] = {
      train: evalSignals(trainSig, trainLows, trainEnd),
      test: evalSignals(testSig, testLows.map(i => i - trainEnd), c.length - trainEnd),
    };
  }

  // Choose only strategies whose train precision > random (we treat random ≈ (2*WINDOW+1) / total_bars)
  const baseRate = (2 * WINDOW + 1) * lows.length / c.length;
  const useful = Object.entries(strategyStats)
    .filter(([_, s]) => s.train.precision > baseRate * 1.2 && s.train.fires >= 5)
    .map(([k, s]) => [k, s.train.precision]);
  useful.sort((a, b) => b[1] - a[1]);

  // Weights = normalized train precision
  const weights = {};
  const wSum = useful.reduce((a, [_, p]) => a + p, 0) || 1;
  for (const [k, p] of useful) weights[k] = +(p / wSum).toFixed(4);

  // Grid-search vote threshold over train
  let best = null;
  for (let nVote = 1; nVote <= Math.min(6, useful.length); nVote++) {
    // threshold = sum of top nVote weights
    const sortedW = Object.values(weights).sort((a, b) => b - a);
    const thresh = sortedW.slice(0, nVote).reduce((a, b) => a + b, 0) * 0.5; // need at least half of the top-N weight mass
    const trainCandles = c.slice(0, trainEnd);
    const trainSignalArr = {};
    for (const k of Object.keys(weights)) trainSignalArr[k] = signals[k].slice(0, trainEnd);
    const { fires } = compositeFire(trainSignalArr, weights, thresh, trainEnd);
    const bt = backtestComposite(trainCandles, fires, period.exitBars);
    if (!best || bt.sharpe > best.bt.sharpe) best = { nVote, threshold: +thresh.toFixed(4), bt };
  }

  // Test on out-of-sample
  const testSignalArr = {};
  for (const k of Object.keys(weights)) testSignalArr[k] = signals[k];
  const { fires: allFires } = compositeFire(testSignalArr, weights, best.threshold, c.length);
  const trainBt = backtestComposite(c.slice(0, trainEnd), allFires.slice(0, trainEnd), period.exitBars);
  const testBt = backtestComposite(c.slice(trainEnd), allFires.slice(trainEnd), period.exitBars);
  const fullBt = backtestComposite(c, allFires, period.exitBars);

  console.log(`  useful strategies: ${useful.map(([k, p]) => `${k}(${p.toFixed(2)})`).join(', ')}`);
  console.log(`  weights: ${JSON.stringify(weights)}`);
  console.log(`  threshold: ${best.threshold}`);
  console.log(`  train sharpe=${trainBt.sharpe.toFixed(2)} cagr=${(trainBt.cagr*100).toFixed(0)}% mdd=${(trainBt.mdd*100).toFixed(0)}% trades=${trainBt.trades}`);
  console.log(`  test  sharpe=${testBt.sharpe.toFixed(2)} cagr=${(testBt.cagr*100).toFixed(0)}% mdd=${(testBt.mdd*100).toFixed(0)}% trades=${testBt.trades}`);

  return {
    coin: coin.id,
    symbol: coin.htx,
    period: period.key,
    candles: c.length,
    span: { from: c[0].ts, to: c[c.length - 1].ts },
    swings: { lows: lows.length, highs: highs.length },
    strategyStats,
    weights,
    threshold: best.threshold,
    backtest: { train: trainBt, test: testBt, full: fullBt },
  };
}

async function main() {
  for (const period of PERIODS) {
    const all = {};
    for (const coin of COINS) {
      try { all[coin.id] = await processCoin(coin, period); }
      catch (e) { console.log(`  ✗ ${coin.id} ${period.key}: ${e.message}`); }
      await new Promise(r => setTimeout(r, 300)); // be polite to HTX
    }
    const fname = `composite_result_${period.key}.json`;
    fs.writeFileSync(path.join(OUT, fname), JSON.stringify(all, null, 2));
    console.log(`\n→ ${path.join(OUT, fname)}`);
  }
  // also write legacy file (1day) for backward-compat
  try {
    fs.copyFileSync(
      path.join(OUT, 'composite_result_1day.json'),
      path.join(OUT, 'composite_result.json'),
    );
  } catch {}
}

main().catch(e => { console.error(e); process.exit(1); });
