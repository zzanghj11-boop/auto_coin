// 봇 실행 엔진 — 한 틱에 해당하는 단일 step
// 입력: 현재 state + 최신 candles + 전략 함수
// 출력: 갱신된 state + 발생한 trade (있으면)
import type { Candle, Signal } from './strategies';
import { STRATEGY_MAP } from './strategies';

export interface BotState {
  cash: number;
  coin: number;
  entry_price: number;
  last_ts: number;
  entry_strategy?: string | null;   // 진입시킨 전략 (전략별 독립 청산용)
}

export interface TradeEvent {
  ts: number;
  side: 'buy' | 'sell';
  price: number;
  size: number;
  fee: number;
  reason: 'signal' | 'stop';
  ret: number | null;
  trigger_strategy?: string | null;  // 어느 전략이 트리거했는지
}

export interface StepResult {
  state: BotState;
  trade: TradeEvent | null;
  equity: number;
  price: number;
}

const FEE = 0.002;
const SLIP = 0.0005;
const STOP = -0.03;

export function runStep(
  state: BotState,
  candles: Candle[],
  strategyFn: (c: Candle[]) => Signal[]
): StepResult {
  if (candles.length === 0) return { state, trade: null, equity: state.cash, price: 0 };
  const last = candles[candles.length - 1];
  const px = last.close;
  let trade: TradeEvent | null = null;
  const next: BotState = { ...state };

  if (last.ts <= state.last_ts) {
    // 새 봉 없음
    return { state: next, trade: null, equity: next.cash + next.coin * px, price: px };
  }

  // 손절
  if (next.coin > 0) {
    const ret = (px - next.entry_price) / next.entry_price;
    if (ret <= STOP) {
      const size = next.coin;
      const proceeds = size * px * (1 - FEE - SLIP);
      trade = { ts: last.ts, side: 'sell', price: px, size, fee: FEE + SLIP, reason: 'stop', ret };
      next.cash += proceeds;
      next.coin = 0;
      next.entry_price = 0;
    }
  }

  if (!trade) {
    const sigs = strategyFn(candles);
    const sig = sigs[sigs.length - 1];
    if (sig === 1 && next.coin === 0) {
      const buyPx = px * (1 + SLIP);
      const size = (next.cash * (1 - FEE)) / buyPx;
      trade = { ts: last.ts, side: 'buy', price: buyPx, size, fee: FEE + SLIP, reason: 'signal', ret: null };
      next.coin = size;
      next.entry_price = buyPx;
      next.cash = 0;
    } else if (sig === -1 && next.coin > 0) {
      const size = next.coin;
      const proceeds = size * px * (1 - FEE - SLIP);
      const ret = (px - next.entry_price) / next.entry_price;
      trade = { ts: last.ts, side: 'sell', price: px, size, fee: FEE + SLIP, reason: 'signal', ret };
      next.cash += proceeds;
      next.coin = 0;
      next.entry_price = 0;
    }
  }

  next.last_ts = last.ts;
  const equity = next.cash + next.coin * px;
  return { state: next, trade, equity, price: px };
}

