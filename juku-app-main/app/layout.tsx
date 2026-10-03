import './globals.css';
import type { Metadata, Viewport } from 'next';

export const viewport: Viewport = {
  themeColor: '#0284C7',
};

export const metadata: Metadata = {
  title: 'Y Log - 学習スケジュール＆ログ',
  description: '中高生向け・高密度学習スケジューラー＆ログ管理',
  applicationName: 'Y Log',
  manifest: '/manifest.json',
  icons: {
    icon: [{ url: '/logo.png', type: 'image/png', sizes: '512x512' }],
    apple: [{ url: '/logo.png', type: 'image/png', sizes: '512x512' }],
  },
  appleWebApp: {
    capable: true,
    title: 'Y Log',
    statusBarStyle: 'default',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body className="antialiased">{children}</body>
    </html>
  );
}
