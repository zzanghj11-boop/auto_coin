import fs from 'node:fs';
const p = JSON.parse(fs.readFileSync('data/coin_lab/presets.json', 'utf8'));

function rationale(d) {
  const v = (d.regime.annualVol * 100).toFixed(0);
  const t = d.regime.trendR2;
  let r = `연변동성 ${v}%, `;
  if (t > 0.5) r += `높은 추세성 (R^2=${t.toFixed(2)})`;
  else if (t < 0.2) r += `낮은 추세성 (R^2=${t.toFixed(2)}, 횡보형)`;
  else r += `중간 추세성 (R^2=${t.toFixed(2)})`;
  return r;
}

const obj = {};
for (const [id, d] of Object.entries(p)) {
  obj[id] = {
    symbol: d.symbol,
    strategy: d.strategy,
    params: d.params,
    metrics: {
      sharpe: +d.metrics.sharpe.toFixed(3),
      cagr: +d.metrics.cagr.toFixed(4),
      mdd: +d.metrics.mdd.toFixed(4),
      calmar: +d.metrics.calmar.toFixed(3),
      trades: d.metrics.trades,
      winRate: +d.metrics.winRate.toFixed(3),
      totalReturn: +d.metrics.totalReturn.toFixed(4),
    },
    regime: {
      annualVol: +d.regime.annualVol.toFixed(4),
      trendR2: +d.regime.trendR2.toFixed(4),
      hurst: +d.regime.hurst.toFixed(3),
      buyHoldReturn: +d.regime.buyHoldReturn.toFixed(4),
      buyHoldMdd: +d.regime.buyHoldMdd.toFixed(4),
    },
    rationale: rationale(d),
    top3: d.top3.map(t => ({
      strategy: t.strategy, params: t.params,
      sharpe: +t.sharpe.toFixed(3), cagr: +t.cagr.toFixed(4),
      mdd: +t.mdd.toFixed(4), trades: t.trades, winRate: +t.winRate.toFixed(3),
    })),
  };
}

const header = `// AUTO-GENERATED from /scripts/coin_strategy_lab.mjs
// 5년치 일봉 데이터 그리드서치 후 Sharpe 최대 전략 선택
// 재생성: node scripts/coin_strategy_lab.mjs && node scripts/build_presets.mjs

export interface CoinPreset {
  symbol: string;
  strategy: string;
  params: Record<string, number>;
  metrics: { sharpe: number; cagr: number; mdd: number; calmar: number; trades: number; winRate: number; totalReturn: number };
  regime: { annualVol: number; trendR2: number; hurst: number; buyHoldReturn: number; buyHoldMdd: number };
  rationale: string;
  top3: Array<{ strategy: string; params: Record<string, number>; sharpe: number; cagr: number; mdd: number; trades: number; winRate: number }>;
}

export const COIN_PRESETS: Record<string, CoinPreset> = `;

const footer = `;\n\nexport const COIN_PRESET_BY_SYMBOL: Record<string, CoinPreset> = Object.fromEntries(\n  Object.values(COIN_PRESETS).map(p => [p.symbol, p])\n);\n`;

fs.writeFileSync('web/lib/trading/coin_presets.ts', header + JSON.stringify(obj, null, 2) + footer);
console.log('wrote web/lib/trading/coin_presets.ts');
