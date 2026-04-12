/**
 * auto_coin × jarvis-v2 — 다층 리스크 관리 엔진
 *
 * jarvis-v2의 7-layer risk management를 auto_coin에 이식.
 * 포지션 사이징, 연패 감산, 드로우다운 축소, 블랙스완 차단.
 *
 * 7-Layer 구조:
 *   1. 리스크 레벨 판정  (CONSERVATIVE / NORMAL / AGGRESSIVE)
 *   2. Kelly 기반 상한   (half-Kelly, MAX_KELLY_PCT 캡)
 *   3. 연패 패널티       (연속 손실 → 포지션 축소)
 *   4. 드로우다운 감산   (MDD 누적 비율 → 감산)
 *   5. 블랙스완 체크     (3/5 조건 충족 → 거래 정지)
 *   6. 포지션 관리       (트레일링 스탑, 시간 기반 종료)
 *   7. 서킷 브레이커     (일일 손실 한도)
 *
 * 사용법:
 *   const risk = require('./jarvis/riskManager');
 *   const sizing = risk.calculatePosition(state, snapshot, confluenceResult);
 *   // sizing.action: 'ENTER' | 'REDUCE' | 'SKIP'
 *   // sizing.sizePct: 포지션 비율 (0~1)
 */
'use strict';

// ─── 설정 상수 ───────────────────────────────────────────────
const CONFIG = {
  // 포지션 사이징 기본값 (자본 대비 %)
  POSITION_SMALL: 0.10,    // 10% — 보수적
  POSITION_NORMAL: 0.20,   // 20% — 기본
  POSITION_LARGE: 0.30,    // 30% — 공격적

  // Kelly 제한
  MAX_KELLY_PCT: 0.25,     // Half Kelly 상한 25%

  // 연패 감산 규칙
  CONSECUTIVE_LOSS_RULES: [
    { losses: 5, factor: 0.20 },  // 5연패 → 80% 감산
    { losses: 3, factor: 0.50 },  // 3연패 → 50% 감산
    { losses: 2, factor: 0.75 },  // 2연패 → 25% 감산
  ],

  // 드로우다운 설정
  MAX_DRAWDOWN_PCT: 0.20,      // 최대 허용 드로우다운 20%
  DD_PAUSE_THRESHOLD: 0.70,    // MDD의 70% 도달 시 거래 중단

  // 블랙스완 조건 (5개 중 3개 충족)
  BLACK_SWAN_THRESHOLD: 3,
  BLACK_SWAN_CONDITIONS: {
    FG_EXTREME: 5,              // F&G ≤ 5
    VIX_EXTREME: 45,            // VIX ≥ 45
    PRICE_CRASH: -10,           // BTC 24h ≤ -10%
    FUNDING_CRASH: -0.30,       // 펀딩비 ≤ -0.30%
  },

  // 서킷 브레이커
  DAILY_LOSS_LIMIT_PCT: 0.10,  // 일일 손실 한도 10%

  // Confluence 시그널 필터
  SIGNAL_FILTER: {
    JACKPOT: { action: 'ENTER', boost: 1.3 },  // 30% 부스트
    STRONG:  { action: 'ENTER', boost: 1.0 },
    GOOD:    { action: 'ENTER', boost: 0.7 },   // 30% 감산
    NEUTRAL: { action: 'REDUCE', boost: 0.4 },  // 60% 감산
    WAIT:    { action: 'SKIP', boost: 0.0 },     // 진입 안함
  },
};

// ─── Layer 1: 리스크 레벨 판정 ───────────────────────────────

/**
 * 시장 상태에 따른 리스크 레벨 결정
 * @param {Object} snapshot - dataFeed 스냅샷
 * @param {Object} confluence - confluenceScore 결과
 * @returns {'CONSERVATIVE'|'NORMAL'|'AGGRESSIVE'}
 */
