/**
 * auto_coin × jarvis-v2 — 데이터 피드 통합 모듈
 *
 * jarvis-v2의 Binance, Fear&Greed, Macro 데이터를 수집하여
 * auto_coin의 매매 판단에 보조 지표로 제공한다.
 *
 * 모든 데이터는 무료 공개 API만 사용 (API 키 불필요)
 * Supabase 의존성 제거 — 파일 기반 캐시 사용
 *
 * 사용법:
 *   const feed = require('./jarvis/dataFeed');
 *   await feed.fetchAll();
 *   const snapshot = feed.getSnapshot();
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { EXTERNAL_URLS } = require('./constants');

const CACHE_FILE = path.join(__dirname, '../../data/jarvis_market_cache.json');

// ─── 메모리 상태 ──────────────────────────────────────────────
let _state = {
  btc: {
    price: 0, change24h: 0, high24h: 0, low24h: 0, volume24h: 0,
    fundingRate: 0, fundingApr: 0, openInterest: 0, longShortRatio: 1,
    updatedAt: null,
  },
  fearGreed: {
    value: 50, label: 'Neutral', prev1d: null, prev1w: null, updatedAt: null,
  },
  macro: {
    dxy: null, nq: null, vix: null, gold: null, oil: null,
    btcDominance: null, nq1dChange: null, oil1dChange: null, updatedAt: null,
  },
  updatedAt: null,
};

// ─── 캐시 로드 / 저장 ─────────────────────────────────────────
function _loadCache() {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const raw = fs.readFileSync(CACHE_FILE, 'utf8');
      const cached = JSON.parse(raw);
      // 10분 이내 캐시만 유효
      if (cached.updatedAt && Date.now() - cached.updatedAt < 600_000) {
        _state = cached;
        return true;
      }
    }
  } catch (e) { /* ignore */ }
  return false;
}

