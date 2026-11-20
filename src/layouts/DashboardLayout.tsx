import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Link, NavLink, Outlet, useNavigate, useOutletContext } from 'react-router-dom';
import { QuizoraLogo } from '@/components/brand/QuizoraLogo';
import { useAuth } from '@/context/AuthContext';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import {
  AlertCircleIcon,
  BookOpenIcon,
  CheckIcon,
  CloseIcon,
  CompassIcon,
  HistoryIcon,
  LayoutDashboardIcon,
  MenuIcon,
  PlusCircleIcon,
  SettingsIcon,
  ShareIcon,
  SparklesIcon,
  UserIcon,
} from '@/components/ui/Icons';
import { cn } from '@/utils/cn';

export interface DashboardToast {
  id: number;
  title: string;
  message: string;
  tone: 'success' | 'error';
}

export interface DashboardOutletContext {
  showToast: (title: string, message: string, tone?: 'success' | 'error') => void;
}

export function useDashboardToast(): DashboardOutletContext {
  return useOutletContext<DashboardOutletContext>();
}

const NAV_ITEMS = [
  {
    to: '/dashboard',
    label: 'Genel Bakış',
    end: true,
    Icon: LayoutDashboardIcon,
  },
  {
    to: '/dashboard/quizzes',
    label: 'Quizlerim',
    end: true,
    Icon: BookOpenIcon,
  },
  {
    to: '/explore',
    label: 'Keşfet',
    end: false,
    Icon: CompassIcon,
  },
  {
    to: '/dashboard/shared',
    label: 'Paylaşılan Quizler',
    end: false,
    Icon: ShareIcon,
  },
  {
    to: '/dashboard/quizzes/new',
    label: 'Yeni Quiz Oluştur',
    end: false,
    Icon: PlusCircleIcon,
  },
  {
    to: '/dashboard/ai-create',
    label: 'Yapay Zekâ ile Oluştur',
    end: false,
    Icon: SparklesIcon,
  },
  {
    to: '/dashboard/history',
    label: 'Geçmiş Yarışmalar',
    end: false,
    Icon: HistoryIcon,
  },
  {
    to: '/dashboard/profile',
    label: 'Profilim',
    end: false,
    Icon: UserIcon,
  },
  {
    to: '/dashboard/settings',
    label: 'Ayarlar',
    end: false,
    Icon: SettingsIcon,
  },
] as const;

