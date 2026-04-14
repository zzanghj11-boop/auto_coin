// /api/cron/jarvis — Vercel Cron 모니터링 (5분마다)
// 시장 위험/기회 감지 → Telegram 알림
// 브리핑은 별도 엔드포인트(/api/cron/jarvis-briefing)로 이동 (Vercel cron이 query string을
// 무시해서 action 파라미터 기반 분기가 실패하던 버그 해결)

import { NextResponse } from 'next/server';
import {
  getBtcData, getFearGreed, getMacro,
  calcConfluence, calcRisk, detectAlerts,
  sendTelegram, isAuthorizedCron,
} from '@/lib/jarvisMarket';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function GET(req: Request) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  // 하위 호환: 과거 ?action=briefing 으로 설정돼 있던 cron이 아직 살아있다면
  // briefing 엔드포인트로 리다이렉트 (쿼리스트링이 실제로 전달되는 수동 호출 대비)
  const { searchParams } = new URL(req.url);
  if (searchParams.get('action') === 'briefing') {
    const url = new URL(req.url);
    url.pathname = '/api/cron/jarvis-briefing';
    url.search = '';
    return NextResponse.redirect(url, 307);
  }

  try {
    const [btc, fg, macro] = await Promise.all([getBtcData(), getFearGreed(), getMacro()]);
    const confluence = calcConfluence(btc, fg, macro);
    const risk = calcRisk(btc, fg, macro);

    const alerts = detectAlerts(btc, fg, macro, confluence);

    // 데이터 수집 성공 여부를 로그로 남겨 무응답 시 원인 파악 가능하게
    console.log('[monitor] tick', {
      btcPrice: btc.price,
      btcChg: btc.change24h,
      fgValue: fg.value,
      vix: macro.vix,
      fr: btc.fundingRate,
      signal: confluence.signal,
      score: confluence.total,
      risk,
      alerts: alerts.length,
    });

    if (alerts.length > 0) {
      console.log('[monitor] alerts fired', alerts);
      for (const alert of alerts) {
        const emoji = alert.level === 'CRITICAL' ? '🚨🚨' : alert.level === 'FIRE' ? '🚨' : '🔥';
        await sendTelegram(`${emoji} *${alert.title}*\n${alert.detail}`);
      }
    }

    return NextResponse.json({
      ok: true,
      mode: 'monitor',
      alerts: alerts.length,
      alertTypes: alerts.map(a => `${a.level}:${a.title}`),
      confluence: { total: confluence.total, signal: confluence.signal },
      risk,
    });
  } catch (e: any) {
    console.error('[monitor] failed', e?.message || e);
    return NextResponse.json({ ok: false, error: e?.message || 'unknown' }, { status: 500 });
  }
}
