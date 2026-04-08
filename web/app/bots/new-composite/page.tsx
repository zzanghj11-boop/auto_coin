'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import DashNav from '@/components/DashNav';
import { COMPOSITE_PRESETS, COMPOSITE_BY_SYMBOL } from '@/lib/trading/composite_presets';

export default function NewCompositeBot() {
  const router = useRouter();
  const supabase = createClient();
  const [email, setEmail] = useState('');
  const [form, setForm] = useState({
    name: 'BTC Composite',
    symbol: 'btcusdt',
    period: '1day',
    mode: 'paper' as 'paper' | 'live',
    initial_cash: 1000,
    exchange_key_id: '' as string | '',
  });
  const [keys, setKeys] = useState<Array<{ id: string; label: string }>>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [bal, setBal] = useState<null | {
    usdt_total: number; usdt_available: number; allocated_to_other_bots: number;
    holdings: Array<{ currency: string; amount: number }>;
    error?: string;
  }>(null);
  const [balLoading, setBalLoading] = useState(false);

  const presets = Object.values(COMPOSITE_PRESETS);
  const preset = COMPOSITE_BY_SYMBOL[form.symbol.toLowerCase()];

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/login'); return; }
      setEmail(user.email ?? '');
      const { data } = await supabase.from('exchange_keys').select('id,label');
      setKeys((data ?? []) as any);
    })();
  }, []);

  async function fetchBalance(keyId: string) {
    setBal(null);
    if (!keyId) return;
    setBalLoading(true);
    try {
      const r = await fetch(`/api/exchange/balance?key_id=${keyId}`);
      const j = await r.json();
      if (!r.ok) { setBal({ usdt_total: 0, usdt_available: 0, allocated_to_other_bots: 0, holdings: [], error: `${j.error} ${j.debug ? JSON.stringify(j.debug) : ''}` }); }
      else setBal(j);
    } catch (e: any) {
      setBal({ usdt_total: 0, usdt_available: 0, allocated_to_other_bots: 0, holdings: [], error: e.message });
    } finally {
      setBalLoading(false);
    }
  }

  useEffect(() => {
    if (form.mode === 'live' && form.exchange_key_id) fetchBalance(form.exchange_key_id);
    else setBal(null);
  }, [form.exchange_key_id, form.mode]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    if (!preset) { setBusy(false); setMsg('해당 심볼의 합성 전략 프리셋이 없습니다.'); return; }
    if (form.mode === 'live' && !form.exchange_key_id) {
      setBusy(false); setMsg('실거래 모드는 API 키 등록이 필요합니다.'); return;
    }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push('/login'); return; }

    const insert = {
      user_id: user.id,
      name: form.name,
      symbol: form.symbol.toLowerCase(),
      period: form.period,
      strategy: 'composite',
      strategies: ['composite'],
      combine_mode: 'COMPOSITE',
      mode: form.mode,
      initial_cash: Number(form.initial_cash),
      exchange_key_id: form.exchange_key_id || null,
      params: { weights: preset.weights, threshold: preset.threshold, window: preset.window },
    };
    const { data: bot, error } = await supabase.from('bots').insert(insert).select('id').single();
    if (error) { setBusy(false); setMsg(error.message); return; }

    await supabase.from('bot_state').upsert({
      bot_id: bot!.id, cash: Number(form.initial_cash), coin: 0, entry_price: 0, last_ts: 0, equity: Number(form.initial_cash),
    });

    router.push(`/bots/${bot!.id}`);
  }

  return (
    <div className="min-h-screen">
      <DashNav email={email} />
      <main className="max-w-3xl mx-auto px-6 py-6">
        <h1 className="text-2xl font-bold mb-1">새 봇 (코인별 맞춤 합성 전략)</h1>
        <p className="text-xs text-muted mb-5">5년치 일봉에서 스윙 저점/고점을 라벨링하고, 8개 베이스 전략의 신호를 가중치 투표로 결합한 코인 전용 합성 전략입니다.</p>

        <form onSubmit={submit} className="card space-y-4">
          <div>
            <label className="label">이름</label>
            <input className="input" required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
          </div>

          <div>
            <label className="label">심볼 (합성 전략 보유 코인만)</label>
            <select className="input" value={form.symbol} onChange={e => setForm({ ...form, symbol: e.target.value })}>
              {presets.map(p => (
                <option key={p.symbol} value={p.symbol}>{p.coin.toUpperCase()} ({p.symbol})</option>
              ))}
            </select>
          </div>

          {preset && (
            <div className="rounded-lg border border-purple-500/40 bg-purple-500/5 p-3 space-y-3">
              <div>
                <div className="text-xs text-purple-300 font-semibold">🧬 합성 전략 프리셋</div>
                <div className="text-[11px] text-muted mt-0.5">
                  데이터: {preset.candles}봉 · 스윙저점 {preset.swings.lows}건 · 고점 {preset.swings.highs}건 · window={preset.window} · threshold={preset.threshold.toFixed(2)}
                </div>
              </div>
              <div>
                <div className="text-[11px] text-muted mb-1">베이스 전략 가중치</div>
                <div className="flex flex-wrap gap-1">
                  {Object.entries(preset.weights).map(([k, w]) => (
                    <span key={k} className="px-2 py-0.5 rounded bg-white/10 text-[11px] font-mono">
                      {k} <span className="text-purple-300">{(w as number).toFixed(2)}</span>
                    </span>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 text-[11px]">
                {(['train','test','full'] as const).map(seg => {
                  const b = preset.backtest[seg];
                  return (
                    <div key={seg} className="rounded bg-black/30 p-2">
                      <div className="text-[9px] uppercase text-muted mb-1">{seg}</div>
                      <div className="flex justify-between"><span className="text-muted">Sharpe</span><span className="font-mono">{b.sharpe.toFixed(2)}</span></div>
                      <div className="flex justify-between"><span className="text-muted">CAGR</span><span className="font-mono">{(b.cagr*100).toFixed(1)}%</span></div>
                      <div className="flex justify-between"><span className="text-muted">MDD</span><span className="font-mono">{(b.mdd*100).toFixed(1)}%</span></div>
                      <div className="flex justify-between"><span className="text-muted">Win</span><span className="font-mono">{(b.winRate*100).toFixed(0)}%</span></div>
                      <div className="flex justify-between"><span className="text-muted">Trades</span><span className="font-mono">{b.trades}</span></div>
                    </div>
                  );
                })}
              </div>
              <details className="text-[11px]">
                <summary className="text-muted cursor-pointer">베이스 전략별 정밀도/재현율</summary>
                <table className="w-full mt-1.5 text-[10px]">
                  <thead className="text-muted"><tr><th className="text-left">전략</th><th>train P</th><th>train R</th><th>F1</th><th>fires</th><th>test P</th><th>test R</th></tr></thead>
                  <tbody>
                    {Object.entries(preset.strategyStats).map(([k, s]: any) => (
                      <tr key={k}>
                        <td className="text-left">{k}</td>
                        <td className="text-center">{s.train_precision.toFixed(2)}</td>
                        <td className="text-center">{s.train_recall.toFixed(2)}</td>
                        <td className="text-center">{s.train_f1.toFixed(2)}</td>
                        <td className="text-center">{s.train_fires}</td>
                        <td className="text-center">{s.test_precision.toFixed(2)}</td>
                        <td className="text-center">{s.test_recall.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>
            </div>
          )}

          <div>
            <label className="label">봉 주기</label>
            <select className="input" value={form.period} onChange={e => setForm({ ...form, period: e.target.value })}>
              <option value="1day">1day (권장 — 학습 데이터와 동일)</option>
              <option value="4hour">4hour</option>
              <option value="60min">60min</option>
            </select>
            <p className="text-[11px] text-muted mt-1">⚠ 합성 전략은 일봉 기준으로 학습되었습니다. 다른 봉은 검증되지 않음.</p>
          </div>

          <div>
            <label className="label">초기 자본 ($ USD)</label>
            {form.mode === 'live' && bal && !bal.error ? (
              <div className="space-y-2">
                <div className="flex gap-2 items-center">
                  <span className="text-xs text-muted shrink-0">$</span>
                  <input
                    className="input flex-1"
                    type="number" min="0" max={bal.usdt_available} step="1"
                    value={form.initial_cash}
                    onChange={e => setForm({ ...form, initial_cash: Math.min(bal.usdt_available, Math.max(0, Number(e.target.value))) })}
                  />
                  <button type="button" onClick={() => setForm({ ...form, initial_cash: Math.floor(bal.usdt_available) })} className="btn btn-ghost text-xs whitespace-nowrap">MAX</button>
                </div>
                <input
                  type="range" min="0" max={Math.floor(bal.usdt_available)} step="1"
                  value={Math.min(form.initial_cash, bal.usdt_available)}
                  onChange={e => setForm({ ...form, initial_cash: Number(e.target.value) })}
                  className="w-full accent-purple-500"
                />
                <div className="flex justify-between text-[10px] text-muted">
                  <span>$0</span>
                  <span>{bal.usdt_available > 0 ? `${((form.initial_cash / bal.usdt_available) * 100).toFixed(0)}%` : '—'}</span>
                  <span>${bal.usdt_available.toFixed(2)}</span>
                </div>
              </div>
            ) : (
              <input className="input" type="number" min="10" step="10" required value={form.initial_cash} onChange={e => setForm({ ...form, initial_cash: Number(e.target.value) })} />
            )}
          </div>

          <div>
            <label className="label">모드</label>
            <div className="flex gap-2">
              {(['paper','live'] as const).map(m => (
                <button key={m} type="button" onClick={() => setForm({ ...form, mode: m })} className={`btn flex-1 ${form.mode === m ? 'btn-primary' : 'btn-ghost'}`}>
                  {m === 'paper' ? '📝 페이퍼' : '💰 실거래'}
                </button>
              ))}
            </div>
            <div className="mt-3">
              <label className="label">HTX API 키</label>
              <select className="input" value={form.exchange_key_id} onChange={e => setForm({ ...form, exchange_key_id: e.target.value })}>
                <option value="">{form.mode === 'live' ? '선택…' : '없음'}</option>
                {keys.map(k => <option key={k.id} value={k.id}>{k.label}</option>)}
              </select>
              {form.mode === 'live' && form.exchange_key_id && (
                <div className="mt-3 p-3 rounded-lg border border-border bg-black/20 text-xs space-y-1.5">
                  {balLoading && <div className="text-muted">잔고 조회 중…</div>}
                  {bal && bal.error && <div className="text-red">⚠ {bal.error}</div>}
                  {bal && !bal.error && (
                    <>
                      <div className="flex justify-between"><span className="text-muted">USDT 총잔고</span><span className="font-mono">${bal.usdt_total.toFixed(2)}</span></div>
                      {bal.allocated_to_other_bots > 0 && (
                        <div className="flex justify-between"><span className="text-muted">다른 봇에 할당</span><span className="font-mono text-yellow-400">−${bal.allocated_to_other_bots.toFixed(2)}</span></div>
                      )}
                      <div className="flex justify-between border-t border-border pt-1.5"><span className="text-muted">사용 가능</span><span className="font-mono text-grn font-semibold">${bal.usdt_available.toFixed(2)}</span></div>
                      {bal.holdings.length > 0 && (
                        <div className="pt-1.5 border-t border-border">
                          <div className="text-muted mb-1">보유 코인</div>
                          <div className="flex flex-wrap gap-1">
                            {bal.holdings.map(h => (
                              <span key={h.currency} className="px-2 py-0.5 rounded bg-white/5 font-mono text-[10px]">
                                {h.currency} {h.amount.toLocaleString(undefined, { maximumFractionDigits: 6 })}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

          {msg && <p className="text-sm text-red">{msg}</p>}
          <button className="btn btn-primary w-full" disabled={busy}>{busy ? '생성 중…' : '합성 봇 만들기'}</button>
        </form>
      </main>
    </div>
  );
}