// ─── 앙상블 실행: 여러 전략 OR 조합, 전략별 독립 청산 ──────────────
// 진입 규칙: FLAT 상태에서 선택된 전략 중 하나라도 +1 신호면 첫 번째 전략이 진입 (trigger_strategy 기록)
// 청산 규칙: LONG 상태면 오직 entry_strategy가 낸 -1 신호일 때만 청산 (손절은 예외)
export function runStepEnsemble(
  state: BotState,
  candles: Candle[],
  strategyKeys: string[]
): StepResult {
  if (candles.length === 0) return { state, trade: null, equity: state.cash, price: 0 };
  const last = candles[candles.length - 1];
  const px = last.close;
  let trade: TradeEvent | null = null;
  const next: BotState = { ...state };

  // 새 봉이 없고 보유도 없으면 작업 없음
  if (last.ts <= state.last_ts && next.coin === 0) {
    return { state: next, trade: null, equity: next.cash + next.coin * px, price: px };
  }

  // 모든 전략 신호 한 번만 사전계산
  const sigsByKey: Record<string, Signal[]> = {};
  for (const key of strategyKeys) {
    const meta = STRATEGY_MAP[key];
    if (!meta) continue;
    sigsByKey[key] = meta.fn(candles);
  }

  // state.last_ts 이후 모든 신규 봉을 순차 replay
  // 보유 중이면서 새 봉이 없는 경우엔 마지막 봉(현재가)에서 청산 조건만 검사
  const noNewBars = last.ts <= state.last_ts;
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    if (noNewBars) {
      // 보유 중일 때만 마지막 바 1회 청산 체크
      if (i !== candles.length - 1 || next.coin === 0) continue;
    } else {
      if (c.ts <= state.last_ts) continue;
    }
    const cpx = c.close;

    // 손절 (자본 보호)
    if (next.coin > 0) {
      const ret = (cpx - next.entry_price) / next.entry_price;
      if (ret <= STOP) {
        const size = next.coin;
        const proceeds = size * cpx * (1 - FEE - SLIP);
        trade = { ts: c.ts, side: 'sell', price: cpx, size, fee: FEE + SLIP, reason: 'stop', ret, trigger_strategy: next.entry_strategy ?? null };
        next.cash += proceeds; next.coin = 0; next.entry_price = 0; next.entry_strategy = null;
        next.last_ts = c.ts;
        continue;
      }
    }

    if (next.coin === 0) {
      for (const key of strategyKeys) {
        if (sigsByKey[key]?.[i] === 1) {
          const buyPx = cpx * (1 + SLIP);
          const size = (next.cash * (1 - FEE)) / buyPx;
          trade = { ts: c.ts, side: 'buy', price: buyPx, size, fee: FEE + SLIP, reason: 'signal', ret: null, trigger_strategy: key };
          next.coin = size; next.entry_price = buyPx; next.cash = 0; next.entry_strategy = key;
          break;
        }
      }
    } else {
      // 청산 판정: entry_strategy 우선, 없거나 매핑 실패 시 모든 활성 전략의 exitFn 중 하나라도 trigger 시 청산
      const ek = next.entry_strategy;
      const ekMeta = ek ? STRATEGY_MAP[ek] : null;
      let exitedBy: string | null = null;
      if (ek && ekMeta) {
        if (ekMeta.exitFn(candles, next.entry_price, i)) exitedBy = ek;
      } else {
        // 폴백: entry_strategy 누락된 기존 포지션 — 활성 전략 중 어느 하나라도 exit 조건 충족
        for (const key of strategyKeys) {
          const m = STRATEGY_MAP[key];
          if (m && m.exitFn(candles, next.entry_price, i)) { exitedBy = key; break; }
        }
      }
      // 추가 안전장치: +5% 익절 또는 진입 후 200봉 시간 청산 (entry_strategy 무관)
      if (!exitedBy) {
        const ret = (cpx - next.entry_price) / next.entry_price;
        if (ret >= 0.05) exitedBy = '__profit5';
      }
      if (exitedBy) {
        const size = next.coin;
        const proceeds = size * cpx * (1 - FEE - SLIP);
        const ret = (cpx - next.entry_price) / next.entry_price;
        trade = { ts: c.ts, side: 'sell', price: cpx, size, fee: FEE + SLIP, reason: 'signal', ret, trigger_strategy: exitedBy };
        next.cash += proceeds; next.coin = 0; next.entry_price = 0; next.entry_strategy = null;
      }
    }
    next.last_ts = c.ts;
  }

  const equity = next.cash + next.coin * px;
  return { state: next, trade, equity, price: px };
}

// ─── 합성 전략 실행 v2: ATR 동적 손절 + EMA 트렌드 필터 + ATR 트레일링 ───────
// v1 문제: 고정 -3% 손절이 1일봉 노이즈에 잘림, 하락장 필터 없음
// v2 개선:
//   1) ATR(14) 기반 동적 손절: -2×ATR (최소 -2%, 최대 -8%)
//   2) EMA(50) 트렌드 필터: 가격 > EMA50 일 때만 진입 허용
//   3) 트레일링 스톱: 고점에서 -1.5×ATR (기존 고정 -10% 대체)
//   4) 시간 청산: 60봉 → 30봉 (과도한 체류 방지)
import { compositeEntrySignal, getCompositePreset } from './composite';
import { getCompositeFor } from './composite_presets';
import { ema as calcEma, atr as calcAtr } from './indicators';

