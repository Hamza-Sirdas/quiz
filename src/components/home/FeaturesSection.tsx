import { useRef, useState, type KeyboardEvent } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, LayoutGroup, motion } from 'motion/react';
import { EASE_OUT_EXPO } from '@/components/home/motion/tokens';
import { gsap, useScrollScene } from '@/components/home/motion/useScrollScene';
import {
  BarChartIcon,
  CheckIcon,
  ChevronRightIcon,
  ClockIcon,
  DownloadIcon,
  FileTextIcon,
  LayersIcon,
  MonitorIcon,
  PauseIcon,
  PlayIcon,
  PlusSquareIcon,
  SparklesIcon,
  VolumeOnIcon,
} from '@/components/ui/Icons';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';

type FeatureTabId =
  | 'quiz-olusturma'
  | 'ai-uretim'
  | 'sinif-modu'
  | 'sonuc-analizi';

interface FeatureItem {
  id: FeatureTabId;
  eyebrow: string;
  title: string;
  description: string;
  ctaLabel: string;
  ctaTo: string;
  highlights: readonly string[];
}

const FEATURE_TABS: readonly FeatureItem[] = [
  {
    id: 'quiz-olusturma',
    eyebrow: '01 / Quiz Editörü',
    title: 'Quiz Oluşturma & 4 Soru Türü',
    description:
      'Tekli seçim, doğru/yanlış, çoklu doğru cevap ve sıralama sorularını aynı quiz içinde birleştirin; her soru için süre, puan ve görsel belirleyin.',
    ctaLabel: 'Quiz Editörünü İncele',
    ctaTo: '/dashboard/quizzes/new',
    highlights: [
      '4 farklı soru türü desteği',
      'Soru bazlı süre ve puan kontrolü',
      'Keşfet kütüphanesinde herkese açık veya gizli paylaşım',
    ],
  },
  {
    id: 'ai-uretim',
    eyebrow: '02 / Yapay Zekâ Stüdyosu',
    title: 'Yapay Zekâ ile Soru Hazırlama',
    description:
      'Konu başlığından, yüklediğiniz PDF ders notundan veya yapıştırdığınız metinden taslak sorular üretin; düzenleyip doğrudan editöre aktarın.',
    ctaLabel: 'Yapay Zekâ ile Oluştur',
    ctaTo: '/dashboard/ai-create',
    highlights: [
      'Konu, PDF ve serbest metin kaynakları',
      'Sınıf seviyesi ve zorluk derecesi ayarı',
      'Üretilen soruları düzenleyerek kaydetme',
    ],
  },
  {
    id: 'sinif-modu',
    eyebrow: '03 / Öğretmen Kontrol Merkezi',
    title: 'Sınıf Modu & Yarışma Başlatma',
    description:
      'Akıllı tahta, projeksiyon ve masaüstü ekranlar için tasarlanan öğretmen kontrol merkeziyle süreyi duraklatın, cevabı açın ve sesi yönetin.',
    ctaLabel: 'Quizlerimden Başlat',
    ctaTo: '/dashboard/quizzes',
    highlights: [
      'Tek tıkla Canlı Yarışma veya Sınıf Modu',
      'Yüksek okunabilirlikli projeksiyon görünümü',
      'Anlık duraklatma, sessize alma ve soru geçişi',
    ],
  },
  {
    id: 'sonuc-analizi',
    eyebrow: '04 / Raporlama & Analiz',
    title: 'Gelişmiş Sonuç ve Soru Analizi',
    description:
      'Tamamlanan yarışmaların geçmişini inceleyin; hangi sorunun zorlandığını yüzde dağılımlarıyla görün ve CSV ya da PDF çıktısı alın.',
    ctaLabel: 'Yarışma Geçmişini Gör',
    ctaTo: '/dashboard/history',
    highlights: [
      'Soru bazlı doğruluk oranı analizi',
      'Katılımcı sıralaması ve puan kırılımı',
      'Tek tıkla CSV ve Türkçe PDF raporu indirme',
    ],
  },
] as const;

function renderFeatureIcon(id: FeatureTabId, isActive: boolean) {
  const iconClass = isActive ? 'w-5 h-5 text-cream-50' : 'w-5 h-5 text-burgundy-600';

  switch (id) {
    case 'quiz-olusturma':
      return <LayersIcon className={iconClass} />;
    case 'ai-uretim':
      return <SparklesIcon className={iconClass} />;
    case 'sinif-modu':
      return <MonitorIcon className={iconClass} />;
    case 'sonuc-analizi':
      return <BarChartIcon className={iconClass} />;
  }
}

