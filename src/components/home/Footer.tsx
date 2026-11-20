import { Link } from 'react-router-dom';
import { QuizoraLogo } from '@/components/brand/QuizoraLogo';
import type { HomeSectionId } from '@/components/home/Navbar';

interface FooterProps {
  onSelectSection: (section: HomeSectionId) => void;
}

const SECTION_LINKS: ReadonlyArray<{ id: HomeSectionId; label: string; href: string }> = [
  { id: 'ana-sayfa', label: 'Ana Sayfa', href: '#ana-sayfa' },
  { id: 'mini-quiz', label: 'Mini Quiz', href: '#mini-quiz' },
  { id: 'nasil-calisir', label: 'Nasıl Çalışır', href: '#nasil-calisir' },
  { id: 'canli-vitrin', label: 'Canlı Vitrin', href: '#canli-vitrin' },
  { id: 'ozellikler', label: 'Özellikler', href: '#ozellikler' },
];

const PLATFORM_LINKS = [
  { label: 'Keşfet', to: '/explore' },
  { label: 'Oyuna Katıl', to: '/join' },
  { label: 'Quiz Oluştur', to: '/dashboard/quizzes/new' },
  { label: 'Oturum Aç', to: '/login' },
] as const;

export function Footer({ onSelectSection }: FooterProps) {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-cream-50 border-t border-navy-900/10 py-10 sm:py-12 text-navy-900">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-8 pb-8 border-b border-navy-900/10">
          {/* Marka Bloğu */}
          <div className="md:col-span-5 space-y-3">
            <Link
              to="/"
              onClick={() => onSelectSection('ana-sayfa')}
              className="inline-flex items-center focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-burgundy-600 rounded"
            >
              <QuizoraLogo size="md" />
            </Link>
            <p className="text-sm text-navy-900/70 leading-relaxed max-w-sm">
              Sınıflar, akademiler ve eğitim toplulukları için tasarlanan Türkçe canlı bilgi
              yarışması ve ölçme platformu.
            </p>
          </div>

          {/* Ana Sayfa Bölümleri */}
          <div className="md:col-span-4">
            <h3 className="font-display font-bold text-xs uppercase tracking-wider text-navy-900/60 mb-3">
              Sayfa Bölümleri
            </h3>
            <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm font-medium text-navy-900/80">
              {SECTION_LINKS.map((item) => (
                <li key={item.id}>
                  <a
                    href={item.href}
                    onClick={() => onSelectSection(item.id)}
                    className="inline-flex items-center min-h-[36px] hover:text-burgundy-600 transition-colors"
                  >
                    {item.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Platform Bağlantıları */}
          <div className="md:col-span-3">
            <h3 className="font-display font-bold text-xs uppercase tracking-wider text-navy-900/60 mb-3">
              Platform
            </h3>
            <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm font-medium text-navy-900/80">
              {PLATFORM_LINKS.map((item) => (
                <li key={item.to}>
                  <Link
                    to={item.to}
                    className="inline-flex items-center min-h-[36px] hover:text-burgundy-600 transition-colors"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="pt-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs sm:text-sm text-navy-900/65">
          <p>© {currentYear} QUIZORA. Etkileşimli öğrenme ve canlı bilgi yarışması platformu.</p>
          <p className="font-medium text-navy-900/75">
            Tüm arayüz ve sınıf araçları Türkçe olarak tasarlanmıştır.
          </p>
        </div>
      </div>
    </footer>
  );
}
