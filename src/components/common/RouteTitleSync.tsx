import { useEffect } from 'react';
import { matchPath, Outlet, useLocation } from 'react-router-dom';

const ROUTE_TITLES: ReadonlyArray<{ pattern: string; title: string }> = [
  { pattern: '/', title: 'QUIZORA — Gerçek Zamanlı Bilgi Yarışması' },
  { pattern: '/login', title: 'Öğretmen Girişi | QUIZORA' },
  { pattern: '/register', title: 'Öğretmen Kaydı | QUIZORA' },
  { pattern: '/forgot-password', title: 'Şifremi Unuttum | QUIZORA' },
  { pattern: '/reset-password', title: 'Yeni Şifre Belirle | QUIZORA' },
  { pattern: '/join', title: 'Oyuna Katıl | QUIZORA' },
  { pattern: '/explore', title: 'Quiz Keşfet | QUIZORA' },
  { pattern: '/explore/:quizId', title: 'Quiz Detayı | QUIZORA' },
  { pattern: '/host/:pin', title: 'Öğretmen Kontrol Merkezi | QUIZORA' },
  { pattern: '/present/:pin', title: 'Sınıf Projeksiyon Görünümü | QUIZORA' },
  { pattern: '/play/:pin', title: 'Canlı Yarışma | QUIZORA' },
  { pattern: '/dashboard', title: 'Öğretmen Paneli | QUIZORA' },
  { pattern: '/dashboard/quizzes', title: 'Quizlerim | QUIZORA' },
  { pattern: '/dashboard/quizzes/new', title: 'Yeni Quiz Oluştur | QUIZORA' },
  { pattern: '/dashboard/quizzes/:id/edit', title: 'Quizi Düzenle | QUIZORA' },
  { pattern: '/dashboard/ai-create', title: 'Yapay Zekâ ile Quiz Oluştur | QUIZORA' },
  { pattern: '/dashboard/shared', title: 'Paylaşılan Quizler | QUIZORA' },
  { pattern: '/dashboard/history', title: 'Geçmiş Yarışmalar | QUIZORA' },
  { pattern: '/dashboard/history/:sessionId', title: 'Yarışma Analizi | QUIZORA' },
  { pattern: '/dashboard/profile', title: 'Profilim | QUIZORA' },
  { pattern: '/dashboard/settings', title: 'Ayarlar | QUIZORA' },
];

export function resolveRouteDocumentTitle(pathname: string): string {
  for (const entry of ROUTE_TITLES) {
    if (matchPath({ path: entry.pattern, end: true }, pathname)) {
      return entry.title;
    }
  }
  return 'QUIZORA — Gerçek Zamanlı Bilgi Yarışması';
}

export function RouteTitleShell() {
  const { pathname } = useLocation();

  useEffect(() => {
    document.title = resolveRouteDocumentTitle(pathname);
  }, [pathname]);

  return <Outlet />;
}
