import { ema, sma, rsi, bollinger } from './indicators';

export interface Candle { ts: number; open: number; high: number; low: number; close: number; volume: number; }
export type Signal = 0 | 1 | -1;

// ─── 전략 함수들 ──────────────────────────────────────────

export function maCross(candles: Candle[], { fast = 20, slow = 60 } = {}): Signal[] {
  const close = candles.map(c => c.close);
  const f = ema(close, fast), s = ema(close, slow);
  const sig: Signal[] = new Array(candles.length).fill(0);
  for (let i = 1; i < candles.length; i++) {
    if (isNaN(f[i]) || isNaN(s[i]) || isNaN(f[i-1]) || isNaN(s[i-1])) continue;
    if (f[i-1] <= s[i-1] && f[i] > s[i]) sig[i] = 1;
    else if (f[i-1] >= s[i-1] && f[i] < s[i]) sig[i] = -1;
  }
  return sig;
}

export function rsiReversal(candles: Candle[], opts: { period?: number; lower?: number; upper?: number; trendPeriod?: number } = {}): Signal[] {
  const { period = 14, lower = 30, upper = 70, trendPeriod = 200 } = opts;
  const close = candles.map(c => c.close);
  const r = rsi(close, period);
  const t = ema(close, trendPeriod);
  const sig: Signal[] = new Array(candles.length).fill(0);
  for (let i = 1; i < candles.length; i++) {
    if (isNaN(r[i]) || isNaN(r[i-1]) || isNaN(t[i])) continue;
    if (close[i] > t[i] && r[i-1] < lower && r[i] >= lower) sig[i] = 1;
    if (r[i-1] > upper && r[i] <= upper) sig[i] = -1;
  }
  return sig;
}

export function rsiReversalFast(candles: Candle[]): Signal[] {
  return rsiReversal(candles, { period: 9, lower: 45, upper: 55, trendPeriod: 30 });
}

export function bbSqueeze(candles: Candle[], opts: { period?: number; mult?: number; window?: number } = {}): Signal[] {
  const { period = 20, mult = 2, window = 120 } = opts;
  const close = candles.map(c => c.close);
  const { mid, upper, lower } = bollinger(close, period, mult);
  const width = upper.map((u, i) => (isNaN(u) ? NaN : u - lower[i]));
  const sig: Signal[] = new Array(candles.length).fill(0);
  for (let i = window; i < candles.length; i++) {
    if (isNaN(width[i])) continue;
    let min = Infinity;
    for (let j = i - window + 1; j <= i; j++) if (width[j] < min) min = width[j];
    if (width[i] <= min * 1.1 && close[i] > upper[i]) sig[i] = 1;
    if (close[i] < mid[i]) sig[i] = -1;
  }
  return sig;
}

export function bbSqueezeFast(candles: Candle[]): Signal[] {
  return bbSqueeze(candles, { period: 10, mult: 2, window: 30 });
}

export function volatilityBreakoutFast(candles: Candle[], { window = 20, holdBars = 10 } = {}): Signal[] {
  const sig: Signal[] = new Array(candles.length).fill(0);
  let entryIdx: number | null = null;
  for (let i = window; i < candles.length; i++) {
    if (entryIdx != null && i - entryIdx >= holdBars) { sig[i] = -1; entryIdx = null; continue; }
    if (entryIdx != null) continue;
    let hi = -Infinity;
    for (let j = i - window; j < i; j++) if (candles[j].close > hi) hi = candles[j].close;
    if (candles[i].close > hi) { sig[i] = 1; entryIdx = i; }
  }
  return sig;
}

// Donchian 20-Breakout (터틀 트레이더 룰)
export function donchian20(candles: Candle[], { entryWin = 20, exitWin = 10 } = {}): Signal[] {
  const sig: Signal[] = new Array(candles.length).fill(0);
  let inPos = false;
  for (let i = Math.max(entryWin, exitWin); i < candles.length; i++) {
    if (!inPos) {
      let hi = -Infinity;
      for (let j = i - entryWin; j < i; j++) if (candles[j].high > hi) hi = candles[j].high;
      if (candles[i].close > hi) { sig[i] = 1; inPos = true; }
    } else {
      let lo = Infinity;
      for (let j = i - exitWin; j < i; j++) if (candles[j].low < lo) lo = candles[j].low;
      if (candles[i].close < lo) { sig[i] = -1; inPos = false; }
    }
  }
  return sig;
}

