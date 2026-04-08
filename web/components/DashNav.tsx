'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function DashNav({ email }: { email: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  async function logout() { await supabase.auth.signOut(); router.push('/'); }
  const item = (href: string, label: string) => (
    <Link
      href={href}
      className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-xs sm:text-sm whitespace-nowrap ${pathname === href || pathname.startsWith(href + '/') ? 'bg-panel text-white' : 'text-muted hover:text-white'}`}
    >
      {label}
    </Link>
  );
  return (
    <header className="flex items-center justify-between gap-2 px-3 sm:px-6 py-3 sm:py-4 border-b border-border">
      <div className="flex items-center gap-2 sm:gap-4 min-w-0 flex-1">
        <Link href="/dashboard" className="font-bold whitespace-nowrap text-sm sm:text-base">⚡ Auto-Coin</Link>
        <nav className="flex gap-0.5 sm:gap-1 overflow-x-auto no-scrollbar">
          {item('/dashboard', '대시보드')}
          {item('/bots/new', '새 봇')}
          {item('/bots/new-composite', '🧬 합성봇')}
          {item('/settings/keys', 'API 키')}
        </nav>
      </div>
      <div className="flex items-center gap-2 text-sm text-muted shrink-0">
        <span className="hidden md:inline max-w-[160px] truncate">{email}</span>
        <button onClick={logout} className="btn btn-ghost text-xs py-1 whitespace-nowrap">로그아웃</button>
      </div>
    </header>
  );
}
