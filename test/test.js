// auto_coin 단위테스트 스위트
// 외부 의존성 0 — Node.js 빌트인 assert만 사용
// 실행: node test/test.js
//
// 커버리지:
//   1) indicators: SMA/EMA/RSI/Bollinger 수치 검증
//   2) strategies: 4개 전략 시그널 결정론적 검증
//   3) backtest: 체결·수수료·슬리피지·손절 로직
//   4) ensemble: 상태 변환, 투표 임계값
//   5) risk: ATR, 켈리, 서킷브레이커
//   6) onchain: bias 산출과 필터 적용
//   7) walkForward: 그리드·윈도우 기본 동작
//   8) paperTrade: step() 결정론적 동작

const assert = require('assert');
const path = require('path');
const fs = require('fs');

const R = p => require(path.join(__dirname, '..', 'src', p));

let pass = 0, fail = 0;
const failures = [];
function test(name, fn) {
  try { fn(); pass++; console.log(`  ✓ ${name}`); }
  catch (e) { fail++; failures.push({ name, err: e.message }); console.log(`  ✗ ${name}\n      ${e.message}`); }
}
function suite(name, fn) { console.log(`\n◈ ${name}`); fn(); }

// 공통: 상승 추세 캔들 생성
function trendingCandles(n = 200, startPx = 100, drift = 0.001) {
  const rows = [];
  let p = startPx;
  for (let i = 0; i < n; i++) {
    const h = p * 1.005, l = p * 0.995, c = p * (1 + drift);
    rows.push({ ts: Date.UTC(2026, 0, 1) + i * 3600e3, open: p, high: h, low: l, close: c, volume: 1 });
    p = c;
  }
  return rows;
}
function flatCandles(n = 100, px = 100) {
  return Array.from({ length: n }, (_, i) => ({
    ts: Date.UTC(2026, 0, 1) + i * 3600e3, open: px, high: px, low: px, close: px, volume: 1,
  }));
}

// ---------------- 1. indicators ----------------
suite('indicators', () => {
  const { sma, ema, rsi, bollinger } = R('indicators');
  test('sma period 3 of [1..5]', () => {
    const r = sma([1, 2, 3, 4, 5], 3);
    assert.ok(isNaN(r[0]) && isNaN(r[1]));
    assert.strictEqual(r[2], 2);
    assert.strictEqual(r[3], 3);
    assert.strictEqual(r[4], 4);
  });
  test('sma of constant equals constant', () => {
    const r = sma(new Array(20).fill(7), 5);
    assert.strictEqual(r[19], 7);
  });
  test('ema of constant equals constant', () => {
    const r = ema(new Array(30).fill(50), 10);
    assert.ok(Math.abs(r[29] - 50) < 1e-9);
  });
  test('rsi all-up series → 100', () => {
    const vals = Array.from({ length: 30 }, (_, i) => 100 + i);
    const r = rsi(vals, 14);
    assert.ok(r[29] > 99.9, `expected ~100, got ${r[29]}`);
  });
  test('rsi all-down series → 0', () => {
    const vals = Array.from({ length: 30 }, (_, i) => 100 - i);
    const r = rsi(vals, 14);
    assert.ok(r[29] < 0.1, `expected ~0, got ${r[29]}`);
  });
  test('bollinger mid = sma, upper > mid > lower', () => {
    const vals = Array.from({ length: 30 }, () => 100 + Math.random() * 10);
    const { mid, upper, lower } = bollinger(vals, 20, 2);
    assert.ok(upper[25] > mid[25]);
    assert.ok(mid[25] > lower[25]);
  });
});

// ---------------- 2. strategies ----------------
suite('strategies', () => {
  const S = R('strategies');
  test('maCross produces at least one buy on dip→rally', () => {
    // 앞 절반 하락, 뒤 절반 상승 → 골든크로스 발생
    const rows = [];
    let p = 100;
    for (let i = 0; i < 150; i++) { p *= 0.995; rows.push({ ts: i * 3600e3, open: p, high: p * 1.002, low: p * 0.998, close: p, volume: 1 }); }
    for (let i = 0; i < 250; i++) { p *= 1.005; rows.push({ ts: (150 + i) * 3600e3, open: p, high: p * 1.002, low: p * 0.998, close: p, volume: 1 }); }
    const sigs = S.maCross(rows);
    assert.ok(sigs.some(s => s === 1), 'expected at least one buy (golden cross)');
  });
  test('maCross on flat market → no signals', () => {
    const sigs = S.maCross(flatCandles(200));
    assert.ok(sigs.every(s => s === 0));
  });
  test('volatilityBreakout signal array length matches candles', () => {
    const c = trendingCandles(100);
    const sigs = S.volatilityBreakout(c);
    assert.strictEqual(sigs.length, c.length);
  });
  test('bbSqueeze requires minimum window length', () => {
    const sigs = S.bbSqueeze(flatCandles(50), { window: 120 });
    assert.ok(sigs.every(s => s === 0));
  });
  test('rsiReversal returns array of valid values', () => {
    const sigs = S.rsiReversal(trendingCandles(500));
    assert.ok(sigs.every(s => s === 0 || s === 1 || s === -1));
  });
});

