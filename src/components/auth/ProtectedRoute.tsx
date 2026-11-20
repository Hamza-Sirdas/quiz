import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { QuizoraLogo } from '@/components/brand/QuizoraLogo';
import { useAuth } from '@/context/AuthContext';

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { teacher, loading, sessionExpired } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center bg-cream-100 text-navy-900 p-6">
        <QuizoraLogo size="md" />
        <p className="mt-4 text-sm font-medium text-navy-600">
          Oturum doğrulanıyor...
        </p>
      </div>
    );
  }

  if (!teacher) {
    const nextPath = `${location.pathname}${location.search}`;
    const target = sessionExpired
      ? `/login?next=${encodeURIComponent(nextPath)}&reason=expired`
      : `/login?next=${encodeURIComponent(nextPath)}`;
    return <Navigate to={target} replace />;
  }

  return <>{children}</>;
}
