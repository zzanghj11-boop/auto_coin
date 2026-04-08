-- exchange_keys.key_type: 'ed25519' (Self-Generated) | 'hmac' (System Generated)
alter table exchange_keys add column if not exists key_type text not null default 'ed25519';
-- 기존 row는 hmac으로 마킹 (이번 마이그레이션 이전 등록분)
update exchange_keys set key_type = 'hmac' where created_at < '2026-04-08';
