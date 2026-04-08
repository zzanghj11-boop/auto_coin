# Auto-Coin 사용 매뉴얼

Node.js 기반 암호화폐 자동매매 연구/실행 툴킷입니다. HTX(Huobi) 데이터로 백테스트·최적화·페이퍼트레이딩·실시간 대시보드까지 엔드투엔드로 커버합니다. **기본은 모의(DryRun)** 이며, 실거래 승격은 명시적으로 스위치를 바꿔야 동작합니다.

---

## 1. 사전 준비

- Node.js 18+ (외부 의존성 없이 동작하도록 설계됨)
- `data/` 디렉터리에 상태·로그가 누적됩니다 (자동 생성)
- HTX REST API는 지역 차단이 있을 수 있으며, 실패 시 백테스트는 랜덤워크 폴백으로 진행됩니다
- 실거래 승격 시에만 `HTX_KEY` / `HTX_SECRET` 환경변수가 필요합니다

```bash
cd auto_coin
node -v            # 18 이상 확인
```

---

## 2. 전체 디렉터리 구조

| 경로 | 설명 |
|---|---|
| `src/fetchData.js` | HTX kline 수집 (axios lazy-require) |
| `src/indicators.js` | SMA / EMA / RSI / Bollinger |
| `src/strategies.js` | MA Cross, RSI 역추세, BB 스퀴즈, 변동성 돌파 |
| `src/backtest.js` | 기본 백테스터 (수수료 0.2%, 슬립 0.05%, 스톱 -3%) |
| `src/backtestRisk.js` | ATR 스톱 + Kelly 사이징 + 서킷브레이커 |
| `src/optimize.js` | 파라미터 그리드 최적화 + Train/Test 분할 |
| `src/walkForward.js` | 롤링/앵커드 워크포워드 |
| `src/ensemble.js` | 4전략 투표 앙상블 |
| `src/multiAsset.js` | 멀티 종목 + 상관관계 매트릭스 |
| `src/risk.js` | ATR · Kelly · CircuitBreaker |
| `src/onchain.js` | Blockscout 온체인 바이어스 필터 |
| `src/paperTrade.js` | 페이퍼트레이딩 실시간 루프 |
| `src/liveDashboard.js` | **페이퍼트레이드 실시간 대시보드 (본 매뉴얼의 핵심)** |
| `src/dashboard.js` | 백테스트 결과 정적 HTML 대시보드 |
| `src/server.js` | 통합 웹 서버 (실행 제어 + 상태 조회) |
| `src/htxTrader.js` | HTX 서명 요청 래퍼 (DryRun 기본) |
| `src/run.js` | 통합 CLI 러너 (`--steps`, `--skip`, …) |
| `test/test.js` | 단위 테스트 스위트 (36 tests) |

---

## 3. 빠른 시작 — 5분 체험

```bash
# 3-1. 단위 테스트 (구성 검증)
node test/test.js

# 3-2. 백테스트 → 대시보드 생성
node src/run.js --symbol btcusdt --period 60min

# 3-3. 페이퍼트레이딩 시작 (터미널 A)
node src/paperTrade.js btcusdt 60min ma

# 3-4. 라이브 대시보드 시작 (터미널 B)
node src/liveDashboard.js btcusdt 60min ma 8788
# → 브라우저에서 http://localhost:8788
```

---

## 4. 페이퍼트레이딩 + 라이브 대시보드 (핵심 워크플로우)

### 4-1. 아키텍처

```
 ┌──────────────────────┐     data/paper_*.json      ┌──────────────────────┐
 │   paperTrade.js      │  ─────────────────────▶    │  liveDashboard.js    │
 │  (HTX 폴링 → 체결)   │     data/paper_*.log       │  (SSE 푸시 1s)       │
 └──────────────────────┘                            └──────────┬───────────┘
                                                                │
                                                                ▼
                                                        브라우저 (Chart.js)
```

- 두 프로세스는 **파일로만** 통신합니다. 페이퍼트레이드가 죽어도 대시보드는 마지막 상태를 계속 보여줍니다.
- 대시보드는 상태 파일을 1초마다 읽어 SSE(`/events`)로 푸시합니다.

### 4-2. 실행 절차

**터미널 A — 페이퍼트레이드**
```bash
node src/paperTrade.js <symbol> <period> <strategy>
# 예: node src/paperTrade.js btcusdt 60min ma
```
- `symbol`: `btcusdt`, `ethusdt`, …
- `period`: `1min` / `5min` / `15min` / `30min` / `60min` / `4hour` / `1day`
- `strategy`: `ma` (MA Cross) · `rsi` (RSI 역추세) · `bb` (볼밴 스퀴즈) · `vb` (변동성 돌파)
- 종료: `Ctrl+C` — 상태는 `data/paper_<sym>_<per>_<strat>.json`에 저장되어 재시작 시 이어짐

**터미널 B — 라이브 대시보드**
```bash
node src/liveDashboard.js <symbol> <period> <strategy> [port]
# 예: node src/liveDashboard.js btcusdt 60min ma 8788
```
→ 브라우저: `http://localhost:8788`

### 4-3. 대시보드 화면 구성

| 영역 | 보여주는 것 |
|---|---|
| **KPI 바** | 현재 Equity · 누적 수익률 · 체결 건수(W/L) · 현재 포지션 |
| **Equity Curve** | 자산 곡선 (시작 ₩1,000,000 기준) |
| **Price & Trades** | 가격 라인 + Buy(초록 △) / Sell(빨강 ◇) 마커 |
| **Recent Trades** | 최근 12건 체결 내역 (스톱 체결은 ⛔) |
| **Log Tail** | `paper_*.log` 마지막 50줄 실시간 tail |
| 상단 🟢 점 | 1초 업데이트 heartbeat |

