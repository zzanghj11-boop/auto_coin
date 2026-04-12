/**
 * auto_coin × jarvis-v2 — Confluence Score 엔진
 *
 * jarvis-v2의 11개 지표 합산 점수 시스템을 auto_coin에 이식.
 * 무료 API로 얻을 수 있는 지표만 실측, 나머지는 중립값 처리.
 *
 * 점수 체계 (0~100점):
 *   S티어: 펀딩비(25pt) + OI변화(20pt) + VP POC(15pt)
 *   A티어: Weekly RSI(10pt) + MVRV(10pt) + aSOPR(10pt)
 *   B티어: F&G(8pt) + MA배열(7pt) + ETF(5pt) + 고래(5pt) + 도미넌스(5pt)
 *
 * 현재 실측 가능: 펀딩비, F&G, MA배열, 도미넌스 (무료)
 * 유료 API 필요:  OI 7일변화(CoinGlass), MVRV/SOPR(CryptoQuant), VP POC, ETF, 고래
 *
 * 등급:
 *   JACKPOT (≥90) — 역사적 매수 구간 (연 3~7회)
 *   STRONG  (≥75) — 강한 매수 신호
 *   GOOD    (≥60) — 진입 고려
 *   NEUTRAL (≥45) — 관망
 *   WAIT    (<45) — 대기
 *
 * 사용법:
 *   const { calculate } = require('./jarvis/confluenceScore');
 *   const result = calculate(marketData);
 *   // result.total, result.signal, result.breakdown
 */
'use strict';

// ─── 지표별 최대 배점 ─────────────────────────────────────────
const MAX = {
  funding: 25, oi: 20, vp_poc: 15, weekly_rsi: 10,
  mvrv: 10, sopr: 10, fg: 8, ma: 7,
  etf: 5, whale: 5, dominance: 5,
};

// ─── 등급 기준 ────────────────────────────────────────────────
const GRADES = { JACKPOT: 90, STRONG: 75, GOOD: 60, NEUTRAL: 45 };

// ─── 1. 펀딩비 점수 (0~25pt) ──────────────────────────────────
// 숏 과열(음수)일수록 높은 점수 = 롱 매수 기회
function scoreFunding(fundingRate) {
  if (fundingRate == null) return Math.floor(MAX.funding * 0.2);
  const r = Number(fundingRate);
  if (r <= -0.10) return MAX.funding;           // 25pt: 극단 숏 과열
  if (r <= -0.05) return Math.round(MAX.funding * 20 / 25); // 20pt
  if (r <= -0.02) return Math.round(MAX.funding * 15 / 25); // 15pt
  if (r <= -0.01) return Math.round(MAX.funding * 10 / 25); // 10pt
  if (r <   0.00) return Math.round(MAX.funding *  8 / 25); //  8pt
  if (r <=  0.01) return Math.round(MAX.funding *  5 / 25); //  5pt
  if (r <=  0.03) return Math.round(MAX.funding *  2 / 25); //  2pt
  return 0;                                      // 롱 과열 → 0pt
}

// ─── 2. OI 7일 변화율 (0~20pt) ────────────────────────────────
// OI 급감 = 포지션 청산 = 바닥 신호
function scoreOI(oi7dChange) {
  if (oi7dChange == null) return Math.round(MAX.oi * 0.15); // 중립
  const v = Number(oi7dChange);
  if (v <= -30) return MAX.oi;
  if (v <= -20) return Math.round(MAX.oi * 17 / 20);
  if (v <= -15) return Math.round(MAX.oi * 14 / 20);
  if (v <= -10) return Math.round(MAX.oi * 10 / 20);
  if (v <=  -5) return Math.round(MAX.oi *  6 / 20);
  if (v <    0) return Math.round(MAX.oi *  3 / 20);
  if (v <=  10) return Math.round(MAX.oi *  1 / 20);
  return 0;
}

