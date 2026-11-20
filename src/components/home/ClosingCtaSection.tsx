import { useRef } from 'react';
import { Link } from 'react-router-dom';
import { gsap, useScrollScene } from '@/components/home/motion/useScrollScene';
import {
  CompassIcon,
  PlayIcon,
  PlusSquareIcon,
} from '@/components/ui/Icons';

const PLATFORM_HIGHLIGHTS = [
  '4 Soru Türü',
  'Yapay Zekâ Destekli Hazırlık',
  'Sınıf & Projeksiyon Modu',
  'Türkçe CSV ve PDF Raporlama',
] as const;

export function ClosingCtaSection() {
  const sectionRef = useRef<HTMLElement>(null);

  useScrollScene(sectionRef, {
    desktop: ({ root, q }) => {
      const tl = gsap.timeline({
        scrollTrigger: { trigger: root, start: 'top 78%', once: true },
      });

      tl.from(q('[data-anim="cta-card"]'), {
        y: 26,
        opacity: 0,
        duration: 0.55,
        ease: 'power3.out',
      })
        .from(
          q('[data-anim="cta-copy"] > *'),
          {
            y: 16,
            opacity: 0,
            duration: 0.45,
            stagger: 0.07,
            ease: 'power3.out',
          },
          '-=0.35',
        )
        .from(
          q('[data-anim="cta-actions"] > a'),
          {
            y: 14,
            opacity: 0,
            duration: 0.42,
            stagger: 0.08,
            ease: 'power3.out',
          },
          '-=0.25',
        )
        .from(
          q('[data-anim="cta-corner"]'),
          {
            scale: 0.6,
            opacity: 0,
            transformOrigin: 'top right',
            duration: 0.45,
            ease: 'back.out(1.6)',
          },
          '-=0.3',
        );
    },
    mobile: ({ root, q }) => {
      gsap.from(q('[data-anim="cta-card"], [data-anim="cta-actions"] > a'), {
        y: 18,
        opacity: 0,
        duration: 0.45,
        stagger: 0.08,
        ease: 'power2.out',
        scrollTrigger: { trigger: root, start: 'top 84%', once: true },
      });
    },
  });

  return (
    <section
      ref={sectionRef}
      aria-labelledby="kapanis-cta-baslik"
      className="bg-navy-900 text-cream-50 border-t border-cream-50/10 py-16 sm:py-24 overflow-x-clip"
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div
          data-anim="cta-card"
          className="relative rounded-3xl border border-cream-50/15 bg-navy-900 p-7 sm:p-12 lg:p-14"
        >
          {/* Köşe editoryal vurgu çizgisi */}
          <div
            data-anim="cta-corner"
            aria-hidden="true"
            className="hidden sm:block absolute top-6 right-6 w-16 h-16 border-t-2 border-r-2 border-burgundy-600 rounded-tr-xl"
          />

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-center">
            <div data-anim="cta-copy" className="lg:col-span-6 space-y-5">
              <div className="inline-flex items-center gap-2 rounded-full border border-cream-50/20 bg-cream-50/5 px-3.5 py-1.5 text-xs font-semibold uppercase tracking-wider text-powder-200">
                <span className="h-2 w-2 rounded-full bg-burgundy-600 shrink-0" aria-hidden="true" />
                <span>Hemen Başlamaya Hazır</span>
              </div>

              <h2
                id="kapanis-cta-baslik"
                className="font-display font-extrabold tracking-tight text-cream-50 text-balance"
                style={{ fontSize: 'clamp(1.85rem, 1.35rem + 2.1vw, 3.1rem)' }}
              >
                Bir Sonraki Yarışma Senin Sınıfında.
              </h2>

              <p className="text-cream-100/80 text-base sm:text-lg leading-relaxed max-w-2xl">
                Dakikalar içinde ilk quizinizi oluşturun, sınıf ekranından yarışma başlatın veya
                paylaşılan PIN koduyla canlı yarışmaya katılın.
              </p>

              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 pt-1 text-xs sm:text-sm font-medium text-powder-200">
                {PLATFORM_HIGHLIGHTS.map((item) => (
                  <span key={item} className="inline-flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-burgundy-600" aria-hidden="true" />
                    {item}
                  </span>
                ))}
              </div>
            </div>

            <div
              data-anim="cta-actions"
              className="lg:col-span-6 flex flex-col sm:flex-row sm:flex-wrap xl:flex-nowrap lg:justify-end gap-3"
            >
              <Link
                to="/dashboard/quizzes/new"
                className="q-press q-focus-light inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-burgundy-600 hover:bg-burgundy-700 text-cream-50 font-semibold text-base px-5 py-3.5 min-h-[48px] shadow-card"
              >
                <PlusSquareIcon className="w-5 h-5 shrink-0" />
                <span>Quiz Oluştur</span>
              </Link>

              <Link
                to="/join"
                className="q-press q-focus-light inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-cream-50/30 bg-cream-50/5 hover:bg-cream-50/15 text-cream-50 font-semibold text-base px-5 py-3.5 min-h-[48px]"
              >
                <PlayIcon className="w-5 h-5 shrink-0" />
                <span>Oyuna Katıl</span>
              </Link>

              <Link
                to="/explore"
                className="q-press q-focus-light inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-cream-50/20 text-powder-200 hover:text-cream-50 hover:border-cream-50/40 font-semibold text-base px-4.5 py-3.5 min-h-[48px]"
              >
                <CompassIcon className="w-5 h-5 shrink-0" />
                <span>Keşfet</span>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