function determineRiskLevel(snapshot, confluence) {
  let aggressiveCount = 0;
  let conservativeCount = 0;

  const fg = snapshot?.fearGreed?.value;
  const vix = snapshot?.macro?.vix;
  const score = confluence?.total || 0;
  const fr = snapshot?.btc?.fundingRate;

  // 보수적 조건 (1개라도 → CONSERVATIVE)
  if (fg != null && fg <= 20) conservativeCount++;
  if (vix != null && vix >= 35) conservativeCount++;
  if (score < 45) conservativeCount++;

  // 공격적 조건 (3개 이상 → AGGRESSIVE)
  if (score >= 75) aggressiveCount++;
  if (fg != null && fg <= 15) aggressiveCount++;  // 극단 공포 = 역발상 기회
  if (fr != null && fr <= -0.05) aggressiveCount++;  // 숏 과열 = 롱 기회
  if (confluence?.signal === 'JACKPOT') aggressiveCount++;

  if (aggressiveCount >= 3) return 'AGGRESSIVE';
  if (conservativeCount >= 1) return 'CONSERVATIVE';
  return 'NORMAL';
}

// ─── Layer 2: Kelly 기준 상한 ────────────────────────────────

/**
 * Kelly Criterion 계산
 * f* = p - (1-p)/b
 * @param {number} winRate - 승률 (0~1)
 * @param {number} avgWin - 평균 수익률 (양수)
 * @param {number} avgLoss - 평균 손실률 (양수)
 * @returns {Object} { full, half, quarter }
 */
function calculateKelly(winRate, avgWin, avgLoss) {
  if (!winRate || !avgWin || !avgLoss || avgLoss === 0) {
    return { full: 0, half: 0, quarter: 0 };
  }

  const p = Math.min(1, Math.max(0, winRate));
  const b = avgWin / avgLoss;
  const kelly = p - (1 - p) / b;

  // Kelly가 음수면 이 전략은 기대값이 음수
  if (kelly <= 0) return { full: 0, half: 0, quarter: 0 };

  return {
    full: Math.min(kelly, 1),
    half: Math.min(kelly / 2, CONFIG.MAX_KELLY_PCT),
    quarter: Math.min(kelly / 4, CONFIG.MAX_KELLY_PCT / 2),
  };
}

// ─── Layer 3: 연패 패널티 ────────────────────────────────────

/**
 * 연속 손실 횟수에 따른 감산 팩터
 * @param {Array} trades - 최근 거래 내역 [{ret: 0.05}, {ret: -0.02}, ...]
 * @returns {number} 0~1 (1 = 감산 없음, 0.2 = 80% 감산)
 */
function getConsecutiveLossFactor(trades) {
  if (!trades || trades.length === 0) return 1;

  // 최근 거래부터 역순으로 연패 카운트
  let consecutive = 0;
  for (let i = trades.length - 1; i >= 0; i--) {
    if (trades[i].ret != null && trades[i].ret <= 0) {
      consecutive++;
    } else {
      break;
    }
  }

  for (const rule of CONFIG.CONSECUTIVE_LOSS_RULES) {
    if (consecutive >= rule.losses) return rule.factor;
  }
  return 1;
}

// ─── Layer 4: 드로우다운 감산 ────────────────────────────────

/**
 * 현재 드로우다운 비율에 따른 감산
 * @param {number} equity - 현재 자산
 * @param {number} peakEquity - 최고 자산
 * @param {number} initialCapital - 초기 자본
 * @returns {{ factor: number, action: string, currentDD: number }}
 */
function getDrawdownFactor(equity, peakEquity, initialCapital) {
  const peak = Math.max(peakEquity || initialCapital, initialCapital);
  const currentDD = (peak - equity) / peak;

  // MDD 한도 대비 현재 드로우다운 비율
  const ddRatio = currentDD / CONFIG.MAX_DRAWDOWN_PCT;

  if (ddRatio >= CONFIG.DD_PAUSE_THRESHOLD) {
    return { factor: 0, action: 'PAUSE', currentDD };
  }
  if (ddRatio >= 0.5) {
    // 50~70% 구간: 선형 감산
    const factor = Math.max(0.1, 1 - ddRatio);
    return { factor, action: 'REDUCE', currentDD };
  }
  return { factor: 1, action: 'NORMAL', currentDD };
}