// ─── 3. VP POC 근접도 (0~15pt) ────────────────────────────────
function scorePOC(btcClose, vpPoc) {
  if (!btcClose || !vpPoc) return 0; // 데이터 없으면 0
  const absDist = Math.abs((btcClose - vpPoc) / vpPoc * 100);
  if (absDist <= 1) return MAX.vp_poc;
  if (absDist <= 3) return Math.round(MAX.vp_poc * 12 / 15);
  if (absDist <= 5) return Math.round(MAX.vp_poc *  8 / 15);
  if (absDist <= 8) return Math.round(MAX.vp_poc *  4 / 15);
  return 0;
}

// ─── 4. Weekly RSI (0~10pt) ───────────────────────────────────
// 주봉 RSI 낮을수록 매수 기회
function scoreWeeklyRSI(rsi1w) {
  if (rsi1w == null) return Math.round(MAX.weekly_rsi * 0.1);
  const v = Number(rsi1w);
  if (v <= 20) return MAX.weekly_rsi;
  if (v <= 25) return Math.round(MAX.weekly_rsi * 9 / 10);
  if (v <= 30) return Math.round(MAX.weekly_rsi * 8 / 10);
  if (v <= 35) return Math.round(MAX.weekly_rsi * 6 / 10);
  if (v <= 40) return Math.round(MAX.weekly_rsi * 4 / 10);
  if (v <= 50) return Math.round(MAX.weekly_rsi * 2 / 10);
  if (v <= 60) return Math.round(MAX.weekly_rsi * 1 / 10);
  return 0;
}

// ─── 5. MVRV (0~10pt) ────────────────────────────────────────
function scoreMVRV(mvrv) {
  if (mvrv == null) return Math.round(MAX.mvrv * 0.3); // 중립
  const v = Number(mvrv);
  if (v <= 1.0) return MAX.mvrv;
  if (v <= 1.5) return Math.round(MAX.mvrv * 7 / 10);
  if (v <= 2.0) return Math.round(MAX.mvrv * 5 / 10);
  if (v <= 2.5) return Math.round(MAX.mvrv * 3 / 10);
  if (v <= 3.0) return Math.round(MAX.mvrv * 1 / 10);
  return 0;
}

// ─── 6. aSOPR (0~10pt) ───────────────────────────────────────
function scoreSOPR(aSopr) {
  if (aSopr == null) return Math.round(MAX.sopr * 0.2); // 중립
  const v = Number(aSopr);
  if (v <= 0.95) return MAX.sopr;
  if (v <= 0.97) return Math.round(MAX.sopr * 8 / 10);
  if (v <= 0.99) return Math.round(MAX.sopr * 6 / 10);
  if (v <= 1.00) return Math.round(MAX.sopr * 4 / 10);
  if (v <= 1.01) return Math.round(MAX.sopr * 2 / 10);
  if (v <= 1.03) return Math.round(MAX.sopr * 1 / 10);
  return 0;
}

// ─── 7. Fear & Greed (0~8pt) ─────────────────────────────────
// 극단 공포 = 높은 점수
function scoreFG(fgValue) {
  if (fgValue == null) return Math.round(MAX.fg * 0.125);
  const v = Number(fgValue);
  if (v <= 10) return MAX.fg;
  if (v <= 20) return Math.round(MAX.fg * 7 / 8);
  if (v <= 25) return Math.round(MAX.fg * 5 / 8);
  if (v <= 35) return Math.round(MAX.fg * 3 / 8);
  if (v <= 45) return Math.round(MAX.fg * 1 / 8);
  return 0;
}

// ─── 8. MA 배열 (0~7pt) ──────────────────────────────────────
// 역배열(bearish) 많을수록 높은 점수 = 바닥 신호
function scoreMA(data) {
  const { btcClose, ma7, ma25, ma99, ma200 } = data;
  if (!btcClose || !ma200) return 0;
  let bearish = 0;
  if (ma7  && ma25  && ma7  < ma25)  bearish++;
  if (ma25 && ma99  && ma25 < ma99)  bearish++;
  if (ma99 && ma200 && ma99 < ma200) bearish++;
  if (btcClose < ma200)              bearish++;
  return Math.round(bearish * (MAX.ma / 4));
}

