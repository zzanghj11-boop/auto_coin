import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { encrypt } from '@/lib/crypto';

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = await req.json();
  const { label, apiKey, apiSecret, dryRun = true, keyType = 'ed25519' } = body as {
    label: string; apiKey: string; apiSecret: string; dryRun?: boolean; keyType?: 'ed25519' | 'hmac';
  };
  if (!label || !apiKey || !apiSecret) return NextResponse.json({ error: 'missing fields' }, { status: 400 });
  if (keyType !== 'ed25519' && keyType !== 'hmac') return NextResponse.json({ error: 'invalid keyType' }, { status: 400 });

  try {
    // 단순화: key/secret 각자 새 nonce 생성, ciphertext 내부에 nonce 포함
    const k = encrypt(apiKey);
    const s = encrypt(apiSecret);
    // api_key_ct = nonce(12) || ct, api_secret_ct = nonce(12) || ct
    const keyBlob = Buffer.concat([k.nonce, k.ct]);
    const secBlob = Buffer.concat([s.nonce, s.ct]);

    // PostgREST + bytea: base64 문자열로 보내면 자동 디코딩되어 raw bytes로 저장됨.
    const { error } = await supabase.from('exchange_keys').insert({
      user_id: user.id,
      exchange: 'htx',
      label,
      api_key_ct: keyBlob.toString('base64'),
      api_secret_ct: secBlob.toString('base64'),
      nonce: k.nonce.toString('base64'),
      dry_run: dryRun,
      key_type: keyType,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = await req.json();
  const { id, label, apiKey, apiSecret, dryRun, keyType } = body as {
    id: string; label?: string; apiKey?: string; apiSecret?: string; dryRun?: boolean; keyType?: 'ed25519' | 'hmac';
  };
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  // 본인 소유 확인
  const { data: existing } = await supabase
    .from('exchange_keys').select('id,user_id').eq('id', id).single();
  if (!existing) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (existing.user_id !== user.id) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  try {
    const patch: any = {};
    if (label !== undefined) patch.label = label;
    if (dryRun !== undefined) patch.dry_run = dryRun;
    if (keyType !== undefined) {
      if (keyType !== 'ed25519' && keyType !== 'hmac') return NextResponse.json({ error: 'invalid keyType' }, { status: 400 });
      patch.key_type = keyType;
    }
    if (apiKey) {
      const k = encrypt(apiKey);
      patch.api_key_ct = Buffer.concat([k.nonce, k.ct]).toString('base64');
    }
    if (apiSecret) {
      const s = encrypt(apiSecret);
      patch.api_secret_ct = Buffer.concat([s.nonce, s.ct]).toString('base64');
      patch.nonce = s.nonce.toString('base64');
    }
    if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'nothing to update' }, { status: 400 });

    const { error } = await supabase.from('exchange_keys').update(patch).eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
