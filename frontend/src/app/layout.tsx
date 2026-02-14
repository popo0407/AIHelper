import type { Metadata } from 'next';
import '@/styles/globals.css';

export const metadata: Metadata = {
  title: 'AI常駐型グループチャット',
  description: 'AIアシスタントが常駐するリアルタイムグループチャットアプリケーション',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body className="min-h-screen bg-serendie-gray-50">
        {children}
      </body>
    </html>
  );
}
