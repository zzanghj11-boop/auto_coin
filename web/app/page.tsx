import Link from 'next/link';

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col">
      <header className="flex justify-between items-center gap-2 px-4 sm:px-8 py-4 sm:py-5 border-b border-border">
        <div className="font-bold text-base sm:text-lg whitespace-nowrap">⚡ Auto-Coin</div>
        <nav className="flex gap-2 sm:gap-3 text-sm">
          <Link href="/login" className="btn btn-ghost text-xs sm:text-sm whitespace-nowrap">로그인</Link>
          <Link href="/login?mode=signup" className="btn btn-primary text-xs sm:text-sm whitespace-nowrap">시작하기</Link>
        </nav>
      </header>

      <section className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-8 py-12 sm:py-20">
        <h1 className="text-3xl sm:text-5xl font-bold leading-tight mb-5 sm:mb-6 break-keep">
          암호화폐 자동매매<br className="hidden sm:inline" />{' '}
          <span className="text-accent">데이터 기반 의사결정</span>{' '}
          플랫폼
        </h1>
        <p className="text-muted text-base sm:text-lg mb-8 sm:mb-10 max-w-2xl break-keep">
          9가지 검증된 전략을 동시에 페이퍼트레이딩하고 실시간으로 비교합니다.
          백테스트·워크포워드 최적화·앙상블 투표까지 한 화면에서.
        </p>
        <div className="flex flex-wrap gap-3 sm:gap-4">
          <Link href="/login?mode=signup" className="btn btn-primary text-sm sm:text-base px-5 sm:px-6 py-2.5 sm:py-3">베타 참여</Link>
          <Link href="#features" className="btn btn-ghost text-sm sm:text-base px-5 sm:px-6 py-2.5 sm:py-3">기능 보기</Link>
        </div>

        <div id="features" className="grid sm:grid-cols-2 md:grid-cols-3 gap-4 mt-12 sm:mt-20">
          <div className="card">
            <h3 className="font-semibold mb-2">🎯 다중 전략 앙상블</h3>
            <p className="text-muted text-sm break-keep">MA Cross · RSI · 볼린저 · 돌파 · Z-Score 등 9종. 체크박스로 동시 선택, OR 결합.</p>
          </div>
          <div className="card">
            <h3 className="font-semibold mb-2">🛡️ 리스크 관리</h3>
            <p className="text-muted text-sm break-keep">ATR 기반 동적 손절/익절, Kelly 사이징, 일일 손실 서킷브레이커.</p>
          </div>
          <div className="card">
            <h3 className="font-semibold mb-2">🔐 API 키 암호화</h3>
            <p className="text-muted text-sm break-keep">AES-256-GCM 암호화 보관. 출금 권한 OFF 강제. 본인만 복호화.</p>
          </div>
        </div>

        <div className="mt-12 sm:mt-16 p-4 sm:p-5 border border-border rounded-xl bg-red/5 text-xs sm:text-sm text-muted break-keep">
          <strong className="text-red">⚠ 투자 위험 고지</strong> — 본 서비스는 투자자문/일임 서비스가 아닙니다.
          모든 거래 결정과 결과는 사용자 본인의 책임이며, 과거 성과가 미래 수익을 보장하지 않습니다.
          실거래 전 반드시 충분한 페이퍼트레이딩 검증을 거치세요.
        </div>
      </section>

      <footer className="text-center py-6 text-muted text-xs border-t border-border px-4">
        © 2026 Auto-Coin · Built on Next.js + Supabase
      </footer>
    </main>
  );
}
