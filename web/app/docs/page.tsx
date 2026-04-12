export default function DocsPage() {
  return (
    <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center p-8">
      <div className="max-w-lg w-full bg-gray-900 rounded-2xl p-8 shadow-xl border border-gray-800">
        <h1 className="text-2xl font-bold mb-2 text-center">AUTO_COIN</h1>
        <p className="text-gray-400 text-center mb-8 text-sm">
          Integrated Crypto Auto-Trading System
        </p>

        <div className="bg-gray-800 rounded-xl p-6 mb-6">
          <h2 className="text-lg font-semibold mb-3">System Guide v2.0</h2>
          <p className="text-gray-400 text-sm mb-4">
            Confluence Score + 7-Layer Risk Management + 4-Strategy Ensemble
            통합 시스템 설명서
          </p>
          <ul className="text-gray-500 text-xs space-y-1 mb-5">
            <li>• 4개 매매 전략 엔진 상세</li>
            <li>• 11개 지표 Confluence Score 채점 체계</li>
            <li>• 7-Layer 리스크 관리 (Kelly, 블랙스완, 서킷 브레이커)</li>
            <li>• 실시간 모니터링 & Telegram 알림</li>
            <li>• 웹 대시보드 & API 가이드</li>
            <li>• 향후 로드맵 (AI, HyperLiquid, 온체인)</li>
          </ul>
          <a
            href="/auto_coin_system_guide_v2.docx"
            download
            className="block w-full text-center bg-blue-600 hover:bg-blue-500 transition rounded-lg py-3 font-medium"
          >
            Download (.docx)
          </a>
        </div>

        <p className="text-gray-600 text-xs text-center">
          Updated: 2026-04-12
        </p>
      </div>
    </div>
  );
}
