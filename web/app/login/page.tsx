'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

export default function LoginPage() {
  const search = useSearchParams();
  const router = useRouter();
  const [mode, setMode] = useState<'signin' | 'signup'>(search.get('mode') === 'signup' ? 'signup' : 'signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const supabase = createClient();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setMsg(null);
    const fn = mode === 'signup'
      ? supabase.auth.signUp({ email, password, options: { emailRedirectTo: `${location.origin}/auth/callback` } })
      : supabase.auth.signInWithPassword({ email, password });
    const { error } = await fn;
    setLoading(false);
    if (error) { setMsg(error.message); return; }
    if (mode === 'signup') setMsg('확인 이메일을 보냈습니다. 메일함을 확인하세요.');
    else router.push(search.get('next') || '/dashboard');
  }

  async function handleGoogle() {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${location.origin}/auth/callback` },
    });
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div className="card w-full max-w-md">
        <Link href="/" className="text-sm text-muted hover:text-white">← 홈으로</Link>
        <h1 className="text-2xl font-bold mt-3 mb-6">
          {mode === 'signup' ? '회원가입' : '로그인'}
        </h1>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="label">이메일</label>
            <input className="input" type="email" required value={email} onChange={e => setEmail(e.target.value)} />
          </div>
          <div>
            <label className="label">비밀번호</label>
            <input className="input" type="password" required minLength={6} value={password} onChange={e => setPassword(e.target.value)} />
          </div>
          {msg && <p className="text-sm text-red">{msg}</p>}
          <button className="btn btn-primary w-full" disabled={loading}>
            {loading ? '처리 중…' : mode === 'signup' ? '가입하기' : '로그인'}
          </button>
        </form>



        <p className="mt-5 text-center text-sm text-muted">
          {mode === 'signup' ? '이미 계정이 있나요? ' : '처음이신가요? '}
          <button
            onClick={() => setMode(mode === 'signup' ? 'signin' : 'signup')}
            className="text-accent hover:underline"
          >
            {mode === 'signup' ? '로그인' : '회원가입'}
          </button>
        </p>
      </div>
    </main>
  );
}