### 4-4. 자주 묻는 것

- **Q. 대시보드가 비어 있어요** → 페이퍼트레이드가 아직 첫 봉을 못 받은 상태. 1~2분 기다리거나 `period`를 `1min`으로 낮춰서 테스트.
- **Q. HTX가 차단돼요** → `fetchData.js`에서 에러 로그가 뜨지만 백테스트는 랜덤워크 폴백으로 동작. 페이퍼트레이드는 실 데이터가 필요하므로 VPN/다른 지역 필요.
- **Q. 포트 충돌** → `liveDashboard.js` 4번째 인자로 다른 포트 지정.
- **Q. 여러 전략을 동시에 보고 싶어요** → 서로 다른 `<symbol>_<period>_<strategy>` 조합은 독립된 상태 파일을 쓰므로, 터미널 여러 개에서 동시 실행 가능. 대시보드도 조합별로 포트만 다르게 띄우면 됨.

---

## 5. 백테스트 / 최적화 / 워크포워드

### 5-1. 기본 백테스트
```bash
node src/backtest.js btcusdt 60min ma
```
결과: `data/backtest_<...>.json` + `dashboard_<...>.html`

### 5-2. 리스크 강화 백테스트 (ATR + Kelly + CB)
```bash
node src/backtestRisk.js btcusdt 60min ma
```

### 5-3. 파라미터 최적화
```bash
node src/optimize.js btcusdt 60min ma
```
- Train 70% / Test 30% 분할
- Calmar 비율로 랭킹 · 최소 5 트레이드 필터

### 5-4. 워크포워드
```bash
node src/walkForward.js btcusdt 60min ma rolling
# 또는 anchored
```
- 창별 OOS 수익 복리 누적
- **Parameter Stability > 40%** 이면 현실적, 미달이면 과최적화 의심

### 5-5. 앙상블
```bash
node src/ensemble.js btcusdt 60min
```
- 4전략을 state화 → threshold 투표(기본 2표)

### 5-6. 멀티 종목 + 상관도
```bash
node src/multiAsset.js btcusdt,ethusdt,xrpusdt 60min ma
```
- 1/N 포트폴리오 vs 개별 평균 MDD 비교 → 분산효과 정량화

---

## 6. 통합 CLI 러너 `run.js`

8 단계를 한 번에:
```bash
node src/run.js --symbol btcusdt --period 60min
node src/run.js --skip walkforward,onchain
node src/run.js --steps backtest,dashboard
```
| 단계 | 내용 |
|---|---|
| 1 | fetch (HTX 수집) |
| 2 | backtest (4전략) |
| 3 | optimize (그리드) |
| 4 | walkforward |
| 5 | multiasset |
| 6 | ensemble |
| 7 | onchain (파일 기반) |
| 8 | dashboard (HTML 생성) |

---

## 7. 리스크 관리 플래그

| 항목 | 기본값 | 위치 |
|---|---|---|
| 수수료 | 0.2% | `backtest.js` `FEE` |
| 슬리피지 | 0.05% | `SLIP` |
| 하드 스톱 | -3% | `STOP` |
| ATR 스톱 / 타겟 | 2×ATR / 3×ATR | `risk.js` `atrStops` |
| Kelly 캡 | 25% (half-kelly) | `risk.js` `kellyFraction` |
| 서킷브레이커 | 일 -5%, 24h 리셋 | `risk.js` `CircuitBreaker` |

---

## 8. 실거래 승격 (주의)

`src/htxTrader.js`는 기본 `dryRun: true`. 승격 절차:

1. HTX API 키 발급 · 권한 확인 (IP 화이트리스트 권장)
2. 환경변수: `HTX_KEY`, `HTX_SECRET`
3. `htxTrader.js`의 `DRY_RUN` 플래그를 `false`로 전환
4. `paperTrade.js` 내 주문 호출부를 `htxTrader.marketOrder`로 스위치
5. **최소 금액**으로 하루 단위 소프트 런칭 → 로그 검증

> ⚠️ 소액이어도 첫 실거래는 반드시 사람이 지켜보는 상태에서 시작하세요. 서킷브레이커는 최후 방어선일 뿐 1차 방어선이 아닙니다.

---

## 9. 단위 테스트

```bash
node test/test.js
# Total: 36 · ✓ Pass: 36 · ✗ Fail: 0
```
커버리지: indicators · strategies · backtest · ensemble · risk · onchain · walkForward · paperTrade

---

## 10. 트러블슈팅 요약

| 증상 | 원인 / 해결 |
|---|---|
| `MODULE_NOT_FOUND axios` | HTX 호출 시 npm 차단 환경 → 백테스트는 랜덤워크 폴백으로 실행됨. 페이퍼트레이드는 axios 필요 → `npm i axios` 또는 네트워크 허용 |
| 대시보드가 업데이트 안 됨 | 페이퍼트레이드가 실행 중인지, state 파일 경로가 일치하는지 확인 |
| 워크포워드 윈도우 0개 | 데이터가 `trainBars + testBars` 보다 짧음. 더 많은 캔들을 받아오거나 `trainBars` 축소 |
| `stability < 40%` | 과최적화 시그널. 파라미터 그리드 축소 또는 OOS 기간 확대 |

---

끝. 새 전략을 추가하려면 `strategies.js`에 함수를 추가하고 `paperTrade.js`의 `STRATEGY_MAP`에 등록하면 대시보드까지 자동 연동됩니다.
