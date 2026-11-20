import { useRef } from 'react';
import { gsap, useScrollScene } from '@/components/home/motion/useScrollScene';
import {
  BarChartIcon,
  CheckIcon,
  MonitorIcon,
  PauseIcon,
  SparklesIcon,
} from '@/components/ui/Icons';

export function HowItWorksSection() {
  const sectionRef = useRef<HTMLElement>(null);

  useScrollScene(sectionRef, {
    desktop: ({ root, q }) => {
      const grid = q('[data-anim="hiw-grid"]')[0];
      const line = q('[data-anim="hiw-line"]')[0];
      const cards = q('[data-anim="hiw-card"]');
      const badges = q('[data-anim="hiw-badge"]');
      const rateBar = q('[data-anim="hiw-rate-bar"]')[0];

      gsap.from(q('[data-anim="hiw-header"] > *'), {
        y: 18,
        opacity: 0,
        duration: 0.5,
        stagger: 0.08,
        ease: 'power3.out',
        scrollTrigger: { trigger: root, start: 'top 78%', once: true },
      });

      if (!grid) return;

      // Çizgi ilerlemesi ile kartların sırayla vurgulanması (kaydırmaya bağlı senkron)
      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: grid,
          start: 'top 80%',
          end: 'top 38%',
          scrub: 0.45,
        },
      });

      if (line) {
        gsap.set(line, { scaleX: 0, transformOrigin: 'left center' });
        tl.to(line, { scaleX: 1, duration: 1, ease: 'none' }, 0);
      }

      cards.forEach((card, index) => {
        const at = 0.06 + index * 0.3;
        gsap.set(card, { opacity: 0.45, y: 20 });
        tl.to(card, { opacity: 1, y: 0, duration: 0.34, ease: 'power2.out' }, at);

        const badge = badges[index];
        if (badge) {
          gsap.set(badge, { scale: 0.85 });
          tl.to(badge, { scale: 1, duration: 0.28, ease: 'back.out(1.6)' }, at + 0.04);
        }
      });

      if (rateBar) {
        gsap.set(rateBar, { scaleX: 0, transformOrigin: 'left center' });
        tl.to(rateBar, { scaleX: 0.84, duration: 0.32, ease: 'power2.out' }, 0.72);
      }
    },
    mobile: ({ root, q }) => {
      const cards = q('[data-anim="hiw-card"]');
      const rateBar = q('[data-anim="hiw-rate-bar"]')[0];

      gsap.from(q('[data-anim="hiw-header"]'), {
        y: 18,
        opacity: 0,
        duration: 0.45,
        ease: 'power2.out',
        scrollTrigger: { trigger: root, start: 'top 82%', once: true },
      });

      gsap.from(cards, {
        y: 22,
        opacity: 0,
        duration: 0.5,
        stagger: 0.1,
        ease: 'power2.out',
        scrollTrigger: { trigger: root, start: 'top 76%', once: true },
      });

      if (rateBar) {
        gsap.fromTo(
          rateBar,
          { scaleX: 0, transformOrigin: 'left center' },
          {
            scaleX: 0.84,
            duration: 0.65,
            ease: 'power3.out',
            scrollTrigger: { trigger: rateBar, start: 'top 90%', once: true },
          },
        );
      }
    },
  });

  return (
    <section
      ref={sectionRef}
      id="nasil-calisir"
      aria-labelledby="nasil-calisir-baslik"
      className="scroll-mt-20 bg-cream-50 py-14 sm:py-20 border-b border-cream-300 overflow-x-clip"
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 space-y-10 sm:space-y-12">
        <div
          data-anim="hiw-header"
          className="flex flex-col md:flex-row md:items-end justify-between gap-4"
        >
          <div>
            <span className="inline-flex items-center rounded-full bg-cream-200 border border-cream-300 px-3 py-1 text-xs font-semibold text-navy-700">
              Üç Adımda Canlı Ders Yarışması
            </span>
            <h2
              id="nasil-calisir-baslik"
              className="mt-3 font-display font-extrabold tracking-tight text-navy-900"
              style={{
                fontSize: 'clamp(1.65rem, 1.2rem + 1.5vw, 2.35rem)',
                lineHeight: 1.15,
              }}
            >
              Nasıl Çalışır?
            </h2>
          </div>
          <p className="max-w-[46ch] text-sm sm:text-base text-navy-600">
            Karmaşık kurulumlar olmadan dakikalar içinde quizinizi hazırlayın, sınıfınızı
            tek PIN veya QR kod ile odaya toplayın.
          </p>
        </div>

        {/* 3 Aşamalı Bağlantılı Ürün Anlatımı */}
        <div
          data-anim="hiw-grid"
          className="relative grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-7"
        >
          {/* Masaüstünde adımlar arası yatay görsel bağlantı çizgisi */}
          <div
            data-anim="hiw-line"
            aria-hidden="true"
            className="hidden lg:block absolute top-11 left-[14%] right-[14%] h-px bg-burgundy-600/35"
          />

          {/* Adım 01 */}
          <article
            data-anim="hiw-card"
            className="q-lift relative rounded-3xl bg-cream-100 border border-cream-300 p-6 shadow-card flex flex-col justify-between gap-6"
          >
            <div>
              <div className="flex items-center justify-between gap-3">
                <span
                  data-anim="hiw-badge"
                  className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-burgundy-600 font-display font-extrabold text-sm text-cream-50 shadow-xs"
                >
                  01
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-powder-100 border border-powder-200 px-2.5 py-1 text-[11px] font-semibold text-burgundy-700">
                  <SparklesIcon className="h-3.5 w-3.5" />
                  <span>Editör veya Yapay Zekâ</span>
                </span>
              </div>

              <h3 className="mt-5 font-display font-bold text-xl text-navy-900">
                Quizini oluştur.
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-navy-600">
                Çoktan seçmeli, doğru/yanlış, çoklu seçim ve sıralama türlerini kullan;
                istersen konu veya PDF belgenden taslak üret.
              </p>
            </div>

            {/* Gömülü Mini Editör Maketi */}
            <div className="rounded-2xl bg-cream-50 border border-cream-300 p-4 space-y-2.5">
              <p className="text-[11px] font-bold uppercase tracking-wider text-navy-500">
                Desteklenen Soru Türleri
              </p>
              <div className="flex flex-wrap gap-2 text-xs font-semibold text-navy-900">
                <div className="rounded-xl bg-powder-100/80 border border-burgundy-600/25 px-3 py-2 flex items-center gap-1.5">
                  <CheckIcon className="h-3.5 w-3.5 text-burgundy-600 shrink-0" />
                  <span>Çoktan Seçmeli</span>
                </div>
                <div className="rounded-xl bg-cream-100 border border-cream-300 px-3 py-2">
                  Doğru / Yanlış
                </div>
                <div className="rounded-xl bg-cream-100 border border-cream-300 px-3 py-2">
                  Çoklu Seçim
                </div>
                <div className="rounded-xl bg-cream-100 border border-cream-300 px-3 py-2">
                  Sıralama
                </div>
              </div>
            </div>
          </article>

          {/* Adım 02 */}
          <article
            data-anim="hiw-card"
            className="q-lift relative rounded-3xl bg-cream-100 border border-cream-300 p-6 shadow-card flex flex-col justify-between gap-6"
          >
            <div>
              <div className="flex items-center justify-between gap-3">
                <span
                  data-anim="hiw-badge"
                  className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-navy-900 font-display font-extrabold text-sm text-cream-50 shadow-xs"
                >
                  02
                </span>
                <span className="inline-flex items-center rounded-full bg-cream-50 border border-cream-300 px-2.5 py-1 text-[11px] font-semibold text-navy-700">
                  Uygulama İndirmeden
                </span>
              </div>

              <h3 className="mt-5 font-display font-bold text-xl text-navy-900">
                PIN veya QR kod ile öğrencilerini davet et.
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-navy-600">
                Yarışma odası açıldığında 6 haneli PIN ve taranabilir QR kod otomatik
                üretilir. Öğrenciler tarayıcıdan saniyeler içinde katılır.
              </p>
            </div>

            {/* Gömülü Mini PIN + Vektörel QR Davet Maketi */}
            <div className="rounded-2xl bg-cream-50 border border-cream-300 p-4 flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-[11px] font-bold uppercase tracking-wider text-navy-500">
                  Örnek Oda PIN
                </p>
                <p className="mt-1 font-display font-extrabold text-2xl tracking-wider tabular-nums text-navy-900">
                  739 204
                </p>
                <p className="mt-1 text-xs text-burgundy-600 font-semibold">
                  Telefon · Tablet · Masaüstü
                </p>
              </div>

              {/* Dekoratif geometrik vektörel QR önizlemesi */}
              <svg
                aria-hidden="true"
                viewBox="0 0 36 36"
                className="h-16 w-16 shrink-0 rounded-xl border border-cream-300 bg-cream-50 p-1.5 text-navy-900"
              >
                <rect x="2" y="2" width="10" height="10" rx="1.5" fill="none" stroke="currentColor" strokeWidth="2.5" />
                <rect x="5" y="5" width="4" height="4" fill="currentColor" />
                <rect x="24" y="2" width="10" height="10" rx="1.5" fill="none" stroke="currentColor" strokeWidth="2.5" />
                <rect x="27" y="5" width="4" height="4" fill="currentColor" />
                <rect x="2" y="24" width="10" height="10" rx="1.5" fill="none" stroke="currentColor" strokeWidth="2.5" />
                <rect x="5" y="27" width="4" height="4" fill="currentColor" />
                <rect x="16" y="4" width="4" height="4" fill="currentColor" />
                <rect x="16" y="12" width="4" height="4" fill="currentColor" />
                <rect x="4" y="16" width="4" height="4" fill="currentColor" />
                <rect x="12" y="18" width="4" height="4" fill="currentColor" />
                <rect x="20" y="16" width="4" height="4" fill="currentColor" />
                <rect x="28" y="16" width="5" height="4" fill="currentColor" />
                <rect x="16" y="24" width="4" height="4" fill="currentColor" />
                <rect x="23" y="24" width="4" height="4" fill="currentColor" />
                <rect x="29" y="29" width="5" height="5" fill="#6B1D2F" />
                <rect x="22" y="30" width="4" height="4" fill="currentColor" />
              </svg>
            </div>
          </article>

          {/* Adım 03 */}
          <article
            data-anim="hiw-card"
            className="q-lift relative rounded-3xl bg-cream-100 border border-cream-300 p-6 shadow-card flex flex-col justify-between gap-6"
          >
            <div>
              <div className="flex items-center justify-between gap-3">
                <span
                  data-anim="hiw-badge"
                  className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-burgundy-600 font-display font-extrabold text-sm text-cream-50 shadow-xs"
                >
                  03
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-cream-50 border border-cream-300 px-2.5 py-1 text-[11px] font-semibold text-navy-700">
                  <BarChartIcon className="h-3.5 w-3.5 text-burgundy-600" />
                  <span>Anlık Kontrol & Analiz</span>
                </span>
              </div>

              <h3 className="mt-5 font-display font-bold text-xl text-navy-900">
                Yarışmayı başlat ve sonuçları incele.
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-navy-600">
                Sınıf modunda soruları yönet, gerektiğinde süreyi duraklat. Yarışma
                bitiminde soru bazlı başarı analizine ve CSV/PDF raporuna ulaş.
              </p>
            </div>

            {/* Gömülü Mini Kontrol & Rapor Maketi */}
            <div className="rounded-2xl bg-cream-50 border border-cream-300 p-4 space-y-3">
              <div className="flex items-center justify-between text-xs font-semibold text-navy-800">
                <span className="inline-flex items-center gap-1.5">
                  <MonitorIcon className="h-3.5 w-3.5 text-burgundy-600" />
                  <span>Projeksiyon & Kontrol</span>
                </span>
                <span className="inline-flex items-center gap-1 rounded-md bg-cream-200 px-2 py-0.5 text-[11px] font-bold text-navy-700">
                  <PauseIcon className="h-3 w-3" />
                  Duraklatılabilir
                </span>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-navy-600">Örnek Başarı Oranı</span>
                  <span className="font-bold tabular-nums text-burgundy-700">%84</span>
                </div>
                <div className="h-2 rounded-full bg-cream-200 overflow-hidden">
                  <div
                    data-anim="hiw-rate-bar"
                    className="h-full w-full rounded-full bg-burgundy-600"
                    style={{ transform: 'scaleX(0.84)', transformOrigin: 'left center' }}
                  />
                </div>
              </div>
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}