export function DashboardLayout() {
  const navigate = useNavigate();
  const { teacher, logout } = useAuth();
  const reducedMotion = usePrefersReducedMotion();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [toast, setToast] = useState<DashboardToast | null>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const closeDrawerButtonRef = useRef<HTMLButtonElement>(null);
  const prevDrawerOpenRef = useRef(false);

  const handleLogout = useCallback(async () => {
    await logout();
    navigate('/login', { replace: true });
  }, [logout, navigate]);

  const showToast = useCallback(
    (title: string, message: string, tone: 'success' | 'error' = 'success') => {
      setToast({
        id: Date.now(),
        title,
        message,
        tone,
      });
    },
    [],
  );

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => {
      setToast(null);
    }, 4500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    const wasOpen = prevDrawerOpenRef.current;
    prevDrawerOpenRef.current = drawerOpen;

    if (drawerOpen) {
      window.requestAnimationFrame(() => {
        closeDrawerButtonRef.current?.focus();
      });
    } else if (wasOpen) {
      window.requestAnimationFrame(() => {
        menuButtonRef.current?.focus();
      });
    }
  }, [drawerOpen]);

  useEffect(() => {
    if (!drawerOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setDrawerOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [drawerOpen]);

  const renderNavContent = (onNavigate?: () => void) => (
    <div className="flex h-full flex-col justify-between p-5">
      <div>
        <Link
          to="/"
          onClick={onNavigate}
          className="inline-flex rounded-lg"
          aria-label="QUIZORA Ana Sayfa"
        >
          <QuizoraLogo size="md" />
        </Link>

        <nav aria-label="Öğretmen paneli menüsü" className="mt-8 space-y-1.5">
          {NAV_ITEMS.map(({ to, label, end, Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              onClick={onNavigate}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-xl border px-3.5 py-2.5 text-sm transition-colors duration-150',
                  isActive
                    ? 'bg-powder-100 border-powder-200 text-burgundy-600 font-semibold'
                    : 'border-transparent text-navy-700 hover:bg-cream-200 hover:text-navy-900 font-medium',
                )
              }
            >
              <Icon className="shrink-0" />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
      </div>

      <div className="mt-8 rounded-2xl bg-powder-100 border border-powder-200 p-4">
        <p className="font-display font-bold text-sm text-navy-900">
          Hızlı Başlangıç
        </p>
        <p className="mt-1 text-xs leading-relaxed text-navy-700">
          Farklı soru türleriyle süreli yeni bir bilgi yarışması hazırlayın.
        </p>
        <Link
          to="/dashboard/quizzes/new"
          onClick={onNavigate}
          className="mt-3 inline-flex w-full items-center justify-center rounded-xl bg-burgundy-600 hover:bg-burgundy-700 px-3.5 py-2 text-xs font-semibold text-cream-50 transition-colors duration-150"
        >
          Yeni Quiz Oluştur
        </Link>
      </div>
    </div>
  );

  return (
    <div className="min-h-dvh flex bg-cream-100 text-navy-900 overflow-x-clip">
      <a
        href="#panel-icerik"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:bg-navy-900 focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-cream-50"
      >
        İçeriğe geç
      </a>

      <aside
        inert={drawerOpen}
        className="hidden lg:flex lg:w-64 lg:shrink-0 lg:flex-col bg-cream-50 border-r border-cream-300 sticky top-0 h-dvh overflow-y-auto"
      >
        {renderNavContent()}
      </aside>

      <AnimatePresence>
        {drawerOpen && (
          <div className="fixed inset-0 z-40 lg:hidden flex">
            <motion.div
              initial={reducedMotion ? { opacity: 1 } : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={reducedMotion ? { opacity: 1 } : { opacity: 0 }}
              transition={{ duration: reducedMotion ? 0 : 0.2 }}
              onClick={() => setDrawerOpen(false)}
              className="fixed inset-0 bg-navy-900/40"
              aria-hidden="true"
            />
            <motion.aside
              id="panel-mobil-menu"
              role="dialog"
              aria-modal="true"
              aria-label="Öğretmen paneli menüsü"
              initial={reducedMotion ? { x: 0 } : { x: '-100%' }}
              animate={{ x: 0 }}
              exit={reducedMotion ? { x: 0 } : { x: '-100%' }}
              transition={{
                duration: reducedMotion ? 0 : 0.24,
                ease: [0.22, 1, 0.36, 1],
              }}
              className="relative z-50 w-72 max-w-[85vw] bg-cream-50 border-r border-cream-300 h-full overflow-y-auto shadow-card"
            >
              <div className="flex items-center justify-end px-4 pt-4">
                <button
                  ref={closeDrawerButtonRef}
                  type="button"
                  onClick={() => setDrawerOpen(false)}
                  aria-label="Menüyü kapat"
                  className="inline-flex items-center justify-center min-w-10 min-h-10 rounded-xl border border-cream-300 bg-cream-100 text-navy-700 hover:bg-cream-200 cursor-pointer"
                >
                  <CloseIcon />
                </button>
              </div>
              {renderNavContent(() => setDrawerOpen(false))}
            </motion.aside>
          </div>
        )}
      </AnimatePresence>

      <div inert={drawerOpen} className="flex-1 min-w-0 flex flex-col">
        <header className="sticky top-0 z-20 bg-cream-50 border-b border-cream-300">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 min-h-16 py-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <button
                ref={menuButtonRef}
                type="button"
                onClick={() => setDrawerOpen(true)}
                aria-expanded={drawerOpen}
                aria-controls="panel-mobil-menu"
                aria-label="Panel menüsünü aç"
                className="lg:hidden inline-flex items-center justify-center min-w-11 min-h-11 rounded-xl border border-cream-300 bg-cream-100 text-navy-900 hover:bg-cream-200 transition-colors duration-150 cursor-pointer"
              >
                <MenuIcon />
              </button>

              <Link
                to="/dashboard/profile"
                className="inline-flex items-center rounded-full bg-powder-100 hover:bg-powder-200 border border-powder-200 px-3 py-1 text-xs font-semibold text-burgundy-600 truncate max-w-[200px] sm:max-w-xs transition-colors duration-150"
              >
                {teacher ? `${teacher.name}` : 'Öğretmen Paneli'}
              </Link>
            </div>

            <div className="flex items-center gap-2.5">
              <Link
                to="/"
                className="hidden sm:inline-flex items-center rounded-xl border border-cream-300 bg-cream-100 hover:bg-cream-200 px-3.5 py-2 text-xs sm:text-sm font-semibold text-navy-700 transition-colors duration-150"
              >
                Ana Sayfa
              </Link>
              <Link
                to="/dashboard/quizzes/new"
                className="inline-flex items-center gap-2 rounded-xl bg-burgundy-600 hover:bg-burgundy-700 px-4 py-2 text-xs sm:text-sm font-semibold text-cream-50 transition-colors duration-150"
              >
                <PlusCircleIcon className="h-4 w-4 shrink-0" />
                <span>Yeni Quiz Oluştur</span>
              </Link>
              <button
                type="button"
                onClick={() => void handleLogout()}
                className="inline-flex items-center rounded-xl border border-cream-300 bg-cream-100 hover:bg-cream-200 px-3 py-2 text-xs sm:text-sm font-semibold text-navy-700 transition-colors duration-150 cursor-pointer"
              >
                Çıkış Yap
              </button>
            </div>
          </div>
        </header>

        <main
          id="panel-icerik"
          tabIndex={-1}
          className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-7 sm:py-9"
        >
          <Outlet context={{ showToast } satisfies DashboardOutletContext} />
        </main>
      </div>

      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast.id}
            role="status"
            aria-live="polite"
            initial={reducedMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reducedMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: 8 }}
            transition={{ duration: reducedMotion ? 0 : 0.22 }}
            className={cn(
              'fixed bottom-5 inset-x-4 sm:inset-x-auto sm:right-6 z-50 sm:max-w-md rounded-xl border p-4 shadow-card',
              toast.tone === 'error'
                ? 'bg-burgundy-50 border-burgundy-500 text-navy-900'
                : 'bg-cream-50 border-powder-500 text-navy-900',
            )}
          >
            <div className="flex items-start gap-3">
              <span className="mt-0.5 shrink-0 text-burgundy-600">
                {toast.tone === 'error' ? <AlertCircleIcon /> : <CheckIcon />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-display font-bold text-sm text-navy-900">
                  {toast.title}
                </p>
                <p className="mt-1 text-xs sm:text-sm text-navy-600">
                  {toast.message}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setToast(null)}
                aria-label="Bildirimi kapat"
                className="inline-flex items-center justify-center min-w-9 min-h-9 rounded-lg text-navy-600 hover:bg-cream-200 hover:text-navy-900 cursor-pointer shrink-0"
              >
                <CloseIcon />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
