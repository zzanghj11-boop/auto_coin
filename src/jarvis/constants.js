/**
 * auto_coin × jarvis-v2 통합 상수
 * jarvis-v2 constants.js에서 auto_coin에 필요한 부분만 추출
 */
'use strict';

// ─── 업데이트 주기 (밀리초) ───────────────────────────────────
const INTERVALS = {
  PRICE: 60_000,         // 1분 - 가격/펀딩비
  SCORE: 300_000,        // 5분 - Confluence 점수
  MACRO: 300_000,        // 5분 - 거시경제
  FG: 3_600_000,         // 1시간 - Fear & Greed
  MARKET_MONITOR: 300_000, // 5분 - 시장 모니터링
};

// ─── 외부 API URL ─────────────────────────────────────────────
const EXTERNAL_URLS = {
  BINANCE_WS: 'wss://fstream.binance.com/ws',
  BINANCE_FAPI: 'https://fapi.binance.com',
  ALTERNATIVE_FG: 'https://api.alternative.me/fng/?limit=10',
  COINGECKO_GLOBAL: 'https://api.coingecko.com/api/v3/global',
};

// ─── Fear & Greed 임계값 ──────────────────────────────────────
const FG_THRESHOLDS = {
  EXTREME_FEAR: 10,
  FEAR: 25,
  WEAK_FEAR: 45,
  NEUTRAL_HIGH: 55,
  GREED: 75,
  EXTREME_GREED: 90,
};

// ─── 시장 모니터 임계값 ──────────────────────────────────────
const MARKET_THRESHOLDS = {
  PRICE_SHOCK_1H: 5,    // BTC 1시간 변동률 (%)
  VIX_SPIKE: 35,         // VIX 급등
  DXY_SHOCK: 1.5,        // DXY 일간 변동
  OIL_SHOCK: 8,          // 유가 일간 변동 (%)
  FUNDING_EXTREME: -0.10, // 펀딩비 극단
};

// ─── 텔레그램 쿨다운 ──────────────────────────────────────────
const COOLDOWNS = {
  TELEGRAM: 60_000,    // 1분 쿨다운
};

module.exports = {
  INTERVALS,
  EXTERNAL_URLS,
  FG_THRESHOLDS,
  MARKET_THRESHOLDS,
  COOLDOWNS,
};
