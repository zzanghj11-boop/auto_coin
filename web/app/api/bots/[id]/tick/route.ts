import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { fetchHtxKlines, runStepEnsemble, runStepComposite, type BotState } from '@/lib/trading/runner';
import { STRATEGY_MAP, type Candle } from '@/lib/trading/strategies';

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { data: bot, error: be } = await supabase.from('bots').select('*').eq('id', id).single();
  if (be || !bot) return NextResponse.json({ error: 'bot not found' }, { status: 404 });
  if (bot.user_id !== user.id) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  // strategies 배열 우선 (text 컬럼에 JSON 문자열로 저장된 경우 파싱), 없으면 legacy strategy 단일값 fallback
  let parsedStrategies: any = bot.strategies;
  if (typeof parsedStrategies === 'string') {
    try { parsedStrategies = JSON.parse(parsedStrategies); } catch { parsedStrategies = null; }
  }
  const strategyKeys: string[] = Array.isArray(parsedStrategies) && parsedStrategies.length > 0
    ? parsedStrategies as string[]
    : (bot.strategy ? [bot.strategy] : []);
  const isComposite = strategyKeys.includes('composite');
  const validKeys = strategyKeys.filter(k => STRATEGY_MAP[k]);
  if (!isComposite && validKeys.length === 0) return NextResponse.json({ error: 'no valid strategy' }, { status: 400 });

  let candles: Candle[];
  try {
    candles = await fetchHtxKlines(bot.symbol, bot.period, 300);
  } catch (e: any) {
    return NextResponse.json({ error: `HTX fetch 실패: ${e.message}` }, { status: 502 });
  }

  const { data: stateRow } = await supabase.from('bot_state').select('*').eq('bot_id', id).maybeSingle();
  const state: BotState = stateRow
    ? { cash: Number(stateRow.cash), coin: Number(stateRow.coin), entry_price: Number(stateRow.entry_price), last_ts: Number(stateRow.last_ts), entry_strategy: stateRow.entry_strategy ?? null }
    : { cash: Number(bot.initial_cash), coin: 0, entry_price: 0, last_ts: 0, entry_strategy: null };

  const result = isComposite
    ? runStepComposite(state, candles, bot.symbol)
    : runStepEnsemble(state, candles, validKeys);

  // state 업데이트
  await supabase.from('bot_state').upsert({
    bot_id: id,
    cash: result.state.cash,
    coin: result.state.coin,
    entry_price: result.state.entry_price,
    last_ts: result.state.last_ts,
    last_price: result.price,
    equity: result.equity,
    entry_strategy: result.state.entry_strategy ?? null,
    updated_at: new Date().toISOString(),
  });

  // 체결 기록
  if (result.trade) {
    await supabase.from('trades').insert({
      bot_id: id,
      ts: result.trade.ts,
      side: result.trade.side,
      price: result.trade.price,
      size: result.trade.size,
      fee: result.trade.fee,
      reason: result.trade.reason,
      ret: result.trade.ret,
      trigger_strategy: result.trade.trigger_strategy ?? null,
    });
  }

  // equity history (새 봉일 때만)
  if (result.state.last_ts > (stateRow?.last_ts ?? 0)) {
    await supabase.from('equity_history').insert({
      bot_id: id,
      ts: result.state.last_ts,
      equity: result.equity,
      price: result.price,
    });
  }

  await supabase.from('bot_runs').insert({ bot_id: id, ok: true, message: result.trade ? `trade: ${result.trade.side}` : 'no signal' });

  return NextResponse.json({
    ok: true,
    trade: result.trade,
    state: { equity: result.equity, price: result.price, coin: result.state.coin },
  });
}