// Z-Score Mean Reversion: 20일 이동평균에서 ±2σ 이탈 시 역방향 진입
export function zScoreReversion(candles: Candle[], { period = 20, entryZ = 2, exitZ = 0.3 } = {}): Signal[] {
  const close = candles.map(c => c.close);
  const m = sma(close, period);
  const sig: Signal[] = new Array(candles.length).fill(0);
  let inPos = false;
  for (let i = period; i < candles.length; i++) {
    if (isNaN(m[i])) continue;
    let v = 0;
    for (let j = i - period + 1; j <= i; j++) v += (close[j] - m[i]) ** 2;
    const sd = Math.sqrt(v / period);
    if (sd === 0) continue;
    const z = (close[i] - m[i]) / sd;
    if (!inPos && z < -entryZ) { sig[i] = 1; inPos = true; }
    else if (inPos && z > -exitZ) { sig[i] = -1; inPos = false; }
  }
  return sig;
}

// Momentum Breakout with Volume Spike
export function momentumVolume(candles: Candle[], { win = 20, volMult = 2 } = {}): Signal[] {
  const sig: Signal[] = new Array(candles.length).fill(0);
  let inPos = false, entryPrice = 0;
  for (let i = win; i < candles.length; i++) {
    let hi = -Infinity, volSum = 0;
    for (let j = i - win; j < i; j++) { if (candles[j].high > hi) hi = candles[j].high; volSum += candles[j].volume; }
    const avgVol = volSum / win;
    if (!inPos && candles[i].close > hi && candles[i].volume > avgVol * volMult) {
      sig[i] = 1; inPos = true; entryPrice = candles[i].close;
    } else if (inPos) {
      if (candles[i].close < entryPrice * 0.98 || candles[i].close > entryPrice * 1.05) {
        sig[i] = -1; inPos = false;
      }
    }
  }
  return sig;
}

// ─── Exit 조건 함수들 (포지션 보유 중 청산 판정, inPos 무관) ───────
// barIdx: 검사할 캔들 인덱스. entryPrice: 봇의 실제 진입가.
export type ExitFn = (candles: Candle[], entryPrice: number, barIdx: number) => boolean;

const exit_ma: ExitFn = (c, _ep, i) => {
  const close = c.map(x => x.close);
  const f = ema(close, 20), s = ema(close, 60);
  if (i < 1 || isNaN(f[i]) || isNaN(s[i])) return false;
  return f[i] < s[i];
};
const exit_rsi: ExitFn = (c, _ep, i) => {
  const close = c.map(x => x.close);
  const r = rsi(close, 14);
  if (isNaN(r[i])) return false;
  return r[i] >= 70;
};
const exit_rsif: ExitFn = (c, _ep, i) => {
  const close = c.map(x => x.close);
  const r = rsi(close, 9);
  if (isNaN(r[i])) return false;
  return r[i] >= 55;
};
const exit_bb: ExitFn = (c, _ep, i) => {
  const close = c.map(x => x.close);
  const { mid } = bollinger(close, 20, 2);
  if (isNaN(mid[i])) return false;
  return close[i] < mid[i];
};
const exit_bbf: ExitFn = (c, _ep, i) => {
  const close = c.map(x => x.close);
  const { mid } = bollinger(close, 10, 2);
  if (isNaN(mid[i])) return false;
  return close[i] < mid[i];
};
const exit_vbf: ExitFn = (c, ep, i) => {
  // 10봉 시간 청산 또는 -2% 손절. ep 기준 진입 후 경과 봉 모르므로 단순화: 추세 꺾임(close < EMA10)
  const close = c.map(x => x.close);
  const e = ema(close, 10);
  if (isNaN(e[i])) return false;
  return close[i] < e[i] || close[i] < ep * 0.98;
};
const exit_donchian: ExitFn = (c, _ep, i) => {
  if (i < 10) return false;
  let lo = Infinity;
  for (let j = i - 10; j < i; j++) if (c[j].low < lo) lo = c[j].low;
  return c[i].close < lo;
};
const exit_zscore: ExitFn = (c, _ep, i) => {
  const close = c.map(x => x.close);
  const m = sma(close, 20);
  if (isNaN(m[i])) return false;
  let v = 0;
  for (let j = i - 19; j <= i; j++) v += (close[j] - m[i]) ** 2;
  const sd = Math.sqrt(v / 20);
  if (sd === 0) return false;
  const z = (close[i] - m[i]) / sd;
  return z > -0.3;
};
const exit_momvol: ExitFn = (c, ep, i) => {
  return c[i].close < ep * 0.98 || c[i].close > ep * 1.05;
};

// ─── 전략 메타데이터 (8항목) ─────────────────────────────

