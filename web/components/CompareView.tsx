'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';

export type CompareBot = {
  id: string;
  name: string;
  symbol: string;
  period: string;
  mode: string;
  enabled: boolean;
  isComposite: boolean;
  strategyLabel: string;
  initialCash: number;
  equity: number;
  ret: number;
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  avgRet: number;
  mdd: number;
  createdAt: string;
  eqSeries: { ts: number; equity: number }[];
};

type SortKey = 'name' | 'symbol' | 'period' | 'strategy' | 'equity' | 'ret' | 'trades' | 'winRate' | 'avgRet' | 'mdd';

const COLORS = ['#60a5fa', '#f472b6', '#34d399', '#fbbf24', '#a78bfa', '#f87171', '#22d3ee', '#fb923c', '#84cc16', '#e879f9', '#94a3b8', '#fde047'];

export default function CompareView({ bots }: { bots: CompareBot[] }) {
  const [filter, setFilter] = useState<'all' | 'composite' | 'ensemble'>('all');
  const [symbolFilter, setSymbolFilter] = useState<string>('all');
  const [sortKey, setSortKey] = useState<SortKey>('ret');
  const [sortDesc, setSortDesc] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [chartMode, setChartMode] = useState<'normalized' | 'absolute'>('normalized');

  const symbols = useMemo(() => Array.from(new Set(bots.map(b => b.symbol))).sort(), [bots]);

  const filtered = useMemo(() => {
    let list = bots;
    if (filter === 'composite') list = list.filter(b => b.isComposite);
    if (filter === 'ensemble') list = list.filter(b => !b.isComposite);
    if (symbolFilter !== 'all') list = list.filter(b => b.symbol === symbolFilter);
    const dir = sortDesc ? -1 : 1;
    list = [...list].sort((a, b) => {
      const get = (x: CompareBot) => {
        switch (sortKey) {
          case 'name': return x.name;
          case 'symbol': return x.symbol;
          case 'period': return x.period;
          case 'strategy': return x.strategyLabel;
          case 'equity': return x.equity;
          case 'ret': return x.ret;
          case 'trades': return x.totalTrades;
          case 'winRate': return x.winRate;
          case 'avgRet': return x.avgRet;
          case 'mdd': return x.mdd;
        }
      };
      const va = get(a) as any, vb = get(b) as any;
      if (typeof va === 'number') return (va - vb) * dir;
      return String(va).localeCompare(String(vb)) * dir;
    });
    return list;
  }, [bots, filter, symbolFilter, sortKey, sortDesc]);

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDesc(!sortDesc);
    else { setSortKey(k); setSortDesc(true); }
  };

  const toggleSelect = (id: string) => {
    const s = new Set(selected);
    if (s.has(id)) s.delete(id); else s.add(id);
    setSelected(s);
  };

  const selectAll = () => {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map(b => b.id)));
  };

  const chartBots = useMemo(() => {
    const ids = selected.size > 0 ? selected : new Set(filtered.slice(0, 6).map(b => b.id));
    return filtered.filter(b => ids.has(b.id));
  }, [selected, filtered]);

  // 평균 통계
  const avgRet = filtered.length > 0 ? filtered.reduce((s, b) => s + b.ret, 0) / filtered.length : 0;
  const avgWinRate = filtered.length > 0 ? filtered.reduce((s, b) => s + b.winRate, 0) / filtered.length : 0;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center flex-wrap gap-2">
        <h1 className="text-2xl font-bold">봇 비교 <span className="text-sm text-muted font-normal">({filtered.length})</span></h1>
        <div className="text-xs text-muted">
          평균 수익률 <span className={avgRet >= 0 ? 'text-green-400' : 'text-red-400'}>{(avgRet * 100).toFixed(2)}%</span> · 평균 승률 {(avgWinRate * 100).toFixed(1)}%
        </div>
      </div>

      <div className="flex gap-2 flex-wrap items-center">
        <div className="flex gap-1">
          {(['all', 'composite', 'ensemble'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`text-xs px-3 py-1.5 rounded-lg border ${filter === f ? 'border-accent bg-accent/10 text-accent' : 'border-border text-muted hover:text-white'}`}>
              {f === 'all' ? '전체' : f === 'composite' ? '🧬 합성' : '일반'}
            </button>
          ))}
        </div>
        <select value={symbolFilter} onChange={e => setSymbolFilter(e.target.value)}
          className="text-xs bg-panel border border-border rounded-lg px-2 py-1.5">
          <option value="all">전체 심볼</option>
          {symbols.map(s => <option key={s} value={s}>{s.toUpperCase()}</option>)}
        </select>
      </div>

      {/* 차트 카드 */}
      <div className="card">
        <div className="flex justify-between items-center mb-3 flex-wrap gap-2">
          <div className="text-sm font-semibold">
            Equity 곡선 <span className="text-xs text-muted">({chartBots.length}개 표시 — {selected.size > 0 ? '선택됨' : '상위 6'})</span>
          </div>
          <div className="flex gap-1">
            <button onClick={() => setChartMode('normalized')}
              className={`text-xs px-2 py-1 rounded ${chartMode === 'normalized' ? 'bg-accent/20 text-accent' : 'text-muted'}`}>
              정규화 (시작=100)
            </button>
            <button onClick={() => setChartMode('absolute')}
              className={`text-xs px-2 py-1 rounded ${chartMode === 'absolute' ? 'bg-accent/20 text-accent' : 'text-muted'}`}>
              절대값
            </button>
          </div>
        </div>
        <EquityChart bots={chartBots} mode={chartMode} />
      </div>

      {/* 봇 비교 테이블 */}
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-muted border-b border-border">
              <th className="px-2 py-2 text-left">
                <input type="checkbox" checked={selected.size === filtered.length && filtered.length > 0}
                  onChange={selectAll} className="cursor-pointer" />
              </th>
              <Th label="봇" sortKey="name" current={sortKey} desc={sortDesc} onClick={toggleSort} align="left" />
              <Th label="심볼" sortKey="symbol" current={sortKey} desc={sortDesc} onClick={toggleSort} />
              <Th label="주기" sortKey="period" current={sortKey} desc={sortDesc} onClick={toggleSort} />
              <Th label="전략" sortKey="strategy" current={sortKey} desc={sortDesc} onClick={toggleSort} />
              <Th label="Equity" sortKey="equity" current={sortKey} desc={sortDesc} onClick={toggleSort} align="right" />
              <Th label="수익률" sortKey="ret" current={sortKey} desc={sortDesc} onClick={toggleSort} align="right" />
              <Th label="거래수" sortKey="trades" current={sortKey} desc={sortDesc} onClick={toggleSort} align="right" />
              <Th label="승률" sortKey="winRate" current={sortKey} desc={sortDesc} onClick={toggleSort} align="right" />
              <Th label="평균수익" sortKey="avgRet" current={sortKey} desc={sortDesc} onClick={toggleSort} align="right" />
              <Th label="MDD" sortKey="mdd" current={sortKey} desc={sortDesc} onClick={toggleSort} align="right" />
            </tr>
          </thead>
          <tbody>
            {filtered.map((b, i) => (
              <tr key={b.id} className={`border-b border-border/40 hover:bg-panel/50 ${!b.enabled ? 'opacity-50' : ''}`}>
                <td className="px-2 py-2">
                  <input type="checkbox" checked={selected.has(b.id)} onChange={() => toggleSelect(b.id)} className="cursor-pointer" />
                </td>
                <td className="px-2 py-2">
                  <Link href={`/bots/${b.id}`} className="hover:text-accent flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full inline-block" style={{ background: COLORS[i % COLORS.length] }} />
                    {b.name}
                  </Link>
                </td>
                <td className="px-2 py-2 text-center text-xs">{b.symbol.toUpperCase()}</td>
                <td className="px-2 py-2 text-center text-xs text-muted">{b.period}</td>
                <td className="px-2 py-2 text-center text-xs">{b.strategyLabel}</td>
                <td className="px-2 py-2 text-right tabular-nums">{b.equity.toFixed(2)}</td>
                <td className={`px-2 py-2 text-right tabular-nums font-semibold ${b.ret >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {(b.ret * 100).toFixed(2)}%
                </td>
                <td className="px-2 py-2 text-right tabular-nums">{b.totalTrades}</td>
                <td className="px-2 py-2 text-right tabular-nums">{(b.winRate * 100).toFixed(0)}%</td>
                <td className={`px-2 py-2 text-right tabular-nums ${b.avgRet >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {(b.avgRet * 100).toFixed(2)}%
                </td>
                <td className="px-2 py-2 text-right tabular-nums text-red-400">{(b.mdd * 100).toFixed(1)}%</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={11} className="text-center text-muted py-6">조건에 맞는 봇이 없습니다</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Th({ label, sortKey, current, desc, onClick, align = 'center' }: { label: string; sortKey: SortKey; current: SortKey; desc: boolean; onClick: (k: SortKey) => void; align?: 'left' | 'center' | 'right' }) {
  const active = current === sortKey;
  return (
    <th className={`px-2 py-2 text-${align} cursor-pointer select-none hover:text-white whitespace-nowrap ${active ? 'text-accent' : ''}`}
      onClick={() => onClick(sortKey)}>
      {label}{active ? (desc ? ' ↓' : ' ↑') : ''}
    </th>
  );
}

function EquityChart({ bots, mode }: { bots: CompareBot[]; mode: 'normalized' | 'absolute' }) {
  const W = 800, H = 280, PAD_L = 50, PAD_R = 10, PAD_T = 10, PAD_B = 30;

  const series = useMemo(() => bots.map((b, i) => {
    const points = b.eqSeries.length > 0
      ? b.eqSeries
      : [{ ts: new Date(b.createdAt).getTime(), equity: b.initialCash }, { ts: Date.now(), equity: b.equity }];
    const norm = mode === 'normalized'
      ? points.map(p => ({ ts: p.ts, v: (p.equity / b.initialCash) * 100 }))
      : points.map(p => ({ ts: p.ts, v: p.equity }));
    return { id: b.id, name: b.name, color: COLORS[bots.indexOf(b) % COLORS.length], points: norm };
  }), [bots, mode]);

  if (series.length === 0 || series.every(s => s.points.length === 0)) {
    return <div className="text-muted text-sm text-center py-12">표시할 데이터가 없습니다</div>;
  }

  const allPoints = series.flatMap(s => s.points);
  const minTs = Math.min(...allPoints.map(p => p.ts));
  const maxTs = Math.max(...allPoints.map(p => p.ts));
  const minV = Math.min(...allPoints.map(p => p.v));
  const maxV = Math.max(...allPoints.map(p => p.v));
  const tsRange = Math.max(1, maxTs - minTs);
  const vRange = Math.max(0.0001, maxV - minV);
  const vMin = minV - vRange * 0.05;
  const vMax = maxV + vRange * 0.05;

  const xOf = (ts: number) => PAD_L + ((ts - minTs) / tsRange) * (W - PAD_L - PAD_R);
  const yOf = (v: number) => PAD_T + (1 - (v - vMin) / (vMax - vMin)) * (H - PAD_T - PAD_B);

  // y축 눈금 5개
  const yTicks = Array.from({ length: 5 }, (_, i) => vMin + ((vMax - vMin) * i) / 4);
  // 시작 기준선 (정규화면 100)
  const baseLine = mode === 'normalized' ? 100 : null;

  return (
    <div className="w-full overflow-x-auto">
      <svg width={W} height={H} className="w-full" viewBox={`0 0 ${W} ${H}`}>
        {yTicks.map((v, i) => (
          <g key={i}>
            <line x1={PAD_L} y1={yOf(v)} x2={W - PAD_R} y2={yOf(v)} stroke="#2c3654" strokeWidth={0.5} strokeDasharray="2 3" />
            <text x={PAD_L - 5} y={yOf(v) + 3} fill="#94a3b8" fontSize="10" textAnchor="end">{v.toFixed(mode === 'normalized' ? 0 : 0)}</text>
          </g>
        ))}
        {baseLine != null && baseLine >= vMin && baseLine <= vMax && (
          <line x1={PAD_L} y1={yOf(baseLine)} x2={W - PAD_R} y2={yOf(baseLine)} stroke="#475569" strokeWidth={1} />
        )}
        {series.map(s => {
          if (s.points.length === 0) return null;
          const d = s.points.map((p, i) => `${i === 0 ? 'M' : 'L'}${xOf(p.ts).toFixed(1)},${yOf(p.v).toFixed(1)}`).join(' ');
          return <path key={s.id} d={d} fill="none" stroke={s.color} strokeWidth={1.5} />;
        })}
        {/* x축 라벨 */}
        <text x={PAD_L} y={H - 8} fill="#94a3b8" fontSize="10">{new Date(minTs).toLocaleDateString()}</text>
        <text x={W - PAD_R} y={H - 8} fill="#94a3b8" fontSize="10" textAnchor="end">{new Date(maxTs).toLocaleDateString()}</text>
      </svg>
      <div className="flex flex-wrap gap-3 mt-2 text-xs">
        {series.map(s => (
          <div key={s.id} className="flex items-center gap-1.5">
            <span className="w-3 h-1 inline-block" style={{ background: s.color }} />
            <span className="text-muted">{s.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
