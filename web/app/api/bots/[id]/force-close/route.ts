import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdmin } from '@supabase/supabase-js';

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const admin = createAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  const { data: bot, error: be } = await admin.from('bots').select('*').eq('id', id).single();
  if (be || !bot) return NextResponse.json({ error: 'bot not found' }, { status: 404 });
  if (bot.user_id !== user.id) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  if (bot.mode === 'live') return NextResponse.json({ error: '실거래 모드는 거래소에서 직접 매도하세요.' }, { status: 400 });

  const { data: state } = await admin.from('bot_state').select('*').eq('bot_id', id).maybeSingle();
  if (!state || Number(state.coin) <= 0) return NextResponse.json({ error: '보유 포지션이 없습니다.' }, { status: 400 });

  const price = Number(state.last_price ?? state.entry_price);
  const size = Number(state.coin);
  const fee = 0.001;
  const proceeds = size * price * (1 - fee);
  const newCash = Number(state.cash) + proceeds;
  const ret = price / Number(state.entry_price) - 1 - fee;

  const { error: te } = await admin.from('trades').insert({
    bot_id: id, ts: Date.now(), side: 'sell', price, size, fee, reason: 'manual',
    ret, trigger_strategy: state.entry_strategy ?? '__manual',
  } as any);
  if (te) return NextResponse.json({ error: `trade insert 실패: ${te.message}` }, { status: 500 });

  const { error: ue } = await admin.from('bot_state').update({
    coin: 0, entry_price: 0, cash: newCash, equity: newCash, entry_strategy: null,
  }).eq('bot_id', id);
  if (ue) return NextResponse.json({ error: `state update 실패: ${ue.message}` }, { status: 500 });

  return NextResponse.json({ ok: true, price, proceeds, ret });
}
