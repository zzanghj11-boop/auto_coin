// AES-256-GCM 로 HTX API 키 암호화
// 마스터키는 ENCRYPTION_KEY 환경변수(32바이트 hex)로만 주입. 클라이언트로 절대 노출 X.
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGO = 'aes-256-gcm';

function getKey(): Buffer {
  const hex = process.env.ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error('ENCRYPTION_KEY must be 64 hex chars (32 bytes). Generate: openssl rand -hex 32');
  }
  return Buffer.from(hex, 'hex');
}

export function encrypt(plain: string): { ct: Buffer; nonce: Buffer } {
  const key = getKey();
  const nonce = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, nonce);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { ct: Buffer.concat([enc, tag]), nonce };
}

export function decrypt(ct: Buffer, nonce: Buffer): string {
  const key = getKey();
  const tag = ct.subarray(ct.length - 16);
  const data = ct.subarray(0, ct.length - 16);
  const decipher = createDecipheriv(ALGO, key, nonce);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}
