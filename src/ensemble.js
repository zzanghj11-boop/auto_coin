// 앙상블 메타 전략
// 4개 베이스 전략의 시그널을 투표(voting)로 결합하여 잡음을 줄이고 안정성을 높인다.
//
// 설계 원칙
// - 각 전략은 "상태 시그널"을 갖는다: 1(롱 유지), 0(중립). 진입 이벤트에서 1로 전환, 청산 이벤트에서 0으로 복귀.
// - 앙상블 스코어 = Σ(상태 시그널)  (0~4)
// - 진입 임계값 threshold 이상이면 롱 진입, 임계값 미만으로 떨어지면 청산.
// - 기본 threshold=2 (과반수). 상향시 보수적, 하향시 공격적.
//
// 단일 전략 대비 장점: 특정 전략의 과최적화/우연 손실이 희석된다.
// 단점: 추세 전환 포착이 느려진다. 횡보장에서 signal이 거의 안 나올 수 있다.

const S = require('./strategies');
const { runBacktest, metrics } = require('./backtest');

// 이벤트 시그널(1/-1/0)을 상태 시그널(1/0)로 변환
function toState(events) {
  const state = new Array(events.length).fill(0);
  let on = false;
  for (let i = 0; i < events.length; i++) {
    if (events[i] === 1) on = true;
    else if (events[i] === -1) on = false;
    state[i] = on ? 1 : 0;
  }
  return state;
}

function ensembleSignals(candles, { threshold = 2 } = {}) {
  const base = {
    ma:  toState(S.maCross(candles)),
    rsi: toState(S.rsiReversal(candles)),
    bb:  toState(S.bbSqueeze(candles)),
    vb:  toState(S.volatilityBreakout(candles)),
  };
  const votes = new Array(candles.length).fill(0);
  for (let i = 0; i < candles.length; i++) {
    votes[i] = base.ma[i] + base.rsi[i] + base.bb[i] + base.vb[i];
  }
  // 투표를 다시 이벤트 시그널로 변환
  const sig = new Array(candles.length).fill(0);
  let inPos = false;
  for (let i = 1; i < candles.length; i++) {
    const wantIn = votes[i] >= threshold;
    if (wantIn && !inPos) { sig[i] = 1; inPos = true; }
    else if (!wantIn && inPos) { sig[i] = -1; inPos = false; }
  }
  return { sig, votes, base };
}

function main() {
  // 독립 실행 시: 샘플 데이터로 4개 베이스 + 앙상블(threshold 1,2,3) 비교
  const fs = require('fs');
  const path = require('path');
  const symbol = process.argv[2] || 'btcusdt';
  const period = process.argv[3] || '60min';
  const f = path.join(__dirname, '..', 'data', `${symbol}_${period}.json`);
  let candles;
  if (fs.existsSync(f)) candles = JSON.parse(fs.readFileSync(f, 'utf8'));
  else {
    console.log('⚠️  실데이터 없음 — 랜덤워크 1500봉으로 비교');
    candles = []; let p = 50000;
    for (let i = 0; i < 1500; i++) {
      const o = p, h = p*(1+Math.random()*0.015), l = p*(1-Math.random()*0.015);
      const c = p*(1+(Math.random()-0.49)*0.02);
      candles.push({ ts: Date.UTC(2026,0,1)+i*3600e3, open:o, high:h, low:l, close:c, volume:1 });
      p = c;
    }
  }

  const rows = [];
  const push = (name, sig) => {
    const r = runBacktest(candles, sig);
    rows.push({ strategy: name, ...metrics(1_000_000, r) });
  };
  push('MA Cross',      S.maCross(candles));
  push('RSI 역추세',    S.rsiReversal(candles));
  push('볼린저 스퀴즈', S.bbSqueeze(candles));
  push('변동성 돌파',   S.volatilityBreakout(candles));
  for (const t of [1, 2, 3]) {
    const { sig } = ensembleSignals(candles, { threshold: t });
    push(`앙상블 (threshold=${t})`, sig);
  }
  console.log(`\n=== ${symbol.toUpperCase()} / ${period} / ${candles.length} candles ===`);
  console.table(rows);
  const bh = ((candles.at(-1).close / candles[0].close - 1) * 100).toFixed(2);
  console.log(`[벤치마크] Buy & Hold: ${bh}%`);
  console.log('\n해석 가이드: 앙상블은 단일 전략보다 MDD가 작으면 성공. threshold=2가 기본.');
}

if (require.main === module) main();
module.exports = { ensembleSignals, toState };
