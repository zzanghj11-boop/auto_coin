/**
 * /api/cron/jarvis — Vercel Cron으로 jarvis 모니터링 자동 실행
 *
 * 1) 시장 스냅샷 수집 (Binance, F&G, Yahoo, CoinGecko)
 * 2) Confluence Score 계산 (11개 지표)
 * 3) 블랙스완 체크
 * 4) 위험/기회 알림 → Telegram 전송
 * 5) action=briefing 파라미터 시 풀 브리핑 전송 (오전 cron용)
 *
 * vercel.json 등록:
 *   { "path": "/api/cron/jarvis",                "schedule": "*/5 * * * *" }  ← 5분마다 모니터링
 *   { "path": "/api/cron/jarvis?action=briefing", "schedule": "0 0 * * *" }   ← 매일 09:00 KST
 */

import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// ─── 데이터 수집 (jarvis/route.ts와 동일 로직) ──────────────

const BINANCE_FAPI = 'https://fapi.binance.com';
const FG_URL = 'https://api.alternative.me/fng/?limit=10';

async function fetchJson(url: string, timeout = 10_000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, { signal: ctrl.signal, cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally { clearTimeout(timer); }
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
    fundingRate: funding.status === 'fulfilled'
      ? Math.round(parseFloat(funding.value.lastFundingRate) * 100 * 10000) / 10000 : 0,
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
  } catch { return { value: 50, label: 'N/A', prev1d: null, prev1w: null }; }
}

async function getMacro() {
  const result: Record<string, number | null> = { dxy: null, nq: null, vix: null, gold: null, btcDominance: null };
  try {
    const g = await fetchJson('https://api.coingecko.com/api/v3/global');
    result.btcDominance = g?.data?.market_cap_percentage?.btc || null;
  } catch {}
  const tickers: Record<string, string> = { 'DX-Y.NYB': 'dxy', 'NQ=F': 'nq', '^VIX': 'vix', 'GC=F': 'gold' };
  const fetches = await Promise.allSettled(
    Object.keys(tickers).map(async (sym) => {
      const res = await fetch(
        `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=2d`,
        { headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://finance.yahoo.com/' }, cache: 'no-store' }
      );
      if (!res.ok) return null;
      const json = await res.json();
      const closes = json.chart?.result?.[0]?.indicators?.quote?.[0]?.close || [];
      return closes[closes.length - 1] ? Math.round(closes[closes.length - 1] * 100) / 100 : null;
    })
  );
  Object.keys(tickers).forEach((sym, i) => {
    if (fetches[i].status === 'fulfilled' && (fetches[i] as any).value !== null) {
      result[tickers[sym]] = (fetches[i] as PromiseFulfilledResult<number | null>).value;
    }
  });
  return result;
}

// ─── Confluence Score (서버리스용 경량 버전) ──────────────────

function calcConfluence(btc: any, fg: any, macro: any) {
  const MAX = { funding: 25, oi: 20, vp_poc: 15, weekly_rsi: 10, mvrv: 10, sopr: 10, fg: 8, ma: 7, etf: 5, whale: 5, dominance: 5 };

  // 펀딩비 점수
  const fr = btc.fundingRate ?? 0;
  const fundingScore = fr <= -0.10 ? 25 : fr <= -0.05 ? 20 : fr <= -0.02 ? 15 : fr <= -0.01 ? 10
    : fr < 0 ? 8 : fr <= 0.01 ? 5 : fr <= 0.03 ? 2 : 0;

  // F&G 점수
  const fgv = fg.value ?? 50;
  const fgScore = fgv <= 10 ? 8 : fgv <= 20 ? 7 : fgv <= 25 ? 5 : fgv <= 35 ? 3 : fgv <= 45 ? 1 : 0;

  // 도미넌스 점수
  const dom = macro.btcDominance ?? 0;
  const domScore = dom >= 60 ? 5 : dom >= 55 ? 3 : dom >= 50 ? 2 : dom >= 45 ? 1 : 0;

  // 중립값 (유료 API 미연동)
  const neutrals = Math.round(MAX.oi * 0.15) + 0 + Math.round(MAX.weekly_rsi * 0.1)
    + Math.round(MAX.mvrv * 0.3) + Math.round(MAX.sopr * 0.2) + 0
    + Math.round(MAX.etf * 0.4) + Math.round(MAX.whale * 0.2);

  const total = Math.min(100, fundingScore + fgScore + domScore + neutrals);
  const signal = total >= 90 ? 'JACKPOT' : total >= 75 ? 'STRONG' : total >= 60 ? 'GOOD' : total >= 45 ? 'NEUTRAL' : 'WAIT';

  return { total, signal, funding: fundingScore, fg: fgScore, dominance: domScore, coverage: '3/11 실측' };
}

// ─── 블랙스완 체크 ───────────────────────────────────────────

function checkBlackSwan(btc: any, fg: any, macro: any) {
  const triggered: string[] = [];
  if (fg.value <= 5) triggered.push(`F&G=${fg.value}`);
  if (macro.vix && macro.vix >= 45) triggered.push(`VIX=${macro.vix}`);
  if (btc.change24h <= -10) triggered.push(`BTC ${btc.change24h.toFixed(1)}%`);
  if (btc.fundingRate <= -0.30) triggered.push(`FR=${btc.fundingRate.toFixed(4)}%`);
  return { isBlackSwan: triggered.length >= 3, triggered, count: triggered.length };
}

// ─── 위험/기회 감지 ──────────────────────────────────────────

function detectAlerts(btc: any, fg: any, macro: any, confluence: any) {
  const alerts: { level: string; title: string; detail: string }[] = [];

  // 위험 알림
  if (Math.abs(btc.change24h) >= 5)
    alerts.push({ level: 'FIRE', title: '가격 충격', detail: `BTC ${btc.change24h > 0 ? '+' : ''}${btc.change24h.toFixed(1)}%` });
  if (macro.vix && macro.vix >= 35)
    alerts.push({ level: 'FIRE', title: 'VIX 급등', detail: `VIX=${macro.vix}` });
  if (btc.fundingRate <= -0.10)
    alerts.push({ level: 'FIRE', title: '펀딩비 극단', detail: `FR=${btc.fundingRate.toFixed(4)}%` });

  // 블랙스완
  const bs = checkBlackSwan(btc, fg, macro);
  if (bs.isBlackSwan)
    alerts.push({ level: 'CRITICAL', title: '블랙스완 경보', detail: bs.triggered.join(', ') });

  // 기회 알림
  if (fg.value <= 10)
    alerts.push({ level: 'OPP', title: 'F&G 극단 공포', detail: `F&G=${fg.value}` });
  if (confluence.signal === 'JACKPOT')
    alerts.push({ level: 'OPP', title: 'JACKPOT 시그널', detail: `Score=${confluence.total}` });
  else if (confluence.signal === 'STRONG')
    alerts.push({ level: 'OPP', title: 'STRONG 시그널', detail: `Score=${confluence.total}` });

  return alerts;
}

// ─── Telegram 전송 ───────────────────────────────────────────

async function sendTelegram(text: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return false;
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' }),
    });
    return res.ok;
  } catch { return false; }
}

