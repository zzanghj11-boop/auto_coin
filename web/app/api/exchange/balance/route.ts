import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { decrypt } from '@/lib/crypto';
import { getBalance, aggregateBalances, HtxKey } from '@/lib/htx';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const keyId = url.searchParams.get('key_id');
  if (!keyId) return NextResponse.json({ error: 'key_id required' }, { status: 400 });

  // 1. 키 조회 + 본인 소유 확인
  const { data: row, error: keyErr } = await supabase
    .from('exchange_keys')
    .select('id,user_id,api_key_ct,api_secret_ct,key_type,dry_run,label')
    .eq('id', keyId)
    .single();
  if (keyErr || !row) return NextResponse.json({ error: 'key not found' }, { status: 404 });
  if (row.user_id !== user.id) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  // 2. 다른 활성 봇이 점유한 자본 합계 (이 키 기준)
  const { data: otherBots } = await supabase
    .from('bots')
    .select('id,initial_cash')
    .eq('exchange_key_id', keyId)
    .eq('mode', 'live')
    .is('archived_at', null);
  const allocatedToOthers = (otherBots ?? []).reduce((s, b: any) => s + Number(b.initial_cash || 0), 0);

  // 3. HTX 잔고 조회
  const debug: any = {};
  try {
    const toBuf = (v: any): Buffer => {
      debug.raw_type = typeof v;
      if (typeof v === 'string') { debug.raw_prefix = v.slice(0, 60); debug.raw_len = v.length; }
      if (Buffer.isBuffer(v)) return v;
      if (v instanceof Uint8Array) return Buffer.from(v);
      if (typeof v === 'string') {
        if (v.startsWith('\\x')) return Buffer.from(v.slice(2), 'hex');
        if (v.startsWith('0x')) return Buffer.from(v.slice(2), 'hex');
        // base64 fallback
        return Buffer.from(v, 'base64');
      }
      if (v && typeof v === 'object' && (v as any).type === 'Buffer' && Array.isArray((v as any).data)) {
        return Buffer.from((v as any).data);
      }
      return Buffer.from(v);
    };
    let apiKeyBlob = toBuf(row.api_key_ct);
    let apiSecBlob = toBuf(row.api_secret_ct);
    // PostgREST가 base64 문자열을 디코딩하지 않고 ASCII bytea로 저장한 케이스 보정.
    // base64 ASCII만으로 구성되어 있고 길이가 4의 배수이면 한 번 더 base64 디코딩.
    const looksBase64 = (b: Buffer) => b.length % 4 === 0 && /^[A-Za-z0-9+/=]+$/.test(b.toString('ascii'));
    if (looksBase64(apiKeyBlob)) apiKeyBlob = Buffer.from(apiKeyBlob.toString('ascii'), 'base64');
    if (looksBase64(apiSecBlob)) apiSecBlob = Buffer.from(apiSecBlob.toString('ascii'), 'base64');
    debug.key_blob_len = apiKeyBlob.length;
    debug.sec_blob_len = apiSecBlob.length;
    const apiKey = decrypt(apiKeyBlob.subarray(12), apiKeyBlob.subarray(0, 12));
    const apiSecret = decrypt(apiSecBlob.subarray(12), apiSecBlob.subarray(0, 12));
    const htxKey: HtxKey = { apiKey, apiSecret, keyType: (row.key_type as any) ?? 'ed25519' };

    const { accountId, list } = await getBalance(htxKey);
    const agg = aggregateBalances(list);
    const usdt = agg['USDT'] ?? 0;
    const holdings = Object.entries(agg)
      .filter(([cur]) => cur !== 'USDT')
      .map(([currency, amount]) => ({ currency, amount }))
      .sort((a, b) => b.amount - a.amount);

    return NextResponse.json({
      ok: true,
      label: row.label,
      key_type: row.key_type,
      account_id: accountId,
      usdt_total: usdt,
      allocated_to_other_bots: allocatedToOthers,
      usdt_available: Math.max(0, usdt - allocatedToOthers),
      holdings,
      dry_run: row.dry_run,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message, debug }, { status: 500 });
  }
}
