'use client';
import { useEffect, useRef, useState } from 'react';

const PERIODS: { key: string; label: string }[] = [
  { key: '1min',  label: '1분' },
  { key: '5min',  label: '5분' },
  { key: '15min', label: '15분' },
  { key: '30min', label: '30분' },
  { key: '60min', label: '1시간' },
  { key: '4hour', label: '4시간' },
  { key: '1day',  label: '일' },
  { key: '1week', label: '주' },
  { key: '1mon',  label: '월' },
];

interface Kline { id: number; open: number; close: number; high: number; low: number; vol: number; }

// CDN loader (한 번만)
let lwcPromise: Promise<any> | null = null;
function loadLWC(): Promise<any> {
  if (typeof window === 'undefined') return Promise.reject('no window');
  if ((window as any).LightweightCharts) return Promise.resolve((window as any).LightweightCharts);
  if (lwcPromise) return lwcPromise;
  lwcPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://unpkg.com/lightweight-charts@4.2.0/dist/lightweight-charts.standalone.production.js';
    s.async = true;
    s.onload = () => resolve((window as any).LightweightCharts);
    s.onerror = () => reject(new Error('lightweight-charts CDN load failed'));
    document.head.appendChild(s);
  });
  return lwcPromise;
}

function sma(values: number[], len: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= len) sum -= values[i - len];
    if (i >= len - 1) out[i] = sum / len;
  }
  return out;
}

export default function PriceChart({ symbol, period: initialPeriod }: { symbol: string; period: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);
  const candleRef = useRef<any>(null);
  const ma20Ref = useRef<any>(null);
  const ma60Ref = useRef<any>(null);
  const ma120Ref = useRef<any>(null);
  const [period, setPeriod] = useState(initialPeriod || '5min');
  const [err, setErr] = useState<string | null>(null);
  const [lastPrice, setLastPrice] = useState<number | null>(null);
  const [chg, setChg] = useState<number>(0);
  const [ready, setReady] = useState(false);

  // 차트 초기화
  useEffect(() => {
    let disposed = false;
    loadLWC().then(LWC => {
      if (disposed || !containerRef.current) return;
      const chart = LWC.createChart(containerRef.current, {
        width: containerRef.current.clientWidth,
        height: 360,
        layout: { background: { color: '#0b0b0b' }, textColor: '#ccc' },
        grid: { vertLines: { color: '#1e1e1e' }, horzLines: { color: '#1e1e1e' } },
        rightPriceScale: { borderColor: '#2a2a2a' },
        timeScale: { borderColor: '#2a2a2a', timeVisible: true, secondsVisible: false },
        crosshair: { mode: 1 },
      });
      const candle = chart.addCandlestickSeries({
        upColor: '#26a69a', downColor: '#ef5350',
        borderUpColor: '#26a69a', borderDownColor: '#ef5350',
        wickUpColor: '#26a69a', wickDownColor: '#ef5350',
      });
      const ma20 = chart.addLineSeries({ color: '#f4d03f', lineWidth: 1, priceLineVisible: false, lastValueVisible: false, title: 'MA20' });
      const ma60 = chart.addLineSeries({ color: '#bb7bf0', lineWidth: 1, priceLineVisible: false, lastValueVisible: false, title: 'MA60' });
      const ma120 = chart.addLineSeries({ color: '#5dade2', lineWidth: 1, priceLineVisible: false, lastValueVisible: false, title: 'MA120' });
      chartRef.current = chart;
      candleRef.current = candle;
      ma20Ref.current = ma20;
      ma60Ref.current = ma60;
      ma120Ref.current = ma120;
      setReady(true);

      const onResize = () => {
        if (containerRef.current && chartRef.current) {
          chartRef.current.applyOptions({ width: containerRef.current.clientWidth });
        }
      };
      window.addEventListener('resize', onResize);
      (chart as any).__onResize = onResize;
    }).catch(e => setErr(e.message));
    return () => {
      disposed = true;
      if (chartRef.current) {
        window.removeEventListener('resize', (chartRef.current as any).__onResize);
        chartRef.current.remove();
        chartRef.current = null;
      }
    };
  }, []);

  // 데이터 로드 + 10초 갱신
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;

    async function load() {
      try {
        const r = await fetch(`https://api.huobi.pro/market/history/kline?symbol=${symbol.toLowerCase()}&period=${period}&size=300`);
        const j = await r.json();
        if (j.status !== 'ok') { setErr(j['err-msg'] ?? 'error'); return; }
        if (cancelled) return;
        const asc: Kline[] = [...j.data].reverse();
        const candles = asc.map(k => ({ time: k.id as any, open: k.open, high: k.high, low: k.low, close: k.close }));
        const closes = asc.map(k => k.close);
        const m20 = sma(closes, 20), m60 = sma(closes, 60), m120 = sma(closes, 120);
        const line = (arr: (number | null)[]) => arr.map((v, i) => v == null ? null : { time: asc[i].id as any, value: v }).filter(Boolean) as any[];

        candleRef.current.setData(candles);
        ma20Ref.current.setData(line(m20));
        ma60Ref.current.setData(line(m60));
        ma120Ref.current.setData(line(m120));

        const last = asc[asc.length - 1], first = asc[0];
        setLastPrice(last.close);
        setChg(((last.close - first.open) / first.open) * 100);
        setErr(null);
      } catch (e: any) {
        if (!cancelled) setErr(e.message);
      }
    }

    load();
    const t = setInterval(load, 10_000);
    return () => { cancelled = true; clearInterval(t); };
  }, [ready, symbol, period]);

  const up = chg >= 0;

  return (
    <div className="card">
      <div className="flex justify-between items-start mb-3 flex-wrap gap-2">
        <div>
          <span className="text-lg font-bold">{symbol.toUpperCase()}</span>
          <span className="text-xs text-muted ml-2">· 10초 자동 갱신 · MA20/60/120</span>
        </div>
        {lastPrice != null && (
          <div className="text-right">
            <div className="text-xl font-mono">{lastPrice.toLocaleString()}</div>
            <div className={`text-xs ${up ? 'text-grn' : 'text-red'}`}>{up ? '▲' : '▼'} {chg.toFixed(2)}%</div>
          </div>
        )}
      </div>
      <div className="flex gap-1 mb-3 flex-wrap">
        {PERIODS.map(p => (
          <button
            key={p.key}
            type="button"
            onClick={() => setPeriod(p.key)}
            className={`text-xs px-2.5 py-1 rounded border ${period === p.key ? 'border-blue-500 bg-blue-500/20 text-blue-300' : 'border-border text-muted hover:text-white'}`}
          >
            {p.label}
          </button>
        ))}
      </div>
      {err && <p className="text-sm text-red mb-2">차트 오류: {err}</p>}
      <div ref={containerRef} style={{ width: '100%', height: 360 }} />
      <div className="flex gap-3 mt-2 text-[10px] text-muted">
        <span><span className="inline-block w-3 h-0.5 bg-[#f4d03f] mr-1 align-middle" />MA20</span>
        <span><span className="inline-block w-3 h-0.5 bg-[#bb7bf0] mr-1 align-middle" />MA60</span>
        <span><span className="inline-block w-3 h-0.5 bg-[#5dade2] mr-1 align-middle" />MA120</span>
      </div>
    </div>
  );
}
