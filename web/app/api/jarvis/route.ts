/**
 * /api/jarvis — jarvis-v2 시장 데이터 API
 *
 * GET  /api/jarvis          → 시장 스냅샷 (BTC, F&G, Macro, Risk Score)
 * POST /api/jarvis?action=  → briefing (시장 브리핑 텔레그램 전송)
 *                             monitor  (시장 모니터링 체크 실행)
 *                             test     (텔레그램 연결 테스트)
 *
 * 대시보드에서 시장 현황 표시 + 수동 알림 트리거에 사용
 */

import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// Binance + alternative.me + Yahoo Finance 직접 fetch (서버리스 호환)
const BINANCE_FAPI = 'https://fapi.binance.com';
const FG_URL = 'https://api.alternative.me/fng/?limit=10';

async function fetchJson(url: string, timeout = 10_000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, { signal: ctrl.signal, cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function getBtcData() {
  const [ticker, funding, oi] = await Promise.allSettled([
    fetchJson(`${BINANCE_FAPI}/fapi/v1/ticker/24hr?symbol=BTCUSDT`),
    fetchJson(`${BINANCE_FAPI}/fapi/v1/premiumIndex?symbol=BTCUSDT`),
    fetchJson(`${BINANCE_FAPI}/fapi/v1/openInterest?symbol=BTCUSDT`),
  ]);

  return {
    price: ticker.status === 'fulfilled' ? parseFloat(ticker.value.lastPrice) : 0,
    change24h: ticker.status === 'fulfilled' ? parseFloat(ticker.value.priceChangePercent) : 0,
    high24h: ticker.status === 'fulfilled' ? parseFloat(ticker.value.highPrice) : 0,
    low24h: ticker.status === 'fulfilled' ? parseFloat(ticker.value.lowPrice) : 0,
    volume24h: ticker.status === 'fulfilled' ? parseFloat(ticker.value.quoteVolume) : 0,
    fundingRate: funding.status === 'fulfilled'
      ? Math.round(parseFloat(funding.value.lastFundingRate) * 100 * 10000) / 10000
      : 0,
    openInterest: oi.status === 'fulfilled' ? parseFloat(oi.value.openInterest) : 0,
  };
}

async function getFearGreed() {
  try {
    const json = await fetchJson(FG_URL);
    const data = json?.data || [];
    return {
      value: data[0] ? parseInt(data[0].value) : 50,
      label: data[0]?.value_classification || 'Neutral',
      prev1d: data[1] ? parseInt(data[1].value) : null,
      prev1w: data[6] ? parseInt(data[6].value) : null,
    };
  } catch {
    return { value: 50, label: 'N/A', prev1d: null, prev1w: null };
  }
}

async function getMacro() {
  const result: Record<string, number | string | null> = {
    dxy: null, nq: null, vix: null, gold: null, btcDominance: null,
  };

  // BTC 도미넌스 (CoinGecko)
  try {
    const g = await fetchJson('https://api.coingecko.com/api/v3/global');
    result.btcDominance = g?.data?.market_cap_percentage?.btc || null;
  } catch { /* ignore */ }

  // Yahoo Finance
  const tickers: Record<string, string> = { 'DX-Y.NYB': 'dxy', 'NQ=F': 'nq', '^VIX': 'vix', 'GC=F': 'gold' };
  const fetches = await Promise.allSettled(
    Object.keys(tickers).map(async (sym) => {
      const res = await fetch(
        `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=2d`,
        {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
            'Referer': 'https://finance.yahoo.com/',
          },
          cache: 'no-store',
        }
      );
      if (!res.ok) return null;
      const json = await res.json();
      const closes = json.chart?.result?.[0]?.indicators?.quote?.[0]?.close || [];
      return closes[closes.length - 1] ? Math.round(closes[closes.length - 1] * 100) / 100 : null;
    })
  );

  Object.keys(tickers).forEach((sym, i) => {
    if (fetches[i].status === 'fulfilled' && fetches[i].value !== null) {
      result[tickers[sym]] = (fetches[i] as PromiseFulfilledResult<number | null>).value;
    }
  });

  return result;
}

function calculateRisk(btc: any, fg: any, macro: any) {
  let score = 50;
  if (fg.value <= 10) score -= 20;
  else if (fg.value <= 25) score -= 10;
  else if (fg.value >= 90) score += 20;
  else if (fg.value >= 75) score += 10;
  if (btc.fundingRate < -0.05) score -= 10;
  if (btc.fundingRate > 0.05) score += 10;
  if (macro.vix && (macro.vix as number) > 35) score += 15;
  if (Math.abs(btc.change24h) > 5) score += 10;
  return Math.max(0, Math.min(100, score));
}

// ─── GET: 스냅샷 반환 ──────────────────────────────────────

export async function GET() {
  try {
    const [btc, fg, macro] = await Promise.all([getBtcData(), getFearGreed(), getMacro()]);
    const riskScore = calculateRisk(btc, fg, macro);

    return NextResponse.json({
      ok: true,
      btc,
      fearGreed: fg,
      macro,
      riskScore,
      updatedAt: new Date().toISOString(),
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}

// ─── POST: 액션 실행 ──────────────────────────────────────

export async function POST(req: Request) {
  const { searchParams } = new URL(req.url);
  const action = searchParams.get('action');

  const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

  if (!BOT_TOKEN || !CHAT_ID) {
    return NextResponse.json({ ok: false, error: 'TELEGRAM 환경변수 미설정' }, { status: 400 });
  }

  async function sendTelegram(text: string) {
    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: CHAT_ID, text, parse_mode: 'Markdown' }),
    });
    return res.ok;
  }

  if (action === 'test') {
    const ok = await sendTelegram('✅ auto\\_coin 텔레그램 연결 테스트 성공!');
    return NextResponse.json({ ok });
  }

  if (action === 'briefing') {
    const [btc, fg, macro] = await Promise.all([getBtcData(), getFearGreed(), getMacro()]);
    const risk = calculateRisk(btc, fg, macro);
    const riskEmoji = risk >= 70 ? '🔴' : risk >= 50 ? '🟡' : '🟢';
    const fgEmoji = fg.value <= 25 ? '😱' : fg.value >= 75 ? '🤑' : '😐';

    const text = [
      `📋 *시장 현황* (${new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })})`,
      '',
      `📊 *BTC* $${btc.price?.toLocaleString()} (${btc.change24h > 0 ? '+' : ''}${btc.change24h?.toFixed(1)}%)`,
      `펀딩: ${btc.fundingRate?.toFixed(4)}% | OI: ${Math.round(btc.openInterest).toLocaleString()} BTC`,
      `${fgEmoji} F&G: ${fg.value} (${fg.label})`,
      macro.dxy ? `💵 DXY:${macro.dxy} | NQ:${macro.nq} | VIX:${macro.vix}` : '',
      macro.btcDominance ? `BTC.D: ${(macro.btcDominance as number)?.toFixed(1)}%` : '',
      '',
      `${riskEmoji} 위험도: ${risk}/100`,
    ].filter(Boolean).join('\n');

    const ok = await sendTelegram(text);
    return NextResponse.json({ ok, riskScore: risk });
  }

  return NextResponse.json({ ok: false, error: 'unknown action' }, { status: 400 });
}
