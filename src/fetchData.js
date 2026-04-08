// HTX(Huobi) 공개 REST API - 과거 캔들 수집
// Docs: https://huobiapi.github.io/docs/spot/v1/en/#get-klines-candles
// 엔드포인트: GET https://api.huobi.pro/market/history/kline
// size 최대 2000. 긴 구간은 여러번 호출 + 시점 잘라 merge 해야함(간단 버전).
const fs = require('fs');
const path = require('path');

const BASE = 'https://api.huobi.pro';

/**
 * @param {string} symbol 예: 'btcusdt'
 * @param {string} period '1min','5min','15min','30min','60min','4hour','1day','1week'
 * @param {number} size 최대 2000
 */
async function fetchKlines(symbol = 'btcusdt', period = '60min', size = 2000) {
  // lazy-require axios so that other modules can require fetchData without axios installed
  const axios = require('axios');
  const url = `${BASE}/market/history/kline`;
  const { data } = await axios.get(url, { params: { symbol, period, size } });
  if (data.status !== 'ok') throw new Error('HTX API error: ' + JSON.stringify(data));
  // HTX는 최신→과거 순으로 내려줌. 오래된 순으로 뒤집어서 저장.
  const rows = data.data
    .map(k => ({
      ts: k.id * 1000, // 초 → ms
      open: k.open,
      high: k.high,
      low: k.low,
      close: k.close,
      volume: k.amount, // base asset volume
    }))
    .sort((a, b) => a.ts - b.ts);
  return rows;
}

async function main() {
  const symbol = process.argv[2] || 'btcusdt';
  const period = process.argv[3] || '60min';
  const rows = await fetchKlines(symbol, period, 2000);
  const outDir = path.join(__dirname, '..', 'data');
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `${symbol}_${period}.json`);
  fs.writeFileSync(outFile, JSON.stringify(rows));
  console.log(`saved ${rows.length} candles → ${outFile}`);
  console.log(`range: ${new Date(rows[0].ts).toISOString()} ~ ${new Date(rows.at(-1).ts).toISOString()}`);
}

if (require.main === module) main().catch(e => { console.error(e.message); process.exit(1); });

module.exports = { fetchKlines };