// ─── Layer 5: 블랙스완 감지 ─────────────────────────────────

/**
 * 블랙스완 조건 체크 (5개 중 3개 → 거래 중단)
 * @param {Object} snapshot - 시장 스냅샷
 * @returns {{ isBlackSwan: boolean, triggered: string[], count: number }}
 */
function checkBlackSwan(snapshot) {
  const triggered = [];
  const cond = CONFIG.BLACK_SWAN_CONDITIONS;

  // 1. F&G 극단 공포
  if (snapshot?.fearGreed?.value != null && snapshot.fearGreed.value <= cond.FG_EXTREME) {
    triggered.push(`F&G=${snapshot.fearGreed.value} (≤${cond.FG_EXTREME})`);
  }

  // 2. VIX 극단
  if (snapshot?.macro?.vix != null && snapshot.macro.vix >= cond.VIX_EXTREME) {
    triggered.push(`VIX=${snapshot.macro.vix} (≥${cond.VIX_EXTREME})`);
  }

  // 3. BTC 대폭락
  if (snapshot?.btc?.change24h != null && snapshot.btc.change24h <= cond.PRICE_CRASH) {
    triggered.push(`BTC 24h=${snapshot.btc.change24h.toFixed(1)}% (≤${cond.PRICE_CRASH}%)`);
  }

  // 4. 펀딩비 극단
  if (snapshot?.btc?.fundingRate != null && snapshot.btc.fundingRate <= cond.FUNDING_CRASH) {
    triggered.push(`펀딩비=${snapshot.btc.fundingRate.toFixed(4)}% (≤${cond.FUNDING_CRASH}%)`);
  }

  // 5. 24h 거래량 급감 (향후 추가)
  // if (snapshot?.btc?.volumeChange24h <= -50) triggered.push(...)

  return {
    isBlackSwan: triggered.length >= CONFIG.BLACK_SWAN_THRESHOLD,
    triggered,
    count: triggered.length,
  };
}

// ─── Layer 7: 서킷 브레이커 ─────────────────────────────────

/**
 * 일일 손실 한도 체크
 * @param {Array} trades - 거래 내역
 * @param {number} initialCapital - 초기 자본
 * @returns {{ breaker: boolean, dailyLoss: number }}
 */
function checkCircuitBreaker(trades, initialCapital) {
  if (!trades || trades.length === 0) return { breaker: false, dailyLoss: 0 };

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayTs = todayStart.getTime();

  // 오늘 거래 중 손실 합산
  const dailyLoss = trades
    .filter(t => t.ts >= todayTs && t.ret != null && t.ret < 0)
    .reduce((sum, t) => sum + Math.abs(t.ret), 0);

  return {
    breaker: dailyLoss >= CONFIG.DAILY_LOSS_LIMIT_PCT,
    dailyLoss,
  };
}

// ─── 메인: 포지션 사이징 계산 ────────────────────────────────

/**
 * 7-Layer 리스크 관리를 거친 최종 포지션 사이징
 *
 * @param {Object} state - paperTrade 상태 { cash, coin, entry, trades, equityHistory }
 * @param {Object} snapshot - dataFeed 스냅샷
 * @param {Object} confluence - confluenceScore 결과 { total, signal, ... }
 * @param {Object} opts - 옵션 { initialCapital, peakEquity }
 * @returns {Object} {
 *   action: 'ENTER'|'REDUCE'|'SKIP',
 *   sizePct: 0~1,
 *   layers: { ... },  // 각 레이어별 결과
 *   reason: string
 * }
 */
