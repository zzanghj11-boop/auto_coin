// 리스크 관리 고도화 모듈
//
// 기존 backtest.js는 전 자본 투입 + 고정 -3% 손절만 있었다.
// 여기서는 재무/퀀트 업계 표준 4종을 구현한다:
//
//   1) ATR — Average True Range (변동성 측정)
//   2) 켈리 공식 기반 포지션 사이징 (상한 제한 포함)
//   3) ATR 기반 동적 손절/익절
//   4) 서킷브레이커 — 일일 손실 한도 초과 시 당일 거래 중단
//
// 이 모듈은 순수 함수/클래스로만 구성되며, backtestRisk.js에서 소비한다.
//
// 설계 원칙
// - 켈리는 "공격적 상한"이므로 하프켈리(0.5×) 또는 1/4 켈리를 쓰는 것이 실무 표준
// - ATR 손절은 고정% 손절보다 시장 변동성에 적응적 → 추세장에서 조기 청산 감소
// - 서킷브레이커는 계좌 보호의 마지막 방어선 (심리적/운영적 안전장치)

// ----- 1. ATR -----
function atr(candles, period = 14) {
  const out = new Array(candles.length).fill(NaN);
  const tr = new Array(candles.length).fill(0);
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    if (i === 0) { tr[i] = c.high - c.low; continue; }
    const prevClose = candles[i - 1].close;
    tr[i] = Math.max(
      c.high - c.low,
      Math.abs(c.high - prevClose),
      Math.abs(c.low - prevClose)
    );
  }
  // Wilder smoothing
  let prev;
  for (let i = 0; i < candles.length; i++) {
    if (i === period - 1) {
      let s = 0; for (let j = 0; j < period; j++) s += tr[j];
      prev = s / period; out[i] = prev;
    } else if (i >= period) {
      prev = (prev * (period - 1) + tr[i]) / period;
      out[i] = prev;
    }
  }
  return out;
}

// ----- 2. 켈리 포지션 사이징 -----
// f* = W - (1-W)/R   (W=승률, R=손익비)
// 안전장치: cap 이상 투입 금지, 음수면 0
function kellyFraction(winRate, payoffRatio, { cap = 0.25, fraction = 0.5 } = {}) {
  if (payoffRatio <= 0) return 0;
  const f = winRate - (1 - winRate) / payoffRatio;
  if (f <= 0) return 0;
  return Math.min(f * fraction, cap);
}

// 실시간 켈리: 최근 N건 거래의 실적으로 동적 계산
function rollingKelly(tradeHistory, { window = 30, ...opts } = {}) {
  if (tradeHistory.length < 10) return 0.1; // 초기값 10%
  const recent = tradeHistory.slice(-window);
  const wins = recent.filter(t => t.ret > 0);
  const losses = recent.filter(t => t.ret <= 0);
  if (losses.length === 0) return 0.25; // 전승은 관측치 부족 → 상한
  const winRate = wins.length / recent.length;
  const avgWin = wins.reduce((a, b) => a + b.ret, 0) / Math.max(wins.length, 1);
  const avgLoss = Math.abs(losses.reduce((a, b) => a + b.ret, 0) / losses.length);
  if (avgLoss === 0) return 0.25;
  const R = avgWin / avgLoss;
  return kellyFraction(winRate, R, opts);
}

// ----- 3. ATR 기반 손절/익절 -----
// 진입 시점의 ATR을 스냅샷해서 고정
function atrStops(entryPrice, atrValue, { stopMult = 2, targetMult = 3 } = {}) {
  return {
    stop: entryPrice - stopMult * atrValue,
    target: entryPrice + targetMult * atrValue,
    riskPerUnit: stopMult * atrValue,
  };
}

// ----- 4. 서킷브레이커 -----
class CircuitBreaker {
  constructor({ dailyLossLimit = 0.05, lookbackBars = 24 } = {}) {
    this.dailyLossLimit = dailyLossLimit; // 5%
    this.lookbackBars = lookbackBars;
    this.tripped = false;
    this.trippedAt = null;
    this.equityWindow = [];
  }
  update(ts, equity) {
    this.equityWindow.push({ ts, equity });
    if (this.equityWindow.length > this.lookbackBars) this.equityWindow.shift();
    const peak = Math.max(...this.equityWindow.map(e => e.equity));
    const drawdown = equity / peak - 1;
    if (drawdown <= -this.dailyLossLimit && !this.tripped) {
      this.tripped = true;
      this.trippedAt = ts;
    }
    // 다음 날(24h 후) 자동 리셋
    if (this.tripped && this.trippedAt && ts - this.trippedAt >= 24 * 3600 * 1000) {
      this.tripped = false;
      this.trippedAt = null;
      this.equityWindow = [{ ts, equity }];
    }
    return this.tripped;
  }
}

module.exports = { atr, kellyFraction, rollingKelly, atrStops, CircuitBreaker };
