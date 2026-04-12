/**
 * auto_coin × jarvis-v2 — 시장 모니터링 + 능동 알림
 *
 * jarvis-v2의 market-monitor + active-brain 개념을 auto_coin에 이식.
 * 주기적으로 시장 상태를 점검하고, 위험/기회 감지 시 텔레그램 알림.
 *
 * 기능:
 *   1. 🔴 화재경보 — BTC 급변, VIX 급등, 펀딩비 극단
 *   2. 🟡 기회포착 — F&G 극단 공포, 펀딩비 숏 과열
 *   3. 🔵 정기 브리핑 — 시장 현황 요약 전송
 *
 * 사용법:
 *   const monitor = require('./jarvis/marketMonitor');
 *   const alerts = await monitor.checkAll();
 *   // 또는 CLI: node src/jarvis/marketMonitor.js
 */
'use strict';

const dataFeed = require('./dataFeed');
const telegram = require('./telegram');
const confluence = require('./confluenceScore');
const riskManager = require('./riskManager');
const { MARKET_THRESHOLDS, FG_THRESHOLDS } = require('./constants');
const fs = require('fs');
const path = require('path');

const ALERT_LOG = path.join(__dirname, '../../data/jarvis_alert_log.json');

// 중복 알림 방지 (같은 유형 1시간 이내 재발송 안함)
let _sentAlerts = {};

function _loadAlertLog() {
  try {
    if (fs.existsSync(ALERT_LOG)) {
      _sentAlerts = JSON.parse(fs.readFileSync(ALERT_LOG, 'utf8'));
    }
  } catch { _sentAlerts = {}; }
}

function _saveAlertLog() {
  try {
    fs.writeFileSync(ALERT_LOG, JSON.stringify(_sentAlerts, null, 2));
  } catch { /* ignore */ }
}

function _canSend(type, cooldownMs = 3_600_000) {
  const last = _sentAlerts[type] || 0;
  return Date.now() - last > cooldownMs;
}

function _markSent(type) {
  _sentAlerts[type] = Date.now();
  _saveAlertLog();
}

// ─── 화재경보 체크 (🔴) ───────────────────────────────────────

/**
 * BTC 가격 급변 감지
 */
function checkPriceShock(snapshot) {
  const change = Math.abs(snapshot.btc.change24h || 0);
  if (change >= MARKET_THRESHOLDS.PRICE_SHOCK_1H) {
    const direction = snapshot.btc.change24h > 0 ? '급등' : '급락';
    return {
      type: 'price_shock',
      level: 'fire',
      title: `🔴 BTC ${direction} 경보`,
      detail: `24h 변동: ${snapshot.btc.change24h > 0 ? '+' : ''}${snapshot.btc.change24h.toFixed(1)}%\n현재가: $${snapshot.btc.price?.toLocaleString()}`,
    };
  }
  return null;
}

/**
 * VIX 급등 감지
 */
function checkVixSpike(snapshot) {
  if (snapshot.macro.vix && snapshot.macro.vix >= MARKET_THRESHOLDS.VIX_SPIKE) {
    return {
      type: 'vix_spike',
      level: 'fire',
      title: '🔴 VIX 공포 급등',
      detail: `VIX: ${snapshot.macro.vix} (임계: ${MARKET_THRESHOLDS.VIX_SPIKE})`,
    };
  }
  return null;
}

/**
 * 펀딩비 극단 감지
 */
function checkFundingExtreme(snapshot) {
  const fr = snapshot.btc.fundingRate;
  if (fr && fr <= MARKET_THRESHOLDS.FUNDING_EXTREME) {
    return {
      type: 'funding_extreme',
      level: 'opportunity',
      title: '🟡 펀딩비 극단 숏 과열',
      detail: `펀딩비: ${fr.toFixed(4)}% (숏 과열 → 롱 기회 가능성)\nAPR: ${snapshot.btc.fundingApr?.toFixed(1)}%`,
    };
  }
  if (fr && fr >= 0.10) {
    return {
      type: 'funding_extreme_long',
      level: 'fire',
      title: '🔴 펀딩비 극단 롱 과열',
      detail: `펀딩비: ${fr.toFixed(4)}% (롱 과열 → 조정 위험)\nAPR: ${snapshot.btc.fundingApr?.toFixed(1)}%`,
    };
  }
  return null;
}

// ─── Confluence 시그널 체크 ────────────────────────────────────

/**
 * Confluence Score STRONG/JACKPOT 감지 → 매수 기회 알림
 */
function checkConfluenceSignal(snapshot) {
  try {
    const result = confluence.calculateFromSnapshot(snapshot);
    if (result.signal === 'JACKPOT') {
      return {
        type: 'confluence_jackpot',
        level: 'opportunity',
        title: '🔥🔥🔥 JACKPOT 시그널 감지!',
        detail: `Confluence Score: ${result.total}/100\n${result.coverage}\n신뢰도: ${result.confidence}\n\n역사적 매수 구간 — 연 3~7회 발생`,
      };
    }
    if (result.signal === 'STRONG') {
      return {
        type: 'confluence_strong',
        level: 'opportunity',
        title: '🔥 STRONG 매수 시그널',
        detail: `Confluence Score: ${result.total}/100\n${result.coverage}\n신뢰도: ${result.confidence}`,
      };
    }
  } catch (e) {
    console.warn('[monitor] Confluence 체크 실패:', e.message);
  }
  return null;
}