// ─── 9. ETF 자금흐름 (0~5pt) ─────────────────────────────────
function scoreETF(etfNetFlow) {
  if (etfNetFlow == null) return Math.round(MAX.etf * 2 / 5); // 중립
  const v = Number(etfNetFlow);
  if (v >  500_000_000)  return 0;
  if (v >  100_000_000)  return Math.round(MAX.etf * 1 / 5);
  if (v >= -100_000_000) return Math.round(MAX.etf * 2 / 5);
  if (v >= -500_000_000) return Math.round(MAX.etf * 4 / 5);
  return MAX.etf;
}

// ─── 10. 고래 Exchange Balance (0~5pt) ────────────────────────
function scoreWhale(whaleTrend) {
  if (whaleTrend == null) return Math.round(MAX.whale * 0.2); // 중립
  const v = Number(whaleTrend);
  if (v >= 7) return MAX.whale;
  if (v >= 4) return Math.round(MAX.whale * 3 / 5);
  if (v >= 1) return Math.round(MAX.whale * 2 / 5);
  return 0;
}

// ─── 11. BTC 도미넌스 (0~5pt) ─────────────────────────────────
function scoreDominance(btcDominance) {
  if (btcDominance == null) return Math.round(MAX.dominance * 0.2); // 중립
  const v = Number(btcDominance);
  if (v >= 60) return MAX.dominance;
  if (v >= 55) return Math.round(MAX.dominance * 3 / 5);
  if (v >= 50) return Math.round(MAX.dominance * 2 / 5);
  if (v >= 45) return Math.round(MAX.dominance * 1 / 5);
  return 0;
}

// ─── 등급 판정 ────────────────────────────────────────────────
function getSignalGrade(total) {
  if (total >= GRADES.JACKPOT) return 'JACKPOT';
  if (total >= GRADES.STRONG)  return 'STRONG';
  if (total >= GRADES.GOOD)    return 'GOOD';
  if (total >= GRADES.NEUTRAL) return 'NEUTRAL';
  return 'WAIT';
}

// ─── 상관관계 경고 ────────────────────────────────────────────
function checkCorrelationWarnings(scores) {
  const warnings = [];
  if (scores.funding >= 20 && scores.weekly_rsi >= 8 && scores.fg >= 6) {
    warnings.push('⚠️ 펀딩/RSI/F&G 동시 극단값 — 독립 정보량 약 60%');
  }
  if (scores.mvrv >= 8 && scores.sopr >= 8) {
    warnings.push('⚠️ MVRV/SOPR 동시 극단값 — 온체인 신호 중복');
  }
  return warnings;
}

// ─── 메인 계산 함수 ──────────────────────────────────────────

/**
 * Confluence Score 계산
 *
 * @param {Object} data - 시장 데이터
 *   무료 API로 수집 가능:
 *     fundingRate    — Binance 펀딩비 (%)
 *     fgValue        — Fear & Greed (0~100)
 *     btcClose       — BTC 현재가
 *     btcDominance   — BTC 도미넌스 (%)
 *   유료 API 필요 (없으면 null → 중립값):
 *     oi7dChange     — OI 7일 변화율 (%)
 *     rsi1w          — 주봉 RSI
 *     mvrvRatio      — MVRV
 *     aSopr          — aSOPR
 *     vpPoc          — Volume Profile POC
 *     etfNetFlow     — ETF 순유입 (USD)
 *     whaleTrend     — 고래 7일 감소 일수
 *     ma7, ma25, ma99, ma200 — 이동평균
 *
 * @returns {Object} { total, signal, breakdown, warnings, available }
 */