export interface StrategyMeta {
  label: string;
  fn: (c: Candle[]) => Signal[];
  exitFn: ExitFn;
  principle: string;      // 1. 원리
  character: string;      // 2. 성격
  winRate: string;        // 3. 기대 승률
  payoff: string;         // 4. 손익비
  strength: string;       // 5. 강점
  weakness: string;       // 6. 약점
  market: string;         // 7. 적합 시장
  frequency: string;      // 8. 신호 빈도
  compatiblePeriods: string[];  // 호환 봉 (경고용)
  riskLevel: 'low' | 'medium' | 'high' | 'extreme';
}

export const STRATEGY_MAP: Record<string, StrategyMeta> = {
  ma: {
    label: 'MA Cross (20/60)',
    fn: c => maCross(c),
    exitFn: exit_ma,
    principle: '단기 이동평균(EMA20)이 장기 이동평균(EMA60)을 상향 돌파(골든크로스) 시 매수, 하향 돌파(데드크로스) 시 매도.',
    character: '추세 추종 (Trend Following). 시장이 한 방향으로 꾸준히 움직일 때 강함.',
    winRate: '30~40% (낮음)',
    payoff: '2~3:1 (높음 - 큰 추세를 끝까지 탐)',
    strength: '큰 추세 구간에서 수익을 극대화. 로직이 단순해 해석 쉬움.',
    weakness: '횡보장에서 whipsaw(가짜 신호) 연발. 수수료로 까먹기 쉬움. 추세 전환 반응 느림.',
    market: '일봉/4시간봉, 명확한 트렌드장',
    frequency: '낮음 (일봉 기준 월 2~5회)',
    compatiblePeriods: ['1day', '4hour', '1hour'],
    riskLevel: 'medium',
  },
  rsi: {
    label: 'RSI 역추세 (14)',
    fn: c => rsiReversal(c),
    exitFn: exit_rsi,
    principle: 'RSI(14)가 30 이하(과매도)에서 반등 시 매수, 70 이상(과매수)에서 하락 시 매도. EMA200 위에서만 매수하는 추세 필터 포함.',
    character: '역추세 (Mean Reversion). "떨어진 건 튀어오른다"는 통계적 가정.',
    winRate: '55~65% (높음)',
    payoff: '1:1.5 (낮음 - 작은 반등 여러 번)',
    strength: '레인지/횡보장에서 승률 매우 높음. 짧은 보유로 자본 회전 빠름.',
    weakness: '강한 하락장에서 과매도 진입 후 추가 하락 (칼날 잡기). 추세장 약함.',
    market: '레인지장, 박스권',
    frequency: '중간 (4시간봉 기준 주 2~4회)',
    compatiblePeriods: ['4hour', '1hour', '15min'],
    riskLevel: 'medium',
  },
  bb: {
    label: '볼린저 스퀴즈 (20, 2σ)',
    fn: c => bbSqueeze(c),
    exitFn: exit_bb,
    principle: '볼린저밴드(20기간, 2σ) 폭이 120봉 최저 대비 10% 이내로 수축 후 상단 돌파 시 매수. 중심선 이탈 시 청산.',
    character: '변동성 브레이크아웃. "고요한 뒤의 폭풍" 포착.',
    winRate: '45~55% (중간)',
    payoff: '2:1 (중간~높음)',
    strength: '박스권에서 에너지 축적 후 초반 추세를 빠르게 진입.',
    weakness: '돌파 후 되돌림(false breakout) 시 즉시 손절. 압축 구간 드묾.',
    market: '박스권 후 돌파 국면, 모든 봉 프레임',
    frequency: '낮음~중간 (조건 까다로움)',
    compatiblePeriods: ['1hour', '15min', '5min'],
    riskLevel: 'medium',
  },
  vbf: {
    label: '변동성 돌파 Fast (Donchian 20)',
    fn: c => volatilityBreakoutFast(c),
    exitFn: exit_vbf,
    principle: '직전 20봉 종가 최고를 돌파 시 매수, 10봉 보유 후 자동 청산. 래리 윌리엄스 변동성 돌파의 스캘핑 변형.',
    character: '단기 모멘텀 + 시간 기반 청산.',
    winRate: '40~50%',
    payoff: '1.5:1',
    strength: '빈도 높음 → 빠른 피드백. 시간 청산으로 물리는 일 드묾.',
    weakness: '추세 꺾여도 10봉 보유해서 손실 키움. 수수료 부담.',
    market: '1min~15min 단기 차트, 변동성 있는 구간',
    frequency: '높음 (1min 기준 시간당 1~3회)',
    compatiblePeriods: ['1min', '5min', '15min'],
    riskLevel: 'high',
  },
  rsif: {
    label: 'RSI Fast (9, 45/55)',
    fn: c => rsiReversalFast(c),
    exitFn: exit_rsif,
    principle: 'RSI(9) 기준 45 돌파 시 매수, 55 이탈 시 매도. EMA30 추세 필터. 1min 튜닝 버전.',
    character: '빠른 역추세 스캘핑.',
    winRate: '50~60%',
    payoff: '1:1.2',
    strength: '1min에서 신호 자주 발생. 즉각적 피드백.',
    weakness: '임계값이 타이트해서 급등락장에 오진입 많음. 수수료 민감.',
    market: '1min~5min 횡보/미세 변동 구간',
    frequency: '매우 높음 (1min 기준 시간당 5~10회)',
    compatiblePeriods: ['1min', '5min'],
    riskLevel: 'high',
  },
  bbf: {
    label: '볼린저 Fast (10, 2σ, 30)',
    fn: c => bbSqueezeFast(c),
    exitFn: exit_bbf,
    principle: '짧은 볼린저(10기간) + 30봉 스퀴즈 윈도우. 1min에 튜닝된 빠른 변동성 돌파.',
    character: '단기 변동성 폭발 감지.',
    winRate: '45~55%',
    payoff: '2:1',
    strength: '1min 변동성 축적 빠르게 포착. 돌파 초기 진입.',
    weakness: '1min 노이즈 많아 허위 신호 자주 발생.',
    market: '1min~5min, 조용한 구간 후 돌파',
    frequency: '중간 (1min 기준 시간당 1~3회)',
    compatiblePeriods: ['1min', '5min'],
    riskLevel: 'high',
  },
  donchian20: {
    label: 'Donchian 20-Breakout (터틀)',
    fn: c => donchian20(c),
    exitFn: exit_donchian,
    principle: '최근 20봉 고점 돌파 시 매수, 10봉 저점 이탈 시 매도. 전설적인 터틀 트레이더의 원형 룰.',
    character: '고전 추세 추종. 메가 트렌드 포착 특화.',
    winRate: '30~40% (낮음)',
    payoff: '3~5:1 (매우 높음)',
    strength: '대박 한 방으로 여러 손실 덮음. BTC 같은 고변동성 자산에서 강력.',
    weakness: '손절 연속에 대한 정신력 요구. 횡보장에서 자본 잠식.',
    market: '일봉/4시간봉, 트렌드 명확한 장',
    frequency: '낮음 (일봉 기준 월 1~3회)',
    compatiblePeriods: ['1day', '4hour', '1hour'],
    riskLevel: 'high',
  },
  zscore: {
    label: 'Z-Score Mean Reversion',
    fn: c => zScoreReversion(c),
    exitFn: exit_zscore,
    principle: '가격이 20봉 이동평균에서 -2σ 이상 이탈 시 매수, 평균 근처(±0.3σ) 복귀 시 청산. 통계적 차익거래의 기본형.',
    character: '퀀트 역추세. 르네상스 메달리온 계열 사고방식.',
    winRate: '65~75% (매우 높음)',
    payoff: '1:1.5',
    strength: '과열 국면 수확. 통계 기반이라 감정 개입 적음.',
    weakness: '강한 하락장에선 복귀 없이 추가 하락 → 큰 손실. 손절 필수.',
    market: '레인지장, 과열/침체가 잦은 자산',
    frequency: '중간 (4시간봉 기준 주 3~6회)',
    compatiblePeriods: ['1hour', '4hour', '1day'],
    riskLevel: 'high',
  },
  momvol: {
    label: 'Momentum + Volume Spike',
    fn: c => momentumVolume(c),
    exitFn: exit_momvol,
    principle: '20봉 고점 돌파 + 거래량이 20봉 평균의 2배 이상일 때만 매수. -2% 손절, +5% 익절.',
    character: '검증된 돌파 추종. 거래량 필터로 허위 돌파 제거.',
    winRate: '45~55%',
    payoff: '2.5:1',
    strength: '거래량 확인이 "진짜 돌파"만 골라냄. 빠른 손절/익절로 리스크 제한.',
    weakness: '거래량 조건 까다로워 신호 드묾. 변동성 낮은 구간에선 무용.',
    market: '1시간봉/4시간봉, 뉴스/이벤트 장',
    frequency: '낮음 (시간봉 기준 일 1~3회)',
    compatiblePeriods: ['15min', '1hour', '4hour'],
    riskLevel: 'extreme',
  },
};

export const STRATEGY_KEYS = Object.keys(STRATEGY_MAP);
