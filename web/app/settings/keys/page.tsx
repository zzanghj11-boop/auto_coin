'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import DashNav from '@/components/DashNav';
import { fmtDateTime } from '@/lib/fmt';
import { useModal } from '@/components/Modal';

interface Key { id: string; label: string | null; dry_run: boolean; key_type?: string | null; created_at: string; last_used_at: string | null; }

export default function KeysPage() {
  const supabase = createClient();
  const router = useRouter();
  const modal = useModal();
  const [email, setEmail] = useState('');
  const [keys, setKeys] = useState<Key[]>([]);
  const [label, setLabel] = useState('HTX Main');
  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [dryRun, setDryRun] = useState(true);
  const [keyType, setKeyType] = useState<'ed25519' | 'hmac'>('ed25519');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [edit, setEdit] = useState({ label: '', apiKey: '', apiSecret: '', dryRun: true, keyType: 'ed25519' as 'ed25519' | 'hmac' });

  async function load() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push('/login'); return; }
    setEmail(user.email ?? '');
    const { data } = await supabase.from('exchange_keys').select('id,label,dry_run,key_type,created_at,last_used_at').order('created_at', { ascending: false });
    setKeys((data ?? []) as any);
  }
  useEffect(() => { load(); }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    const r = await fetch('/api/keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label, apiKey, apiSecret, dryRun, keyType }),
    });
    const j = await r.json();
    setBusy(false);
    if (!r.ok) { setMsg(j.error || '저장 실패'); return; }
    setApiKey(''); setApiSecret(''); setLabel('HTX Main');
    setMsg('저장되었습니다.');
    load();
  }

  function startEdit(k: Key) {
    setEditId(k.id);
    setEdit({ label: k.label ?? '', apiKey: '', apiSecret: '', dryRun: k.dry_run, keyType: (k.key_type as any) || 'ed25519' });
    setMsg(null);
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editId) return;
    setBusy(true); setMsg(null);
    const body: any = { id: editId, label: edit.label, dryRun: edit.dryRun, keyType: edit.keyType };
    if (edit.apiKey) body.apiKey = edit.apiKey;
    if (edit.apiSecret) body.apiSecret = edit.apiSecret;
    const r = await fetch('/api/keys', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const j = await r.json();
    setBusy(false);
    if (!r.ok) { setMsg(j.error || '수정 실패'); return; }
    setEditId(null);
    setMsg('수정되었습니다.');
    load();
  }

  async function del(id: string) {
    const ok = await modal.confirm('이 API 키를 삭제하시겠습니까?\n복구할 수 없습니다.', { title: 'API 키 삭제', variant: 'danger', confirmLabel: '삭제' });
    if (!ok) return;
    await supabase.from('exchange_keys').delete().eq('id', id);
    load();
  }

  return (
    <div className="min-h-screen">
      <DashNav email={email} />
      <main className="max-w-3xl mx-auto px-6 py-6 space-y-5">
        <h1 className="text-2xl font-bold">HTX API 키</h1>

        <div className="card border-red/40 bg-red/5 text-sm space-y-1">
          <p className="text-red font-semibold">⚠ 키 등록 전 필독</p>
          <ul className="text-muted list-disc pl-5 space-y-1">
            <li>HTX에서 발급 시 <strong>출금(Withdraw) 권한은 반드시 OFF</strong> 하세요. Trade 권한만.</li>
            <li>가능하면 IP 화이트리스트를 설정하세요.</li>
            <li>키는 AES-256-GCM으로 암호화되어 저장되며, 복호화는 서버에서만 일어납니다.</li>
            <li>처음에는 DryRun 모드로 테스트하세요.</li>
          </ul>
        </div>

        <form onSubmit={save} className="card space-y-3">
          <h3 className="font-semibold">새 키 등록</h3>
          <div>
            <label className="label">라벨</label>
            <input className="input" value={label} onChange={e => setLabel(e.target.value)} required />
          </div>
          <div>
            <label className="label">키 종류</label>
            <div className="flex gap-2">
              <button type="button" onClick={() => setKeyType('ed25519')}
                className={`btn flex-1 ${keyType === 'ed25519' ? 'btn-primary' : 'btn-ghost'}`}>
                Self-Generated (Ed25519) ✓ 권장
              </button>
              <button type="button" onClick={() => setKeyType('hmac')}
                className={`btn flex-1 ${keyType === 'hmac' ? 'btn-primary' : 'btn-ghost'}`}>
                System Generated (HMAC)
              </button>
            </div>
            <p className="text-[11px] text-muted mt-1">
              {keyType === 'ed25519'
                ? 'HTX 비대칭키 생성기로 발급한 PEM/Base64 PKCS#8 개인키를 Secret 칸에 붙여넣으세요. HTX 서버에 비밀키가 노출되지 않습니다.'
                : 'HTX 웹에서 발급받은 일반 HMAC 키. Secret은 HTX가 보관합니다.'}
            </p>
          </div>
          <div>
            <label className="label">API Key</label>
            <input className="input font-mono" value={apiKey} onChange={e => setApiKey(e.target.value)} required />
          </div>
          <div>
            <label className="label">{keyType === 'ed25519' ? 'Private Key (PEM 또는 Base64 PKCS#8)' : 'API Secret'}</label>
            {keyType === 'ed25519' ? (
              <textarea className="input font-mono text-xs" rows={5} value={apiSecret} onChange={e => setApiSecret(e.target.value)} required placeholder="-----BEGIN PRIVATE KEY-----&#10;...&#10;-----END PRIVATE KEY-----" />
            ) : (
              <input className="input font-mono" type="password" value={apiSecret} onChange={e => setApiSecret(e.target.value)} required />
            )}
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={dryRun} onChange={e => setDryRun(e.target.checked)} />
            DryRun 모드 (실 주문 안 나감, 기본값)
          </label>
          {msg && <p className="text-sm">{msg}</p>}
          <button className="btn btn-primary" disabled={busy}>{busy ? '저장 중…' : '저장'}</button>
        </form>

        <div className="card">
          <h3 className="label mb-3">등록된 키</h3>
          {keys.length === 0 ? (
            <p className="text-sm text-muted">없음</p>
          ) : (
            <ul className="divide-y divide-border text-sm">
              {keys.map(k => (
                <li key={k.id} className="py-3">
                  {editId === k.id ? (
                    <form onSubmit={saveEdit} className="space-y-2">
                      <input className="input" value={edit.label} onChange={e => setEdit({ ...edit, label: e.target.value })} placeholder="라벨" required />
                      <div className="flex gap-2">
                        <button type="button" onClick={() => setEdit({ ...edit, keyType: 'ed25519' })}
                          className={`btn flex-1 ${edit.keyType === 'ed25519' ? 'btn-primary' : 'btn-ghost'}`}>Ed25519</button>
                        <button type="button" onClick={() => setEdit({ ...edit, keyType: 'hmac' })}
                          className={`btn flex-1 ${edit.keyType === 'hmac' ? 'btn-primary' : 'btn-ghost'}`}>HMAC</button>
                      </div>
                      <input className="input font-mono" value={edit.apiKey} onChange={e => setEdit({ ...edit, apiKey: e.target.value })} placeholder="새 API Key (변경 시에만 입력)" />
                      {edit.keyType === 'ed25519' ? (
                        <textarea className="input font-mono text-xs" rows={4} value={edit.apiSecret} onChange={e => setEdit({ ...edit, apiSecret: e.target.value })} placeholder="새 Private Key PEM (변경 시에만 입력)" />
                      ) : (
                        <input className="input font-mono" type="password" value={edit.apiSecret} onChange={e => setEdit({ ...edit, apiSecret: e.target.value })} placeholder="새 Secret (변경 시에만 입력)" />
                      )}
                      <label className="flex items-center gap-2 text-sm">
                        <input type="checkbox" checked={edit.dryRun} onChange={e => setEdit({ ...edit, dryRun: e.target.checked })} />
                        DryRun 모드
                      </label>
                      <div className="flex gap-2">
                        <button className="btn btn-primary text-xs" disabled={busy}>{busy ? '저장 중…' : '저장'}</button>
                        <button type="button" onClick={() => setEditId(null)} className="btn btn-ghost text-xs">취소</button>
                      </div>
                    </form>
                  ) : (
                    <div className="flex justify-between items-center">
                      <div>
                        <div className="font-medium">{k.label} <span className="text-[10px] text-muted">[{k.key_type || 'ed25519'}]</span></div>
                        <div className="text-xs text-muted">
                          {k.dry_run ? 'DryRun' : 'LIVE'} · 등록 {fmtDateTime(k.created_at)}
                          {k.last_used_at && ` · 마지막 사용 ${fmtDateTime(k.last_used_at)}`}
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <button onClick={() => startEdit(k)} className="btn btn-ghost text-xs">수정</button>
                        <button onClick={() => del(k.id)} className="btn btn-ghost text-xs text-red">삭제</button>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
    </div>
  );
}
