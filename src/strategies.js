// 4개 전략. 각 전략은 (candles) → signals[] 를 리턴.
// signals[i] ∈ {1: 롱 진입, -1: 청산, 0: 유지}. 롱 전용.
const { ema, rsi, bollinger } = require('./indicators');

function maCross(candles, { fast = 20, slow = 60 } = {}) {
  const close = candles.map(c => c.close);
  const f = ema(close, fast);
  const s = ema(close, slow);
  const sig = new Array(candles.length).fill(0);
  for (let i = 1; i < candles.length; i++) {
    if (isNaN(f[i]) || isNaN(s[i]) || isNaN(f[i - 1]) || isNaN(s[i - 1])) continue;
    if (f[i - 1] <= s[i - 1] && f[i] > s[i]) sig[i] = 1;
    else if (f[i - 1] >= s[i - 1] && f[i] < s[i]) sig[i] = -1;
  }
  return sig;
}

function rsiReversal(candles, { period = 14, lower = 30, upper = 70, trendPeriod = 200 } = {}) {
  const close = candles.map(c => c.close);
  const r = rsi(close, period);
  const t = ema(close, trendPeriod);
  const sig = new Array(candles.length).fill(0);
  for (let i = 1; i < candles.length; i++) {
    if (isNaN(r[i]) || isNaN(r[i - 1]) || isNaN(t[i])) continue;
    if (close[i] > t[i] && r[i - 1] < lower && r[i] >= lower) sig[i] = 1;
    else if (r[i - 1] < 50 && r[i] >= 50) {
      // 중립선 도달 시 청산 후보 (별도 관리)
    }
    if (r[i - 1] > upper && r[i] <= upper) sig[i] = -1;
  }
  return sig;
}

function bbSqueeze(candles, { period = 20, mult = 2, window = 120 } = {}) {
  const close = candles.map(c => c.close);
  const { mid, upper, lower } = bollinger(close, period, mult);
  const width = upper.map((u, i) => (isNaN(u) ? NaN : u - lower[i]));
  const sig = new Array(candles.length).fill(0);
  for (let i = window; i < candles.length; i++) {
    if (isNaN(width[i])) continue;
    let min = Infinity;
    for (let j = i - window + 1; j <= i; j++) if (width[j] < min) min = width[j];
    const squeezed = width[i] <= min * 1.0001;
    if (squeezed && close[i] > upper[i]) sig[i] = 1;
    if (close[i] < mid[i]) sig[i] = -1;
  }
  return sig;
}

function volatilityBreakout(candles, { k = 0.5 } = {}) {
  // 1h 캔들 가정. 세션 = UTC 자정 기준 일단위.
  const sig = new Array(candles.length).fill(0);
  // 각 일자별 전일 변동폭, 당일 시가 산출
  const dayOpen = {}; const dayRange = {};
  for (const c of candles) {
    const d = new Date(c.ts).toISOString().slice(0, 10);
    if (!(d in dayOpen)) dayOpen[d] = c.open;
    if (!(d in dayRange)) dayRange[d] = { high: c.high, low: c.low };
    else {
      dayRange[d].high = Math.max(dayRange[d].high, c.high);
      dayRange[d].low = Math.min(dayRange[d].low, c.low);
    }
  }
  const days = Object.keys(dayRange).sort();
  const prevRange = {};
  for (let i = 1; i < days.length; i++) {
    prevRange[days[i]] = dayRange[days[i - 1]].high - dayRange[days[i - 1]].low;
  }
  let enteredToday = null;
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const d = new Date(c.ts).toISOString().slice(0, 10);
    const h = new Date(c.ts).getUTCHours();
    if (h === 0) { // 세션 전환
      if (enteredToday !== null) sig[i] = -1;
      enteredToday = null;
    }
    const pr = prevRange[d];
    if (pr == null || enteredToday != null) continue;
    const target = dayOpen[d] + k * pr;
    if (c.high >= target) { sig[i] = 1; enteredToday = d; }
  }
  return sig;
}

// ─────────────────────────────────────────────────────────
// 1분봉 튜닝 버전 — 빠른 시각적 피드백용
// 원본과 같은 아이디어지만 파라미터를 1min 스케일에 맞게 완화
// ─────────────────────────────────────────────────────────

// RSI-fast: 추세필터 30EMA(짧음), 과매도 기준 45로 완화, 9기간 RSI
function rsiReversalFast(candles) {
  return rsiReversal(candles, { period: 9, lower: 45, upper: 55, trendPeriod: 30 });
}

// BB-fast: 윈도우 30, 스퀴즈 임계 +10% 여유, 기간 10
function bbSqueezeFast(candles, { period = 10, mult = 2, window = 30 } = {}) {
  const close = candles.map(c => c.close);
  const { mid, upper, lower } = bollinger(close, period, mult);
  const width = upper.map((u, i) => (isNaN(u) ? NaN : u - lower[i]));
  const sig = new Array(candles.length).fill(0);
  for (let i = window; i < candles.length; i++) {
    if (isNaN(width[i])) continue;
    let min = Infinity;
    for (let j = i - window + 1; j <= i; j++) if (width[j] < min) min = width[j];
    const squeezed = width[i] <= min * 1.10;  // 10% 여유
    if (squeezed && close[i] > upper[i]) sig[i] = 1;
    if (close[i] < mid[i]) sig[i] = -1;
  }
  return sig;
}

// Volatility BO fast: "전일" 대신 "직전 60봉 레인지" 를 기준으로 돌파 감지
// 세션 = rolling 60bar 윈도우. 청산은 고정 bars 후 또는 트레일 기반이 아니라,
// 단순히 다음 60봉 윈도우가 갱신될 때 (60bars 보유) 신호 청산.
// VB-fast: 직전 window봉 종가 최고치를 close가 돌파하면 진입 (도나치안 채널 변형)
function volatilityBreakoutFast(candles, { window = 20, holdBars = 10 } = {}) {
  const sig = new Array(candles.length).fill(0);
  let entryIdx = null;
  for (let i = window; i < candles.length; i++) {
    if (entryIdx != null && i - entryIdx >= holdBars) {
      sig[i] = -1; entryIdx = null; continue;
    }
    if (entryIdx != null) continue;
    let hi = -Infinity;
    for (let j = i - window; j < i; j++) if (candles[j].close > hi) hi = candles[j].close;
    if (candles[i].close > hi) { sig[i] = 1; entryIdx = i; }
  }
  return sig;
}

module.exports = {
  maCross, rsiReversal, bbSqueeze, volatilityBreakout,
  rsiReversalFast, bbSqueezeFast, volatilityBreakoutFast,
};
