'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { STRATEGY_MAP } from '@/lib/trading/strategies';
import { fmtDateTime } from '@/lib/fmt';
import CoinDaySummary from '@/components/CoinDaySummary';

interface BotState {
  cash: number; coin: number; entry_price: number;
  equity: number | null; last_price: number | null;
  updated_at: string; entry_strategy: string | null;
}
export interface Bot {
  id: string;
  name: string;
  symbol: string;
  period: string;
  strategy: string;
  strategies: string[] | null;
  mode: 'paper' | 'live';
  enabled: boolean;
  initial_cash: number;
  exchange_keys: { label: string | null; dry_run: boolean } | null;
  bot_state: BotState | null;
}

export default function DashboardList({ initialBots, filter }: { initialBots: Bot[]; filter: 'all' | 'paper' | 'live' }) {
  const supabase = createClient();
  const [bots, setBots] = useState<Bot[]>(initialBots);

  useEffect(() => {
    setBots(initialBots);
  }, [initialBots]);

  // Realtime: bot_state 변경 구독 (전체)
  useEffect(() => {
    const ch = supabase
      .channel('dashboard-bot-state')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bot_state' }, (payload) => {
        const next = payload.new as any;
        if (!next?.bot_id) return;
        setBots(prev => prev.map(b => b.id === next.bot_id
          ? { ...b, bot_state: { cash: next.cash, coin: next.coin, entry_price: next.entry_price, equity: next.equity, last_price: next.last_price, updated_at: next.updated_at, entry_strategy: next.entry_strategy ?? null } }
          : b));
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'bots' }, (payload) => {
        const next = payload.new as any;
        if (!next?.id) return;
        setBots(prev => prev.map(b => b.id === next.id ? { ...b, enabled: next.enabled, name: next.name } : b));
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  // 30초마다 last_price만이라도 폴링 (realtime 누락시 대비)
  useEffect(() => {
    const t = setInterval(async () => {
      const ids = bots.map(b => b.id);
      if (ids.length === 0) return;
      const { data } = await supabase
        .from('bot_state')
        .select('bot_id,cash,coin,entry_price,equity,last_price,updated_at,entry_strategy')
        .in('bot_id', ids);
      if (!data) return;
      const m = new Map<string, any>();
      for (const r of data) m.set(r.bot_id, r);
      setBots(prev => prev.map(b => {
        const s = m.get(b.id);
        return s ? { ...b, bot_state: s } : b;
      }));
    }, 30000);
    return () => clearInterval(t);
  }, [bots.length]);

  const list = filter === 'all' ? bots : bots.filter(b => b.mode === filter);

  if (list.length === 0) {
    return (
      <div className="card text-center py-16">
        <p className="text-muted mb-4">아직 봇이 없어요. 첫 봇을 만들어 페이퍼트레이딩을 시작하세요.</p>
        <Link href="/bots/new" className="btn btn-primary">봇 만들기</Link>
      </div>
    );
  }

  return (
    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
      {list.map(b => {
        const equity = Number(b.bot_state?.equity ?? b.initial_cash);
        const ret = ((equity / b.initial_cash - 1) * 100);
        const strategies = (b.strategies && b.strategies.length > 0) ? b.strategies : [b.strategy];
        const base = b.symbol.replace(/usdt$|usd$/i, '').toUpperCase();
        const quote = b.symbol.toLowerCase().endsWith('usdt') ? 'USDT' : (b.symbol.toLowerCase().endsWith('usd') ? 'USD' : '');
        const holding = b.bot_state && b.bot_state.coin > 0;
        return (
          <Link
            key={b.id}
            href={`/bots/${b.id}`}
            className={`card hover:border-accent transition-colors block ${b.mode === 'live' ? 'border-2 border-red shadow-[0_0_24px_-4px_rgba(248,81,73,0.45)]' : ''}`}
          >
            <div className="flex justify-between items-start mb-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-2xl font-bold font-mono">{base}</span>
                  {quote && <span className="text-sm text-muted">/{quote}</span>}
                  <span className="text-xs text-muted">· {b.period}</span>
                  {holding && <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500">● 보유중</span>}
                </div>
                <div className="text-sm text-white/80 mt-1 truncate">{b.name}</div>
                {b.exchange_keys && (
                  <div className="text-[10px] text-muted mt-0.5 truncate">🔑 {b.exchange_keys.label ?? '無라벨'}{b.exchange_keys.dry_run && ' (DryRun)'}</div>
                )}
              </div>
              <div className="flex flex-col items-end gap-1">
                <span className={`text-[10px] px-2 py-0.5 rounded-full border ${b.mode === 'live' ? 'border-red text-red' : 'border-border text-muted'}`}>
                  {b.mode === 'live' ? '💰 LIVE' : '📝 PAPER'}
                </span>
                <span className={`text-[10px] ${b.enabled ? 'text-grn' : 'text-muted'}`}>{b.enabled ? '● 가동' : '○ 정지'}</span>
              </div>
            </div>

            <div className="flex flex-wrap gap-1 mb-4">
              {strategies.map(k => {
                const active = b.bot_state?.entry_strategy === k;
                return (
                  <span key={k} className={`text-[10px] px-2 py-0.5 rounded border ${active ? 'border-blue-500 bg-blue-500/20 text-blue-300' : 'border-border text-muted'}`}>
                    {STRATEGY_MAP[k]?.label ?? k}
                  </span>
                );
              })}
            </div>

            <CoinDaySummary symbol={b.symbol} />

            <div className="grid grid-cols-3 gap-3 mt-4 pt-4 border-t border-border">
              <div>
                <div className="text-[10px] text-muted uppercase">현재가</div>
                <div className="text-sm font-semibold font-mono">
                  {b.bot_state?.last_price ? `$${Number(b.bot_state.last_price).toLocaleString(undefined, { maximumFractionDigits: 2 })}` : '—'}
                </div>
              </div>
              <div>
                <div className="text-[10px] text-muted uppercase">Equity</div>
                <div className="text-sm font-semibold font-mono">${equity.toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
              </div>
              <div>
                <div className="text-[10px] text-muted uppercase">수익률</div>
                <div className={`text-sm font-bold ${ret >= 0 ? 'text-grn' : 'text-red'}`}>{ret >= 0 ? '+' : ''}{ret.toFixed(2)}%</div>
              </div>
            </div>
            {b.bot_state?.updated_at && (
              <div className="text-[10px] text-muted mt-2 font-mono">갱신 {fmtDateTime(b.bot_state.updated_at)}</div>
            )}
          </Link>
        );
      })}
    </div>
  );
}
