// 온체인 시그널 필터
//
// 개념
// ------
// 가격 차트만으로는 놓치는 "대형 자금 이동"을 보조 시그널로 쓴다.
// 가장 잘 알려진 on-chain 지표 두 가지:
//   1) 거래소 순유입(Exchange Netflow):
//      - 코인(ETH/BTC)이 거래소로 대량 입금 → 매도 압력 ↑ (bearish)
//      - 코인이 거래소 밖으로 출금 → 자가 보관/장기 보유 → (bullish)
//   2) 스테이블코인 거래소 보유고(USDT/USDC reserves):
//      - 거래소에 USDT 쌓임 → 매수 대기 자금 ↑ (bullish)
//      - 거래소 밖으로 USDT 유출 → 매수 여력 ↓ (bearish)
//
// 구현
// ------
// Blockscout MCP로 실제 데이터를 가져오는 부분은 Node.js 외부(Claude MCP 환경 또는
// 스케줄 태스크)에서 실행되어 `onchain_signal.json` 파일로 저장된다.
// 이 모듈은 그 파일을 읽어 "bias"를 반환하고, 전략 시그널에 필터로 씌운다.
//
// onchain_signal.json 스키마:
// {
//   "updated": "2026-04-06T09:00:00Z",
//   "bias": "bullish" | "neutral" | "bearish",
//   "signals": {
//     "binance_usdt_netflow_24h": 1234567,   // + = 거래소로 유입(bullish)
//     "eth_exchange_netflow_24h": -8900      // - = 거래소에서 유출(bullish)
//   },
//   "notes": "string"
// }
//
// 전략 필터 규칙
// - bias=bearish: 롱 신규 진입 차단 (기존 포지션은 유지 가능)
// - bias=bullish: 필터 통과, 진입 허용
// - bias=neutral: 필터 통과
// - 파일이 없거나 24시간 이상 오래되면 neutral 취급 (fail-safe)

const fs = require('fs');
const path = require('path');

const SIGNAL_FILE = path.join(__dirname, '..', 'data', 'onchain_signal.json');
const STALE_MS = 24 * 3600 * 1000;

function readBias() {
  if (!fs.existsSync(SIGNAL_FILE)) return { bias: 'neutral', reason: 'no-file' };
  try {
    const j = JSON.parse(fs.readFileSync(SIGNAL_FILE, 'utf8'));
    const updated = new Date(j.updated).getTime();
    if (Date.now() - updated > STALE_MS) return { bias: 'neutral', reason: 'stale' };
    return { bias: j.bias || 'neutral', reason: 'ok', signals: j.signals };
  } catch (e) {
    return { bias: 'neutral', reason: 'parse-error' };
  }
}

/**
 * 시그널 배열에 온체인 필터 적용.
 * bearish면 매수(1)를 0으로 차단. 매도(-1)는 그대로.
 */
function applyOnchainFilter(signals) {
  const { bias } = readBias();
  if (bias !== 'bearish') return signals;
  return signals.map(s => (s === 1 ? 0 : s));
}

/**
 * Claude 스케줄 태스크에서 호출할 헬퍼.
 * MCP 결과(원시 트랜스퍼 배열)를 받아 bias를 산출하여 파일로 저장.
 *
 * @param {Array<{from:string,to:string,amountUsd:number,symbol:string}>} transfers
 * @param {string[]} exchangeAddresses 소문자 주소 리스트
 */
function computeAndSaveBias(transfers, exchangeAddresses, extraNotes = '') {
  const exSet = new Set(exchangeAddresses.map(a => a.toLowerCase()));
  let stableIn = 0, stableOut = 0, coinIn = 0, coinOut = 0;
  const STABLES = new Set(['USDT', 'USDC', 'DAI']);
  for (const t of transfers) {
    const toEx = exSet.has(t.to.toLowerCase());
    const fromEx = exSet.has(t.from.toLowerCase());
    if (!toEx && !fromEx) continue;
    const isStable = STABLES.has(t.symbol);
    if (toEx) isStable ? stableIn += t.amountUsd : coinIn += t.amountUsd;
    else      isStable ? stableOut += t.amountUsd : coinOut += t.amountUsd;
  }
  const stableNet = stableIn - stableOut;     // + → 매수대기 자금 유입
  const coinNet = coinIn - coinOut;           // + → 매도압력
  // 결합 스코어: 스테이블 유입은 +, 코인 유입은 −
  const score = stableNet - coinNet;
  let bias = 'neutral';
  if (score > 1_000_000) bias = 'bullish';
  else if (score < -1_000_000) bias = 'bearish';

  const out = {
    updated: new Date().toISOString(),
    bias,
    signals: {
      stable_netflow_usd: stableNet,
      coin_netflow_usd: coinNet,
      combined_score: score,
    },
    notes: extraNotes,
  };
  fs.mkdirSync(path.dirname(SIGNAL_FILE), { recursive: true });
  fs.writeFileSync(SIGNAL_FILE, JSON.stringify(out, null, 2));
  return out;
}

module.exports = { readBias, applyOnchainFilter, computeAndSaveBias, SIGNAL_FILE };
