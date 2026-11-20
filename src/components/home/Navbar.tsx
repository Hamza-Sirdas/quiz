import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Link } from 'react-router-dom';
import { QuizoraLogo } from '@/components/brand/QuizoraLogo';
import { CloseIcon, MenuIcon } from '@/components/ui/Icons';
import { useAuth } from '@/context/AuthContext';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { cn } from '@/utils/cn';

export type HomeSectionId = 'ana-sayfa' | 'ozellikler';

interface NavbarProps {
  activeSection: HomeSectionId;
  onSelectSection: (section: HomeSectionId) => void;
}

export function Navbar({ activeSection, onSelectSection }: NavbarProps) {
  const { teacher } = useAuth();
  const reducedMotion = usePrefersReducedMotion();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (!mobileOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMobileOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mobileOpen]);

  const handleSectionSelect = (section: HomeSectionId) => {
    setMobileOpen(false);
    onSelectSection(section);
    if (section === 'ana-sayfa') {
      window.scrollTo({ top: 0 });
    }
  };

  const navLinkClass = (isActive: boolean) =>
    cn(
      'py-1.5 text-sm transition-[color] duration-150 border-b-2',
      isActive
        ? 'border-navy-900 font-semibold text-navy-900'
        : 'border-transparent font-medium text-navy-700 hover:text-navy-900',
    );

  const authDestination = teacher ? '/dashboard' : '/login';
  const authLabel = teacher ? 'Öğretmen Paneli' : 'Oturum Aç';

  return (
    <header className="sticky top-0 z-30 bg-powder-300 border-b border-navy-900/10">
      <a
        href="#ana-sayfa-baslik"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:bg-navy-900 focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-cream-50"
      >
        İçeriğe geç
      </a>

      <div className="max-w-6xl mx-auto px-5 sm:px-6 lg:px-8 min-h-18 py-3 flex items-center justify-between gap-4">
        <a
          href="#ana-sayfa"
          onClick={(event) => {
            event.preventDefault();
            handleSectionSelect('ana-sayfa');
          }}
          className="shrink-0 rounded-lg"
          aria-label="QUIZORA Ana Sayfa"
        >
          <QuizoraLogo size="md" />
        </a>

        <nav aria-label="Birincil" className="hidden lg:flex items-center gap-7">
          <a
            href="#ana-sayfa"
            onClick={(event) => {
              event.preventDefault();
              handleSectionSelect('ana-sayfa');
            }}
            className={navLinkClass(activeSection === 'ana-sayfa')}
          >
            Ana Sayfa
          </a>
          <Link to="/explore" className={navLinkClass(false)}>
            Keşfet
          </Link>
          <a
            href="#ozellikler"
            onClick={() => handleSectionSelect('ozellikler')}
            className={navLinkClass(activeSection === 'ozellikler')}
          >
            Özellikler
          </a>
          <Link to="/dashboard/quizzes" className={navLinkClass(false)}>
            Sınıf Modu
          </Link>
        </nav>

        <div className="hidden lg:flex items-center gap-3">
          <motion.div
            whileHover={reducedMotion ? undefined : { y: -1 }}
            whileTap={reducedMotion ? undefined : { scale: 0.99 }}
            transition={{ duration: 0.2 }}
          >
            <Link
              to={authDestination}
              className="inline-flex items-center justify-center rounded-xl border border-navy-700/75 bg-cream-50/35 hover:bg-cream-50/75 px-4 py-2 text-sm font-semibold text-navy-900 transition-colors duration-200"
            >
              {authLabel}
            </Link>
          </motion.div>
          <motion.div
            whileHover={reducedMotion ? undefined : { y: -1 }}
            whileTap={reducedMotion ? undefined : { scale: 0.99 }}
            transition={{ duration: 0.2 }}
          >
            <Link
              to="/dashboard/quizzes/new"
              className="inline-flex items-center justify-center rounded-xl bg-burgundy-600 hover:bg-burgundy-700 px-5 py-2.5 text-sm font-semibold text-cream-50 transition-colors duration-200"
            >
              Quiz Oluştur
            </Link>
          </motion.div>
        </div>

        <button
          type="button"
          className="lg:hidden inline-flex items-center justify-center min-w-11 min-h-11 rounded-xl border border-navy-900/20 bg-cream-50/45 text-navy-900 hover:bg-cream-50/80 transition-colors duration-200 cursor-pointer"
          aria-expanded={mobileOpen}
          aria-controls="mobil-menu"
          aria-label={mobileOpen ? 'Menüyü kapat' : 'Menüyü aç'}
          onClick={() => setMobileOpen((prev) => !prev)}
        >
          {mobileOpen ? <CloseIcon /> : <MenuIcon />}
        </button>
      </div>

      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            id="mobil-menu"
            initial={reducedMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reducedMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: -8 }}
            transition={{ duration: reducedMotion ? 0 : 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="lg:hidden bg-cream-50 border-t border-cream-300 border-b border-b-cream-300 shadow-card"
          >
            <nav
              aria-label="Mobil gezinme"
              className="max-w-6xl mx-auto px-5 sm:px-6 py-4 flex flex-col gap-1"
            >
              <a
                href="#ana-sayfa"
                onClick={(event) => {
                  event.preventDefault();
                  handleSectionSelect('ana-sayfa');
                }}
                className={cn(
                  'rounded-xl px-3.5 py-2.5 text-sm font-medium transition-colors duration-200',
                  activeSection === 'ana-sayfa'
                    ? 'bg-powder-100 text-burgundy-600 font-semibold'
                    : 'text-navy-900 hover:bg-cream-200',
                )}
              >
                Ana Sayfa
              </a>
              <Link
                to="/explore"
                onClick={() => setMobileOpen(false)}
                className="rounded-xl px-3.5 py-2.5 text-sm font-medium text-navy-900 hover:bg-cream-200 transition-colors duration-200"
              >
                Keşfet
              </Link>
              <a
                href="#ozellikler"
                onClick={() => handleSectionSelect('ozellikler')}
                className={cn(
                  'rounded-xl px-3.5 py-2.5 text-sm font-medium transition-colors duration-200',
                  activeSection === 'ozellikler'
                    ? 'bg-powder-100 text-burgundy-600 font-semibold'
                    : 'text-navy-900 hover:bg-cream-200',
                )}
              >
                Özellikler
              </a>
              <Link
                to="/dashboard/quizzes"
                onClick={() => setMobileOpen(false)}
                className="rounded-xl px-3.5 py-2.5 text-sm font-medium text-navy-900 hover:bg-cream-200 transition-colors duration-200"
              >
                Sınıf Modu
              </Link>

              <div className="mt-3 pt-3 border-t border-cream-300 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <Link
                  to={authDestination}
                  onClick={() => setMobileOpen(false)}
                  className="inline-flex w-full items-center justify-center rounded-xl border border-navy-700/75 bg-cream-100 hover:bg-cream-200 px-4 py-2.5 text-sm font-semibold text-navy-900 transition-colors duration-200"
                >
                  {authLabel}
                </Link>
                <Link
                  to="/dashboard/quizzes/new"
                  onClick={() => setMobileOpen(false)}
                  className="inline-flex w-full items-center justify-center rounded-xl bg-burgundy-600 hover:bg-burgundy-700 px-4 py-2.5 text-sm font-semibold text-cream-50 transition-colors duration-200"
                >
                  Quiz Oluştur
                </Link>
              </div>
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
