import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// POST /api/bots/:id/reset — 봇 상태·거래·히스토리 초기화
// equity → initial_cash, coin → 0, trades/equity_history 삭제
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { data: bot, error: be } = await supabase.from('bots').select('id, user_id, initial_cash').eq('id', id).single();
  if (be || !bot) return NextResponse.json({ error: 'bot not found' }, { status: 404 });
  if (bot.user_id !== user.id) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const cash = bot.initial_cash ?? 1000;

  // 1) bot_state 초기화
  const { error: e1 } = await supabase.from('bot_state').upsert({
    bot_id: id,
    cash,
    coin: 0,
    entry_price: 0,
    last_ts: 0,
    last_price: 0,
    equity: cash,
    entry_strategy: null,
  });

  // 2) trades 삭제
  const { error: e2 } = await supabase.from('trades').delete().eq('bot_id', id);

  // 3) equity_history 삭제
  const { error: e3 } = await supabase.from('equity_history').delete().eq('bot_id', id);

  const errors = [e1, e2, e3].filter(Boolean);
  if (errors.length > 0) {
    return NextResponse.json({ error: 'partial failure', details: errors.map(e => e!.message) }, { status: 500 });
  }

  return NextResponse.json({ ok: true, bot_id: id, reset_equity: cash });
}
