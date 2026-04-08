import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import DashboardList, { type Bot } from '@/components/DashboardList';

export const dynamic = 'force-dynamic';

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ filter?: string }> }) {
  const sp = await searchParams;
  const filter = sp.filter === 'live' ? 'live' : sp.filter === 'paper' ? 'paper' : 'all';
  const supabase = await createClient();
  const { data: bots } = await supabase
    .from('bots')
    .select('id,name,symbol,period,strategy,strategies,mode,enabled,initial_cash,exchange_keys(label,dry_run),bot_state(cash,coin,entry_price,equity,last_price,updated_at,entry_strategy)')
    .is('archived_at', null)
    .order('created_at', { ascending: false });

  const allList = (bots ?? []) as unknown as Bot[];
  const liveCount = allList.filter(b => b.mode === 'live').length;
  const paperCount = allList.filter(b => b.mode === 'paper').length;
  const visibleCount = filter === 'all' ? allList.length : allList.filter(b => b.mode === filter).length;

  return (
    <div className="space-y-5">
      <div className="flex justify-between items-center flex-wrap gap-3">
        <h1 className="text-2xl font-bold">내 봇 <span className="text-sm text-muted font-normal">({visibleCount})</span></h1>
        <Link href="/bots/new" className="btn btn-primary">+ 새 봇</Link>
      </div>
      <div className="flex gap-2 flex-wrap">
        <FilterTab href="/dashboard" label={`전체 ${allList.length}`} active={filter === 'all'} />
        <FilterTab href="/dashboard?filter=paper" label={`📝 페이퍼 ${paperCount}`} active={filter === 'paper'} />
        <FilterTab href="/dashboard?filter=live" label={`💰 실거래 ${liveCount}`} active={filter === 'live'} />
      </div>

      <DashboardList initialBots={allList} filter={filter} />
    </div>
  );
}

function FilterTab({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={`text-xs px-3 py-1.5 rounded-lg border whitespace-nowrap ${active ? 'border-accent bg-accent/10 text-accent' : 'border-border text-muted hover:text-white'}`}
    >
      {label}
    </Link>
  );
}