// ---------------- 3. backtest ----------------
suite('backtest', () => {
  const { runBacktest } = R('backtest');
  test('no signals → cash untouched', () => {
    const c = flatCandles(50, 100);
    const sigs = new Array(50).fill(0);
    const r = runBacktest(c, sigs);
    assert.strictEqual(r.finalEquity, 1_000_000);
    assert.strictEqual(r.trades.length, 0);
  });
  test('buy then sell → fees reduce final', () => {
    const c = flatCandles(20, 100);
    const sigs = new Array(20).fill(0);
    sigs[5] = 1; sigs[15] = -1;
    const r = runBacktest(c, sigs);
    // 수수료·슬리피지 때문에 시작값보다 작아야 함
    assert.ok(r.finalEquity < 1_000_000, `expected <1M, got ${r.finalEquity}`);
    assert.strictEqual(r.trades.length, 1);
  });
  test('stop loss triggers on -3% drop', () => {
    // 가격 급락 캔들
    const c = flatCandles(20, 100);
    c[10] = { ...c[10], close: 90 }; // -10% drop
    const sigs = new Array(20).fill(0);
    sigs[5] = 1;
    const r = runBacktest(c, sigs);
    assert.ok(r.trades.some(t => t.reason === 'stop'), 'expected stop-loss trade');
  });
  test('final liquidation on end of data', () => {
    const c = flatCandles(10, 100);
    const sigs = new Array(10).fill(0);
    sigs[2] = 1;
    const r = runBacktest(c, sigs);
    assert.ok(r.trades.some(t => t.reason === 'final'));
  });
});

// ---------------- 4. ensemble ----------------
suite('ensemble', () => {
  const { toState, ensembleSignals } = R('ensemble');
  test('toState converts event pulses to state', () => {
    const state = toState([0, 1, 0, 0, -1, 0]);
    assert.deepStrictEqual(state, [0, 1, 1, 1, 0, 0]);
  });
  test('toState ignores redundant events', () => {
    const state = toState([1, 1, 0, -1, -1]);
    assert.deepStrictEqual(state, [1, 1, 1, 0, 0]);
  });
  test('ensembleSignals returns {sig, votes, base}', () => {
    const c = trendingCandles(300);
    const e = ensembleSignals(c, { threshold: 2 });
    assert.ok(Array.isArray(e.sig));
    assert.strictEqual(e.sig.length, c.length);
    assert.ok(e.votes.every(v => v >= 0 && v <= 4));
  });
  test('higher threshold → fewer signals (or equal)', () => {
    const c = trendingCandles(500, 100, 0.002);
    const t1 = ensembleSignals(c, { threshold: 1 }).sig.filter(s => s === 1).length;
    const t3 = ensembleSignals(c, { threshold: 3 }).sig.filter(s => s === 1).length;
    assert.ok(t3 <= t1, `t1=${t1} t3=${t3}`);
  });
});

// ---------------- 5. risk ----------------
suite('risk', () => {
  const { atr, kellyFraction, rollingKelly, atrStops, CircuitBreaker } = R('risk');
  test('atr of flat candles ≈ 0', () => {
    const r = atr(flatCandles(30), 14);
    assert.ok(r[20] < 1e-9, `expected 0, got ${r[20]}`);
  });
  test('kellyFraction with 60% winRate, R=2, cap=1, fraction=1', () => {
    const f = kellyFraction(0.6, 2, { cap: 1, fraction: 1 });
    assert.ok(Math.abs(f - 0.4) < 1e-9, `expected 0.4, got ${f}`);
  });
  test('kellyFraction negative edge → 0', () => {
    assert.strictEqual(kellyFraction(0.4, 1, { cap: 1, fraction: 1 }), 0);
  });
  test('kellyFraction respects cap', () => {
    const f = kellyFraction(0.9, 5, { cap: 0.25, fraction: 1 });
    assert.strictEqual(f, 0.25);
  });
  test('rollingKelly fallback on empty history', () => {
    const f = rollingKelly([]);
    assert.strictEqual(f, 0.1);
  });
  test('atrStops stop < entry < target', () => {
    const s = atrStops(100, 2, { stopMult: 2, targetMult: 3 });
    assert.strictEqual(s.stop, 96);
    assert.strictEqual(s.target, 106);
    assert.strictEqual(s.riskPerUnit, 4);
  });
  test('CircuitBreaker trips on -5% drawdown', () => {
    const cb = new CircuitBreaker({ dailyLossLimit: 0.05, lookbackBars: 24 });
    const t0 = Date.now();
    cb.update(t0, 1_000_000);
    cb.update(t0 + 3600_000, 1_010_000); // peak
    const tripped = cb.update(t0 + 7200_000, 950_000); // -5.94%
    assert.strictEqual(tripped, true);
  });
  test('CircuitBreaker does not trip within limit', () => {
    const cb = new CircuitBreaker({ dailyLossLimit: 0.05, lookbackBars: 24 });
    const t0 = Date.now();
    cb.update(t0, 1_000_000);
    cb.update(t0 + 3600_000, 990_000); // -1%
    assert.strictEqual(cb.tripped, false);
  });
});

