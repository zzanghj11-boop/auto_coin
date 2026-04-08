'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import DashNav from '@/components/DashNav';
import { STRATEGY_MAP } from '@/lib/trading/strategies';
import PriceChart from '@/components/PriceChart';
import { fmtDateTime } from '@/lib/fmt';
import { useModal } from '@/components/Modal';

interface Bot {
  id: string; name: string; symbol: string; period: string; strategy: string;
  strategies: string[] | null;
  mode: string; enabled: boolean; initial_cash: number;
  exchange_key_id: string | null;
  exchange_keys?: { label: string | null; dry_run: boolean } | null;
}
interface State { cash: number; coin: number; entry_price: number; equity: number | null; last_price: number | null; updated_at: string; entry_strategy?: string | null; }
interface Trade { id: number; ts: number; side: string; price: number; size: number; reason: string | null; ret: number | null; trigger_strategy?: string | null; }
interface EqPoint { ts: number; equity: number; price: number; }

export default function BotPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const supabase = createClient();
  const modal = useModal();
  const [email, setEmail] = useState('');
  const [bot, setBot] = useState<Bot | null>(null);
  const [state, setState] = useState<State | null>(null);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [equity, setEquity] = useState<EqPoint[]>([]);
  const [ticking, setTicking] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function load() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push('/login'); return; }
    setEmail(user.email ?? '');

    const { data: b } = await supabase.from('bots').select('*,exchange_keys(label,dry_run)').eq('id', id).single();
    setBot(b as any);
    const { data: s } = await supabase.from('bot_state').select('*').eq('bot_id', id).maybeSingle();
    setState(s as any);
    const { data: t } = await supabase.from('trades').select('*').eq('bot_id', id).order('ts', { ascending: false }).limit(30);
    setTrades((t ?? []) as any);
    const { data: e } = await supabase.from('equity_history').select('*').eq('bot_id', id).order('ts', { ascending: true }).limit(500);
    setEquity((e ?? []) as any);
  }

  useEffect(() => {
    load();
    // Realtime: bot_state 업데이트 구독
    const ch = supabase
      .channel(`bot-${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bot_state', filter: `bot_id=eq.${id}` },
        (payload) => setState(payload.new as any))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'trades', filter: `bot_id=eq.${id}` },
        () => load())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'equity_history', filter: `bot_id=eq.${id}` },
        (payload) => setEquity(prev => [...prev.slice(-499), payload.new as any]))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [id]);

  async function tick() {
    setTicking(true); setMsg(null);
    const r = await fetch(`/api/bots/${id}/tick`, { method: 'POST' });
    const j = await r.json();
    setTicking(false);
    if (!r.ok) setMsg(j.error || 'tick 실패');
    else {
      setMsg(j.trade ? `체결: ${j.trade.side.toUpperCase()} @${j.trade.price.toFixed(2)}` : '새 봉 없음');
      load();
    }
  }

  async function toggle() {
    if (!bot) return;
    await supabase.from('bots').update({ enabled: !bot.enabled }).eq('id', id);
    load();
  }

  async function del() {
    if (state && state.coin > 0) {
      await modal.alert(
        `현재 ${state.coin.toFixed(6)} ${bot?.symbol.replace('usdt','').toUpperCase()} 보유 중입니다.\n\n` +
        (bot?.mode === 'live'
          ? '실거래 포지션은 HTX 거래소에 실제 자산으로 남아있습니다. 먼저 청산(전량 매도) 후 삭제하세요.'
          : '페이퍼 포지션을 먼저 청산하세요. "▶ Tick"으로 매도 신호를 기다리거나 "⚡ 청산" 버튼을 사용하세요.'),
        { title: '삭제 불가', variant: 'danger' }
      );
      return;
    }
    const ok = await modal.confirm(
      '체결 내역은 보존되며, 대시보드에서만 숨겨집니다. 복구 가능합니다.',
      { title: '봇 아카이브', variant: 'warn', confirmLabel: '아카이브' }
    );
    if (!ok) return;
    await supabase.from('bots').update({ archived_at: new Date().toISOString(), enabled: false }).eq('id', id);
    router.push('/dashboard');
  }

  async function forceClose() {
    if (!state || state.coin <= 0 || !bot) return;
    if (bot.mode === 'live') {
      await modal.alert('실거래 모드는 HTX에서 직접 매도하세요.\n(안전상 강제 청산 비활성화)', { title: '강제 청산 불가', variant: 'danger' });
      return;
    }
    const ok = await modal.confirm(
      `보유: ${state.coin.toFixed(6)}\n진입가: $${state.entry_price}\n\n페이퍼 포지션 전량을 현재가로 강제 청산합니다.`,
      { title: '강제 청산', variant: 'warn', confirmLabel: '청산' }
    );
    if (!ok) return;
    const res = await fetch(`/api/bots/${id}/force-close`, { method: 'POST' });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      await modal.alert(j.error ?? '강제 청산 실패', { title: '오류', variant: 'danger' });
      return;
    }
    load();
  }

  if (!bot) return <div className="min-h-screen"><DashNav email={email} /><main className="p-6 text-muted">로딩…</main></div>;

  const eq = state?.equity ?? bot.initial_cash;
  const ret = ((eq / bot.initial_cash - 1) * 100);
  const wins = trades.filter(t => t.ret != null && t.ret > 0).length;
  const losses = trades.filter(t => t.ret != null && t.ret <= 0).length;

  return (
    <div className="min-h-screen">
      <DashNav email={email} />
      <main className="max-w-5xl mx-auto px-3 sm:px-6 py-4 sm:py-6 space-y-4 sm:space-y-5">
        <div className="flex justify-between items-start">
          <div>
            <Link href="/dashboard" className="text-xs text-muted hover:text-white">← 대시보드</Link>
            <h1 className="text-2xl font-bold mt-1">{bot.name}</h1>
            <p className="text-sm text-muted mt-1">
              {bot.symbol.toUpperCase()} · {bot.period} · {bot.mode.toUpperCase()}
              {bot.exchange_keys && <> · 🔑 {bot.exchange_keys.label ?? '無라벨'}{bot.exchange_keys.dry_run && ' (DryRun)'}</>}
            </p>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {((bot.strategies && bot.strategies.length > 0) ? bot.strategies : [bot.strategy]).map(k => (
                <span key={k} className={`text-[10px] px-2 py-0.5 rounded-full border ${state?.entry_strategy === k ? 'border-blue-500 bg-blue-500/20 text-blue-300' : 'border-border text-muted'}`}>
                  {STRATEGY_MAP[k]?.label ?? k}{state?.entry_strategy === k ? ' ● 보유중' : ''}
                </span>
              ))}
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button onClick={tick} className="btn btn-primary" disabled={ticking}>{ticking ? '…' : '▶ Tick'}</button>
            <button onClick={toggle} className="btn btn-ghost">{bot.enabled ? '⏸ 중지' : '▶ 시작'}</button>
            {state && state.coin > 0 && bot.mode === 'paper' && (
              <button onClick={forceClose} className="btn btn-ghost text-yellow-400" title="페이퍼 포지션 강제 청산">⚡ 청산</button>
            )}
            <button onClick={del} className="btn btn-ghost text-red" title="아카이브(소프트 삭제)">🗑</button>
          </div>
        </div>
        {msg && <div className="card text-sm">{msg}</div>}

        <PriceChart symbol={bot.symbol} period={bot.period} />

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="card">
            <div className="label">현재가</div>
            <div className="text-xl font-bold">{state?.last_price ? `$${Number(state.last_price).toLocaleString(undefined, { maximumFractionDigits: 2 })}` : '—'}</div>
            <div className="text-[10px] text-muted mt-1">{state?.updated_at ? fmtDateTime(state.updated_at) : '대기'}</div>
          </div>
          <div className="card">
            <div className="label">Equity</div>
            <div className="text-xl font-bold">${Number(eq).toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
          </div>
          <div className="card">
            <div className="label">수익률</div>
            <div className={`text-xl font-bold ${ret >= 0 ? 'text-grn' : 'text-red'}`}>{ret >= 0 ? '+' : ''}{ret.toFixed(2)}%</div>
          </div>
          <div className="card">
            <div className="label">체결</div>
            <div className="text-xl font-bold">{trades.length} <span className="text-xs text-muted">(W{wins}/L{losses})</span></div>
          </div>
          <div className="card">
            <div className="label">포지션</div>
            <div className="text-sm font-semibold">{state && state.coin > 0 ? `LONG ${state.coin.toFixed(6)}` : 'FLAT'}</div>
          </div>
        </div>

        <div className="card">
          <h3 className="label mb-3">Equity Curve</h3>
          {equity.length === 0 ? (
            <p className="text-sm text-muted text-center py-10">데이터 없음. "▶ Tick" 으로 수동 실행하거나 봇을 시작하세요.</p>
          ) : (
            <Sparkline points={equity.map(e => e.equity)} />
          )}
        </div>

        <div className="card">
          <h3 className="label mb-3">최근 체결</h3>
          {trades.length === 0 ? (
            <p className="text-sm text-muted text-center py-6">체결 없음</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-xs text-muted">
                <tr><th className="text-left pb-2">시간</th><th className="text-left">사이드</th><th className="text-left">전략</th><th className="text-right">가격</th><th className="text-right">수익률</th></tr>
              </thead>
              <tbody>
                {trades.map(t => (
                  <tr key={t.id} className="border-t border-border">
                    <td className="py-2 font-mono text-xs">{fmtDateTime(t.ts)}</td>
                    <td className={t.side === 'buy' ? 'text-grn' : 'text-red'}>{t.side.toUpperCase()}{t.reason === 'stop' && ' ⛔'}</td>
                    <td className="text-xs text-muted">{t.trigger_strategy ? (STRATEGY_MAP[t.trigger_strategy]?.label ?? t.trigger_strategy) : '-'}</td>
                    <td className="text-right">{t.price.toFixed(2)}</td>
                    <td className={`text-right ${t.ret != null && t.ret > 0 ? 'text-grn' : t.ret != null ? 'text-red' : 'text-muted'}`}>
                      {t.ret != null ? `${(t.ret * 100).toFixed(2)}%` : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </main>
    </div>
  );
}

function Sparkline({ points }: { points: number[] }) {
  if (points.length < 2) return <div className="h-32" />;
  const min = Math.min(...points), max = Math.max(...points);
  const range = max - min || 1;
  const w = 800, h = 140;
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${(i / (points.length - 1)) * w},${h - ((p - min) / range) * h}`).join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-36">
      <path d={path} fill="none" stroke="#58a6ff" strokeWidth="2" />
    </svg>
  );
}