function calculatePosition(state, snapshot, confluence, opts = {}) {
  const initialCapital = opts.initialCapital || 1_000_000;
  const currentPx = snapshot?.btc?.price || 0;
  const equity = state.cash + state.coin * currentPx;
  const peakEquity = opts.peakEquity || Math.max(
    initialCapital,
    ...(state.equityHistory || []).map(e => e.equity)
  );

  const layers = {};
  const reasons = [];

  // ─── Layer 1: 리스크 레벨 ────
  const riskLevel = determineRiskLevel(snapshot, confluence);
  const basePct = riskLevel === 'AGGRESSIVE' ? CONFIG.POSITION_LARGE
    : riskLevel === 'CONSERVATIVE' ? CONFIG.POSITION_SMALL
    : CONFIG.POSITION_NORMAL;
  layers.riskLevel = { level: riskLevel, basePct };

  // ─── Layer 2: Kelly 상한 ─────
  const winTrades = (state.trades || []).filter(t => t.ret > 0);
  const loseTrades = (state.trades || []).filter(t => t.ret != null && t.ret <= 0);
  const winRate = winTrades.length / Math.max(1, winTrades.length + loseTrades.length);
  const avgWin = winTrades.length > 0
    ? winTrades.reduce((s, t) => s + Math.abs(t.ret), 0) / winTrades.length : 0.03;
  const avgLoss = loseTrades.length > 0
    ? loseTrades.reduce((s, t) => s + Math.abs(t.ret), 0) / loseTrades.length : 0.03;

  const kelly = calculateKelly(winRate, avgWin, avgLoss);
  let sizePct = basePct;
  if (kelly.half > 0 && state.trades?.length >= 10) {
    // 10회 이상 거래 후 Kelly 적용 (데이터 부족 시 무시)
    sizePct = Math.min(sizePct, kelly.half);
    if (sizePct < basePct) reasons.push(`Kelly cap: ${(kelly.half * 100).toFixed(1)}%`);
  }
  layers.kelly = kelly;

  // ─── Layer 3: 연패 패널티 ────
  const lossFactor = getConsecutiveLossFactor(state.trades);
  if (lossFactor < 1) {
    sizePct *= lossFactor;
    reasons.push(`연패 감산: ×${lossFactor}`);
  }
  layers.consecutiveLoss = { factor: lossFactor };

  // ─── Layer 4: 드로우다운 ─────
  const dd = getDrawdownFactor(equity, peakEquity, initialCapital);
  if (dd.action === 'PAUSE') {
    layers.drawdown = dd;
    return {
      action: 'SKIP',
      sizePct: 0,
      layers,
      reason: `드로우다운 한도 근접 (DD=${(dd.currentDD * 100).toFixed(1)}%) → 거래 중단`,
    };
  }
  if (dd.factor < 1) {
    sizePct *= dd.factor;
    reasons.push(`DD 감산: ×${dd.factor.toFixed(2)} (DD=${(dd.currentDD * 100).toFixed(1)}%)`);
  }
  layers.drawdown = dd;

  // ─── Layer 5: 블랙스완 ───────
  const blackSwan = checkBlackSwan(snapshot);
  if (blackSwan.isBlackSwan) {
    layers.blackSwan = blackSwan;
    return {
      action: 'SKIP',
      sizePct: 0,
      layers,
      reason: `블랙스완 감지 (${blackSwan.count}/5): ${blackSwan.triggered.join(', ')}`,
    };
  }
  layers.blackSwan = blackSwan;

  // ─── Layer 6: Confluence 시그널 필터 ─────
  const signal = confluence?.signal || 'WAIT';
  const filter = CONFIG.SIGNAL_FILTER[signal] || CONFIG.SIGNAL_FILTER.WAIT;

  if (filter.action === 'SKIP') {
    layers.confluence = { signal, filter };
    return {
      action: 'SKIP',
      sizePct: 0,
      layers,
      reason: `Confluence=${confluence?.total || 0} (${signal}) → 진입 대기`,
    };
  }

  sizePct *= filter.boost;
  if (filter.boost !== 1.0) {
    reasons.push(`Confluence ${signal}: ×${filter.boost}`);
  }
  layers.confluence = { signal, filter };

  // ─── Layer 7: 서킷 브레이커 ──
  const circuit = checkCircuitBreaker(state.trades, initialCapital);
  if (circuit.breaker) {
    layers.circuitBreaker = circuit;
    return {
      action: 'SKIP',
      sizePct: 0,
      layers,
      reason: `서킷 브레이커 발동 (일일 손실 ${(circuit.dailyLoss * 100).toFixed(1)}%)`,
    };
  }
  layers.circuitBreaker = circuit;

  // ─── 최종 결과 ───────────────
  sizePct = Math.max(0, Math.min(0.50, sizePct)); // 최대 50% 캡

  return {
    action: filter.action,
    sizePct,
    layers,
    reason: reasons.length > 0 ? reasons.join(' | ') : `${riskLevel} base=${(basePct * 100).toFixed(0)}%`,
  };
}

