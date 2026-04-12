/**
 * auto_coin × jarvis-v2 — 텔레그램 알림 모듈
 *
 * jarvis-v2의 telegram.js를 auto_coin용으로 이식.
 * 환경변수:
 *   TELEGRAM_BOT_TOKEN — 봇 토큰
 *   TELEGRAM_CHAT_ID   — 알림 받을 채팅 ID
 *
 * 사용법:
 *   const tg = require('./jarvis/telegram');
 *   await tg.send('📊 매매 시그널: BUY');
 *   await tg.notifyTrade({ action: 'BUY', symbol: 'btcusdt', ... });
 */
'use strict';

const { COOLDOWNS } = require('./constants');

// 환경변수는 lazy하게 읽음 (dotenv가 먼저 로드될 수 있도록)
function _getToken() { return process.env.TELEGRAM_BOT_TOKEN; }
function _getChatId() { return process.env.TELEGRAM_CHAT_ID; }

let _lastNotifyAt = 0;

/**
 * 텔레그램 메시지 전송
 * @param {string} text - 전송할 텍스트 (Markdown 지원)
 * @param {boolean} force - 쿨다운 무시
 * @param {Object} options - { plain: false, parseMode: 'Markdown' }
 */
async function send(text, force = false, options = {}) {
  try {
    const BOT_TOKEN = _getToken();
    const CHAT_ID = _getChatId();

    if (!BOT_TOKEN || !CHAT_ID) {
      console.warn('[telegram] BOT_TOKEN 또는 CHAT_ID 환경변수 없음 — 알림 생략');
      return false;
    }

    if (!force && Date.now() - _lastNotifyAt < COOLDOWNS.TELEGRAM) {
      console.log('[telegram] 쿨다운 중 — 알림 생략');
      return false;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    const body = { chat_id: CHAT_ID, text };
    if (!options.plain) body.parse_mode = 'Markdown';

    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(`HTTP ${res.status}: ${errBody}`);
    }

    _lastNotifyAt = Date.now();
    console.log('[telegram] ✅ 메시지 전송 성공');
    return true;
  } catch (err) {
    if (err.name === 'AbortError') {
      console.error('[telegram] 전송 타임아웃 (10초 초과)');
    } else {
      console.error('[telegram] 전송 실패:', err.message);
    }
    return false;
  }
}

/**
 * 매매 시그널 알림
 * @param {Object} trade - { action, symbol, price, strategy, reason }
 */
async function notifyTrade(trade) {
  const emoji = trade.action === 'BUY' ? '🟢' : trade.action === 'SELL' ? '🔴' : '⚪';
  const text = [
    `${emoji} *${trade.action}* ${trade.symbol?.toUpperCase() || 'BTC'}`,
    `가격: $${trade.price?.toLocaleString() || '?'}`,
    `전략: ${trade.strategy || '?'}`,
    trade.reason ? `사유: ${trade.reason}` : '',
    `시각: ${new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}`,
  ].filter(Boolean).join('\n');

  return send(text, true);
}

/**
 * 시장 요약 알림 (dataFeed.getSummaryText() 결과를 전송)
 */
async function notifyMarketSummary(summaryText) {
  const header = `📋 *시장 현황* (${new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })})`;
  return send(`${header}\n\n${summaryText}`, true);
}

/**
 * 위험 경보 알림
 */
async function notifyAlert(title, detail) {
  const text = `🚨 *${title}*\n${detail}`;
  return send(text, true);
}

/**
 * 시스템 상태 알림
 */
async function notifySystem(message) {
  return send(`🤖 ${message}`, true, { plain: true });
}

/**
 * 연결 테스트
 */
async function test() {
  return send('✅ auto\\_coin 텔레그램 연결 테스트 성공!', true);
}

module.exports = {
  send,
  notifyTrade,
  notifyMarketSummary,
  notifyAlert,
  notifySystem,
  test,
};
