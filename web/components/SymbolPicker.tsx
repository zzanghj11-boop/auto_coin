'use client';
import { useEffect, useMemo, useState } from 'react';

interface Sym { symbol: string; base: string; quote: string; }

export default function SymbolPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [all, setAll] = useState<Sym[]>([]);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch('https://api.huobi.pro/v1/common/symbols');
        const j = await r.json();
        const list: Sym[] = (j.data ?? [])
          .filter((s: any) => s.state === 'online')
          .map((s: any) => ({ symbol: s.symbol, base: (s['base-currency'] ?? '').toUpperCase(), quote: (s['quote-currency'] ?? '').toUpperCase() }));
        list.sort((a, b) => a.symbol.localeCompare(b.symbol));
        setAll(list);
      } catch (e: any) {
        setErr('HTX 심볼 목록 로드 실패');
      }
    })();
  }, []);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return all.slice(0, 200);
    return all.filter(s => s.symbol.includes(needle) || s.base.toLowerCase().includes(needle)).slice(0, 200);
  }, [q, all]);

  return (
    <div className="relative">
      <input
        className="input"
        placeholder="심볼 검색 (예: btc, eth, sol)"
        value={open ? q : value.toUpperCase()}
        onFocus={() => { setOpen(true); setQ(''); }}
        onChange={e => { setQ(e.target.value); setOpen(true); }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {err && <p className="text-xs text-red mt-1">{err}</p>}
      {open && (
        <div className="absolute z-50 mt-1 w-full max-h-64 overflow-auto bg-[#111] border border-border rounded-lg shadow-2xl" style={{ backgroundColor: '#0f0f0f' }}>
          {filtered.length === 0 && <div className="px-3 py-2 text-xs text-muted">결과 없음</div>}
          {filtered.map(s => (
            <button
              key={s.symbol}
              type="button"
              onMouseDown={e => { e.preventDefault(); onChange(s.symbol); setOpen(false); }}
              className="w-full text-left px-3 py-1.5 text-sm hover:bg-white/5 flex justify-between"
            >
              <span className="font-mono">{s.symbol.toUpperCase()}</span>
              <span className="text-xs text-muted">{s.base}/{s.quote}</span>
            </button>
          ))}
        </div>
      )}
      <p className="text-[10px] text-muted mt-1">{all.length > 0 ? `${all.length}개 심볼 로드됨` : '로드 중…'}</p>
    </div>
  );
}
