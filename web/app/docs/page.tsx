export default function DocsPage() {
  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div>
        <h1 className="text-2xl font-bold">📖 시스템 가이드</h1>
        <p className="text-muted text-sm mt-1">
          auto_coin 통합 자동매매 시스템 기술 문서
        </p>
      </div>

      {/* 시스템 설명서 다운로드 카드 */}
      <div className="bg-panel rounded-xl border border-border p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex-1 min-w-[200px]">
            <h2 className="text-lg font-semibold mb-2">
              System Guide v2.0
            </h2>
            <p className="text-muted text-sm mb-4">
              Confluence Score + 7-Layer Risk Management + 4-Strategy Ensemble
              통합 시스템 전체 설명서
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-muted mb-5">
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400 inline-block" />
                4개 매매 전략 엔진 상세
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-purple-400 inline-block" />
                11개 지표 Confluence Score
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-red-400 inline-block" />
                7-Layer 리스크 관리
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block" />
                실시간 모니터링 &amp; Telegram
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 inline-block" />
                웹 대시보드 &amp; API 가이드
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 inline-block" />
                향후 로드맵 (AI, HyperLiquid)
              </div>
            </div>
          </div>
          <a
            href="/auto_coin_system_guide_v2.docx"
            download
            className="btn btn-primary px-6 py-2.5 text-sm font-medium shrink-0"
          >
            ⬇ 다운로드 (.docx)
          </a>
        </div>
        <div className="border-t border-border mt-4 pt-3 flex items-center justify-between text-xs text-muted">
          <span>49KB · Word 문서</span>
          <span>Updated: 2026-04-12</span>
        </div>
      </div>

      {/* 시스템 구성 요약 */}
      <div className="bg-panel rounded-xl border border-border p-6">
        <h2 className="text-lg font-semibold mb-4">시스템 구성 요약</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[
            { title: '매매 전략', value: '4+1', desc: 'MA Cross, RSI, BB, VB + Ensemble', color: 'text-blue-400' },
            { title: 'Confluence 지표', value: '11개', desc: 'S/A/B 티어 (4개 실측, 7개 추정)', color: 'text-purple-400' },
            { title: '리스크 레이어', value: '7단계', desc: 'Kelly → 연패 → DD → 블랙스완 → CB', color: 'text-red-400' },
            { title: '데이터 소스', value: '4개', desc: 'Binance, CoinGecko, Yahoo, F&G', color: 'text-green-400' },
            { title: '알림 채널', value: 'Telegram', desc: '위험, 기회, 브리핑, 매매 알림', color: 'text-yellow-400' },
            { title: '배포', value: 'Vercel', desc: 'Next.js + Supabase + Cron', color: 'text-cyan-400' },
          ].map((item) => (
            <div key={item.title} className="bg-surface rounded-lg p-4 border border-border">
              <div className="flex items-baseline gap-2 mb-1">
                <span className={`text-xl font-bold ${item.color}`}>{item.value}</span>
                <span className="text-sm font-medium">{item.title}</span>
              </div>
              <p className="text-xs text-muted">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* 7-Layer 리스크 관리 요약 */}
      <div className="bg-panel rounded-xl border border-border p-6">
        <h2 className="text-lg font-semibold mb-4">7-Layer 리스크 관리</h2>
        <div className="space-y-2">
          {[
            { layer: 'L1', name: '리스크 레벨', desc: 'CONSERVATIVE(10%) / NORMAL(20%) / AGGRESSIVE(30%)', tag: '판정' },
            { layer: 'L2', name: 'Kelly Criterion', desc: 'Half-Kelly 상한 25%, 10회 거래 후 활성', tag: '상한' },
            { layer: 'L3', name: '연패 패널티', desc: '2연패 ×0.75, 3연패 ×0.50, 5연패 ×0.20', tag: '감산' },
            { layer: 'L4', name: '드로우다운', desc: 'MDD 20%의 70% 도달 시 거래 중단', tag: '감산' },
            { layer: 'L5', name: '블랙스완', desc: 'F&G≤5, VIX≥45, BTC-10%, FR-0.3% 중 3개 → HALT', tag: '차단' },
            { layer: 'L6', name: '포지션 관리', desc: '트레일링 스탑 -2%, 공포/VIX 청산', tag: '종료' },
            { layer: 'L7', name: '서킷 브레이커', desc: '일일 손실 10% 초과 시 24시간 거래 정지', tag: '차단' },
          ].map((l) => (
            <div key={l.layer} className="flex items-center gap-3 bg-surface rounded-lg px-4 py-3 border border-border">
              <span className="text-xs font-mono font-bold text-blue-400 w-6">{l.layer}</span>
              <span className="text-sm font-medium w-28 shrink-0">{l.name}</span>
              <span className="text-xs text-muted flex-1">{l.desc}</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 shrink-0">{l.tag}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