/**
 * 블랙스완 감지 → 긴급 경고
 */
function checkBlackSwanAlert(snapshot) {
  try {
    const bs = riskManager.checkBlackSwan(snapshot);
    if (bs.isBlackSwan) {
      return {
        type: 'black_swan',
        level: 'fire',
        title: '🚨🚨 블랙스완 경보 — 거래 중단',
        detail: `${bs.count}/5 조건 충족:\n${bs.triggered.join('\n')}\n\n모든 신규 진입 차단됨`,
      };
    }
  } catch (e) {
    console.warn('[monitor] 블랙스완 체크 실패:', e.message);
  }
  return null;
}

// ─── 기회포착 체크 (🟡) ───────────────────────────────────────

/**
 * F&G 극단 공포 감지 → 매수 기회
 */
function checkFearGreedOpportunity(snapshot) {
  const fg = snapshot.fearGreed.value;
  if (fg <= FG_THRESHOLDS.EXTREME_FEAR) {
    return {
      type: 'fg_extreme_fear',
      level: 'opportunity',
      title: '🟡 극단 공포 구간 — 매수 기회',
      detail: `F&G: ${fg} (${snapshot.fearGreed.label})\n역사적으로 이 구간은 바닥 형성 가능성 높음`,
    };
  }
  if (fg >= FG_THRESHOLDS.EXTREME_GREED) {
    return {
      type: 'fg_extreme_greed',
      level: 'warning',
      title: '🟡 극단 탐욕 구간 — 주의',
      detail: `F&G: ${fg} (${snapshot.fearGreed.label})\n과열 구간 — 신규 진입 자제 권고`,
    };
  }
  return null;
}

// ─── 메인 체크 함수 ──────────────────────────────────────────

/**
 * 모든 조건 체크 → 알림 발송
 * @returns {Array} 발동된 알림 목록
 */
async function checkAll() {
  _loadAlertLog();

  // 데이터 수집
  const snapshot = await dataFeed.fetchAll();
  if (!snapshot.btc.price) {
    console.warn('[monitor] 데이터 수집 실패 — 체크 스킵');
    return [];
  }

  // 체크 실행
  const checks = [
    checkPriceShock(snapshot),
    checkVixSpike(snapshot),
    checkFundingExtreme(snapshot),
    checkFearGreedOpportunity(snapshot),
    checkConfluenceSignal(snapshot),
    checkBlackSwanAlert(snapshot),
  ].filter(Boolean);

  // 알림 발송 (중복 방지)
  const sent = [];
  for (const alert of checks) {
    if (_canSend(alert.type)) {
      const ok = await telegram.notifyAlert(alert.title, alert.detail);
      if (ok) {
        _markSent(alert.type);
        sent.push(alert);
      }
    }
  }

  if (sent.length > 0) {
    console.log(`[monitor] ${sent.length}건 알림 발송 완료`);
  }

  return sent;
}

/**
 * 시장 요약 브리핑 전송 (수동 호출 또는 cron)
 * Confluence Score + 리스크 분석 포함
 */
async function sendBriefing() {
  const snapshot = await dataFeed.fetchAll();
  const summary = dataFeed.getSummaryText();
  const risk = dataFeed.getRiskScore();
  const riskEmoji = risk >= 70 ? '🔴' : risk >= 50 ? '🟡' : '🟢';

  // Confluence Score 계산
  let confluenceText = '';
  try {
    const score = confluence.calculateFromSnapshot(snapshot);
    confluenceText = `\n\n${confluence.formatScore(score)}`;
  } catch (e) {
    confluenceText = '\n\n(Confluence Score 계산 실패)';
  }

  // 블랙스완 체크
  let bsText = '';
  try {
    const bs = riskManager.checkBlackSwan(snapshot);
    if (bs.count > 0) {
      bsText = `\n\n⚠️ 블랙스완 ${bs.count}/5: ${bs.triggered.join(', ')}`;
    }
  } catch { /* ignore */ }

  const fullText = `${summary}\n\n${riskEmoji} 위험도: ${risk}/100${confluenceText}${bsText}`;
  return telegram.notifyMarketSummary(fullText);
}

module.exports = {
  checkAll,
  sendBriefing,
  checkPriceShock,
  checkVixSpike,
  checkFundingExtreme,
  checkFearGreedOpportunity,
  checkConfluenceSignal,
  checkBlackSwanAlert,
};

// ─── CLI 직접 실행 ──────────────────────────────────────────
if (require.main === module) {
  try { require('dotenv').config(); } catch { /* dotenv 없으면 환경변수 직접 설정 필요 */ }
  const cmd = process.argv[2];
  if (cmd === 'briefing') {
    sendBriefing().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
  } else {
    checkAll().then(alerts => {
      console.log(`\n=== ${alerts.length}건 알림 발동 ===`);
      alerts.forEach(a => console.log(`[${a.level}] ${a.title}`));
      process.exit(0);
    }).catch(e => { console.error(e); process.exit(1); });
  }
}
