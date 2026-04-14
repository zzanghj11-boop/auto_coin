// Shared market data helpers for jarvis cron endpoints.
// Extracted from /api/cron/jarvis so the briefing endpoint can reuse them
// without duplicating BTC/F&G/Macro fetching, confluence scoring, and Telegram send.

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

export type BtcData = {
  price: number; change24h: number; fundingRate: number; openInterest: number;
};
export type FgData = {
  value: number; label: string; prev1d: number | null; prev1w: number | null;
};
export type MacroData = {
  dxy: number | null; nq: number | null; vix: number | null;
  gold: number | null; btcDominance: number | null;
};

export async function getBtcData(): Promise<BtcData> {
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

export async function getFearGreed(): Promise<FgData> {
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

export async function getMacro(): Promise<MacroData> {
  const result: MacroData = { dxy: null, nq: null, vix: null, gold: null, btcDominance: null };
  try {
    const g = await fetchJson('https://api.coingecko.com/api/v3/global');
    result.btcDominance = g?.data?.market_cap_percentage?.btc || null;
  } catch {}
  const tickers: Record<string, keyof MacroData> = { 'DX-Y.NYB': 'dxy', 'NQ=F': 'nq', '^VIX': 'vix', 'GC=F': 'gold' };
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
    const r = fetches[i];
    if (r.status === 'fulfilled' && r.value !== null) {
      result[tickers[sym]] = r.value as number;
    }
  });
  return result;
}

// ─── Confluence Score (서버리스용 경량 버전) ──────────────────
export type Confluence = {
  total: number;
  signal: 'JACKPOT' | 'STRONG' | 'GOOD' | 'NEUTRAL' | 'WAIT';
  funding: number; fg: number; dominance: number; coverage: string;
};

export function calcConfluence(btc: BtcData, fg: FgData, macro: MacroData): Confluence {
  const MAX = { funding: 25, oi: 20, vp_poc: 15, weekly_rsi: 10, mvrv: 10, sopr: 10, fg: 8, ma: 7, etf: 5, whale: 5, dominance: 5 };

  const fr = btc.fundingRate ?? 0;
  const fundingScore = fr <= -0.10 ? 25 : fr <= -0.05 ? 20 : fr <= -0.02 ? 15 : fr <= -0.01 ? 10
    : fr < 0 ? 8 : fr <= 0.01 ? 5 : fr <= 0.03 ? 2 : 0;

  const fgv = fg.value ?? 50;
  const fgScore = fgv <= 10 ? 8 : fgv <= 20 ? 7 : fgv <= 25 ? 5 : fgv <= 35 ? 3 : fgv <= 45 ? 1 : 0;

  const dom = macro.btcDominance ?? 0;
  const domScore = dom >= 60 ? 5 : dom >= 55 ? 3 : dom >= 50 ? 2 : dom >= 45 ? 1 : 0;

  const neutrals = Math.round(MAX.oi * 0.15) + 0 + Math.round(MAX.weekly_rsi * 0.1)
    + Math.round(MAX.mvrv * 0.3) + Math.round(MAX.sopr * 0.2) + 0
    + Math.round(MAX.etf * 0.4) + Math.round(MAX.whale * 0.2);

  const total = Math.min(100, fundingScore + fgScore + domScore + neutrals);
  const signal: Confluence['signal'] =
    total >= 90 ? 'JACKPOT' : total >= 75 ? 'STRONG' : total >= 60 ? 'GOOD' : total >= 45 ? 'NEUTRAL' : 'WAIT';

  return { total, signal, funding: fundingScore, fg: fgScore, dominance: domScore, coverage: '3/11 실측' };
}

// ─── 블랙스완 체크 ───────────────────────────────────────────
export function checkBlackSwan(btc: BtcData, fg: FgData, macro: MacroData) {
  const triggered: string[] = [];
  if (fg.value <= 5) triggered.push(`F&G=${fg.value}`);
  if (macro.vix && macro.vix >= 45) triggered.push(`VIX=${macro.vix}`);
  if (btc.change24h <= -10) triggered.push(`BTC ${btc.change24h.toFixed(1)}%`);
  if (btc.fundingRate <= -0.30) triggered.push(`FR=${btc.fundingRate.toFixed(4)}%`);
  return { isBlackSwan: triggered.length >= 3, triggered, count: triggered.length };
}

// ─── 위험/기회 감지 ──────────────────────────────────────────
export function detectAlerts(btc: BtcData, fg: FgData, macro: MacroData, confluence: Confluence) {
  const alerts: { level: string; title: string; detail: string }[] = [];

  if (Math.abs(btc.change24h) >= 5)
    alerts.push({ level: 'FIRE', title: '가격 충격', detail: `BTC ${btc.change24h > 0 ? '+' : ''}${btc.change24h.toFixed(1)}%` });
  if (macro.vix && macro.vix >= 35)
    alerts.push({ level: 'FIRE', title: 'VIX 급등', detail: `VIX=${macro.vix}` });
  if (btc.fundingRate <= -0.10)
    alerts.push({ level: 'FIRE', title: '펀딩비 극단', detail: `FR=${btc.fundingRate.toFixed(4)}%` });

  const bs = checkBlackSwan(btc, fg, macro);
  if (bs.isBlackSwan)
    alerts.push({ level: 'CRITICAL', title: '블랙스완 경보', detail: bs.triggered.join(', ') });

  if (fg.value <= 10)
    alerts.push({ level: 'OPP', title: 'F&G 극단 공포', detail: `F&G=${fg.value}` });
  if (confluence.signal === 'JACKPOT')
    alerts.push({ level: 'OPP', title: 'JACKPOT 시그널', detail: `Score=${confluence.total}` });
  else if (confluence.signal === 'STRONG')
    alerts.push({ level: 'OPP', title: 'STRONG 시그널', detail: `Score=${confluence.total}` });

  return alerts;
}

export function calcRisk(btc: BtcData, fg: FgData, macro: MacroData) {
  return Math.max(0, Math.min(100,
    50
    + (fg.value <= 10 ? -20 : fg.value <= 25 ? -10 : fg.value >= 75 ? 10 : 0)
    + (btc.fundingRate < -0.05 ? -10 : btc.fundingRate > 0.05 ? 10 : 0)
    + (macro.vix && macro.vix > 35 ? 15 : 0)
    + (Math.abs(btc.change24h) > 5 ? 10 : 0)
  ));
}

// ─── Telegram 전송 (로깅 포함) ───────────────────────────────
export async function sendTelegram(text: string): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    console.warn('[tg] env missing', { hasToken: !!token, hasChatId: !!chatId });
    return false;
  }
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error('[tg] send failed', { status: res.status, body: body.slice(0, 200) });
      return false;
    }
    console.log('[tg] sent', { len: text.length });
    return true;
  } catch (e: any) {
    console.error('[tg] send threw', e?.message || e);
    return false;
  }
}

// ─── Cron 인증 헬퍼 ─────────────────────────────────────────
export function isAuthorizedCron(req: Request): boolean {
  const auth = req.headers.get('authorization');
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // 미설정 시 허용 (개발 편의)
  return auth === `Bearer ${secret}`;
}
