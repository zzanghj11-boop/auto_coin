# auto_coin — HTX 기반 코인 자동매매 + 백테스트 (Node.js)

4개 고전 차트 매매기법(MA Cross / RSI 역추세 / 볼린저밴드 스퀴즈 / 변동성 돌파)을 HTX(Huobi) 현물 데이터로 백테스트하고, 검증된 전략만 실거래로 승격하는 파이프라인입니다.

## 구조
```
auto_coin/
├── STRATEGY.md          # 매매기법 분석 문서 (꼭 먼저 읽을 것)
├── package.json
└── src/
    ├── fetchData.js     # HTX REST로 과거 캔들 수집
    ├── indicators.js    # SMA/EMA/RSI/Bollinger
    ├── strategies.js    # 4개 전략 시그널 엔진
    ├── backtest.js      # 롱-온리 백테스트 + 성과지표
    └── htxTrader.js     # 실거래 주문 래퍼 (기본 dryRun)
```

## 사용법
```bash
cd auto_coin
npm install
# 1) 데이터 수집 (기본: BTC/USDT 1시간봉 2000개)
node src/fetchData.js btcusdt 60min
# 2) 백테스트 실행 → 4개 전략 비교 테이블 출력
node src/backtest.js btcusdt 60min
```

## 성과지표
총수익률, MDD(최대낙폭), 승률, Profit Factor, 거래수, Buy&Hold 벤치마크.
**전략 선정 1순위 기준은 총수익률이 아니라 MDD입니다.**

## 실거래로 승격하려면
1. `STRATEGY.md`의 리스크 관리 규칙을 그대로 적용
2. `src/htxTrader.js`를 `dryRun: true`로 먼저 테스트
3. 환경변수 `HTX_KEY`, `HTX_SECRET`, `HTX_ACC` 설정
4. 소액(예: 20 USDT)으로 2주 이상 페이퍼트레이딩 → 실거래

## ⚠️ 주의
- HTX API는 국가별 접근 제한이 있을 수 있음. 차단 시 Binance 엔드포인트로 교체 필요.
- 백테스트 결과는 미래 수익을 보장하지 않음. 슬리피지/수수료/유동성 영향 과소평가 가능.
- 본 코드는 롱-온리입니다. 숏/레버리지는 별도 선물 API 연동 필요.
