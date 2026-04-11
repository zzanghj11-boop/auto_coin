import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// POST /api/bots/reset-all — 내 모든 봇 일괄 초기화
export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { data: bots, error: be } = await supabase
    .from('bots')
    .select('id, initial_cash')
    .eq('user_id', user.id)
    .eq('enabled', true);

  if (be || !bots) return NextResponse.json({ error: 'failed to load bots' }, { status: 500 });

  const results: { bot_id: string; ok: boolean; error?: string }[] = [];

  for (const bot of bots) {
    const cash = bot.initial_cash ?? 1000;
    try {
      // bot_state 초기화
      await supabase.from('bot_state').upsert({
        bot_id: bot.id,
        cash,
        coin: 0,
        entry_price: 0,
        last_ts: 0,
        last_price: 0,
        equity: cash,
        entry_strategy: null,
      });
      // trades 삭제
      await supabase.from('trades').delete().eq('bot_id', bot.id);
      // equity_history 삭제
      await supabase.from('equity_history').delete().eq('bot_id', bot.id);
      results.push({ bot_id: bot.id, ok: true });
    } catch (e: any) {
      results.push({ bot_id: bot.id, ok: false, error: e.message });
    }
  }

  const success = results.filter(r => r.ok).length;
  const failed = results.filter(r => !r.ok).length;

  return NextResponse.json({
    total: bots.length,
    success,
    failed,
    results,
  });
}