function calculate(data) {
  const breakdown = {
    funding:    scoreFunding(data.fundingRate),
    oi:         scoreOI(data.oi7dChange),
    vp_poc:     scorePOC(data.btcClose, data.vpPoc),
    weekly_rsi: scoreWeeklyRSI(data.rsi1w),
    mvrv:       scoreMVRV(data.mvrvRatio),
    sopr:       scoreSOPR(data.aSopr),
    fg:         scoreFG(data.fgValue),
    ma:         scoreMA(data),
    etf:        scoreETF(data.etfNetFlow),
    whale:      scoreWhale(data.whaleTrend),
    dominance:  scoreDominance(data.btcDominance),
  };

  const total = Math.min(100, Object.values(breakdown).reduce((a, b) => a + b, 0));
  const signal = getSignalGrade(total);
  const warnings = checkCorrelationWarnings(breakdown);

  // 어떤 지표가 실측이고 어떤 것이 중립값인지 표시
  const available = {
    funding: data.fundingRate != null,
    oi: data.oi7dChange != null,
    vp_poc: data.vpPoc != null,
    weekly_rsi: data.rsi1w != null,
    mvrv: data.mvrvRatio != null,
    sopr: data.aSopr != null,
    fg: data.fgValue != null,
    ma: data.ma200 != null,
    etf: data.etfNetFlow != null,
    whale: data.whaleTrend != null,
    dominance: data.btcDominance != null,
  };

  const availCount = Object.values(available).filter(Boolean).length;

  return {
    total,
    signal,
    breakdown,
    warnings,
    available,
    coverage: `${availCount}/11 지표 실측`,
    confidence: availCount >= 8 ? 'HIGH' : availCount >= 5 ? 'MEDIUM' : 'LOW',
  };
}

/**
 * dataFeed 스냅샷으로 점수 계산 (편의 함수)
 */
function calculateFromSnapshot(snapshot) {
  return calculate({
    fundingRate: snapshot.btc?.fundingRate,
    fgValue: snapshot.fearGreed?.value,
    btcClose: snapshot.btc?.price,
    btcDominance: snapshot.macro?.btcDominance,
    // 아래는 무료로 못 얻음 → null → 중립값
    oi7dChange: null,
    rsi1w: null,
    mvrvRatio: null,
    aSopr: null,
    vpPoc: null,
    etfNetFlow: null,
    whaleTrend: null,
    ma7: null, ma25: null, ma99: null, ma200: null,
  });
}

/**
 * 점수 요약 텍스트 (텔레그램용)
 */
function formatScore(result) {
  const emoji = { JACKPOT: '🔥🔥🔥', STRONG: '🔥', GOOD: '⭐', NEUTRAL: '😐', WAIT: '⏸️' };
  const bd = result.breakdown;

  let text = `${emoji[result.signal] || '❓'} *Confluence: ${result.total}/100 (${result.signal})*\n`;
  text += `신뢰도: ${result.confidence} (${result.coverage})\n\n`;

  // 점수가 높은 지표부터 표시
  const sorted = Object.entries(bd).sort((a, b) => b[1] - a[1]);
  for (const [key, val] of sorted) {
    const max = MAX[key] || 0;
    const bar = val > 0 ? '█'.repeat(Math.ceil(val / max * 5)) : '░';
    const live = result.available[key] ? '' : ' (추정)';
    text += `${key}: ${val}/${max} ${bar}${live}\n`;
  }

  if (result.warnings.length > 0) {
    text += `\n${result.warnings.join('\n')}`;
  }

  return text;
}

module.exports = {
  calculate,
  calculateFromSnapshot,
  formatScore,
  getSignalGrade,
  // 개별 함수 (테스트용)
  scoreFunding, scoreOI, scorePOC, scoreWeeklyRSI, scoreMVRV,
  scoreSOPR, scoreFG, scoreMA, scoreETF, scoreWhale, scoreDominance,
  MAX, GRADES,
};
