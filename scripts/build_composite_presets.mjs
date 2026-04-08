import fs from 'node:fs';
import path from 'node:path';

const PERIODS = ['1day', '4hour', '60min'];
const DIR = 'data/coin_lab';

function transform(j, period) {
  const obj = {};
  for (const [id, d] of Object.entries(j)) {
    obj[id] = {
      coin: id,
      symbol: d.symbol,
      period,
      candles: d.candles,
      span: d.span,
      swings: d.swings,
      weights: d.weights,
      threshold: d.threshold,
      window: 3,
      strategyStats: Object.fromEntries(Object.entries(d.strategyStats).map(([k, s]) => [k, {
        train_precision: +s.train.precision.toFixed(3),
        train_recall: +s.train.recall.toFixed(3),
        train_f1: +s.train.f1.toFixed(3),
        train_fires: s.train.fires,
        test_precision: +s.test.precision.toFixed(3),
        test_recall: +s.test.recall.toFixed(3),
      }])),
      backtest: {
        train: { sharpe: +d.backtest.train.sharpe.toFixed(3), cagr: +d.backtest.train.cagr.toFixed(4), mdd: +d.backtest.train.mdd.toFixed(4), trades: d.backtest.train.trades, winRate: +d.backtest.train.winRate.toFixed(3) },
        test:  { sharpe: +d.backtest.test.sharpe.toFixed(3),  cagr: +d.backtest.test.cagr.toFixed(4),  mdd: +d.backtest.test.mdd.toFixed(4),  trades: d.backtest.test.trades,  winRate: +d.backtest.test.winRate.toFixed(3) },
        full:  { sharpe: +d.backtest.full.sharpe.toFixed(3),  cagr: +d.backtest.full.cagr.toFixed(4),  mdd: +d.backtest.full.mdd.toFixed(4),  trades: d.backtest.full.trades,  winRate: +d.backtest.full.winRate.toFixed(3) },
      },
    };
  }
  return obj;
}

const all = {}; // { period: { coinId: preset } }
for (const period of PERIODS) {
  const f = path.join(DIR, `composite_result_${period}.json`);
  if (!fs.existsSync(f)) { console.log(`skip ${period} (no file)`); continue; }
  const j = JSON.parse(fs.readFileSync(f, 'utf8'));
  all[period] = transform(j, period);
}

const header = `// AUTO-GENERATED from /scripts/composite_strategy_lab.mjs + build_composite_presets.mjs
// Per-coin composite strategy across multiple periods (1day / 4hour / 60min).
// Runtime evaluator: lib/trading/composite.ts
// Regenerate: node scripts/composite_strategy_lab.mjs && node scripts/build_composite_presets.mjs

export interface CompositePreset {
  coin: string;
  symbol: string;
  period: string;
  candles: number;
  span: { from: number; to: number };
  swings: { lows: number; highs: number };
  weights: Record<string, number>;
  threshold: number;
  window: number;
  strategyStats: Record<string, { train_precision: number; train_recall: number; train_f1: number; train_fires: number; test_precision: number; test_recall: number }>;
  backtest: {
    train: { sharpe: number; cagr: number; mdd: number; trades: number; winRate: number };
    test:  { sharpe: number; cagr: number; mdd: number; trades: number; winRate: number };
    full:  { sharpe: number; cagr: number; mdd: number; trades: number; winRate: number };
  };
}

// keyed by period → coinId
export const COMPOSITE_PRESETS_BY_PERIOD: Record<string, Record<string, CompositePreset>> = `;

const footer = `;

// Backward-compat: 1day presets at top level
export const COMPOSITE_PRESETS: Record<string, CompositePreset> = COMPOSITE_PRESETS_BY_PERIOD['1day'] ?? {};

export const COMPOSITE_BY_SYMBOL: Record<string, CompositePreset> = Object.fromEntries(
  Object.values(COMPOSITE_PRESETS).map(p => [p.symbol, p])
);

// Lookup by (symbol, period)
export function getCompositeFor(symbol: string, period: string): CompositePreset | null {
  const bucket = COMPOSITE_PRESETS_BY_PERIOD[period];
  if (!bucket) return null;
  return Object.values(bucket).find(p => p.symbol === symbol.toLowerCase()) ?? null;
}
`;

fs.writeFileSync('web/lib/trading/composite_presets.ts', header + JSON.stringify(all, null, 2) + footer);
console.log('wrote web/lib/trading/composite_presets.ts');
