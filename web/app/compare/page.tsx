import { createClient } from '@/lib/supabase/server';
import CompareView, { type CompareBot } from '@/components/CompareView';

export const dynamic = 'force-dynamic';

export default async function ComparePage() {
  const supabase = await createClient();

  // 봇 + 상태
  const { data: botsRaw } = await supabase
    .from('bots')
    .select('id,name,symbol,period,strategy,strategies,mode,enabled,initial_cash,created_at,bot_state(cash,coin,equity,last_price,updated_at)')
    .is('archived_at', null)
    .order('created_at', { ascending: false });

  const bots = (botsRaw ?? []) as any[];
  const ids = bots.map(b => b.id);

  // 거래 내역 (필요한 컬럼만)
  const { data: tradesRaw } = ids.length
    ? await supabase.from('trades').select('bot_id,ts,side,ret').in('bot_id', ids).order('ts', { ascending: true })
    : { data: [] as any[] };

  // equity 시계열
  const { data: eqRaw } = ids.length
    ? await supabase.from('equity_history').select('bot_id,ts,equity').in('bot_id', ids).order('ts', { ascending: true })
    : { data: [] as any[] };

  // 봇별 통계 + 시계열 묶기
  const tradesByBot = new Map<string, { ts: number; side: string; ret: number | null }[]>();
  for (const t of tradesRaw ?? []) {
    const arr = tradesByBot.get(t.bot_id) ?? [];
    arr.push({ ts: Number(t.ts), side: t.side, ret: t.ret });
    tradesByBot.set(t.bot_id, arr);
  }
  const eqByBot = new Map<string, { ts: number; equity: number }[]>();
  for (const e of eqRaw ?? []) {
    const arr = eqByBot.get(e.bot_id) ?? [];
    arr.push({ ts: Number(e.ts), equity: Number(e.equity) });
    eqByBot.set(e.bot_id, arr);
  }

  const result: CompareBot[] = bots.map(b => {
    const state = Array.isArray(b.bot_state) ? b.bot_state[0] : b.bot_state;
    const initialCash = Number(b.initial_cash ?? 1000);
    const equity = Number(state?.equity ?? initialCash);
    const trades = tradesByBot.get(b.id) ?? [];
    const sells = trades.filter(t => t.side === 'sell' && t.ret != null);
    const wins = sells.filter(t => (t.ret ?? 0) > 0).length;
    const losses = sells.filter(t => (t.ret ?? 0) <= 0).length;
    const totalTrades = sells.length;
    const winRate = totalTrades > 0 ? wins / totalTrades : 0;
    const avgRet = totalTrades > 0 ? sells.reduce((s, t) => s + (t.ret ?? 0), 0) / totalTrades : 0;
    const eqSeries = eqByBot.get(b.id) ?? [];

    // 최대 낙폭 (peak-to-trough)
    let mdd = 0;
    let peak = -Infinity;
    for (const p of eqSeries) {
      if (p.equity > peak) peak = p.equity;
      if (peak > 0) {
        const dd = (p.equity - peak) / peak;
        if (dd < mdd) mdd = dd;
      }
    }
    if (eqSeries.length === 0 && equity < initialCash) {
      mdd = (equity - initialCash) / initialCash;
    }

    let parsedStrategies: any = b.strategies;
    if (typeof parsedStrategies === 'string') {
      try { parsedStrategies = JSON.parse(parsedStrategies); } catch { parsedStrategies = null; }
    }
    const strategyKeys: string[] = Array.isArray(parsedStrategies) && parsedStrategies.length > 0
      ? parsedStrategies
      : (b.strategy ? [b.strategy] : []);
    const isComposite = strategyKeys.includes('composite');

    return {
      id: b.id,
      name: b.name,
      symbol: b.symbol,
      period: b.period,
      mode: b.mode,
      enabled: b.enabled,
      isComposite,
      strategyLabel: isComposite ? '🧬 합성' : strategyKeys.join('+') || '-',
      initialCash,
      equity,
      ret: equity / initialCash - 1,
      totalTrades,
      wins,
      losses,
      winRate,
      avgRet,
      mdd,
      createdAt: b.created_at,
      eqSeries,
    };
  });

  return <CompareView bots={result} />;
}