function _saveCache() {
  try {
    const dir = path.dirname(CACHE_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(CACHE_FILE, JSON.stringify(_state, null, 2));
  } catch (e) {
    console.warn('[jarvis-feed] 캐시 저장 실패:', e.message);
  }
}

// ─── BTC 시장 데이터 (Binance 공개 API) ──────────────────────

async function _fetchBtcData() {
  try {
    const [tickerRes, fundingRes, oiRes, lsRes] = await Promise.allSettled([
      _fetchJson(`${EXTERNAL_URLS.BINANCE_FAPI}/fapi/v1/ticker/24hr?symbol=BTCUSDT`),
      _fetchJson(`${EXTERNAL_URLS.BINANCE_FAPI}/fapi/v1/premiumIndex?symbol=BTCUSDT`),
      _fetchJson(`${EXTERNAL_URLS.BINANCE_FAPI}/fapi/v1/openInterest?symbol=BTCUSDT`),
      _fetchJson(`${EXTERNAL_URLS.BINANCE_FAPI}/futures/data/globalLongShortAccountRatio?symbol=BTCUSDT&period=1h&limit=1`),
    ]);

    if (tickerRes.status === 'fulfilled' && tickerRes.value) {
      const d = tickerRes.value;
      _state.btc.price = parseFloat(d.lastPrice);
      _state.btc.change24h = parseFloat(d.priceChangePercent);
      _state.btc.high24h = parseFloat(d.highPrice);
      _state.btc.low24h = parseFloat(d.lowPrice);
      _state.btc.volume24h = parseFloat(d.quoteVolume);
    }

    if (fundingRes.status === 'fulfilled' && fundingRes.value) {
      const rate = parseFloat(fundingRes.value.lastFundingRate) * 100;
      _state.btc.fundingRate = Math.round(rate * 10000) / 10000;
      _state.btc.fundingApr = Math.round(rate * 3 * 365 * 100) / 100;
    }

    if (oiRes.status === 'fulfilled' && oiRes.value) {
      _state.btc.openInterest = parseFloat(oiRes.value.openInterest);
    }

    if (lsRes.status === 'fulfilled' && Array.isArray(lsRes.value) && lsRes.value[0]) {
      _state.btc.longShortRatio = parseFloat(lsRes.value[0].longShortRatio);
    }

    _state.btc.updatedAt = Date.now();
    console.log(`[jarvis-feed] BTC: $${_state.btc.price.toLocaleString()} (${_state.btc.change24h > 0 ? '+' : ''}${_state.btc.change24h}%) FR:${_state.btc.fundingRate}%`);
  } catch (e) {
    console.warn('[jarvis-feed] BTC 데이터 수집 실패:', e.message);
  }
}

// ─── Fear & Greed 지수 (alternative.me 무료) ──────────────────

async function _fetchFearGreed() {
  try {
    const json = await _fetchJson(EXTERNAL_URLS.ALTERNATIVE_FG);
    const data = json?.data || [];
    if (!data.length) return;

    _state.fearGreed = {
      value: parseInt(data[0].value),
      label: data[0].value_classification,
      prev1d: data[1] ? parseInt(data[1].value) : null,
      prev1w: data[6] ? parseInt(data[6].value) : null,
      updatedAt: Date.now(),
    };
    console.log(`[jarvis-feed] F&G: ${_state.fearGreed.value} (${_state.fearGreed.label})`);
  } catch (e) {
    console.warn('[jarvis-feed] F&G 수집 실패:', e.message);
  }
}

// ─── 거시경제 지표 (Yahoo Finance 무료) ────────────────────────

const YAHOO_UA = [
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/119.0.0.0 Safari/537.36',
];

async function _fetchMacro() {
  try {
    const tickers = { 'DX-Y.NYB': 'dxy', 'NQ=F': 'nq', '^VIX': 'vix', 'GC=F': 'gold', 'CL=F': 'oil' };
    const results = await Promise.allSettled(
      Object.keys(tickers).map(t => _fetchYahooTicker(t))
    );

    const keys = Object.keys(tickers);
    results.forEach((r, i) => {
      if (r.status === 'fulfilled' && r.value) {
        const key = tickers[keys[i]];
        _state.macro[key] = r.value.price;
        if (key === 'nq') _state.macro.nq1dChange = r.value.change1d;
        if (key === 'oil') _state.macro.oil1dChange = r.value.change1d;
      }
    });

    // BTC 도미넌스 (CoinGecko 무료)
    try {
      const gRes = await _fetchJson(EXTERNAL_URLS.COINGECKO_GLOBAL);
      _state.macro.btcDominance = gRes?.data?.market_cap_percentage?.btc || null;
    } catch (e) { /* ignore */ }

    _state.macro.updatedAt = Date.now();
    console.log(`[jarvis-feed] Macro: DXY:${_state.macro.dxy} NQ:${_state.macro.nq} VIX:${_state.macro.vix}`);
  } catch (e) {
    console.warn('[jarvis-feed] Macro 수집 실패:', e.message);
  }
}

async function _fetchYahooTicker(symbol) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 12_000);
    try {
      const res = await fetch(
        `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=3d`,
        {
          signal: ctrl.signal,
          headers: {
            'User-Agent': YAHOO_UA[attempt % YAHOO_UA.length],
            'Accept': 'application/json',
            'Referer': 'https://finance.yahoo.com/',
          },
        }
      ).finally(() => clearTimeout(timer));

      if (res.status === 429) {
        await new Promise(r => setTimeout(r, (attempt + 1) * 5000));
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const json = await res.json();
      const result = json.chart?.result?.[0];
      if (!result) return null;

      const closes = result.indicators?.quote?.[0]?.close || [];
      const last = closes[closes.length - 1];
      const prev = closes[closes.length - 2];
      return {
        price: last ? Math.round(last * 100) / 100 : null,
        change1d: (last && prev) ? ((last - prev) / prev * 100).toFixed(2) : null,
      };
    } catch (e) {
      if (attempt === 1) return null;
      await new Promise(r => setTimeout(r, 2000));
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}

// ─── 유틸리티 ──────────────────────────────────────────────────

async function _fetchJson(url, timeout = 10_000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

// ─── 공개 API ──────────────────────────────────────────────────

/**
 * 모든 데이터 소스 한번에 수집
 * @returns {Object} 전체 스냅샷
 */
async function fetchAll() {
  // 캐시가 유효하면 스킵
  if (_loadCache()) {
    console.log('[jarvis-feed] 캐시 유효 — 스킵');
    return getSnapshot();
  }

  await Promise.allSettled([
    _fetchBtcData(),
    _fetchFearGreed(),
    _fetchMacro(),
  ]);

  _state.updatedAt = Date.now();
  _saveCache();
  return getSnapshot();
}

/**
 * 현재 스냅샷 반환 (fetch 없이)
 */
function getSnapshot() {
  return JSON.parse(JSON.stringify(_state));
}

/**
 * 시장 상태 요약 텍스트 생성 (텔레그램 알림용)
 */
function getSummaryText() {
  const b = _state.btc;
  const f = _state.fearGreed;
  const m = _state.macro;

  const fgEmoji = f.value <= 25 ? '😱' : f.value >= 75 ? '🤑' : '😐';
  const priceEmoji = b.change24h >= 3 ? '🚀' : b.change24h <= -3 ? '📉' : '📊';

  return [
    `${priceEmoji} *BTC* $${b.price?.toLocaleString() || '?'} (${b.change24h > 0 ? '+' : ''}${b.change24h?.toFixed(1) || '?'}%)`,
    `펀딩: ${b.fundingRate?.toFixed(4) || '?'}% | OI: ${b.openInterest ? Math.round(b.openInterest).toLocaleString() : '?'} BTC`,
    `L/S: ${b.longShortRatio?.toFixed(2) || '?'}`,
    `${fgEmoji} F&G: ${f.value} (${f.label})${f.prev1d ? ` ← 어제 ${f.prev1d}` : ''}`,
    m.dxy ? `💵 DXY:${m.dxy} | NQ:${m.nq} | VIX:${m.vix}` : '',
    m.btcDominance ? `BTC.D: ${m.btcDominance?.toFixed(1)}%` : '',
  ].filter(Boolean).join('\n');
}

/**
 * 시장 위험도 점수 (0~100) — 높을수록 위험
 * auto_coin의 매매 판단에 보조로 사용
 */
function getRiskScore() {
  let score = 50; // 기본 중립

  const f = _state.fearGreed;
  const b = _state.btc;
  const m = _state.macro;

  // F&G 극단 → 역투자 관점에서 risk 조정
  if (f.value <= 10) score -= 20;       // 극단 공포 = 매수 기회 (risk 낮음)
  else if (f.value <= 25) score -= 10;  // 공포
  else if (f.value >= 90) score += 20;  // 극단 탐욕 = risk 높음
  else if (f.value >= 75) score += 10;  // 탐욕

  // 펀딩비
  if (b.fundingRate < -0.05) score -= 10;  // 숏 과열 = 롱 기회
  if (b.fundingRate > 0.05) score += 10;   // 롱 과열

  // VIX
  if (m.vix && m.vix > 35) score += 15;   // 시장 공포 극대
  else if (m.vix && m.vix > 25) score += 5;

  // 24h 변동성
  if (Math.abs(b.change24h) > 5) score += 10;

  return Math.max(0, Math.min(100, score));
}

module.exports = {
  fetchAll,
  getSnapshot,
  getSummaryText,
  getRiskScore,
};
