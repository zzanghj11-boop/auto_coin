/**
 * auto_coin × jarvis-v2 — 통합 진입점
 *
 * 사용법:
 *   const jarvis = require('./jarvis');
 *
 *   // 1) 시장 데이터 한번에 수집
 *   const snapshot = await jarvis.data.fetchAll();
 *
 *   // 2) 텔레그램 알림
 *   await jarvis.telegram.send('📊 테스트 메시지');
 *
 *   // 3) 시장 모니터링 (위험/기회 체크 + 자동 알림)
 *   const alerts = await jarvis.monitor.checkAll();
 *
 *   // 4) 시장 브리핑 전송
 *   await jarvis.monitor.sendBriefing();
 *
 *   // 5) 위험도 점수 (0~100, 높을수록 위험)
 *   const risk = jarvis.data.getRiskScore();
 */
'use strict';

const data = require('./dataFeed');
const telegram = require('./telegram');
const monitor = require('./marketMonitor');

module.exports = { data, telegram, monitor };