// ─── Layer 6: 포지션 관리 규칙 (진행 중 포지션) ──────────────

/**
 * 보유 중인 포지션에 대한 동적 종료 규칙
 * @param {Object} state - { entry, coin, trades }
 * @param {number} currentPx - 현재가
 * @param {Object} snapshot - 시장 스냅샷
 * @returns {{ shouldExit: boolean, reason: string } | null}
 */
function checkPositionExit(state, currentPx, snapshot) {
  if (!state.coin || state.coin <= 0) return null;

  const entryPx = state.entry;
  const pnlPct = (currentPx - entryPx) / entryPx;

  // 트레일링 스탑: 최고점 대비 2% 하락 시 청산
  if (state._peakPx && currentPx < state._peakPx * 0.98 && pnlPct > 0) {
    return {
      shouldExit: true,
      reason: `트레일링 스탑: 최고 $${state._peakPx.toFixed(0)} → 현재 $${currentPx.toFixed(0)} (-${((1 - currentPx / state._peakPx) * 100).toFixed(1)}%)`,
    };
  }

  // 시장 공포 + 수익 중 → 안전 청산
  if (snapshot?.fearGreed?.value <= 10 && pnlPct > 0) {
    return {
      shouldExit: true,
      reason: `시장 공포 청산: F&G=${snapshot.fearGreed.value}, 수익 ${(pnlPct * 100).toFixed(2)}% 확보`,
    };
  }

  // VIX 위험 + 수익 중 → 안전 청산
  if (snapshot?.macro?.vix >= 35 && pnlPct > 0) {
    return {
      shouldExit: true,
      reason: `VIX 위험 청산: VIX=${snapshot.macro.vix}, 수익 ${(pnlPct * 100).toFixed(2)}% 확보`,
    };
  }

  return null;
}

// ─── 요약 텍스트 (텔레그램용) ────────────────────────────────

/**
 * 리스크 분석 요약 텍스트 생성
 */
function formatRiskSummary(result) {
  const lines = [];
  lines.push(`*리스크 분석* — ${result.action}`);
  lines.push(`포지션 비율: ${(result.sizePct * 100).toFixed(1)}%`);

  if (result.layers.riskLevel) {
    lines.push(`리스크 레벨: ${result.layers.riskLevel.level}`);
  }
  if (result.layers.kelly?.half > 0) {
    lines.push(`Kelly(half): ${(result.layers.kelly.half * 100).toFixed(1)}%`);
  }
  if (result.layers.consecutiveLoss?.factor < 1) {
    lines.push(`연패 감산: ×${result.layers.consecutiveLoss.factor}`);
  }
  if (result.layers.drawdown?.currentDD > 0) {
    lines.push(`드로우다운: ${(result.layers.drawdown.currentDD * 100).toFixed(1)}%`);
  }
  if (result.layers.blackSwan?.count > 0) {
    lines.push(`블랙스완: ${result.layers.blackSwan.count}/5 조건`);
  }
  if (result.reason) {
    lines.push(`사유: ${result.reason}`);
  }

  return lines.join('\n');
}

module.exports = {
  calculatePosition,
  checkPositionExit,
  formatRiskSummary,
  // 개별 함수 (테스트/디버그용)
  determineRiskLevel,
  calculateKelly,
  getConsecutiveLossFactor,
  getDrawdownFactor,
  checkBlackSwan,
  checkCircuitBreaker,
  CONFIG,
};