export function FeaturesSection() {
  const [activeTabId, setActiveTabId] = useState<FeatureTabId>('quiz-olusturma');
  const reducedMotion = usePrefersReducedMotion();
  const sectionRef = useRef<HTMLElement>(null);

  useScrollScene(sectionRef, {
    desktop: ({ root, q }) => {
      gsap.from(q('[data-anim="feat-header"] > *'), {
        y: 18,
        opacity: 0,
        duration: 0.5,
        stagger: 0.08,
        ease: 'power3.out',
        scrollTrigger: { trigger: root, start: 'top 78%', once: true },
      });
      gsap.from(q('[data-anim="feat-tab"]'), {
        x: -18,
        opacity: 0,
        duration: 0.48,
        stagger: 0.08,
        ease: 'power3.out',
        scrollTrigger: { trigger: root, start: 'top 72%', once: true },
      });
      gsap.from(q('[data-anim="feat-preview"]'), {
        scale: 0.97,
        y: 22,
        opacity: 0,
        duration: 0.58,
        ease: 'power3.out',
        scrollTrigger: { trigger: root, start: 'top 72%', once: true },
      });
    },
    mobile: ({ root, q }) => {
      gsap.from(q('[data-anim="feat-header"], [data-anim="feat-tab"], [data-anim="feat-preview"]'), {
        y: 18,
        opacity: 0,
        duration: 0.45,
        stagger: 0.07,
        ease: 'power2.out',
        scrollTrigger: { trigger: root, start: 'top 80%', once: true },
      });
    },
  });

  const activeFeature =
    FEATURE_TABS.find((tab) => tab.id === activeTabId) ?? FEATURE_TABS[0];

  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextIndex = index;
    if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
      nextIndex = (index + 1) % FEATURE_TABS.length;
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
      nextIndex = (index - 1 + FEATURE_TABS.length) % FEATURE_TABS.length;
    } else {
      return;
    }

    event.preventDefault();
    const nextTab = FEATURE_TABS[nextIndex];
    setActiveTabId(nextTab.id);
    const nextElement = document.getElementById(`feature-tab-${nextTab.id}`);
    nextElement?.focus();
  };

  return (
    <section
      ref={sectionRef}
      id="ozellikler"
      aria-labelledby="ozellikler-baslik"
      className="scroll-mt-20 bg-powder-300 border-t border-navy-900/10 py-14 sm:py-20 overflow-x-clip"
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div data-anim="feat-header" className="max-w-3xl mb-10 sm:mb-12">
          <div className="inline-flex items-center gap-2 rounded-full border border-navy-900/15 bg-cream-50/90 px-3.5 py-1.5 text-xs font-semibold tracking-wider uppercase text-navy-900 mb-4">
            <span className="h-2 w-2 rounded-full bg-burgundy-600" aria-hidden="true" />
            Öğretmen Paneli Tanıtımı
          </div>

          <h2
            id="ozellikler-baslik"
            className="font-display font-extrabold tracking-tight text-navy-900 text-balance"
            style={{ fontSize: 'clamp(1.75rem, 1.35rem + 1.6vw, 2.75rem)' }}
          >
            Hazırlıktan Analize Kadar Tek Öğretmen Stüdyosu.
          </h2>
          <p className="mt-3 text-navy-900/75 text-base sm:text-lg leading-relaxed max-w-2xl">
            Quiz editörü, yapay zekâ destekli soru üreticisi, sınıf projeksiyon ekranı ve
            yarışma raporları birbirine entegre tek bir panelde buluşur.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start">
          {/* Sol Seçim Listesi (dış div scroll reveal için, iç button q-lift + kayan vurgu) */}
          <LayoutGroup id="feature-tabs">
            <div
              role="tablist"
              aria-label="Öğretmen paneli modülleri"
              className="lg:col-span-5 space-y-3"
            >
              {FEATURE_TABS.map((item, index) => {
                const isSelected = item.id === activeTabId;

                return (
                  <div key={item.id} data-anim="feat-tab">
                    <button
                      id={`feature-tab-${item.id}`}
                      type="button"
                      role="tab"
                      aria-selected={isSelected}
                      aria-controls={`feature-panel-${item.id}`}
                      onClick={() => setActiveTabId(item.id)}
                      onKeyDown={(e) => handleTabKeyDown(e, index)}
                      className={`q-lift q-focus relative w-full text-left rounded-xl p-4 sm:p-5 border cursor-pointer overflow-hidden ${
                        isSelected
                          ? 'bg-cream-50 border-navy-900 shadow-card ring-1 ring-burgundy-600/20'
                          : 'bg-cream-50/65 border-navy-900/12 hover:bg-cream-50 hover:border-navy-900/25'
                      }`}
                    >
                      {isSelected && (
                        <motion.span
                          layoutId="feature-tab-accent"
                          transition={{ duration: reducedMotion ? 0 : 0.28, ease: EASE_OUT_EXPO }}
                          aria-hidden="true"
                          className="absolute inset-y-3 left-0 w-1 rounded-r-full bg-burgundy-600"
                        />
                      )}
                      <div className="relative flex items-start gap-3.5">
                        <div
                          className={`mt-0.5 shrink-0 w-10 h-10 rounded-lg flex items-center justify-center transition-colors ${
                            isSelected
                              ? 'bg-burgundy-600 text-cream-50'
                              : 'bg-powder-200 text-burgundy-600'
                          }`}
                        >
                          {renderFeatureIcon(item.id, isSelected)}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[11px] font-bold tracking-wider uppercase text-burgundy-700">
                              {item.eyebrow}
                            </span>
                            {isSelected && (
                              <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-burgundy-600/10 text-burgundy-700">
                                Seçili
                              </span>
                            )}
                          </div>
                          <h3 className="mt-1 font-display font-bold text-base sm:text-lg text-navy-900 leading-snug">
                            {item.title}
                          </h3>
                          <p className="mt-1.5 text-sm text-navy-900/75 leading-relaxed">
                            {item.description}
                          </p>
                        </div>
                      </div>
                    </button>
                  </div>
                );
              })}
            </div>
          </LayoutGroup>

          {/* Sağ Katmanlı Öğretmen Paneli Önizlemesi */}
          <div data-anim="feat-preview" className="lg:col-span-7">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeFeature.id}
                id={`feature-panel-${activeFeature.id}`}
                role="tabpanel"
                aria-labelledby={`feature-tab-${activeFeature.id}`}
                initial={reducedMotion ? undefined : { opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reducedMotion ? undefined : { opacity: 0, y: -6 }}
                transition={{ duration: 0.22 }}
                className="rounded-2xl bg-cream-50 border border-navy-900/15 shadow-card overflow-hidden"
              >
                {/* Mockup Pencere Üst Çubuğu */}
                <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 bg-navy-900 text-cream-50 border-b border-navy-900/10">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold tracking-wider uppercase text-powder-200">
                      <span className="w-2 h-2 rounded-full bg-burgundy-600" aria-hidden="true" />
                      Örnek Öğretmen Paneli Görünümü
                    </span>
                  </div>
                  <span className="text-xs font-medium text-cream-100/75">
                    {activeFeature.eyebrow}
                  </span>
                </div>

                {/* Dinamik Modül Önizleme İçeriği */}
                <div className="p-5 sm:p-7">
                  {activeFeature.id === 'quiz-olusturma' && (
                    <div className="space-y-5">
                      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-navy-900/10">
                        <div>
                          <div className="text-xs font-semibold uppercase tracking-wider text-navy-900/55">
                            Aktif Taslak Quiz
                          </div>
                          <div className="font-display font-bold text-lg text-navy-900 mt-0.5">
                            Türkiye Coğrafyası ve Bölgeler
                          </div>
                        </div>
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-powder-200 px-3 py-1 text-xs font-semibold text-navy-900">
                          Herkese Açık • Keşfet Uyumlu
                        </span>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                        {[
                          { label: 'Çoktan Seçmeli', active: true },
                          { label: 'Doğru / Yanlış', active: false },
                          { label: 'Çoklu Doğru', active: false },
                          { label: 'Sıralama', active: false },
                        ].map((qType) => (
                          <div
                            key={qType.label}
                            className={`rounded-lg px-3 py-2.5 text-xs font-semibold border ${
                              qType.active
                                ? 'bg-burgundy-600 text-cream-50 border-burgundy-700'
                                : 'bg-cream-100 text-navy-900 border-navy-900/12'
                            }`}
                          >
                            {qType.label}
                          </div>
                        ))}
                      </div>

                      <div className="rounded-xl bg-cream-100 border border-navy-900/12 p-4 space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-xs font-bold text-burgundy-700">
                            SORU 1 / 12
                          </span>
                          <div className="flex items-center gap-2 text-xs font-semibold text-navy-900/75">
                            <span className="inline-flex items-center gap-1 rounded bg-cream-50 px-2 py-1 border border-navy-900/10">
                              <ClockIcon className="w-3.5 h-3.5" />
                              20 sn
                            </span>
                            <span className="rounded bg-cream-50 px-2 py-1 border border-navy-900/10">
                              1000 Puan
                            </span>
                          </div>
                        </div>
                        <p className="font-display font-bold text-navy-900 text-base">
                          Türkiye&apos;nin yüzölçümü en büyük bölgesi hangisidir?
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-medium">
                          <div className="rounded-lg bg-emerald-50 border border-emerald-600/40 px-3 py-2 text-emerald-950 flex items-center justify-between">
                            <span>Doğu Anadolu Bölgesi</span>
                            <CheckIcon className="w-4 h-4 text-emerald-700" />
                          </div>
                          <div className="rounded-lg bg-cream-50 border border-navy-900/12 px-3 py-2 text-navy-900/80">
                            İç Anadolu Bölgesi
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {activeFeature.id === 'ai-uretim' && (
                    <div className="space-y-5">
                      <div className="grid grid-cols-3 gap-2">
                        {[
                          { label: 'Konu Başlığı', active: true },
                          { label: 'PDF Yükle', active: false },
                          { label: 'Metin Yapıştır', active: false },
                        ].map((mode) => (
                          <div
                            key={mode.label}
                            className={`rounded-lg px-3 py-2.5 text-center text-xs font-semibold border ${
                              mode.active
                                ? 'bg-navy-900 text-cream-50 border-navy-900'
                                : 'bg-cream-100 text-navy-900 border-navy-900/12'
                            }`}
                          >
                            {mode.label}
                          </div>
                        ))}
                      </div>

                      <div className="rounded-xl bg-cream-100 border border-navy-900/12 p-4 space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-xs font-bold uppercase tracking-wider text-burgundy-700">
                            Parametreler
                          </span>
                          <span className="text-xs font-medium text-navy-900/70">
                            Türkçe • 8 Soru • Orta Zorluk
                          </span>
                        </div>
                        <div className="rounded-lg bg-cream-50 border border-navy-900/12 px-3.5 py-2.5 text-sm font-medium text-navy-900">
                          Konu: Türkiye Cumhuriyeti&apos;nin kuruluş dönemi ve reformlar
                        </div>
                      </div>

                      <div className="rounded-xl bg-powder-100 border border-navy-900/12 p-4 space-y-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="inline-flex items-center gap-1.5 text-xs font-bold text-navy-900">
                            <SparklesIcon className="w-4 h-4 text-burgundy-600" />
                            Üretilen Taslak Soru #1
                          </span>
                          <span className="text-xs font-semibold text-burgundy-700">
                            Editöre Aktarıma Hazır
                          </span>
                        </div>
                        <p className="text-sm font-semibold text-navy-900">
                          Cumhuriyet&apos;in ilanından hemen önce yürürlüğe giren saltanatın
                          kaldırılması kararı hangi yılda alınmıştır?
                        </p>
                        <div className="text-xs text-navy-900/70">
                          Doğru Cevap: 1922 • Açıklama otomatik olarak taslağa eklendi
                        </div>
                      </div>
                    </div>
                  )}

                  {activeFeature.id === 'sinif-modu' && (
                    <div className="space-y-5">
                      <div className="rounded-xl bg-navy-900 text-cream-50 p-4 sm:p-5 space-y-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <div className="text-[11px] font-bold uppercase tracking-wider text-powder-200">
                              Sınıf Projeksiyonu • Oturum #482910
                            </div>
                            <div className="font-display font-bold text-base sm:text-lg mt-0.5">
                              Soru 4 / 10 — Büyük Ölçekli Sınıf Görünümü
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="inline-flex items-center gap-1.5 rounded-lg bg-burgundy-600 px-3 py-1.5 text-xs font-bold text-cream-50">
                              <ClockIcon className="w-3.5 h-3.5" />
                              09 sn
                            </span>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-semibold">
                          <div className="rounded-lg bg-cream-50/10 border border-cream-50/15 px-3 py-2 flex items-center gap-2">
                            <PauseIcon className="w-3.5 h-3.5 text-powder-200" />
                            <span>Süreyi Duraklat</span>
                          </div>
                          <div className="rounded-lg bg-cream-50/10 border border-cream-50/15 px-3 py-2 flex items-center gap-2">
                            <PlayIcon className="w-3.5 h-3.5 text-powder-200" />
                            <span>Cevabı Aç</span>
                          </div>
                          <div className="rounded-lg bg-cream-50/10 border border-cream-50/15 px-3 py-2 flex items-center gap-2">
                            <VolumeOnIcon className="w-3.5 h-3.5 text-powder-200" />
                            <span>Ses Kontrolü</span>
                          </div>
                          <div className="rounded-lg bg-cream-50/10 border border-cream-50/15 px-3 py-2 flex items-center gap-2">
                            <ChevronRightIcon className="w-3.5 h-3.5 text-powder-200" />
                            <span>Sonraki Soru</span>
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                        <div className="rounded-xl bg-cream-100 border border-navy-900/12 p-3.5">
                          <div className="text-navy-900/60 font-semibold">Yanıt Durumu</div>
                          <div className="font-display font-bold text-lg text-navy-900 mt-1">
                            26 / 28 Öğrenci Cevapladı
                          </div>
                        </div>
                        <div className="rounded-xl bg-cream-100 border border-navy-900/12 p-3.5">
                          <div className="text-navy-900/60 font-semibold">Akıllı Tahta Uyumu</div>
                          <div className="font-display font-bold text-lg text-navy-900 mt-1">
                            Yüksek Kontrastlı Tipografi
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {activeFeature.id === 'sonuc-analizi' && (
                    <div className="space-y-5">
                      <div className="grid grid-cols-3 gap-3">
                        <div className="rounded-xl bg-cream-100 border border-navy-900/12 p-3.5">
                          <div className="text-[11px] font-semibold uppercase tracking-wider text-navy-900/60">
                            Katılımcı
                          </div>
                          <div className="font-display font-bold text-xl text-navy-900 mt-1">
                            28 Öğrenci
                          </div>
                        </div>
                        <div className="rounded-xl bg-cream-100 border border-navy-900/12 p-3.5">
                          <div className="text-[11px] font-semibold uppercase tracking-wider text-navy-900/60">
                            Ortalama Doğruluk
                          </div>
                          <div className="font-display font-bold text-xl text-burgundy-700 mt-1">
                            %78
                          </div>
                        </div>
                        <div className="rounded-xl bg-cream-100 border border-navy-900/12 p-3.5">
                          <div className="text-[11px] font-semibold uppercase tracking-wider text-navy-900/60">
                            Dışa Aktarım
                          </div>
                          <div className="flex items-center gap-1.5 mt-1.5 text-xs font-bold text-navy-900">
                            <DownloadIcon className="w-4 h-4 text-burgundy-600" />
                            CSV &amp; PDF
                          </div>
                        </div>
                      </div>

                      <div className="rounded-xl bg-cream-100 border border-navy-900/12 p-4 space-y-3">
                        <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-navy-900/70">
                          <span>Soru Bazlı Başarı Dağılımı</span>
                          <span className="inline-flex items-center gap-1 text-burgundy-700">
                            <FileTextIcon className="w-3.5 h-3.5" />
                            Örnek Oturum Özeti
                          </span>
                        </div>

                        {[
                          { label: 'Soru 1 — Cumhuriyet Dönemi', rate: 89 },
                          { label: 'Soru 2 — Doğru / Yanlış Değerlendirme', rate: 74 },
                          { label: 'Soru 3 — Kronolojik Sıralama', rate: 68 },
                        ].map((row) => (
                          <div key={row.label} className="space-y-1">
                            <div className="flex items-center justify-between text-xs font-medium text-navy-900">
                              <span>{row.label}</span>
                              <span className="font-bold">{row.rate}%</span>
                            </div>
                            <div className="h-2 rounded-full bg-navy-900/10 overflow-hidden">
                              <div
                                className="h-full rounded-full bg-burgundy-600"
                                style={{ width: `${row.rate}%` }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Alt Kazanımlar ve Yönlendirme CTA */}
                  <div className="mt-6 pt-5 border-t border-navy-900/10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <ul className="space-y-1.5">
                      {activeFeature.highlights.map((point) => (
                        <li
                          key={point}
                          className="flex items-center gap-2 text-xs sm:text-sm font-medium text-navy-900/80"
                        >
                          <CheckIcon className="w-4 h-4 text-burgundy-600 shrink-0" />
                          <span>{point}</span>
                        </li>
                      ))}
                    </ul>

                    <Link
                      to={activeFeature.ctaTo}
                      className="q-press q-focus inline-flex items-center justify-center gap-2 rounded-xl bg-burgundy-600 hover:bg-burgundy-700 text-cream-50 font-semibold text-sm px-5 py-3 min-h-[44px] shrink-0"
                    >
                      <PlusSquareIcon className="w-4 h-4 shrink-0" />
                      <span>{activeFeature.ctaLabel}</span>
                    </Link>
                  </div>
                </div>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </section>
  );
}
