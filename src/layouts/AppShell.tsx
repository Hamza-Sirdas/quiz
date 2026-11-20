import type { ReactNode } from 'react';
import { QuizoraLogo } from '@/components/brand/QuizoraLogo';

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="min-h-dvh flex flex-col bg-cream-100 text-navy-900">
      <header className="bg-cream-50 border-b border-cream-300">
        <div className="max-w-6xl mx-auto px-6 min-h-16 py-3 flex flex-wrap items-center justify-between gap-4">
          <QuizoraLogo size="md" />
          <span className="inline-flex items-center rounded-full bg-powder-100 border border-powder-200 px-3.5 py-1 text-xs font-semibold text-burgundy-600">
            Aşama 1 · Temel İskelet
          </span>
        </div>
      </header>

      <main className="flex-1 w-full max-w-6xl mx-auto px-6 py-10">
        {children}
      </main>

      <footer className="border-t border-cream-300 bg-cream-50">
        <div className="max-w-6xl mx-auto px-6 py-5 text-sm text-navy-600">
          QUIZORA — Gerçek Zamanlı Çok Oyunculu Bilgi Yarışması
        </div>
      </footer>
    </div>
  );
}
