'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import DashNav from '@/components/DashNav';
import { STRATEGY_MAP, STRATEGY_KEYS } from '@/lib/trading/strategies';
import { COIN_PRESET_BY_SYMBOL } from '@/lib/trading/coin_presets';
import SymbolPicker from '@/components/SymbolPicker';

const PERIODS = ['1min','5min','15min','30min','60min','4hour','1day'];

const RISK_COLORS: Record<string, string> = {
  low: 'text-grn',
  medium: 'text-yellow-400',
  high: 'text-orange-400',
  extreme: 'text-red',
};

export default function NewBot() {
  const router = useRouter();
  const supabase = createClient();
  const [email, setEmail] = useState('');
  const [form, setForm] = useState({
    name: 'BTC Ensemble',
    symbol: 'btcusdt',
    period: '5min',
    mode: 'paper' as 'paper' | 'live',
    initial_cash: 1000,
    exchange_key_id: '' as string | '',
  });
  const [selected, setSelected] = useState<string[]>(['ma']);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [keys, setKeys] = useState<Array<{ id: string; label: string }>>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [bal, setBal] = useState<null | {
    usdt_total: number; usdt_available: number; allocated_to_other_bots: number;
    holdings: Array<{ currency: string; amount: number }>;
    error?: string;
  }>(null);
  const [balLoading, setBalLoading] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/login'); return; }
      setEmail(user.email ?? '');
      const { data } = await supabase.from('exchange_keys').select('id,label');
      setKeys((data ?? []) as any);
    })();
  }, []);

  function toggle(key: string) {
    setSelected(s => s.includes(key) ? s.filter(k => k !== key) : [...s, key]);
  }

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

  // 키 변경 시 잔고 자동 조회 (실거래 모드일 때만)
  useEffect(() => {
    if (form.mode === 'live' && form.exchange_key_id) fetchBalance(form.exchange_key_id);
    else setBal(null);
  }, [form.exchange_key_id, form.mode]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    if (selected.length === 0) { setBusy(false); setMsg('최소 하나의 전략을 선택하세요.'); return; }
    if (form.mode === 'live' && !form.exchange_key_id) {
      setBusy(false); setMsg('실거래 모드는 API 키 등록이 필요합니다.'); return;
    }
    if (form.mode === 'live' && bal && !bal.error) {
      if (form.initial_cash > bal.usdt_available + 0.01) {
        setBusy(false); setMsg(`할당 한도 초과: 사용 가능 $${bal.usdt_available.toFixed(2)}`); return;
      }
      if (form.initial_cash <= 0) {
        setBusy(false); setMsg('자본을 0보다 크게 설정하세요.'); return;
      }
    }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push('/login'); return; }

    const insert = {
      user_id: user.id,
      name: form.name,
      symbol: form.symbol.toLowerCase(),
      period: form.period,
      strategy: selected[0],          // legacy 호환
      strategies: selected,            // 실제 사용되는 배열
      combine_mode: 'OR',
      mode: form.mode,
      initial_cash: Number(form.initial_cash),
      exchange_key_id: form.exchange_key_id || null,
      params: {},
    };
    const { data: bot, error } = await supabase.from('bots').insert(insert).select('id').single();
    if (error) { setBusy(false); setMsg(error.message); return; }

    await supabase.from('bot_state').upsert({
      bot_id: bot!.id, cash: Number(form.initial_cash), coin: 0, entry_price: 0, last_ts: 0, equity: Number(form.initial_cash),
    });

    router.push(`/bots/${bot!.id}`);
  }

  const incompatible = selected.filter(k => STRATEGY_MAP[k] && !STRATEGY_MAP[k].compatiblePeriods.includes(form.period));

  return (
    <div className="min-h-screen">
      <DashNav email={email} />
      <main className="max-w-3xl mx-auto px-6 py-6">
        <h1 className="text-2xl font-bold mb-5">새 봇</h1>
        <form onSubmit={submit} className="card space-y-4">
          <div>
            <label className="label">이름</label>
            <input className="input" required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">심볼 (HTX 거래소)</label>
              <SymbolPicker value={form.symbol} onChange={v => setForm({ ...form, symbol: v })} />
            </div>
            <div>
              <label className="label">봉 주기</label>
              <select className="input" value={form.period} onChange={e => setForm({ ...form, period: e.target.value })}>
                {PERIODS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          </div>

          {(() => {
            const preset = COIN_PRESET_BY_SYMBOL[form.symbol.toLowerCase()];
            if (!preset) return null;
            const m = preset.metrics, r = preset.regime;
            return (
              <div className="rounded-lg border border-blue-500/40 bg-blue-500/5 p-3 space-y-2">
                <div className="flex justify-between items-start gap-3">
                  <div>
                    <div className="text-xs text-blue-300 font-semibold">🧪 5년치 일봉 백테스트 추천 전략</div>
                    <div className="text-sm font-bold mt-0.5">{STRATEGY_MAP[preset.strategy]?.label || preset.strategy}</div>
                    <div className="text-[11px] text-muted mt-0.5">{preset.rationale}</div>
                  </div>
                  <button type="button" onClick={() => setSelected([preset.strategy])}
                    className="btn btn-primary text-xs whitespace-nowrap">이 전략 적용</button>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                  <Stat label="Sharpe" value={m.sharpe.toFixed(2)} />
                  <Stat label="CAGR" value={(m.cagr * 100).toFixed(1) + '%'} />
                  <Stat label="MDD" value={(m.mdd * 100).toFixed(1) + '%'} />
                  <Stat label="Win" value={(m.winRate * 100).toFixed(0) + '%'} />
                  <Stat label="Trades" value={String(m.trades)} />
                  <Stat label="Calmar" value={m.calmar.toFixed(2)} />
                  <Stat label="연변동성" value={(r.annualVol * 100).toFixed(0) + '%'} />
                  <Stat label="B&H" value={(r.buyHoldReturn * 100).toFixed(0) + '%'} />
                </div>
                <details className="text-[11px]">
                  <summary className="text-muted cursor-pointer">Top 3 비교</summary>
                  <table className="w-full mt-1.5 text-[10px]">
                    <thead className="text-muted"><tr><th className="text-left">전략</th><th>Sharpe</th><th>CAGR</th><th>MDD</th><th>Trades</th></tr></thead>
                    <tbody>
                      {preset.top3.map((t, i) => (
                        <tr key={i} className={i === 0 ? 'text-grn' : ''}>
                          <td className="text-left">{STRATEGY_MAP[t.strategy]?.label || t.strategy}</td>
                          <td className="text-center">{t.sharpe.toFixed(2)}</td>
                          <td className="text-center">{(t.cagr * 100).toFixed(0)}%</td>
                          <td className="text-center">{(t.mdd * 100).toFixed(0)}%</td>
                          <td className="text-center">{t.trades}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </details>
              </div>
            );
          })()}

          <div>
            <label className="label">전략 선택 (다중, OR 결합 · 자본 공유 · 진입시킨 전략만 청산)</label>
            <div className="space-y-2 mt-2">
              {STRATEGY_KEYS.map(key => {
                const meta = STRATEGY_MAP[key];
                const isSel = selected.includes(key);
                const isOpen = expanded[key];
                const badPeriod = isSel && !meta.compatiblePeriods.includes(form.period);
                return (
                  <div key={key} className={`border rounded-lg ${isSel ? 'border-blue-500' : 'border-border'}`}>
                    <div className="flex items-center gap-2 p-3">
                      <input type="checkbox" checked={isSel} onChange={() => toggle(key)} className="w-4 h-4" />
                      <button type="button" onClick={() => toggle(key)} className="flex-1 text-left text-sm font-semibold">
                        {meta.label}
                      </button>
                      <span className={`text-[10px] uppercase ${RISK_COLORS[meta.riskLevel]}`}>{meta.riskLevel}</span>
                      {badPeriod && <span className="text-[10px] text-yellow-400" title="현재 봉과 호환성 낮음">⚠</span>}
                      <button type="button" onClick={() => setExpanded(e => ({ ...e, [key]: !e[key] }))} className="text-xs text-muted hover:text-white px-2">
                        {isOpen ? '▲' : '▼'}
                      </button>
                    </div>
                    {isOpen && (
                      <div className="px-3 pb-3 pt-0 text-xs space-y-1.5 border-t border-border">
                        <Row label="원리" value={meta.principle} />
                        <Row label="성격" value={meta.character} />
                        <Row label="기대승률" value={meta.winRate} />
                        <Row label="손익비" value={meta.payoff} />
                        <Row label="강점" value={meta.strength} />
                        <Row label="약점" value={meta.weakness} />
                        <Row label="적합시장" value={meta.market} />
                        <Row label="신호빈도" value={meta.frequency} />
                        <div className="text-muted pt-1">호환 봉: {meta.compatiblePeriods.join(', ')}</div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {incompatible.length > 0 && (
              <p className="text-xs text-yellow-400 mt-2">
                ⚠ 선택된 전략 중 현재 봉 주기({form.period})와 호환성이 낮은 것: {incompatible.map(k => STRATEGY_MAP[k].label).join(', ')} — 경고일 뿐 진행은 가능합니다.
              </p>
            )}
          </div>

          <div>
            <label className="label">초기 자본 ($ USD)</label>
            {form.mode === 'live' && bal && !bal.error ? (
              <div className="space-y-2">
                <div className="flex gap-2 items-center">
                  <span className="text-xs text-muted shrink-0">$</span>
                  <input
                    className="input flex-1"
                    type="number"
                    min="0"
                    max={bal.usdt_available}
                    step="1"
                    value={form.initial_cash}
                    onChange={e => setForm({ ...form, initial_cash: Math.min(bal.usdt_available, Math.max(0, Number(e.target.value))) })}
                  />
                  <button type="button" onClick={() => setForm({ ...form, initial_cash: Math.floor(bal.usdt_available) })} className="btn btn-ghost text-xs whitespace-nowrap">MAX</button>
                </div>
                <input
                  type="range"
                  min="0"
                  max={Math.floor(bal.usdt_available)}
                  step="1"
                  value={Math.min(form.initial_cash, bal.usdt_available)}
                  onChange={e => setForm({ ...form, initial_cash: Number(e.target.value) })}
                  className="w-full accent-blue-500"
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
              <label className="label">HTX API 키 {form.mode === 'paper' && <span className="text-muted normal-case">(선택, 추후 실거래 전환용)</span>}</label>
              <select className="input" value={form.exchange_key_id} onChange={e => setForm({ ...form, exchange_key_id: e.target.value })}>
                <option value="">{form.mode === 'live' ? '선택…' : '없음 (키 미지정)'}</option>
                {keys.map(k => <option key={k.id} value={k.id}>{k.label}</option>)}
              </select>
              {keys.length === 0 && form.mode === 'live' && (
                <p className="text-xs text-red mt-2">등록된 키가 없습니다. 먼저 <a href="/settings/keys" className="underline">API 키 등록</a>을 하세요.</p>
              )}
              {form.mode === 'live' && (
                <p className="text-xs text-red mt-2">⚠ 실거래 모드는 실제 자금이 오갑니다. 소액으로 시작하고 반드시 모니터링하세요.</p>
              )}
              {form.mode === 'live' && form.exchange_key_id && (
                <div className="mt-3 p-3 rounded-lg border border-border bg-black/20 text-xs space-y-1.5">
                  {balLoading && <div className="text-muted">잔고 조회 중…</div>}
                  {bal && bal.error && <div className="text-red">⚠ {bal.error}</div>}
                  {bal && !bal.error && (
                    <>
                      <div className="flex justify-between">
                        <span className="text-muted">USDT 총잔고</span>
                        <span className="font-mono">${bal.usdt_total.toFixed(2)}</span>
                      </div>
                      {bal.allocated_to_other_bots > 0 && (
                        <div className="flex justify-between">
                          <span className="text-muted">다른 봇에 할당</span>
                          <span className="font-mono text-yellow-400">−${bal.allocated_to_other_bots.toFixed(2)}</span>
                        </div>
                      )}
                      <div className="flex justify-between border-t border-border pt-1.5">
                        <span className="text-muted">사용 가능</span>
                        <span className="font-mono text-grn font-semibold">${bal.usdt_available.toFixed(2)}</span>
                      </div>
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
          <button className="btn btn-primary w-full" disabled={busy}>{busy ? '생성 중…' : '봇 만들기'}</button>
        </form>
      </main>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded bg-black/30 px-2 py-1">
      <div className="text-[9px] text-muted uppercase">{label}</div>
      <div className="text-xs font-mono font-semibold">{value}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <span className="text-muted shrink-0 w-16">{label}</span>
      <span className="text-white/90">{value}</span>
    </div>
  );
}
