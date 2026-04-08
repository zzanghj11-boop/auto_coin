import './globals.css';
import type { Metadata } from 'next';
import { ModalHost } from '@/components/Modal';

export const metadata: Metadata = {
  title: 'Auto-Coin · 암호화폐 자동매매 연구 플랫폼',
  description: '다중 전략 백테스트·페이퍼트레이딩·실시간 비교 대시보드',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>
        {children}
        <ModalHost />
      </body>
    </html>
  );
}
