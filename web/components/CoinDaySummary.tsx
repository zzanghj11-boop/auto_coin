'use client';
import { useEffect, useState } from 'react';

interface Kline { id: number; open: number; close: number; high: number; low: number; }

export default function CoinDaySummary({ symbol }: { symbol: string }) {
  const [data, setData] = useState<Kline[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`https://api.huobi.pro/market/history/kline?symbol=${symbol.toLowerCase()}&period=1day&size=30`);
        const j = await r.json();
        if (cancelled) return;
        if (j.status !== 'ok') { setErr(j['err-msg'] ?? 'error'); return; }
        setData([...j.data].reverse());
      } catch (e: any) {
        if (!cancelled) setErr(e.message);
      }
    })();
    return () => { cancelled = true; };
  }, [symbol]);

  if (err) return <div className="h-16 text-[10px] text-red flex items-center justify-center">차트 로드 실패</div>;
  if (!data || data.length < 2) return <div className="h-16 text-[10px] text-muted flex items-center justify-center">일봉 로딩…</div>;

  const last = data[data.length - 1];
  const first = data[0];
  const dayChg = ((last.close - last.open) / last.open) * 100;   // 오늘 변동률 (open→close)
  const m30 = ((last.close - first.open) / first.open) * 100;    // 30일 수익률

  const highs = data.map(d => d.high), lows = data.map(d => d.low);
  const max = Math.max(...highs), min = Math.min(...lows);
  const span = max - min || 1;
  const W = 600, H = 64, PAD = 2;
  const x = (i: number) => PAD + (i * (W - 2 * PAD)) / (data.length - 1);
  const y = (v: number) => PAD + ((max - v) * (H - 2 * PAD)) / span;
  const bw = Math.max(2, (W - 2 * PAD) / data.length * 0.6);

  const up = dayChg >= 0;
  const lineColor = up ? '#26a69a' : '#ef5350';

  return (
    <div>
      <div className="flex justify-between items-baseline mb-1">
        <span className="text-[10px] text-muted uppercase">30일 · 일봉</span>
        <div className="flex gap-3 text-[11px]">
          <span className="text-muted">오늘 <span className={dayChg >= 0 ? 'text-grn' : 'text-red'}>{dayChg >= 0 ? '+' : ''}{dayChg.toFixed(2)}%</span></span>
          <span className="text-muted">30일 <span className={m30 >= 0 ? 'text-grn' : 'text-red'}>{m30 >= 0 ? '+' : ''}{m30.toFixed(2)}%</span></span>
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-16" preserveAspectRatio="none">
        {data.map((d, i) => {
          const cx = x(i);
          const isUp = d.close >= d.open;
          const color = isUp ? '#26a69a' : '#ef5350';
          const yTop = y(Math.max(d.open, d.close));
          const yBot = y(Math.min(d.open, d.close));
          return (
            <g key={i}>
              <line x1={cx} x2={cx} y1={y(d.high)} y2={y(d.low)} stroke={color} strokeWidth="1" />
              <rect x={cx - bw / 2} y={yTop} width={bw} height={Math.max(1, yBot - yTop)} fill={color} />
            </g>
          );
        })}
      </svg>
      <div className="flex justify-between text-[9px] text-muted mt-0.5 font-mono">
        <span>L ${Number(min).toLocaleString(undefined, { maximumFractionDigits: 4 })}</span>
        <span>H ${Number(max).toLocaleString(undefined, { maximumFractionDigits: 4 })}</span>
      </div>
    </div>
  );
}
