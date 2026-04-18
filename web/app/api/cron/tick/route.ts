// Vercel Cron 엔드포인트 — 활성화된 모든 봇을 한 번에 tick
// vercel.json 에 등록 예: { "crons": [{ "path": "/api/cron/tick", "schedule": "* * * * *" }] }
// 보호: CRON_SECRET 환경변수와 Authorization 헤더 일치 확인

import { NextResponse } from 'next/server';
import { createClient as createAdmin } from '@supabase/supabase-js';
import { fetchHtxKlines, runStepEnsemble, runStepComposite, type BotState } from '@/lib/trading/runner';
import { STRATEGY_MAP } from '@/lib/trading/strategies';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

async function sendTelegram(text: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' }),
    });
  } catch (_) { /* 텔레그램 실패해도 거래 처리 계속 */ }
}

export async function GET(req: Request) {
  const auth = req.headers.get('authorization');
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const admin = createAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  const { data: bots } = await admin.from('bots').select('*').eq('enabled', true);
  if (!bots || bots.length === 0) return NextResponse.json({ ok: true, processed: 0 });

  // 심볼/주기별로 kline을 미리 병렬 prefetch (HTX fetch는 한 번만)
  const klineKeys = Array.from(new Set(bots.map(b => `${b.symbol}|${b.period}`)));
  const klineEntries = await Promise.all(klineKeys.map(async k => {
    const [symbol, period] = k.split('|');
    try { return [k, await fetchHtxKlines(symbol, period, 300)] as const; }
    catch (e: any) { return [k, { __error: e?.message ?? 'fetch failed' }] as const; }
  }));
  const cache = new Map<string, any>(klineEntries);

  // 모든 봇을 병렬 처리
  const results = await Promise.all(bots.map(async (bot) => {
    const k = `${bot.symbol}|${bot.period}`;
    try {
      const candles = cache.get(k);
      if (candles?.__error) throw new Error(`HTX fetch 실패: ${candles.__error}`);
      let parsedStrategies: any = bot.strategies;
      if (typeof parsedStrategies === 'string') {
        try { parsedStrategies = JSON.parse(parsedStrategies); } catch { parsedStrategies = null; }
      }
      const strategyKeys: string[] = Array.isArray(parsedStrategies) && parsedStrategies.length > 0
        ? parsedStrategies as string[]
        : (bot.strategy ? [bot.strategy] : []);
      const isComposite = strategyKeys.includes('composite');
      const validKeys = strategyKeys.filter(x => STRATEGY_MAP[x]);
      if (!isComposite && validKeys.length === 0) { return { id: bot.id, error: 'no valid strategy' }; }

      const { data: stateRow } = await admin.from('bot_state').select('*').eq('bot_id', bot.id).maybeSingle();
      const state: BotState = stateRow
        ? { cash: Number(stateRow.cash), coin: Number(stateRow.coin), entry_price: Number(stateRow.entry_price), last_ts: Number(stateRow.last_ts), entry_strategy: stateRow.entry_strategy ?? null }
        : { cash: Number(bot.initial_cash), coin: 0, entry_price: 0, last_ts: 0, entry_strategy: null };

      const result = isComposite
        ? runStepComposite(state, candles, bot.symbol, bot.period)
        : runStepEnsemble(state, candles, validKeys);
      const prevTs = stateRow?.last_ts ?? 0;

      await admin.from('bot_state').upsert({
        bot_id: bot.id,
        cash: result.state.cash, coin: result.state.coin, entry_price: result.state.entry_price,
        last_ts: result.state.last_ts, last_price: result.price, equity: result.equity,
        entry_strategy: result.state.entry_strategy ?? null,
        updated_at: new Date().toISOString(),
      });
      if (result.trade) {
        await admin.from('trades').insert({
          bot_id: bot.id, ts: result.trade.ts, side: result.trade.side,
          price: result.trade.price, size: result.trade.size, fee: result.trade.fee,
          reason: result.trade.reason, ret: result.trade.ret,
          trigger_strategy: result.trade.trigger_strategy ?? null,
        });
        // 텔레그램 거래 알림
        const side = result.trade.side === 'buy' ? '🟢 매수' : '🔴 매도';
        const retStr = result.trade.ret != null ? ` | 수익: ${(result.trade.ret * 100).toFixed(2)}%` : '';
        const equityStr = result.equity ? ` | 자산: $${Number(result.equity).toFixed(2)}` : '';
        const msg = `${side} *${bot.name}*\n` +
          `코인: \`${bot.symbol}\` (${bot.period})\n` +
          `가격: $${Number(result.trade.price).toFixed(4)}\n` +
          `전략: ${result.trade.trigger_strategy ?? '-'}${retStr}${equityStr}`;
        await sendTelegram(msg);
      }
      if (result.state.last_ts > prevTs) {
        await admin.from('equity_history').insert({
          bot_id: bot.id, ts: result.state.last_ts, equity: result.equity, price: result.price,
        });
      }
      await admin.from('bot_runs').insert({ bot_id: bot.id, ok: true, message: result.trade ? `${result.trade.side}` : 'noop' });
      return { id: bot.id, ok: true, traded: !!result.trade };
    } catch (e: any) {
      await admin.from('bot_runs').insert({ bot_id: bot.id, ok: false, message: e.message });
      return { id: bot.id, error: e.message };
    }
  }));

  return NextResponse.json({ ok: true, processed: bots.length, results });
}
