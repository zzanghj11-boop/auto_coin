// Vercel Cron 엔드포인트 — 활성화된 모든 봇을 한 번에 tick
// vercel.json 에 등록 예: { "crons": [{ "path": "/api/cron/tick", "schedule": "* * * * *" }] }
// 보호: CRON_SECRET 환경변수와 Authorization 헤더 일치 확인

import { NextResponse } from 'next/server';
import { createClient as createAdmin } from '@supabase/supabase-js';
import { fetchHtxKlines, runStepEnsemble, type BotState } from '@/lib/trading/runner';
import { STRATEGY_MAP } from '@/lib/trading/strategies';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

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

  // 심볼/주기별로 kline 캐시
  const cache = new Map<string, any>();
  const results: any[] = [];

  for (const bot of bots) {
    const k = `${bot.symbol}|${bot.period}`;
    try {
      if (!cache.has(k)) cache.set(k, await fetchHtxKlines(bot.symbol, bot.period, 300));
      const candles = cache.get(k);
      const strategyKeys: string[] = Array.isArray(bot.strategies) && bot.strategies.length > 0
        ? bot.strategies as string[]
        : (bot.strategy ? [bot.strategy] : []);
      const validKeys = strategyKeys.filter(x => STRATEGY_MAP[x]);
      if (validKeys.length === 0) { results.push({ id: bot.id, error: 'no valid strategy' }); continue; }

      const { data: stateRow } = await admin.from('bot_state').select('*').eq('bot_id', bot.id).maybeSingle();
      const state: BotState = stateRow
        ? { cash: Number(stateRow.cash), coin: Number(stateRow.coin), entry_price: Number(stateRow.entry_price), last_ts: Number(stateRow.last_ts), entry_strategy: stateRow.entry_strategy ?? null }
        : { cash: Number(bot.initial_cash), coin: 0, entry_price: 0, last_ts: 0, entry_strategy: null };

      const result = runStepEnsemble(state, candles, validKeys);
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
      }
      if (result.state.last_ts > prevTs) {
        await admin.from('equity_history').insert({
          bot_id: bot.id, ts: result.state.last_ts, equity: result.equity, price: result.price,
        });
      }
      await admin.from('bot_runs').insert({ bot_id: bot.id, ok: true, message: result.trade ? `${result.trade.side}` : 'noop' });
      results.push({ id: bot.id, ok: true, traded: !!result.trade });
    } catch (e: any) {
      await admin.from('bot_runs').insert({ bot_id: bot.id, ok: false, message: e.message });
      results.push({ id: bot.id, error: e.message });
    }
  }

  return NextResponse.json({ ok: true, processed: bots.length, results });
}
