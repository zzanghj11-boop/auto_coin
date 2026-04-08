// AUTO-GENERATED from /scripts/coin_strategy_lab.mjs
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

export const COIN_PRESETS: Record<string, CoinPreset> = {
  "BTC": {
    "symbol": "btcusdt",
    "strategy": "momvol",
    "params": {
      "win": 10,
      "volMult": 1.5,
      "sl": 0.02,
      "tp": 0.15
    },
    "metrics": {
      "sharpe": 1.063,
      "cagr": 0.2257,
      "mdd": 0.3026,
      "calmar": 0.746,
      "trades": 34,
      "winRate": 0.353,
      "totalReturn": 2.05
    },
    "regime": {
      "annualVol": 0.5952,
      "trendR2": 0.4488,
      "hurst": 0.579,
      "buyHoldReturn": 5.3374,
      "buyHoldMdd": 0.7642
    },
    "rationale": "연변동성 60%, 중간 추세성 (R^2=0.45)",
    "top3": [
      {
        "strategy": "momvol",
        "params": {
          "win": 10,
          "volMult": 1.5,
          "sl": 0.02,
          "tp": 0.15
        },
        "sharpe": 1.063,
        "cagr": 0.2257,
        "mdd": 0.3026,
        "trades": 34,
        "winRate": 0.353
      },
      {
        "strategy": "donchian20",
        "params": {
          "entryWin": 55,
          "exitWin": 20
        },
        "sharpe": 1.007,
        "cagr": 0.3664,
        "mdd": 0.3223,
        "trades": 12,
        "winRate": 0.667
      },
      {
        "strategy": "ma",
        "params": {
          "fast": 30,
          "slow": 150
        },
        "sharpe": 0.79,
        "cagr": 0.2358,
        "mdd": 0.4049,
        "trades": 5,
        "winRate": 0.8
      }
    ]
  },
  "ETH": {
    "symbol": "ethusdt",
    "strategy": "donchian20",
    "params": {
      "entryWin": 20,
      "exitWin": 5
    },
    "metrics": {
      "sharpe": 1.227,
      "cagr": 0.5585,
      "mdd": 0.3712,
      "calmar": 1.505,
      "trades": 33,
      "winRate": 0.515,
      "totalReturn": 10.3755
    },
    "regime": {
      "annualVol": 0.7642,
      "trendR2": 0.1706,
      "hurst": 0.584,
      "buyHoldReturn": 5.0839,
      "buyHoldMdd": 0.7958
    },
    "rationale": "연변동성 76%, 낮은 추세성 (R^2=0.17, 횡보형)",
    "top3": [
      {
        "strategy": "donchian20",
        "params": {
          "entryWin": 20,
          "exitWin": 5
        },
        "sharpe": 1.227,
        "cagr": 0.5585,
        "mdd": 0.3712,
        "trades": 33,
        "winRate": 0.515
      },
      {
        "strategy": "bb",
        "params": {
          "p": 10,
          "mult": 1.5,
          "win": 60
        },
        "sharpe": 1.203,
        "cagr": 0.1487,
        "mdd": 0.1174,
        "trades": 5,
        "winRate": 0.4
      },
      {
        "strategy": "momvol",
        "params": {
          "win": 40,
          "volMult": 3,
          "sl": 0.04,
          "tp": 0.1
        },
        "sharpe": 1.17,
        "cagr": 0.1168,
        "mdd": 0.075,
        "trades": 6,
        "winRate": 0.833
      }
    ]
  },
  "XRP": {
    "symbol": "xrpusdt",
    "strategy": "momvol",
    "params": {
      "win": 20,
      "volMult": 1.5,
      "sl": 0.04,
      "tp": 0.1
    },
    "metrics": {
      "sharpe": 1.479,
      "cagr": 0.6939,
      "mdd": 0.166,
      "calmar": 4.18,
      "trades": 25,
      "winRate": 0.72,
      "totalReturn": 16.9527
    },
    "regime": {
      "annualVol": 1.0004,
      "trendR2": 0.3567,
      "hurst": 0.587,
      "buyHoldReturn": 4.6526,
      "buyHoldMdd": 0.8286
    },
    "rationale": "연변동성 100%, 중간 추세성 (R^2=0.36)",
    "top3": [
      {
        "strategy": "momvol",
        "params": {
          "win": 20,
          "volMult": 1.5,
          "sl": 0.04,
          "tp": 0.1
        },
        "sharpe": 1.479,
        "cagr": 0.6939,
        "mdd": 0.166,
        "trades": 25,
        "winRate": 0.72
      },
      {
        "strategy": "donchian20",
        "params": {
          "entryWin": 20,
          "exitWin": 5
        },
        "sharpe": 1.05,
        "cagr": 0.6341,
        "mdd": 0.6169,
        "trades": 29,
        "winRate": 0.448
      },
      {
        "strategy": "bb",
        "params": {
          "p": 10,
          "mult": 1.5,
          "win": 60
        },
        "sharpe": 0.83,
        "cagr": 0.188,
        "mdd": 0.2103,
        "trades": 5,
        "winRate": 0.6
      }
    ]
  },
  "SOL": {
    "symbol": "solusdt",
    "strategy": "donchian20",
    "params": {
      "entryWin": 20,
      "exitWin": 5
    },
    "metrics": {
      "sharpe": 1.518,
      "cagr": 1.4574,
      "mdd": 0.5758,
      "calmar": 2.531,
      "trades": 30,
      "winRate": 0.5,
      "totalReturn": 121.8387
    },
    "regime": {
      "annualVol": 1.1111,
      "trendR2": 0.3401,
      "hurst": 0.595,
      "buyHoldReturn": 39.1321,
      "buyHoldMdd": 0.9629
    },
    "rationale": "연변동성 111%, 중간 추세성 (R^2=0.34)",
    "top3": [
      {
        "strategy": "donchian20",
        "params": {
          "entryWin": 20,
          "exitWin": 5
        },
        "sharpe": 1.518,
        "cagr": 1.4574,
        "mdd": 0.5758,
        "trades": 30,
        "winRate": 0.5
      },
      {
        "strategy": "ma",
        "params": {
          "fast": 10,
          "slow": 150
        },
        "sharpe": 1.115,
        "cagr": 0.6631,
        "mdd": 0.647,
        "trades": 12,
        "winRate": 0.333
      },
      {
        "strategy": "momvol",
        "params": {
          "win": 10,
          "volMult": 2,
          "sl": 0.04,
          "tp": 0.05
        },
        "sharpe": 1.044,
        "cagr": 0.2147,
        "mdd": 0.2047,
        "trades": 24,
        "winRate": 0.708
      }
    ]
  },
  "TRX": {
    "symbol": "trxusdt",
    "strategy": "momvol",
    "params": {
      "win": 20,
      "volMult": 1.5,
      "sl": 0.04,
      "tp": 0.15
    },
    "metrics": {
      "sharpe": 0.934,
      "cagr": 0.2473,
      "mdd": 0.3145,
      "calmar": 0.786,
      "trades": 24,
      "winRate": 0.458,
      "totalReturn": 2.3558
    },
    "regime": {
      "annualVol": 0.7055,
      "trendR2": 0.7683,
      "hurst": 0.56,
      "buyHoldReturn": 11.2203,
      "buyHoldMdd": 0.6893
    },
    "rationale": "연변동성 71%, 높은 추세성 (R^2=0.77)",
    "top3": [
      {
        "strategy": "momvol",
        "params": {
          "win": 20,
          "volMult": 1.5,
          "sl": 0.04,
          "tp": 0.15
        },
        "sharpe": 0.934,
        "cagr": 0.2473,
        "mdd": 0.3145,
        "trades": 24,
        "winRate": 0.458
      },
      {
        "strategy": "ma",
        "params": {
          "fast": 10,
          "slow": 50
        },
        "sharpe": 0.849,
        "cagr": 0.3896,
        "mdd": 0.6056,
        "trades": 23,
        "winRate": 0.391
      },
      {
        "strategy": "donchian20",
        "params": {
          "entryWin": 20,
          "exitWin": 10
        },
        "sharpe": 0.767,
        "cagr": 0.3076,
        "mdd": 0.5235,
        "trades": 26,
        "winRate": 0.615
      }
    ]
  },
  "DOGE": {
    "symbol": "dogeusdt",
    "strategy": "donchian20",
    "params": {
      "entryWin": 55,
      "exitWin": 20
    },
    "metrics": {
      "sharpe": 1.025,
      "cagr": 1.2897,
      "mdd": 0.8254,
      "calmar": 1.563,
      "trades": 11,
      "winRate": 0.455,
      "totalReturn": 92.621
    },
    "regime": {
      "annualVol": 1.3563,
      "trendR2": 0.1525,
      "hurst": 0.57,
      "buyHoldReturn": 35.4432,
      "buyHoldMdd": 0.9192
    },
    "rationale": "연변동성 136%, 낮은 추세성 (R^2=0.15, 횡보형)",
    "top3": [
      {
        "strategy": "donchian20",
        "params": {
          "entryWin": 55,
          "exitWin": 20
        },
        "sharpe": 1.025,
        "cagr": 1.2897,
        "mdd": 0.8254,
        "trades": 11,
        "winRate": 0.455
      },
      {
        "strategy": "momvol",
        "params": {
          "win": 20,
          "volMult": 1.5,
          "sl": 0.04,
          "tp": 0.1
        },
        "sharpe": 0.828,
        "cagr": 0.8796,
        "mdd": 0.2362,
        "trades": 30,
        "winRate": 0.533
      },
      {
        "strategy": "bb",
        "params": {
          "p": 20,
          "mult": 1.5,
          "win": 120
        },
        "sharpe": 0.59,
        "cagr": 0.1367,
        "mdd": 0.2371,
        "trades": 7,
        "winRate": 0.571
      }
    ]
  },
  "BCH": {
    "symbol": "bchusdt",
    "strategy": "zscore",
    "params": {
      "p": 30,
      "entryZ": 2.5,
      "exitZ": 0
    },
    "metrics": {
      "sharpe": 0.592,
      "cagr": 0.1541,
      "mdd": 0.683,
      "calmar": 0.226,
      "trades": 18,
      "winRate": 0.833,
      "totalReturn": 1.1928
    },
    "regime": {
      "annualVol": 0.8902,
      "trendR2": 0.0205,
      "hurst": 0.561,
      "buyHoldReturn": 0.8113,
      "buyHoldMdd": 0.9354
    },
    "rationale": "연변동성 89%, 낮은 추세성 (R^2=0.02, 횡보형)",
    "top3": [
      {
        "strategy": "zscore",
        "params": {
          "p": 30,
          "entryZ": 2.5,
          "exitZ": 0
        },
        "sharpe": 0.592,
        "cagr": 0.1541,
        "mdd": 0.683,
        "trades": 18,
        "winRate": 0.833
      },
      {
        "strategy": "rsi",
        "params": {
          "p": 9,
          "lo": 35,
          "hi": 75,
          "tp": 100
        },
        "sharpe": 0.47,
        "cagr": 0.1206,
        "mdd": 0.5748,
        "trades": 7,
        "winRate": 0.571
      },
      {
        "strategy": "momvol",
        "params": {
          "win": 10,
          "volMult": 3,
          "sl": 0.02,
          "tp": 0.15
        },
        "sharpe": 0.449,
        "cagr": 0.0595,
        "mdd": 0.1137,
        "trades": 10,
        "winRate": 0.3
      }
    ]
  },
  "XMR": {
    "symbol": "xmrusdt",
    "strategy": "zscore",
    "params": {
      "p": 10,
      "entryZ": 2,
      "exitZ": 0.3
    },
    "metrics": {
      "sharpe": 1.422,
      "cagr": 0.3294,
      "mdd": 0.1534,
      "calmar": 2.148,
      "trades": 37,
      "winRate": 0.73,
      "totalReturn": 1.5421
    },
    "regime": {
      "annualVol": 0.5951,
      "trendR2": 0.6883,
      "hurst": 0.572,
      "buyHoldReturn": 1.3951,
      "buyHoldMdd": 0.5624
    },
    "rationale": "연변동성 60%, 높은 추세성 (R^2=0.69)",
    "top3": [
      {
        "strategy": "zscore",
        "params": {
          "p": 10,
          "entryZ": 2,
          "exitZ": 0.3
        },
        "sharpe": 1.422,
        "cagr": 0.3294,
        "mdd": 0.1534,
        "trades": 37,
        "winRate": 0.73
      },
      {
        "strategy": "momvol",
        "params": {
          "win": 10,
          "volMult": 2,
          "sl": 0.02,
          "tp": 0.05
        },
        "sharpe": 0.852,
        "cagr": 0.1053,
        "mdd": 0.0267,
        "trades": 6,
        "winRate": 0.667
      },
      {
        "strategy": "rsi",
        "params": {
          "p": 9,
          "lo": 30,
          "hi": 70,
          "tp": 200
        },
        "sharpe": 0.8,
        "cagr": 0.2086,
        "mdd": 0.2952,
        "trades": 6,
        "winRate": 0.5
      }
    ]
  },
  "ZEC": {
    "symbol": "zecusdt",
    "strategy": "bb",
    "params": {
      "p": 30,
      "mult": 1.5,
      "win": 180
    },
    "metrics": {
      "sharpe": 1.475,
      "cagr": 1.3194,
      "mdd": 0.3235,
      "calmar": 4.079,
      "trades": 6,
      "winRate": 0.5,
      "totalReturn": 15.0794
    },
    "regime": {
      "annualVol": 1.0533,
      "trendR2": 0.432,
      "hurst": 0.609,
      "buyHoldReturn": 6.4628,
      "buyHoldMdd": 0.7201
    },
    "rationale": "연변동성 105%, 중간 추세성 (R^2=0.43)",
    "top3": [
      {
        "strategy": "bb",
        "params": {
          "p": 30,
          "mult": 1.5,
          "win": 180
        },
        "sharpe": 1.475,
        "cagr": 1.3194,
        "mdd": 0.3235,
        "trades": 6,
        "winRate": 0.5
      },
      {
        "strategy": "donchian20",
        "params": {
          "entryWin": 10,
          "exitWin": 5
        },
        "sharpe": 1.298,
        "cagr": 1.1205,
        "mdd": 0.4609,
        "trades": 23,
        "winRate": 0.522
      },
      {
        "strategy": "ma",
        "params": {
          "fast": 10,
          "slow": 100
        },
        "sharpe": 1.043,
        "cagr": 0.7632,
        "mdd": 0.5291,
        "trades": 9,
        "winRate": 0.222
      }
    ]
  },
  "LTC": {
    "symbol": "ltcusdt",
    "strategy": "momvol",
    "params": {
      "win": 10,
      "volMult": 3,
      "sl": 0.04,
      "tp": 0.05
    },
    "metrics": {
      "sharpe": 1.136,
      "cagr": 0.1518,
      "mdd": 0.0533,
      "calmar": 2.847,
      "trades": 11,
      "winRate": 0.818,
      "totalReturn": 1.1694
    },
    "regime": {
      "annualVol": 0.883,
      "trendR2": 0.1844,
      "hurst": 0.54,
      "buyHoldReturn": 0.1741,
      "buyHoldMdd": 0.8922
    },
    "rationale": "연변동성 88%, 낮은 추세성 (R^2=0.18, 횡보형)",
    "top3": [
      {
        "strategy": "momvol",
        "params": {
          "win": 10,
          "volMult": 3,
          "sl": 0.04,
          "tp": 0.05
        },
        "sharpe": 1.136,
        "cagr": 0.1518,
        "mdd": 0.0533,
        "trades": 11,
        "winRate": 0.818
      },
      {
        "strategy": "rsi",
        "params": {
          "p": 9,
          "lo": 35,
          "hi": 70,
          "tp": 150
        },
        "sharpe": 0.612,
        "cagr": 0.1353,
        "mdd": 0.377,
        "trades": 7,
        "winRate": 0.857
      },
      {
        "strategy": "zscore",
        "params": {
          "p": 20,
          "entryZ": 2.5,
          "exitZ": 0
        },
        "sharpe": 0.573,
        "cagr": 0.1385,
        "mdd": 0.3331,
        "trades": 25,
        "winRate": 0.76
      }
    ]
  }
};

export const COIN_PRESET_BY_SYMBOL: Record<string, CoinPreset> = Object.fromEntries(
  Object.values(COIN_PRESETS).map(p => [p.symbol, p])
);
