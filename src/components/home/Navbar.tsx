import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Link } from 'react-router-dom';
import { QuizoraLogo } from '@/components/brand/QuizoraLogo';
import { EASE_OUT_EXPO } from '@/components/home/motion/tokens';
import { CloseIcon, MenuIcon } from '@/components/ui/Icons';
import { useAuth } from '@/context/AuthContext';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { cn } from '@/utils/cn';

export type HomeSectionId =
  | 'ana-sayfa'
  | 'mini-quiz'
  | 'nasil-calisir'
  | 'canli-vitrin'
  | 'ozellikler';

interface NavbarProps {
  activeSection: HomeSectionId;
  onSelectSection: (section: HomeSectionId) => void;
}

const mobileListVariants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.035, delayChildren: 0.02 },
  },
};

const mobileItemVariants = {
  hidden: { opacity: 0, x: -8 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.2, ease: EASE_OUT_EXPO },
  },
};

export function Navbar({ activeSection, onSelectSection }: NavbarProps) {
  const { teacher } = useAuth();
  const reducedMotion = usePrefersReducedMotion();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > 16);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

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
      'q-navlink q-focus inline-flex items-center min-h-9 px-3.5 py-1.5 rounded-xl text-sm transition-colors duration-150 border',
      isActive
        ? 'bg-cream-50 border-burgundy-600/35 text-burgundy-700 font-semibold shadow-xs'
        : 'border-transparent font-medium text-navy-700 hover:text-navy-900 hover:bg-cream-50/60',
    );

  const authDestination = teacher ? '/dashboard' : '/login';
  const authLabel = teacher ? 'Öğretmen Paneli' : 'Oturum Aç';

  return (
    <header
      className={cn(
        'sticky top-0 z-30 transition-[background-color,border-color,box-shadow,padding] duration-200',
        scrolled
          ? 'bg-cream-50/95 backdrop-blur-md border-b border-cream-300 shadow-card py-2.5'
          : 'bg-powder-300/95 border-b border-navy-900/10 py-3.5',
      )}
    >
      <a
        href="#ana-sayfa-baslik"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:bg-navy-900 focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-cream-50"
      >
        İçeriğe geç
      </a>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-3 sm:gap-4">
        <a
          href="#ana-sayfa"
          onClick={(event) => {
            event.preventDefault();
            handleSectionSelect('ana-sayfa');
          }}
          className="q-focus shrink-0 rounded-lg inline-flex items-center"
          aria-label="QUIZORA Ana Sayfa"
        >
          <QuizoraLogo size="md" />
        </a>

        <nav
          aria-label="Birincil"
          className={cn(
            'hidden lg:flex items-center gap-1 rounded-2xl border px-1.5 py-1 transition-colors duration-200',
            scrolled
              ? 'bg-cream-100 border-cream-300'
              : 'bg-cream-50/55 border-navy-900/10',
          )}
        >
          <a
            href="#ana-sayfa"
            aria-current={activeSection === 'ana-sayfa' ? 'page' : undefined}
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
            aria-current={activeSection === 'ozellikler' ? 'page' : undefined}
            onClick={() => handleSectionSelect('ozellikler')}
            className={navLinkClass(activeSection === 'ozellikler')}
          >
            Özellikler
          </a>
          <Link to="/dashboard/quizzes" className={navLinkClass(false)}>
            Sınıf Modu
          </Link>
        </nav>

        <div className="hidden lg:flex items-center gap-2.5 shrink-0">
          <Link
            to={authDestination}
            className={cn(
              'q-press q-focus inline-flex items-center justify-center min-h-10 rounded-xl border px-4 py-2 text-sm font-semibold',
              scrolled
                ? 'border-cream-300 bg-cream-100 hover:bg-cream-200 text-navy-900'
                : 'border-navy-700/75 bg-cream-50/50 hover:bg-cream-50/85 text-navy-900',
            )}
          >
            {authLabel}
          </Link>
          <Link
            to="/dashboard/quizzes/new"
            className="q-press q-focus inline-flex items-center justify-center min-h-10 rounded-xl bg-burgundy-600 hover:bg-burgundy-700 px-4.5 py-2 text-sm font-semibold text-cream-50 shadow-xs"
          >
            Quiz Oluştur
          </Link>
        </div>

        <button
          type="button"
          className="q-press q-focus lg:hidden inline-flex items-center justify-center min-w-11 min-h-11 rounded-xl border border-navy-900/20 bg-cream-50/65 text-navy-900 hover:bg-cream-50 cursor-pointer shrink-0"
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
            transition={{
              duration: reducedMotion ? 0 : 0.22,
              ease: EASE_OUT_EXPO,
            }}
            className="lg:hidden mt-2 bg-cream-50 border-t border-cream-300 border-b border-b-cream-300 shadow-card"
          >
            <motion.nav
              aria-label="Mobil gezinme"
              variants={reducedMotion ? undefined : mobileListVariants}
              initial={reducedMotion ? false : 'hidden'}
              animate="visible"
              className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex flex-col gap-1.5"
            >
              <motion.a
                variants={reducedMotion ? undefined : mobileItemVariants}
                href="#ana-sayfa"
                aria-current={activeSection === 'ana-sayfa' ? 'page' : undefined}
                onClick={(event) => {
                  event.preventDefault();
                  handleSectionSelect('ana-sayfa');
                }}
                className={cn(
                  'q-focus rounded-xl px-3.5 py-2.5 text-sm font-medium transition-colors duration-200',
                  activeSection === 'ana-sayfa'
                    ? 'bg-powder-100 border border-powder-300 text-burgundy-700 font-semibold'
                    : 'text-navy-900 hover:bg-cream-200',
                )}
              >
                Ana Sayfa
              </motion.a>
              <motion.div variants={reducedMotion ? undefined : mobileItemVariants}>
                <Link
                  to="/explore"
                  onClick={() => setMobileOpen(false)}
                  className="q-focus block rounded-xl px-3.5 py-2.5 text-sm font-medium text-navy-900 hover:bg-cream-200 transition-colors duration-200"
                >
                  Keşfet
                </Link>
              </motion.div>
              <motion.a
                variants={reducedMotion ? undefined : mobileItemVariants}
                href="#mini-quiz"
                aria-current={activeSection === 'mini-quiz' ? 'page' : undefined}
                onClick={() => handleSectionSelect('mini-quiz')}
                className={cn(
                  'q-focus rounded-xl px-3.5 py-2.5 text-sm font-medium transition-colors duration-200',
                  activeSection === 'mini-quiz'
                    ? 'bg-powder-100 border border-powder-300 text-burgundy-700 font-semibold'
                    : 'text-navy-900 hover:bg-cream-200',
                )}
              >
                Etkileşimli Mini Quiz
              </motion.a>
              <motion.a
                variants={reducedMotion ? undefined : mobileItemVariants}
                href="#ozellikler"
                aria-current={activeSection === 'ozellikler' ? 'page' : undefined}
                onClick={() => handleSectionSelect('ozellikler')}
                className={cn(
                  'q-focus rounded-xl px-3.5 py-2.5 text-sm font-medium transition-colors duration-200',
                  activeSection === 'ozellikler'
                    ? 'bg-powder-100 border border-powder-300 text-burgundy-700 font-semibold'
                    : 'text-navy-900 hover:bg-cream-200',
                )}
              >
                Özellikler
              </motion.a>
              <motion.div variants={reducedMotion ? undefined : mobileItemVariants}>
                <Link
                  to="/dashboard/quizzes"
                  onClick={() => setMobileOpen(false)}
                  className="q-focus block rounded-xl px-3.5 py-2.5 text-sm font-medium text-navy-900 hover:bg-cream-200 transition-colors duration-200"
                >
                  Sınıf Modu
                </Link>
              </motion.div>

              <motion.div
                variants={reducedMotion ? undefined : mobileItemVariants}
                className="mt-3 pt-3 border-t border-cream-300 grid grid-cols-1 sm:grid-cols-2 gap-2.5"
              >
                <Link
                  to={authDestination}
                  onClick={() => setMobileOpen(false)}
                  className="q-press q-focus inline-flex w-full min-h-11 items-center justify-center rounded-xl border border-navy-700/75 bg-cream-100 hover:bg-cream-200 px-4 py-2.5 text-sm font-semibold text-navy-900"
                >
                  {authLabel}
                </Link>
                <Link
                  to="/dashboard/quizzes/new"
                  onClick={() => setMobileOpen(false)}
                  className="q-press q-focus inline-flex w-full min-h-11 items-center justify-center rounded-xl bg-burgundy-600 hover:bg-burgundy-700 px-4 py-2.5 text-sm font-semibold text-cream-50"
                >
                  Quiz Oluştur
                </Link>
              </motion.div>
            </motion.nav>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