// ─── GET 핸들러 ──────────────────────────────────────────────

export async function GET(req: Request) {
  // Cron 인증
  const auth = req.headers.get('authorization');
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const action = searchParams.get('action');

  try {
    const [btc, fg, macro] = await Promise.all([getBtcData(), getFearGreed(), getMacro()]);
    const confluence = calcConfluence(btc, fg, macro);
    const risk = Math.max(0, Math.min(100,
      50
      + (fg.value <= 10 ? -20 : fg.value <= 25 ? -10 : fg.value >= 75 ? 10 : 0)
      + (btc.fundingRate < -0.05 ? -10 : btc.fundingRate > 0.05 ? 10 : 0)
      + (macro.vix && macro.vix > 35 ? 15 : 0)
      + (Math.abs(btc.change24h) > 5 ? 10 : 0)
    ));

    // ─── 브리핑 모드 (매일 오전) ─────
    if (action === 'briefing') {
      const riskEmoji = risk >= 70 ? '🔴' : risk >= 50 ? '🟡' : '🟢';
      const fgEmoji = fg.value <= 25 ? '😱' : fg.value >= 75 ? '🤑' : '😐';
      const confEmoji = { JACKPOT: '🔥🔥🔥', STRONG: '🔥', GOOD: '⭐', NEUTRAL: '😐', WAIT: '⏸' }[confluence.signal] || '';

      const text = [
        `📋 *모닝 브리핑* (${new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })})`,
        '',
        `📊 *BTC* $${btc.price?.toLocaleString()} (${btc.change24h > 0 ? '+' : ''}${btc.change24h?.toFixed(1)}%)`,
        `펀딩: ${btc.fundingRate?.toFixed(4)}% | OI: ${Math.round(btc.openInterest).toLocaleString()} BTC`,
        `${fgEmoji} F&G: ${fg.value} (${fg.label})${fg.prev1d != null ? ` | 어제: ${fg.prev1d}` : ''}${fg.prev1w != null ? ` | 지난주: ${fg.prev1w}` : ''}`,
        macro.dxy ? `💵 DXY:${macro.dxy} | NQ:${macro.nq} | VIX:${macro.vix} | Gold:${macro.gold}` : '',
        macro.btcDominance ? `BTC.D: ${macro.btcDominance?.toFixed(1)}%` : '',
        '',
        `${riskEmoji} 위험도: ${risk}/100`,
        '',
        `${confEmoji} *Confluence: ${confluence.total}/100 (${confluence.signal})*`,
        `펀딩: ${confluence.funding}/25 | F&G: ${confluence.fg}/8 | 도미넌스: ${confluence.dominance}/5`,
        `${confluence.coverage}`,
      ].filter(Boolean).join('\n');

      const ok = await sendTelegram(text);
      return NextResponse.json({ ok, mode: 'briefing', confluence, risk });
    }

    // ─── 모니터링 모드 (5분마다) ─────
    const alerts = detectAlerts(btc, fg, macro, confluence);

    if (alerts.length > 0) {
      for (const alert of alerts) {
        const emoji = alert.level === 'CRITICAL' ? '🚨🚨' : alert.level === 'FIRE' ? '🚨' : '🔥';
        await sendTelegram(`${emoji} *${alert.title}*\n${alert.detail}`);
      }
    }

    return NextResponse.json({
      ok: true,
      mode: 'monitor',
      alerts: alerts.length,
      confluence: { total: confluence.total, signal: confluence.signal },
      risk,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