export function runStepComposite(
  state: BotState,
  candles: Candle[],
  symbol: string,
  period: string = '1day'
): StepResult {
  if (candles.length === 0) return { state, trade: null, equity: state.cash, price: 0 };
  const last = candles[candles.length - 1];
  const px = last.close;
  let trade: TradeEvent | null = null;
  const next: BotState = { ...state };

  if (last.ts <= state.last_ts && next.coin === 0) {
    return { state: next, trade: null, equity: next.cash + next.coin * px, price: px };
  }
  const noNewBars = last.ts <= state.last_ts;

  // period별 preset 우선 조회, 없으면 1day fallback
  const preset = getCompositeFor(symbol, period) ?? getCompositePreset(symbol);
  if (!preset) {
    next.last_ts = last.ts;
    return { state: next, trade, equity: next.cash + next.coin * px, price: px };
  }

  // ── 사전계산: ATR(14), EMA(50) ──
  const closes = candles.map(c => c.close);
  const atrArr = calcAtr(candles, 14);
  const ema50 = calcEma(closes, 50);

  // 진입후 트레일링 스톱용 peak 추적
  let peakSinceEntry = next.coin > 0 ? Math.max(next.entry_price, px) : 0;
  let entryBarIdx = -1;

  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    if (noNewBars) {
      if (i !== candles.length - 1 || next.coin === 0) {
        if (next.coin > 0 && c.high > peakSinceEntry) peakSinceEntry = c.high;
        continue;
      }
    } else if (c.ts <= state.last_ts) {
      if (next.coin > 0 && c.high > peakSinceEntry) peakSinceEntry = c.high;
      continue;
    }
    const cpx = c.close;
    const curAtr = !isNaN(atrArr[i]) ? atrArr[i] : 0;

    // ── ATR 동적 손절 (자본 보호) ──
    // 기존: 고정 -3% → 변경: -2×ATR/price, 최소 -2% 최대 -8%
    if (next.coin > 0) {
      const ret = (cpx - next.entry_price) / next.entry_price;
      const atrStop = curAtr > 0
        ? -Math.min(Math.max((2 * curAtr) / next.entry_price, 0.02), 0.08)
        : STOP;
      if (ret <= atrStop) {
        const size = next.coin;
        const proceeds = size * cpx * (1 - FEE - SLIP);
        trade = { ts: c.ts, side: 'sell', price: cpx, size, fee: FEE + SLIP, reason: 'stop', ret, trigger_strategy: 'composite:atr_stop' };
        next.cash += proceeds; next.coin = 0; next.entry_price = 0; next.entry_strategy = null;
        peakSinceEntry = 0; entryBarIdx = -1;
        next.last_ts = c.ts;
        continue;
      }
    }

    if (next.coin === 0) {
      // ── EMA(50) 트렌드 필터: 하락장 진입 차단 ──
      const ema50v = ema50[i];
      const trendOk = isNaN(ema50v) || cpx > ema50v;

      if (trendOk) {
        const slice = candles.slice(0, i + 1);
        const sig = compositeEntrySignal(slice, preset);
        if (sig.fire) {
          const buyPx = cpx * (1 + SLIP);
          const size = (next.cash * (1 - FEE)) / buyPx;
          trade = { ts: c.ts, side: 'buy', price: buyPx, size, fee: FEE + SLIP, reason: 'signal', ret: null, trigger_strategy: `composite:${sig.contributors.join('+')}` };
          next.coin = size; next.entry_price = buyPx; next.cash = 0; next.entry_strategy = 'composite';
          peakSinceEntry = buyPx; entryBarIdx = i;
        }
      }
    } else {
      if (c.high > peakSinceEntry) peakSinceEntry = c.high;
      // ── ATR 트레일링 스톱 또는 30봉 시간 청산 ──
      const trailAtr = curAtr > 0
        ? peakSinceEntry - 1.5 * curAtr
        : peakSinceEntry * 0.90;
      const timeExit = entryBarIdx >= 0 && (i - entryBarIdx) >= 30;
      if (cpx < trailAtr || timeExit) {
        const size = next.coin;
        const proceeds = size * cpx * (1 - FEE - SLIP);
        const ret = (cpx - next.entry_price) / next.entry_price;
        trade = { ts: c.ts, side: 'sell', price: cpx, size, fee: FEE + SLIP, reason: 'signal', ret, trigger_strategy: timeExit ? 'composite:time' : 'composite:trail' };
        next.cash += proceeds; next.coin = 0; next.entry_price = 0; next.entry_strategy = null;
        peakSinceEntry = 0; entryBarIdx = -1;
      }
    }
    next.last_ts = c.ts;
  }

  const equity = next.cash + next.coin * px;
  return { state: next, trade, equity, price: px };
}

// HTX 직접 호출 (서버에서만)
export async function fetchHtxKlines(symbol: string, period: string, size = 300): Promise<Candle[]> {
  const url = `https://api.huobi.pro/market/history/kline?symbol=${symbol}&period=${period}&size=${size}`;
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) throw new Error(`HTX ${r.status}`);
  const j: any = await r.json();
  if (j.status !== 'ok') throw new Error(`HTX ${j['err-msg']}`);
  return (j.data as any[])
    .map(k => ({ ts: k.id * 1000, open: k.open, high: k.high, low: k.low, close: k.close, volume: k.vol }))
    .sort((a, b) => a.ts - b.ts);
}
