// AUTO-GENERATED from /scripts/composite_strategy_lab.mjs + build_composite_presets.mjs
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
export const COMPOSITE_PRESETS_BY_PERIOD: Record<string, Record<string, CompositePreset>> = {
  "1day": {
    "BTC": {
      "coin": "BTC",
      "symbol": "btcusdt",
      "period": "1day",
      "candles": 2000,
      "span": {
        "from": 1602864000000,
        "to": 1775577600000
      },
      "swings": {
        "lows": 23,
        "highs": 24
      },
      "weights": {
        "rsif": 0.5401,
        "zscore": 0.4599
      },
      "threshold": 0.5,
      "window": 3,
      "strategyStats": {
        "ma": {
          "train_precision": 0.091,
          "train_recall": 0.048,
          "train_f1": 0.063,
          "train_fires": 11,
          "test_precision": 0,
          "test_recall": 0
        },
        "rsi": {
          "train_precision": 0.333,
          "train_recall": 0.048,
          "train_f1": 0.083,
          "train_fires": 3,
          "test_precision": 0,
          "test_recall": 0
        },
        "rsif": {
          "train_precision": 0.259,
          "train_recall": 0.333,
          "train_f1": 0.292,
          "train_fires": 27,
          "test_precision": 0.143,
          "test_recall": 0.5
        },
        "bb": {
          "train_precision": 0,
          "train_recall": 0,
          "train_f1": 0,
          "train_fires": 1,
          "test_precision": 0,
          "test_recall": 0
        },
        "bbf": {
          "train_precision": 0.333,
          "train_recall": 0.095,
          "train_f1": 0.148,
          "train_fires": 3,
          "test_precision": 0,
          "test_recall": 0
        },
        "donchian": {
          "train_precision": 0.017,
          "train_recall": 0.095,
          "train_f1": 0.029,
          "train_fires": 118,
          "test_precision": 0,
          "test_recall": 0
        },
        "vbf": {
          "train_precision": 0.009,
          "train_recall": 0.095,
          "train_f1": 0.017,
          "train_fires": 220,
          "test_precision": 0,
          "test_recall": 0
        },
        "zscore": {
          "train_precision": 0.221,
          "train_recall": 0.524,
          "train_f1": 0.311,
          "train_fires": 77,
          "test_precision": 0.154,
          "test_recall": 1
        },
        "momvol": {
          "train_precision": 0,
          "train_recall": 0,
          "train_f1": 0,
          "train_fires": 17,
          "test_precision": 0,
          "test_recall": 0
        }
      },
      "backtest": {
        "train": {
          "sharpe": 0.837,
          "cagr": 0.2404,
          "mdd": 0.4316,
          "trades": 20,
          "winRate": 0.45
        },
        "test": {
          "sharpe": 0.005,
          "cagr": -0.0145,
          "mdd": 0.1061,
          "trades": 3,
          "winRate": 0.333
        },
        "full": {
          "sharpe": 0.722,
          "cagr": 0.1846,
          "mdd": 0.4316,
          "trades": 23,
          "winRate": 0.435
        }
      }
    },
    "ETH": {
      "coin": "ETH",
      "symbol": "ethusdt",
      "period": "1day",
      "candles": 2000,
      "span": {
        "from": 1602864000000,
        "to": 1775577600000
      },
      "swings": {
        "lows": 34,
        "highs": 35
      },
      "weights": {
        "zscore": 1
      },
      "threshold": 0.5,
      "window": 3,
      "strategyStats": {
        "ma": {
          "train_precision": 0,
          "train_recall": 0,
          "train_f1": 0,
          "train_fires": 10,
          "test_precision": 0,
          "test_recall": 0
        },
        "rsi": {
          "train_precision": 0,
          "train_recall": 0,
          "train_f1": 0,
          "train_fires": 0,
          "test_precision": 0,
          "test_recall": 0
        },
        "rsif": {
          "train_precision": 0.133,
          "train_recall": 0.133,
          "train_f1": 0.133,
          "train_fires": 30,
          "test_precision": 0,
          "test_recall": 0
        },
        "bb": {
          "train_precision": 0,
          "train_recall": 0,
          "train_f1": 0,
          "train_fires": 1,
          "test_precision": 0,
          "test_recall": 0
        },
        "bbf": {
          "train_precision": 0,
          "train_recall": 0,
          "train_f1": 0,
          "train_fires": 1,
          "test_precision": 0,
          "test_recall": 0
        },
        "donchian": {
          "train_precision": 0.062,
          "train_recall": 0.267,
          "train_f1": 0.1,
          "train_fires": 130,
          "test_precision": 0,
          "test_recall": 0
        },
        "vbf": {
          "train_precision": 0.047,
          "train_recall": 0.3,
          "train_f1": 0.081,
          "train_fires": 236,
          "test_precision": 0,
          "test_recall": 0
        },
        "zscore": {
          "train_precision": 0.224,
          "train_recall": 0.4,
          "train_f1": 0.287,
          "train_fires": 85,
          "test_precision": 0.333,
          "test_recall": 1
        },
        "momvol": {
          "train_precision": 0,
          "train_recall": 0,
          "train_f1": 0,
          "train_fires": 18,
          "test_precision": 0,
          "test_recall": 0
        }
      },
      "backtest": {
        "train": {
          "sharpe": 0.245,
          "cagr": 0.0194,
          "mdd": 0.5339,
          "trades": 52,
          "winRate": 0.442
        },
        "test": {
          "sharpe": 1.667,
          "cagr": 0.8297,
          "mdd": 0.3895,
          "trades": 14,
          "winRate": 0.429
        },
        "full": {
          "sharpe": 0.523,
          "cagr": 0.14,
          "mdd": 0.5339,
          "trades": 66,
          "winRate": 0.439
        }
      }
    },
    "XRP": {
      "coin": "XRP",
      "symbol": "xrpusdt",
      "period": "1day",
      "candles": 2000,
      "span": {
        "from": 1602864000000,
        "to": 1775577600000
      },
      "swings": {
        "lows": 44,
        "highs": 44
      },
      "weights": {
        "zscore": 0.5387,
        "rsif": 0.4613
      },
      "threshold": 0.5,
      "window": 3,
      "strategyStats": {
        "ma": {
          "train_precision": 0.071,
          "train_recall": 0.025,
          "train_f1": 0.037,
          "train_fires": 14,
          "test_precision": 0,
          "test_recall": 0
        },
        "rsi": {
          "train_precision": 1,
          "train_recall": 0.025,
          "train_f1": 0.049,
          "train_fires": 1,
          "test_precision": 0,
          "test_recall": 0
        },
        "rsif": {
          "train_precision": 0.294,
          "train_recall": 0.225,
          "train_f1": 0.255,
          "train_fires": 34,
          "test_precision": 0.077,
          "test_recall": 0.25
        },
        "bb": {
          "train_precision": 0,
          "train_recall": 0,
          "train_f1": 0,
          "train_fires": 1,
          "test_precision": 0,
          "test_recall": 0
        },
        "bbf": {
          "train_precision": 0,
          "train_recall": 0,
          "train_f1": 0,
          "train_fires": 2,
          "test_precision": 0,
          "test_recall": 0
        },
        "donchian": {
          "train_precision": 0.085,
          "train_recall": 0.125,
          "train_f1": 0.101,
          "train_fires": 82,
          "test_precision": 0,
          "test_recall": 0
        },
        "vbf": {
          "train_precision": 0.057,
          "train_recall": 0.15,
          "train_f1": 0.083,
          "train_fires": 157,
          "test_precision": 0,
          "test_recall": 0
        },
        "zscore": {
          "train_precision": 0.343,
          "train_recall": 0.45,
          "train_f1": 0.39,
          "train_fires": 99,
          "test_precision": 0.167,
          "test_recall": 0.5
        },
        "momvol": {
          "train_precision": 0.167,
          "train_recall": 0.075,
          "train_f1": 0.103,
          "train_fires": 24,
          "test_precision": 0,
          "test_recall": 0
        }
      },
      "backtest": {
        "train": {
          "sharpe": 0.991,
          "cagr": 0.4725,
          "mdd": 0.5942,
          "trades": 67,
          "winRate": 0.478
        },
        "test": {
          "sharpe": 0.429,
          "cagr": 0.0946,
          "mdd": 0.4275,
          "trades": 10,
          "winRate": 0.5
        },
        "full": {
          "sharpe": 0.898,
          "cagr": 0.3877,
          "mdd": 0.5942,
          "trades": 77,
          "winRate": 0.481
        }
      }
    },
    "SOL": {
      "coin": "SOL",
      "symbol": "solusdt",
      "period": "1day",
      "candles": 1953,
      "span": {
        "from": 1606924800000,
        "to": 1775577600000
      },
      "swings": {
        "lows": 58,
        "highs": 58
      },
      "weights": {
        "zscore": 0.5737,
        "rsif": 0.4263
      },
      "threshold": 0.2868,
      "window": 3,
      "strategyStats": {
        "ma": {
          "train_precision": 0,
          "train_recall": 0,
          "train_f1": 0,
          "train_fires": 13,
          "test_precision": 0,
          "test_recall": 0
        },
        "rsi": {
          "train_precision": 0,
          "train_recall": 0,
          "train_f1": 0,
          "train_fires": 1,
          "test_precision": 0,
          "test_recall": 0
        },
        "rsif": {
          "train_precision": 0.412,
          "train_recall": 0.231,
          "train_f1": 0.296,
          "train_fires": 34,
          "test_precision": 0,
          "test_recall": 0
        },
        "bb": {
          "train_precision": 0,
          "train_recall": 0,
          "train_f1": 0,
          "train_fires": 1,
          "test_precision": 0,
          "test_recall": 0
        },
        "bbf": {
          "train_precision": 0,
          "train_recall": 0,
          "train_f1": 0,
          "train_fires": 2,
          "test_precision": 0,
          "test_recall": 0
        },
        "donchian": {
          "train_precision": 0.117,
          "train_recall": 0.212,
          "train_f1": 0.15,
          "train_fires": 120,
          "test_precision": 0,
          "test_recall": 0
        },
        "vbf": {
          "train_precision": 0.131,
          "train_recall": 0.231,
          "train_f1": 0.167,
          "train_fires": 199,
          "test_precision": 0,
          "test_recall": 0
        },
        "zscore": {
          "train_precision": 0.554,
          "train_recall": 0.327,
          "train_f1": 0.411,
          "train_fires": 74,
          "test_precision": 0.19,
          "test_recall": 0.667
        },
        "momvol": {
          "train_precision": 0.194,
          "train_recall": 0.115,
          "train_f1": 0.145,
          "train_fires": 31,
          "test_precision": 0,
          "test_recall": 0
        }
      },
      "backtest": {
        "train": {
          "sharpe": 1.186,
          "cagr": 0.7468,
          "mdd": 0.6677,
          "trades": 85,
          "winRate": 0.4
        },
        "test": {
          "sharpe": 0.927,
          "cagr": 0.3612,
          "mdd": 0.3841,
          "trades": 17,
          "winRate": 0.412
        },
        "full": {
          "sharpe": 1.138,
          "cagr": 0.6617,
          "mdd": 0.6677,
          "trades": 102,
          "winRate": 0.402
        }
      }
    },
    "TRX": {
      "coin": "TRX",
      "symbol": "trxusdt",
      "period": "1day",
      "candles": 2000,
      "span": {
        "from": 1602864000000,
        "to": 1775577600000
      },
      "swings": {
        "lows": 28,
        "highs": 28
      },
      "weights": {
        "zscore": 0.7031,
        "rsif": 0.2969
      },
      "threshold": 0.3515,
      "window": 3,
      "strategyStats": {
        "ma": {
          "train_precision": 0,
          "train_recall": 0,
          "train_f1": 0,
          "train_fires": 9,
          "test_precision": 0,
          "test_recall": 0
        },
        "rsi": {
          "train_precision": 0.25,
          "train_recall": 0.037,
          "train_f1": 0.065,
          "train_fires": 4,
          "test_precision": 0,
          "test_recall": 0
        },
        "rsif": {
          "train_precision": 0.182,
          "train_recall": 0.185,
          "train_f1": 0.183,
          "train_fires": 33,
          "test_precision": 0,
          "test_recall": 0
        },
        "bb": {
          "train_precision": 0,
          "train_recall": 0,
          "train_f1": 0,
          "train_fires": 1,
          "test_precision": 0,
          "test_recall": 0
        },
        "bbf": {
          "train_precision": 0,
          "train_recall": 0,
          "train_f1": 0,
          "train_fires": 2,
          "test_precision": 0,
          "test_recall": 0
        },
        "donchian": {
          "train_precision": 0.04,
          "train_recall": 0.111,
          "train_f1": 0.059,
          "train_fires": 99,
          "test_precision": 0,
          "test_recall": 0
        },
        "vbf": {
          "train_precision": 0.026,
          "train_recall": 0.148,
          "train_f1": 0.044,
          "train_fires": 193,
          "test_precision": 0,
          "test_recall": 0
        },
        "zscore": {
          "train_precision": 0.431,
          "train_recall": 0.481,
          "train_f1": 0.455,
          "train_fires": 72,
          "test_precision": 0,
          "test_recall": 0
        },
        "momvol": {
          "train_precision": 0.071,
          "train_recall": 0.037,
          "train_f1": 0.049,
          "train_fires": 14,
          "test_precision": 0,
          "test_recall": 0
        }
      },
      "backtest": {
        "train": {
          "sharpe": 1.218,
          "cagr": 0.4749,
          "mdd": 0.3558,
          "trades": 40,
          "winRate": 0.6
        },
        "test": {
          "sharpe": 0.487,
          "cagr": 0.0788,
          "mdd": 0.1792,
          "trades": 4,
          "winRate": 0.5
        },
        "full": {
          "sharpe": 1.087,
          "cagr": 0.3761,
          "mdd": 0.3558,
          "trades": 44,
          "winRate": 0.568
        }
      }
    },
    "DOGE": {
      "coin": "DOGE",
      "symbol": "dogeusdt",
      "period": "1day",
      "candles": 2000,
      "span": {
        "from": 1602864000000,
        "to": 1775577600000
      },
      "swings": {
        "lows": 52,
        "highs": 52
      },
      "weights": {
        "momvol": 0.3552,
        "rsif": 0.3433,
        "zscore": 0.3015
      },
      "threshold": 0.3493,
      "window": 3,
      "strategyStats": {
        "ma": {
          "train_precision": 0.083,
          "train_recall": 0.022,
          "train_f1": 0.035,
          "train_fires": 12,
          "test_precision": 0,
          "test_recall": 0
        },
        "rsi": {
          "train_precision": 1,
          "train_recall": 0.044,
          "train_f1": 0.085,
          "train_fires": 2,
          "test_precision": 0,
          "test_recall": 0
        },
        "rsif": {
          "train_precision": 0.333,
          "train_recall": 0.244,
          "train_f1": 0.282,
          "train_fires": 30,
          "test_precision": 0.125,
          "test_recall": 0.143
        },
        "bb": {
          "train_precision": 0,
          "train_recall": 0,
          "train_f1": 0,
          "train_fires": 3,
          "test_precision": 0,
          "test_recall": 0
        },
        "bbf": {
          "train_precision": 0,
          "train_recall": 0,
          "train_f1": 0,
          "train_fires": 5,
          "test_precision": 0,
          "test_recall": 0
        },
        "donchian": {
          "train_precision": 0.188,
          "train_recall": 0.178,
          "train_f1": 0.183,
          "train_fires": 64,
          "test_precision": 0.091,
          "test_recall": 0.143
        },
        "vbf": {
          "train_precision": 0.126,
          "train_recall": 0.222,
          "train_f1": 0.161,
          "train_fires": 143,
          "test_precision": 0.034,
          "test_recall": 0.143
        },
        "zscore": {
          "train_precision": 0.293,
          "train_recall": 0.289,
          "train_f1": 0.291,
          "train_fires": 82,
          "test_precision": 0.133,
          "test_recall": 0.286
        },
        "momvol": {
          "train_precision": 0.345,
          "train_recall": 0.133,
          "train_f1": 0.192,
          "train_fires": 29,
          "test_precision": 0,
          "test_recall": 0
        }
      },
      "backtest": {
        "train": {
          "sharpe": 0.918,
          "cagr": 1.151,
          "mdd": 0.3119,
          "trades": 34,
          "winRate": 0.529
        },
        "test": {
          "sharpe": 0.571,
          "cagr": 0.1372,
          "mdd": 0.3129,
          "trades": 6,
          "winRate": 0.333
        },
        "full": {
          "sharpe": 0.843,
          "cagr": 0.8935,
          "mdd": 0.3129,
          "trades": 40,
          "winRate": 0.5
        }
      }
    },
    "XMR": {
      "coin": "XMR",
      "symbol": "xmrusdt",
      "period": "1day",
      "candles": 1196,
      "span": {
        "from": 1672329600000,
        "to": 1775577600000
      },
      "swings": {
        "lows": 16,
        "highs": 16
      },
      "weights": {
        "zscore": 1
      },
      "threshold": 0.5,
      "window": 3,
      "strategyStats": {
        "ma": {
          "train_precision": 0.1,
          "train_recall": 0.091,
          "train_f1": 0.095,
          "train_fires": 10,
          "test_precision": 0,
          "test_recall": 0
        },
        "rsi": {
          "train_precision": 0,
          "train_recall": 0,
          "train_f1": 0,
          "train_fires": 1,
          "test_precision": 0,
          "test_recall": 0
        },
        "rsif": {
          "train_precision": 0.091,
          "train_recall": 0.182,
          "train_f1": 0.121,
          "train_fires": 22,
          "test_precision": 0.4,
          "test_recall": 0.4
        },
        "bb": {
          "train_precision": 0,
          "train_recall": 0,
          "train_f1": 0,
          "train_fires": 1,
          "test_precision": 0,
          "test_recall": 0
        },
        "bbf": {
          "train_precision": 0,
          "train_recall": 0,
          "train_f1": 0,
          "train_fires": 2,
          "test_precision": 0,
          "test_recall": 0
        },
        "donchian": {
          "train_precision": 0,
          "train_recall": 0,
          "train_f1": 0,
          "train_fires": 21,
          "test_precision": 0,
          "test_recall": 0
        },
        "vbf": {
          "train_precision": 0.016,
          "train_recall": 0.091,
          "train_f1": 0.027,
          "train_fires": 125,
          "test_precision": 0,
          "test_recall": 0
        },
        "zscore": {
          "train_precision": 0.211,
          "train_recall": 0.455,
          "train_f1": 0.288,
          "train_fires": 57,
          "test_precision": 0,
          "test_recall": 0
        },
        "momvol": {
          "train_precision": 0,
          "train_recall": 0,
          "train_f1": 0,
          "train_fires": 2,
          "test_precision": 0,
          "test_recall": 0
        }
      },
      "backtest": {
        "train": {
          "sharpe": 0.853,
          "cagr": 0.2433,
          "mdd": 0.2584,
          "trades": 27,
          "winRate": 0.556
        },
        "test": {
          "sharpe": 0.876,
          "cagr": 0.0878,
          "mdd": 0.0478,
          "trades": 1,
          "winRate": 1
        },
        "full": {
          "sharpe": 0.753,
          "cagr": 0.1898,
          "mdd": 0.2584,
          "trades": 28,
          "winRate": 0.536
        }
      }
    },
    "LTC": {
      "coin": "LTC",
      "symbol": "ltcusdt",
      "period": "1day",
      "candles": 2000,
      "span": {
        "from": 1602864000000,
        "to": 1775577600000
      },
      "swings": {
        "lows": 41,
        "highs": 42
      },
      "weights": {
        "zscore": 0.6691,
        "rsif": 0.3309
      },
      "threshold": 0.3346,
      "window": 3,
      "strategyStats": {
        "ma": {
          "train_precision": 0,
          "train_recall": 0,
          "train_f1": 0,
          "train_fires": 15,
          "test_precision": 0,
          "test_recall": 0
        },
        "rsi": {
          "train_precision": 1,
          "train_recall": 0.056,
          "train_f1": 0.105,
          "train_fires": 1,
          "test_precision": 0,
          "test_recall": 0
        },
        "rsif": {
          "train_precision": 0.239,
          "train_recall": 0.278,
          "train_f1": 0.257,
          "train_fires": 46,
          "test_precision": 0,
          "test_recall": 0
        },
        "bb": {
          "train_precision": 0,
          "train_recall": 0,
          "train_f1": 0,
          "train_fires": 2,
          "test_precision": 0,
          "test_recall": 0
        },
        "bbf": {
          "train_precision": 0,
          "train_recall": 0,
          "train_f1": 0,
          "train_fires": 1,
          "test_precision": 0,
          "test_recall": 0
        },
        "donchian": {
          "train_precision": 0.068,
          "train_recall": 0.111,
          "train_f1": 0.085,
          "train_fires": 73,
          "test_precision": 0.083,
          "test_recall": 0.2
        },
        "vbf": {
          "train_precision": 0.056,
          "train_recall": 0.167,
          "train_f1": 0.083,
          "train_fires": 162,
          "test_precision": 0.031,
          "test_recall": 0.2
        },
        "zscore": {
          "train_precision": 0.484,
          "train_recall": 0.472,
          "train_f1": 0.478,
          "train_fires": 91,
          "test_precision": 0.333,
          "test_recall": 0.8
        },
        "momvol": {
          "train_precision": 0,
          "train_recall": 0,
          "train_f1": 0,
          "train_fires": 22,
          "test_precision": 0,
          "test_recall": 0
        }
      },
      "backtest": {
        "train": {
          "sharpe": 0.676,
          "cagr": 0.2294,
          "mdd": 0.5738,
          "trades": 58,
          "winRate": 0.483
        },
        "test": {
          "sharpe": 0.573,
          "cagr": 0.1698,
          "mdd": 0.4079,
          "trades": 15,
          "winRate": 0.267
        },
        "full": {
          "sharpe": 0.648,
          "cagr": 0.214,
          "mdd": 0.5738,
          "trades": 73,
          "winRate": 0.452
        }
      }
    }
  },
  "4hour": {
    "BTC": {
      "coin": "BTC",
      "symbol": "btcusdt",
      "period": "4hour",
      "candles": 2000,
      "span": {
        "from": 1746849600000,
        "to": 1775635200000
      },
      "swings": {
        "lows": 1,
        "highs": 1
      },
      "weights": {
        "zscore": 1
      },
      "threshold": 0.5,
      "window": 3,
      "strategyStats": {
        "ma": {
          "train_precision": 0,
          "train_recall": 0,
          "train_f1": 0,
          "train_fires": 15,
          "test_precision": 0,
          "test_recall": 0
        },
        "rsi": {
          "train_precision": 0,
          "train_recall": 0,
          "train_f1": 0,
          "train_fires": 0,
          "test_precision": 0,
          "test_recall": 0
        },
        "rsif": {
          "train_precision": 0,
          "train_recall": 0,
          "train_f1": 0,
          "train_fires": 27,
          "test_precision": 0,
          "test_recall": 0
        },
        "bb": {
          "train_precision": 0,
          "train_recall": 0,
          "train_f1": 0,
          "train_fires": 4,
          "test_precision": 0,
          "test_recall": 0
        },
        "bbf": {
          "train_precision": 0,
          "train_recall": 0,
          "train_f1": 0,
          "train_fires": 3,
          "test_precision": 0,
          "test_recall": 0
        },
        "donchian": {
          "train_precision": 0,
          "train_recall": 0,
          "train_f1": 0,
          "train_fires": 85,
          "test_precision": 0,
          "test_recall": 0
        },
        "vbf": {
          "train_precision": 0,
          "train_recall": 0,
          "train_f1": 0,
          "train_fires": 163,
          "test_precision": 0,
          "test_recall": 0
        },
        "zscore": {
          "train_precision": 0.019,
          "train_recall": 1,
          "train_f1": 0.037,
          "train_fires": 107,
          "test_precision": 0,
          "test_recall": 0
        },
        "momvol": {
          "train_precision": 0,
          "train_recall": 0,
          "train_f1": 0,
          "train_fires": 31,
          "test_precision": 0,
          "test_recall": 0
        }
      },
      "backtest": {
        "train": {
          "sharpe": -1.363,
          "cagr": -0.3714,
          "mdd": 0.3217,
          "trades": 18,
          "winRate": 0.389
        },
        "test": {
          "sharpe": -2.67,
          "cagr": -0.7043,
          "mdd": 0.2089,
          "trades": 5,
          "winRate": 0.4
        },
        "full": {
          "sharpe": -1.684,
          "cagr": -0.4594,
          "mdd": 0.462,
          "trades": 23,
          "winRate": 0.391
        }
      }
    },
    "ETH": {
      "coin": "ETH",
      "symbol": "ethusdt",
      "period": "4hour",
      "candles": 2000,
      "span": {
        "from": 1746849600000,
        "to": 1775635200000
      },
      "swings": {
        "lows": 6,
        "highs": 7
      },
      "weights": {
        "zscore": 1
      },
      "threshold": 0.5,
      "window": 3,
      "strategyStats": {
        "ma": {
          "train_precision": 0,
          "train_recall": 0,
          "train_f1": 0,
          "train_fires": 12,
          "test_precision": 0,
          "test_recall": 0
        },
        "rsi": {
          "train_precision": 0.5,
          "train_recall": 0.2,
          "train_f1": 0.286,
          "train_fires": 2,
          "test_precision": 0,
          "test_recall": 0
        },
        "rsif": {
          "train_precision": 0,
          "train_recall": 0,
          "train_f1": 0,
          "train_fires": 28,
          "test_precision": 0,
          "test_recall": 0
        },
        "bb": {
          "train_precision": 0,
          "train_recall": 0,
          "train_f1": 0,
          "train_fires": 2,
          "test_precision": 0,
          "test_recall": 0
        },
        "bbf": {
          "train_precision": 0,
          "train_recall": 0,
          "train_f1": 0,
          "train_fires": 2,
          "test_precision": 0,
          "test_recall": 0
        },
        "donchian": {
          "train_precision": 0,
          "train_recall": 0,
          "train_f1": 0,
          "train_fires": 98,
          "test_precision": 0,
          "test_recall": 0
        },
        "vbf": {
          "train_precision": 0,
          "train_recall": 0,
          "train_f1": 0,
          "train_fires": 193,
          "test_precision": 0,
          "test_recall": 0
        },
        "zscore": {
          "train_precision": 0.12,
          "train_recall": 0.8,
          "train_f1": 0.209,
          "train_fires": 100,
          "test_precision": 0.087,
          "test_recall": 1
        },
        "momvol": {
          "train_precision": 0,
          "train_recall": 0,
          "train_f1": 0,
          "train_fires": 38,
          "test_precision": 0,
          "test_recall": 0
        }
      },
      "backtest": {
        "train": {
          "sharpe": -0.575,
          "cagr": -0.3735,
          "mdd": 0.4918,
          "trades": 27,
          "winRate": 0.37
        },
        "test": {
          "sharpe": -0.964,
          "cagr": -0.4732,
          "mdd": 0.2183,
          "trades": 7,
          "winRate": 0.429
        },
        "full": {
          "sharpe": -0.651,
          "cagr": -0.3948,
          "mdd": 0.6031,
          "trades": 34,
          "winRate": 0.382
        }
      }
    },
    "XRP": {
      "coin": "XRP",
      "symbol": "xrpusdt",
      "period": "4hour",
      "candles": 2000,
      "span": {
        "from": 1746849600000,
        "to": 1775635200000
      },
      "swings": {
        "lows": 5,
        "highs": 5
      },
      "weights": {
        "zscore": 1
      },
      "threshold": 0.5,
      "window": 3,
      "strategyStats": {
        "ma": {
          "train_precision": 0,
          "train_recall": 0,
          "train_f1": 0,
          "train_fires": 15,
          "test_precision": 0,
          "test_recall": 0
        },
        "rsi": {
          "train_precision": 0,
          "train_recall": 0,
          "train_f1": 0,
          "train_fires": 1,
          "test_precision": 0,
          "test_recall": 0
        },
        "rsif": {
          "train_precision": 0,
          "train_recall": 0,
          "train_f1": 0,
          "train_fires": 20,
          "test_precision": 0.125,
          "test_recall": 0.5
        },
        "bb": {
          "train_precision": 0,
          "train_recall": 0,
          "train_f1": 0,
          "train_fires": 0,
          "test_precision": 0,
          "test_recall": 0
        },
        "bbf": {
          "train_precision": 0,
          "train_recall": 0,
          "train_f1": 0,
          "train_fires": 4,
          "test_precision": 0,
          "test_recall": 0
        },
        "donchian": {
          "train_precision": 0,
          "train_recall": 0,
          "train_f1": 0,
          "train_fires": 73,
          "test_precision": 0,
          "test_recall": 0
        },
        "vbf": {
          "train_precision": 0,
          "train_recall": 0,
          "train_f1": 0,
          "train_fires": 137,
          "test_precision": 0.033,
          "test_recall": 0.5
        },
        "zscore": {
          "train_precision": 0.074,
          "train_recall": 1,
          "train_f1": 0.138,
          "train_fires": 121,
          "test_precision": 0.185,
          "test_recall": 0.5
        },
        "momvol": {
          "train_precision": 0,
          "train_recall": 0,
          "train_f1": 0,
          "train_fires": 24,
          "test_precision": 0,
          "test_recall": 0
        }
      },
      "backtest": {
        "train": {
          "sharpe": -0.855,
          "cagr": -0.4628,
          "mdd": 0.387,
          "trades": 28,
          "winRate": 0.357
        },
        "test": {
          "sharpe": -0.393,
          "cagr": -0.3736,
          "mdd": 0.2197,
          "trades": 8,
          "winRate": 0.5
        },
        "full": {
          "sharpe": -0.75,
          "cagr": -0.446,
          "mdd": 0.5163,
          "trades": 36,
          "winRate": 0.389
        }
      }
    },
    "SOL": {
      "coin": "SOL",
      "symbol": "solusdt",
      "period": "4hour",
      "candles": 2000,
      "span": {
        "from": 1746849600000,
        "to": 1775635200000
      },
      "swings": {
        "lows": 6,
        "highs": 6
      },
      "weights": {
        "zscore": 1
      },
      "threshold": 0.5,
      "window": 3,
      "strategyStats": {
        "ma": {
          "train_precision": 0,
          "train_recall": 0,
          "train_f1": 0,
          "train_fires": 11,
          "test_precision": 0,
          "test_recall": 0
        },
        "rsi": {
          "train_precision": 0,
          "train_recall": 0,
          "train_f1": 0,
          "train_fires": 1,
          "test_precision": 0,
          "test_recall": 0
        },
        "rsif": {
          "train_precision": 0,
          "train_recall": 0,
          "train_f1": 0,
          "train_fires": 42,
          "test_precision": 0,
          "test_recall": 0
        },
        "bb": {
          "train_precision": 0,
          "train_recall": 0,
          "train_f1": 0,
          "train_fires": 5,
          "test_precision": 0,
          "test_recall": 0
        },
        "bbf": {
          "train_precision": 0,
          "train_recall": 0,
          "train_f1": 0,
          "train_fires": 4,
          "test_precision": 0,
          "test_recall": 0
        },
        "donchian": {
          "train_precision": 0,
          "train_recall": 0,
          "train_f1": 0,
          "train_fires": 92,
          "test_precision": 0,
          "test_recall": 0
        },
        "vbf": {
          "train_precision": 0,
          "train_recall": 0,
          "train_f1": 0,
          "train_fires": 188,
          "test_precision": 0,
          "test_recall": 0
        },
        "zscore": {
          "train_precision": 0.052,
          "train_recall": 0.6,
          "train_f1": 0.095,
          "train_fires": 97,
          "test_precision": 0.16,
          "test_recall": 1
        },
        "momvol": {
          "train_precision": 0,
          "train_recall": 0,
          "train_f1": 0,
          "train_fires": 22,
          "test_precision": 0,
          "test_recall": 0
        }
      },
      "backtest": {
        "train": {
          "sharpe": -0.988,
          "cagr": -0.5327,
          "mdd": 0.4973,
          "trades": 31,
          "winRate": 0.387
        },
        "test": {
          "sharpe": -2.267,
          "cagr": -0.8137,
          "mdd": 0.3168,
          "trades": 10,
          "winRate": 0.4
        },
        "full": {
          "sharpe": -1.263,
          "cagr": -0.6112,
          "mdd": 0.6569,
          "trades": 41,
          "winRate": 0.39
        }
      }
    },
    "DOGE": {
      "coin": "DOGE",
      "symbol": "dogeusdt",
      "period": "4hour",
      "candles": 2000,
      "span": {
        "from": 1746849600000,
        "to": 1775635200000
      },
      "swings": {
        "lows": 7,
        "highs": 7
      },
      "weights": {
        "zscore": 1
      },
      "threshold": 0.5,
      "window": 3,
      "strategyStats": {
        "ma": {
          "train_precision": 0,
          "train_recall": 0,
          "train_f1": 0,
          "train_fires": 13,
          "test_precision": 0,
          "test_recall": 0
        },
        "rsi": {
          "train_precision": 0,
          "train_recall": 0,
          "train_f1": 0,
          "train_fires": 0,
          "test_precision": 0,
          "test_recall": 0
        },
        "rsif": {
          "train_precision": 0,
          "train_recall": 0,
          "train_f1": 0,
          "train_fires": 21,
          "test_precision": 0,
          "test_recall": 0
        },
        "bb": {
          "train_precision": 0,
          "train_recall": 0,
          "train_f1": 0,
          "train_fires": 3,
          "test_precision": 0,
          "test_recall": 0
        },
        "bbf": {
          "train_precision": 0,
          "train_recall": 0,
          "train_f1": 0,
          "train_fires": 3,
          "test_precision": 0,
          "test_recall": 0
        },
        "donchian": {
          "train_precision": 0,
          "train_recall": 0,
          "train_f1": 0,
          "train_fires": 80,
          "test_precision": 0,
          "test_recall": 0
        },
        "vbf": {
          "train_precision": 0,
          "train_recall": 0,
          "train_f1": 0,
          "train_fires": 138,
          "test_precision": 0,
          "test_recall": 0
        },
        "zscore": {
          "train_precision": 0.085,
          "train_recall": 0.667,
          "train_f1": 0.152,
          "train_fires": 117,
          "test_precision": 0.211,
          "test_recall": 1
        },
        "momvol": {
          "train_precision": 0,
          "train_recall": 0,
          "train_f1": 0,
          "train_fires": 32,
          "test_precision": 0,
          "test_recall": 0
        }
      },
      "backtest": {
        "train": {
          "sharpe": -0.811,
          "cagr": -0.5477,
          "mdd": 0.6,
          "trades": 34,
          "winRate": 0.382
        },
        "test": {
          "sharpe": -0.275,
          "cagr": -0.2259,
          "mdd": 0.2018,
          "trades": 6,
          "winRate": 0.333
        },
        "full": {
          "sharpe": -0.685,
          "cagr": -0.4829,
          "mdd": 0.6402,
          "trades": 39,
          "winRate": 0.385
        }
      }
    },
    "XMR": {
      "coin": "XMR",
      "symbol": "xmrusdt",
      "period": "4hour",
      "candles": 2000,
      "span": {
        "from": 1746849600000,
        "to": 1775635200000
      },
      "swings": {
        "lows": 9,
        "highs": 10
      },
      "weights": {
        "zscore": 0.7273,
        "rsif": 0.2727
      },
      "threshold": 0.3636,
      "window": 3,
      "strategyStats": {
        "ma": {
          "train_precision": 0,
          "train_recall": 0,
          "train_f1": 0,
          "train_fires": 13,
          "test_precision": 0,
          "test_recall": 0
        },
        "rsi": {
          "train_precision": 0,
          "train_recall": 0,
          "train_f1": 0,
          "train_fires": 0,
          "test_precision": 0,
          "test_recall": 0
        },
        "rsif": {
          "train_precision": 0.04,
          "train_recall": 0.286,
          "train_f1": 0.07,
          "train_fires": 50,
          "test_precision": 0.111,
          "test_recall": 0.5
        },
        "bb": {
          "train_precision": 0,
          "train_recall": 0,
          "train_f1": 0,
          "train_fires": 3,
          "test_precision": 0,
          "test_recall": 0
        },
        "bbf": {
          "train_precision": 0,
          "train_recall": 0,
          "train_f1": 0,
          "train_fires": 2,
          "test_precision": 0,
          "test_recall": 0
        },
        "donchian": {
          "train_precision": 0,
          "train_recall": 0,
          "train_f1": 0,
          "train_fires": 85,
          "test_precision": 0,
          "test_recall": 0
        },
        "vbf": {
          "train_precision": 0,
          "train_recall": 0,
          "train_f1": 0,
          "train_fires": 172,
          "test_precision": 0,
          "test_recall": 0
        },
        "zscore": {
          "train_precision": 0.107,
          "train_recall": 0.714,
          "train_f1": 0.186,
          "train_fires": 75,
          "test_precision": 0.333,
          "test_recall": 1
        },
        "momvol": {
          "train_precision": 0,
          "train_recall": 0,
          "train_f1": 0,
          "train_fires": 17,
          "test_precision": 0,
          "test_recall": 0
        }
      },
      "backtest": {
        "train": {
          "sharpe": 0.817,
          "cagr": 0.3775,
          "mdd": 0.3839,
          "trades": 30,
          "winRate": 0.333
        },
        "test": {
          "sharpe": -0.543,
          "cagr": -0.4228,
          "mdd": 0.1865,
          "trades": 9,
          "winRate": 0.444
        },
        "full": {
          "sharpe": 0.466,
          "cagr": 0.0988,
          "mdd": 0.4299,
          "trades": 39,
          "winRate": 0.333
        }
      }
    },
    "LTC": {
      "coin": "LTC",
      "symbol": "ltcusdt",
      "period": "4hour",
      "candles": 2000,
      "span": {
        "from": 1746849600000,
        "to": 1775635200000
      },
      "swings": {
        "lows": 5,
        "highs": 5
      },
      "weights": {
        "zscore": 1
      },
      "threshold": 0.5,
      "window": 3,
      "strategyStats": {
        "ma": {
          "train_precision": 0,
          "train_recall": 0,
          "train_f1": 0,
          "train_fires": 12,
          "test_precision": 0,
          "test_recall": 0
        },
        "rsi": {
          "train_precision": 0,
          "train_recall": 0,
          "train_f1": 0,
          "train_fires": 0,
          "test_precision": 0,
          "test_recall": 0
        },
        "rsif": {
          "train_precision": 0,
          "train_recall": 0,
          "train_f1": 0,
          "train_fires": 32,
          "test_precision": 0,
          "test_recall": 0
        },
        "bb": {
          "train_precision": 0,
          "train_recall": 0,
          "train_f1": 0,
          "train_fires": 0,
          "test_precision": 0,
          "test_recall": 0
        },
        "bbf": {
          "train_precision": 0,
          "train_recall": 0,
          "train_f1": 0,
          "train_fires": 3,
          "test_precision": 0,
          "test_recall": 0
        },
        "donchian": {
          "train_precision": 0,
          "train_recall": 0,
          "train_f1": 0,
          "train_fires": 77,
          "test_precision": 0,
          "test_recall": 0
        },
        "vbf": {
          "train_precision": 0,
          "train_recall": 0,
          "train_f1": 0,
          "train_fires": 167,
          "test_precision": 0,
          "test_recall": 0
        },
        "zscore": {
          "train_precision": 0.037,
          "train_recall": 0.6,
          "train_f1": 0.07,
          "train_fires": 108,
          "test_precision": 0,
          "test_recall": 0
        },
        "momvol": {
          "train_precision": 0,
          "train_recall": 0,
          "train_f1": 0,
          "train_fires": 24,
          "test_precision": 0,
          "test_recall": 0
        }
      },
      "backtest": {
        "train": {
          "sharpe": -0.521,
          "cagr": -0.3863,
          "mdd": 0.375,
          "trades": 24,
          "winRate": 0.333
        },
        "test": {
          "sharpe": 0.12,
          "cagr": -0.0686,
          "mdd": 0.1591,
          "trades": 6,
          "winRate": 0.5
        },
        "full": {
          "sharpe": -0.308,
          "cagr": -0.2924,
          "mdd": 0.4317,
          "trades": 30,
          "winRate": 0.367
        }
      }
    }
  },
  "60min": {
    "XRP": {
      "coin": "XRP",
      "symbol": "xrpusdt",
      "period": "60min",
      "candles": 2000,
      "span": {
        "from": 1768449600000,
        "to": 1775646000000
      },
      "swings": {
        "lows": 3,
        "highs": 3
      },
      "weights": {
        "zscore": 1
      },
      "threshold": 0.5,
      "window": 3,
      "strategyStats": {
        "ma": {
          "train_precision": 0,
          "train_recall": 0,
          "train_f1": 0,
          "train_fires": 18,
          "test_precision": 0,
          "test_recall": 0
        },
        "rsi": {
          "train_precision": 0,
          "train_recall": 0,
          "train_f1": 0,
          "train_fires": 1,
          "test_precision": 0,
          "test_recall": 0
        },
        "rsif": {
          "train_precision": 0,
          "train_recall": 0,
          "train_f1": 0,
          "train_fires": 29,
          "test_precision": 0,
          "test_recall": 0
        },
        "bb": {
          "train_precision": 0,
          "train_recall": 0,
          "train_f1": 0,
          "train_fires": 2,
          "test_precision": 0,
          "test_recall": 0
        },
        "bbf": {
          "train_precision": 0,
          "train_recall": 0,
          "train_f1": 0,
          "train_fires": 1,
          "test_precision": 0,
          "test_recall": 0
        },
        "donchian": {
          "train_precision": 0,
          "train_recall": 0,
          "train_f1": 0,
          "train_fires": 69,
          "test_precision": 0,
          "test_recall": 0
        },
        "vbf": {
          "train_precision": 0,
          "train_recall": 0,
          "train_f1": 0,
          "train_fires": 120,
          "test_precision": 0,
          "test_recall": 0
        },
        "zscore": {
          "train_precision": 0.056,
          "train_recall": 0.667,
          "train_f1": 0.104,
          "train_fires": 124,
          "test_precision": 0,
          "test_recall": 0
        },
        "momvol": {
          "train_precision": 0,
          "train_recall": 0,
          "train_f1": 0,
          "train_fires": 24,
          "test_precision": 0,
          "test_recall": 0
        }
      },
      "backtest": {
        "train": {
          "sharpe": -4.585,
          "cagr": -0.9384,
          "mdd": 0.4165,
          "trades": 22,
          "winRate": 0.364
        },
        "test": {
          "sharpe": 1.58,
          "cagr": 0.7234,
          "mdd": 0.118,
          "trades": 6,
          "winRate": 0.5
        },
        "full": {
          "sharpe": -3.647,
          "cagr": -0.8801,
          "mdd": 0.4511,
          "trades": 28,
          "winRate": 0.393
        }
      }
    }
  }
};

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
