// Composite (signal-mining) strategy runtime evaluator.
// Reads per-coin spec from composite_presets.ts and combines base strategy
// signals with coin-specific weights + vote threshold.
import type { Candle, Signal } from './strategies';
import { STRATEGY_MAP } from './strategies';
import { COMPOSITE_BY_SYMBOL, type CompositePreset } from './composite_presets';

export function getCompositePreset(symbol: string): CompositePreset | null {
  return COMPOSITE_BY_SYMBOL[symbol.toLowerCase()] ?? null;
}

// Returns 1 (enter) / -1 (exit) / 0 (hold) at the LAST bar.
// Entry: weighted vote of recent buy signals from base strategies (within window) ≥ threshold.
// Exit: trailing -10% from peak since entry handled by caller (state-aware).
export function compositeEntrySignal(candles: Candle[], preset: CompositePreset): { fire: boolean; score: number; contributors: string[] } {
  const n = candles.length;
  if (n === 0) return { fire: false, score: 0, contributors: [] };
  let score = 0;
  const contributors: string[] = [];
  for (const [k, w] of Object.entries(preset.weights)) {
    const meta = STRATEGY_MAP[k];
    if (!meta) continue;
    const sigs = meta.fn(candles);
    // any +1 in [n-1-window, n-1]
    let any = false;
    for (let d = 0; d <= preset.window; d++) {
      const idx = n - 1 - d;
      if (idx < 0) break;
      if (sigs[idx] === 1) { any = true; break; }
    }
    if (any) { score += w; contributors.push(k); }
  }
  return { fire: score >= preset.threshold, score, contributors };
}
