// 디버그용: 특정 봇 1개를 즉시 tick하고 결과/에러를 JSON으로 반환
// 사용: GET /api/debug/tick-one?bot_id=xxxx (로그인된 본인 봇만)
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdmin } from '@supabase/supabase-js';
import { fetchHtxKlines, runStepEnsemble, runStepComposite, type BotState } from '@/lib/trading/runner';
import { STRATEGY_MAP } from '@/lib/trading/strategies';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const botId = url.searchParams.get('bot_id');
  if (!botId) return NextResponse.json({ error: 'bot_id required' }, { status: 400 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const admin = createAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  const trace: any = { steps: [] };
  try {
    const { data: bot, error: be } = await admin.from('bots').select('*').eq('id', botId).single();
    trace.steps.push({ step: 'load_bot', ok: !be, bot: bot ? { id: bot.id, symbol: bot.symbol, period: bot.period, enabled: bot.enabled, strategies: bot.strategies, user_id: bot.user_id } : null, error: be?.message });
    if (be || !bot) return NextResponse.json({ error: 'bot not found', trace }, { status: 404 });
    if (bot.user_id !== user.id) return NextResponse.json({ error: 'forbidden', trace }, { status: 403 });

    const strategyKeys: string[] = Array.isArray(bot.strategies) && bot.strategies.length > 0
      ? bot.strategies as string[]
      : (bot.strategy ? [bot.strategy] : []);
    const isComposite = strategyKeys.includes('composite');
    const validKeys = strategyKeys.filter(x => STRATEGY_MAP[x]);
    trace.steps.push({ step: 'parse_strategies', strategyKeys, isComposite, validKeys });

    if (!isComposite && validKeys.length === 0) return NextResponse.json({ error: 'no valid strategy', trace }, { status: 400 });

    let candles;
    try {
      candles = await fetchHtxKlines(bot.symbol, bot.period, 300);
      trace.steps.push({ step: 'fetch_klines', ok: true, count: candles.length, lastTs: candles[candles.length - 1]?.ts, lastClose: candles[candles.length - 1]?.close });
    } catch (e: any) {
      trace.steps.push({ step: 'fetch_klines', ok: false, error: e.message });
      return NextResponse.json({ error: `HTX fetch 실패: ${e.message}`, trace }, { status: 502 });
    }

    const { data: stateRow, error: se } = await admin.from('bot_state').select('*').eq('bot_id', botId).maybeSingle();
    trace.steps.push({ step: 'load_state', ok: !se, hasRow: !!stateRow, error: se?.message });

    const state: BotState = stateRow
      ? { cash: Number(stateRow.cash), coin: Number(stateRow.coin), entry_price: Number(stateRow.entry_price), last_ts: Number(stateRow.last_ts), entry_strategy: stateRow.entry_strategy ?? null }
      : { cash: Number(bot.initial_cash), coin: 0, entry_price: 0, last_ts: 0, entry_strategy: null };

    let result;
    try {
      result = isComposite
        ? runStepComposite(state, candles, bot.symbol)
        : runStepEnsemble(state, candles, validKeys);
      trace.steps.push({ step: 'run_step', ok: true, price: result.price, equity: result.equity, traded: !!result.trade });
    } catch (e: any) {
      trace.steps.push({ step: 'run_step', ok: false, error: e.message, stack: e.stack });
      return NextResponse.json({ error: `runStep 실패: ${e.message}`, trace }, { status: 500 });
    }

    const { error: ue } = await admin.from('bot_state').upsert({
      bot_id: botId,
      cash: result.state.cash, coin: result.state.coin, entry_price: result.state.entry_price,
      last_ts: result.state.last_ts, last_price: result.price, equity: result.equity,
      entry_strategy: result.state.entry_strategy ?? null,
      updated_at: new Date().toISOString(),
    });
    trace.steps.push({ step: 'upsert_state', ok: !ue, error: ue?.message });

    return NextResponse.json({ ok: true, trace, result: { price: result.price, equity: result.equity, traded: !!result.trade, state: result.state } });
  } catch (e: any) {
    trace.steps.push({ step: 'fatal', error: e.message, stack: e.stack });
    return NextResponse.json({ error: e.message, trace }, { status: 500 });
  }
}
