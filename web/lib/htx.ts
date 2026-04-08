// HTX REST API 서명 + 호출 유틸
// - hmac: HMAC-SHA256 (System Generated 키)
// - ed25519: Self-Generated 키 (PEM 또는 base64 raw)
import { createHmac, createPrivateKey, sign as nodeSign } from 'node:crypto';

export type KeyType = 'hmac' | 'ed25519';

const HOST = 'api.huobi.pro';

function pad(n: number) { return String(n).padStart(2, '0'); }
function isoTs() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

function canonicalize(params: Record<string, string>): string {
  return Object.keys(params)
    .sort()
    .map(k => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`)
    .join('&');
}

function buildPayload(method: 'GET' | 'POST', path: string, params: Record<string, string>) {
  const qs = canonicalize(params);
  return `${method}\n${HOST}\n${path}\n${qs}`;
}

function signHmac(secret: string, payload: string): string {
  return createHmac('sha256', secret).update(payload, 'utf8').digest('base64');
}

function loadEd25519PrivateKey(secret: string) {
  // 사용자가 PEM(BEGIN PRIVATE KEY) 또는 raw base64(32바이트 또는 PKCS#8)로 입력 가능
  const trimmed = secret.trim();
  if (trimmed.includes('BEGIN')) {
    return createPrivateKey({ key: trimmed, format: 'pem' });
  }
  // base64 → DER. HTX self-generated key는 보통 base64 PKCS#8 형식
  try {
    const der = Buffer.from(trimmed, 'base64');
    return createPrivateKey({ key: der, format: 'der', type: 'pkcs8' });
  } catch {
    // 마지막 시도: raw 32바이트 + PKCS#8 prefix 수동 래핑
    const raw = Buffer.from(trimmed, 'base64');
    if (raw.length !== 32) throw new Error('Ed25519 키 형식을 인식할 수 없습니다 (PEM 또는 PKCS#8 base64 필요)');
    const prefix = Buffer.from('302e020100300506032b657004220420', 'hex');
    const pkcs8 = Buffer.concat([prefix, raw]);
    return createPrivateKey({ key: pkcs8, format: 'der', type: 'pkcs8' });
  }
}

function signEd25519(secret: string, payload: string): string {
  const key = loadEd25519PrivateKey(secret);
  // Ed25519는 algorithm을 null로
  const sig = nodeSign(null, Buffer.from(payload, 'utf8'), key);
  return sig.toString('base64');
}

export interface HtxKey {
  apiKey: string;
  apiSecret: string;
  keyType: KeyType;
}

export async function htxGet<T = any>(key: HtxKey, path: string, query: Record<string, string> = {}): Promise<T> {
  const params: Record<string, string> = {
    AccessKeyId: key.apiKey,
    SignatureMethod: key.keyType === 'ed25519' ? 'Ed25519' : 'HmacSHA256',
    SignatureVersion: '2',
    Timestamp: isoTs(),
    ...query,
  };
  const payload = buildPayload('GET', path, params);
  const signature = key.keyType === 'ed25519'
    ? signEd25519(key.apiSecret, payload)
    : signHmac(key.apiSecret, payload);
  params.Signature = signature;
  const url = `https://${HOST}${path}?${canonicalize(params)}`;
  const r = await fetch(url, { method: 'GET' });
  const j = await r.json();
  if (j.status && j.status !== 'ok') {
    throw new Error(`HTX ${j['err-code'] ?? ''}: ${j['err-msg'] ?? JSON.stringify(j)}`);
  }
  return j as T;
}

// === 잔고 조회 ===
export interface AccountBalance {
  currency: string;
  type: string;       // 'trade' | 'frozen'
  balance: string;
}

export async function getSpotAccountId(key: HtxKey): Promise<string> {
  const r = await htxGet<{ data: Array<{ id: number; type: string; state: string }> }>(key, '/v1/account/accounts');
  const spot = r.data.find(a => a.type === 'spot' && a.state === 'working');
  if (!spot) throw new Error('spot 계정을 찾을 수 없음');
  return String(spot.id);
}

export async function getBalance(key: HtxKey): Promise<{ accountId: string; list: AccountBalance[] }> {
  const accountId = await getSpotAccountId(key);
  const r = await htxGet<{ data: { id: number; list: AccountBalance[] } }>(key, `/v1/account/accounts/${accountId}/balance`);
  return { accountId, list: r.data.list };
}

// 통화별 trade 잔고 합산 (사용 가능)
export function aggregateBalances(list: AccountBalance[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const b of list) {
    if (b.type !== 'trade') continue;
    const v = parseFloat(b.balance);
    if (!Number.isFinite(v) || v <= 0) continue;
    out[b.currency.toUpperCase()] = (out[b.currency.toUpperCase()] ?? 0) + v;
  }
  return out;
}