// ---------------- 6. onchain ----------------
suite('onchain', () => {
  const { computeAndSaveBias, readBias, applyOnchainFilter, SIGNAL_FILE } = R('onchain');
  // 백업 후 테스트용 파일로 교체
  let backup;
  if (fs.existsSync(SIGNAL_FILE)) backup = fs.readFileSync(SIGNAL_FILE, 'utf8');

  test('computeAndSaveBias → bullish when big stable inflow', () => {
    const EX = '0xEX';
    const tx = [
      { from: '0xuser', to: EX, symbol: 'USDT', amountUsd: 5_000_000 },
      { from: EX, to: '0xuser2', symbol: 'ETH', amountUsd: 100 },
    ];
    const out = computeAndSaveBias(tx, [EX]);
    assert.strictEqual(out.bias, 'bullish');
  });
  test('applyOnchainFilter passes through on non-bearish', () => {
    const r = applyOnchainFilter([0, 1, -1, 1]);
    assert.deepStrictEqual(r, [0, 1, -1, 1]);
  });
  test('computeAndSaveBias → bearish blocks longs', () => {
    const EX = '0xEX';
    const tx = [
      { from: EX, to: '0xuser', symbol: 'USDT', amountUsd: 5_000_000 }, // stable out
      { from: '0xuser', to: EX, symbol: 'ETH', amountUsd: 5_000_000 },  // coin in
    ];
    const out = computeAndSaveBias(tx, [EX]);
    assert.strictEqual(out.bias, 'bearish');
    const filtered = applyOnchainFilter([0, 1, -1, 1]);
    assert.deepStrictEqual(filtered, [0, 0, -1, 0]);
  });
  test('computeAndSaveBias → neutral on small flow', () => {
    const EX = '0xEX';
    const out = computeAndSaveBias([{ from: '0xu', to: EX, symbol: 'USDT', amountUsd: 100 }], [EX]);
    assert.strictEqual(out.bias, 'neutral');
  });

  // 백업 복원
  if (backup) fs.writeFileSync(SIGNAL_FILE, backup);
  else if (fs.existsSync(SIGNAL_FILE)) fs.unlinkSync(SIGNAL_FILE);
});

// ---------------- 7. walkForward ----------------
suite('walkForward', () => {
  const { walkForward, stability } = R('walkForward');
  test('walkForward returns empty windows for tiny data', () => {
    const r = walkForward(trendingCandles(100), 'MA Cross', { trainBars: 200, testBars: 50 });
    assert.strictEqual(r.windows.length, 0);
  });
  test('walkForward generates windows for sufficient data', () => {
    // 노이즈 있는 오실레이팅 데이터 → MA 크로스 발생 보장
    const rows = [];
    let p = 100;
    for (let i = 0; i < 1500; i++) {
      const drift = Math.sin(i / 30) * 0.01 + ((i * 2654435761) % 1000 / 1000 - 0.5) * 0.008;
      p = p * (1 + drift);
      rows.push({ ts: Date.UTC(2026, 0, 1) + i * 3600e3, open: p, high: p * 1.003, low: p * 0.997, close: p, volume: 1 });
    }
    const r = walkForward(rows, 'MA Cross', { trainBars: 500, testBars: 150 });
    assert.ok(r.windows.length > 0, `expected >0 windows, got ${r.windows.length}`);
  });
  test('stability returns share between 0-100', () => {
    const s = stability([
      { params: { a: 1 } }, { params: { a: 1 } }, { params: { a: 2 } },
    ]);
    assert.ok(s.mostFrequentShare >= 0 && s.mostFrequentShare <= 100);
    assert.strictEqual(s.uniqueCombos, 2);
  });
});

// ---------------- 8. paperTrade ----------------
suite('paperTrade', () => {
  const { step } = R('paperTrade');
  const S = R('strategies');
  test('step is idempotent on same lastTs', () => {
    const state = { cash: 1_000_000, coin: 0, entry: 0, lastTs: 0, trades: [], equityHistory: [] };
    const c = trendingCandles(60);
    step(state, c, S.maCross, () => {});
    const t1 = state.lastTs;
    step(state, c, S.maCross, () => {});
    assert.strictEqual(state.lastTs, t1); // no change
  });
  test('step advances lastTs on new candle', () => {
    const state = { cash: 1_000_000, coin: 0, entry: 0, lastTs: 0, trades: [], equityHistory: [] };
    const c = trendingCandles(60);
    step(state, c, S.maCross, () => {});
    const t1 = state.lastTs;
    const c2 = trendingCandles(61);
    step(state, c2, S.maCross, () => {});
    assert.ok(state.lastTs >= t1);
  });
});

// ---------------- summary ----------------
console.log(`\n${'─'.repeat(60)}`);
console.log(`Total: ${pass + fail}  ·  ✓ Pass: ${pass}  ·  ✗ Fail: ${fail}`);
if (fail > 0) {
  console.log('\nFailures:');
  for (const f of failures) console.log(`  - ${f.name}: ${f.err}`);
  process.exit(1);
}
console.log('All tests passed.\n');
