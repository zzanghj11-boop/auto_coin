// /api/cron/jarvis-briefing — Vercel Cron: 매일 09:00 KST 브리핑
// 이전에는 /api/cron/jarvis?action=briefing 로 시도했으나 Vercel cron이 query string을
// 스케줄에 포함하지 않아 action 파라미터가 누락되고 모니터 모드로 빠졌음.
// 별도 path로 분리하여 문제 해결.

import { NextResponse } from 'next/server';
import {
  getBtcData, getFearGreed, getMacro,
  calcConfluence, calcRisk, sendTelegram, isAuthorizedCron,
} from '@/lib/jarvisMarket';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function GET(req: Request) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  try {
    const [btc, fg, macro] = await Promise.all([getBtcData(), getFearGreed(), getMacro()]);
    const confluence = calcConfluence(btc, fg, macro);
    const risk = calcRisk(btc, fg, macro);

    const riskEmoji = risk >= 70 ? '🔴' : risk >= 50 ? '🟡' : '🟢';
    const fgEmoji = fg.value <= 25 ? '😱' : fg.value >= 75 ? '🤑' : '😐';
    const confEmoji =
      ({ JACKPOT: '🔥🔥🔥', STRONG: '🔥', GOOD: '⭐', NEUTRAL: '😐', WAIT: '⏸' } as const)[confluence.signal] || '';

    const text = [
      `📋 *모닝 브리핑* (${new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })})`,
      '',
      `📊 *BTC* $${btc.price?.toLocaleString()} (${btc.change24h > 0 ? '+' : ''}${btc.change24h?.toFixed(1)}%)`,
      `펀딩: ${btc.fundingRate?.toFixed(4)}% | OI: ${Math.round(btc.openInterest).toLocaleString()} BTC`,
      `${fgEmoji} F&G: ${fg.value} (${fg.label})${fg.prev1d != null ? ` | 어제: ${fg.prev1d}` : ''}${fg.prev1w != null ? ` | 지난주: ${fg.prev1w}` : ''}`,
      macro.dxy ? `💵 DXY:${macro.dxy} | NQ:${macro.nq} | VIX:${macro.vix} | Gold:${macro.gold}` : '',
      macro.btcDominance ? `BTC.D: ${macro.btcDominance?.toFixed(1)}%` : '',
      '',
      `${riskEmoji} 위험도: ${risk}/100`,
      '',
      `${confEmoji} *Confluence: ${confluence.total}/100 (${confluence.signal})*`,
      `펀딩: ${confluence.funding}/25 | F&G: ${confluence.fg}/8 | 도미넌스: ${confluence.dominance}/5`,
      `${confluence.coverage}`,
    ].filter(Boolean).join('\n');

    console.log('[briefing] running', { risk, signal: confluence.signal, btcPrice: btc.price });
    const ok = await sendTelegram(text);
    return NextResponse.json({ ok, mode: 'briefing', confluence, risk });
  } catch (e: any) {
    console.error('[briefing] failed', e?.message || e);
    return NextResponse.json({ ok: false, error: e?.message || 'unknown' }, { status: 500 });
  }
}
