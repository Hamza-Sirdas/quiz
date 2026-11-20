import { Link } from 'react-router-dom';
import { QuizoraLogo } from '@/components/brand/QuizoraLogo';

interface FooterProps {
  onSelectSection: (section: 'ana-sayfa' | 'ozellikler') => void;
}

export function Footer({ onSelectSection }: FooterProps) {
  return (
    <footer className="bg-cream-100 border-t border-cream-300 py-6 sm:py-7">
      <div className="max-w-6xl mx-auto px-5 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <QuizoraLogo size="sm" />
          <p className="text-sm text-navy-600">
            Gerçek zamanlı, çok oyunculu bilgi yarışması platformu.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-6 text-sm text-navy-600">
          <a
            href="#ana-sayfa"
            onClick={(event) => {
              event.preventDefault();
              onSelectSection('ana-sayfa');
              window.scrollTo({ top: 0 });
            }}
            className="hover:text-navy-900 transition-colors duration-200"
          >
            Ana Sayfa
          </a>
          <a
            href="#ozellikler"
            onClick={() => onSelectSection('ozellikler')}
            className="hover:text-navy-900 transition-colors duration-200"
          >
            Özellikler
          </a>
          <Link
            to="/explore"
            className="hover:text-navy-900 transition-colors duration-200"
          >
            Keşfet
          </Link>
          <Link
            to="/join"
            className="hover:text-navy-900 transition-colors duration-200"
          >
            Oyuna Katıl
          </Link>
          <span className="text-navy-500">© 2026 QUIZORA</span>
        </div>
      </div>
    </footer>
  );
}
