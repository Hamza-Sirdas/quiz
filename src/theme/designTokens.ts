import type { BrandColorKey } from '@/types';

export const BRAND_COLORS = {
  burgundy: {
    50: '#F8EEF0',
    100: '#F0DCE0',
    500: '#8A3346',
    600: '#6B1D2F',
    700: '#551624',
    800: '#410F1B',
  },
  powder: {
    50: '#F7ECEE',
    100: '#F2E4E5',
    200: '#E7D2D4',
    300: '#DEC4C5',
    400: '#C9A7AA',
    500: '#9E7A7F',
  },
  cream: {
    50: '#FFFDFB',
    100: '#FAF7F4',
    200: '#EFEAE4',
    300: '#E4DBD4',
  },
  navy: {
    950: '#171E2B',
    900: '#232B3A',
    700: '#3B4252',
    600: '#4A5263',
    500: '#5E6676',
  },
} as const;

export interface ColorSwatch {
  key: BrandColorKey;
  name: string;
  hex: string;
  role: string;
  swatchClass: string;
  badgeTextClass: string;
}

export const COLOR_SWATCHES: readonly ColorSwatch[] = [
  {
    key: 'burgundy',
    name: 'Bordo',
    hex: BRAND_COLORS.burgundy[600],
    role: 'Ana marka rengi, birincil eylemler ve vurgu',
    swatchClass: 'bg-burgundy-600 border-burgundy-700',
    badgeTextClass: 'text-cream-50',
  },
  {
    key: 'powder',
    name: 'Pudra Pembesi',
    hex: BRAND_COLORS.powder[300],
    role: 'Marka zeminleri, rozetler ve yumuşak yüzeyler',
    swatchClass: 'bg-powder-300 border-powder-500',
    badgeTextClass: 'text-navy-900',
  },
  {
    key: 'cream',
    name: 'Krem',
    hex: BRAND_COLORS.cream[100],
    role: 'Ana sayfa zemini ve kart yüzeyleri',
    swatchClass: 'bg-cream-100 border-cream-300',
    badgeTextClass: 'text-navy-900',
  },
  {
    key: 'navy',
    name: 'Koyu Lacivert',
    hex: BRAND_COLORS.navy[900],
    role: 'Başlıklar, birincil metin ve ikincil butonlar',
    swatchClass: 'bg-navy-900 border-navy-950',
    badgeTextClass: 'text-cream-50',
  },
];

export const TYPOGRAPHY_TOKENS = {
  display: {
    label: 'Display',
    fontFamily: 'Plus Jakarta Sans',
    sizeVar: '--text-display',
    lineHeightVar: '--leading-display',
    sample: 'Bilgini Yarışmayla Kanıtla',
  },
  h1: {
    label: 'Başlık 1 (H1)',
    fontFamily: 'Plus Jakarta Sans',
    sizeVar: '--text-h1',
    lineHeightVar: '--leading-h1',
    sample: 'Hoş geldin, Öğretmen',
  },
  h2: {
    label: 'Başlık 2 (H2)',
    fontFamily: 'Plus Jakarta Sans',
    sizeVar: '--text-h2',
    lineHeightVar: '--leading-h2',
    sample: 'Oyun Lobisi ve Katılımcılar',
  },
  h3: {
    label: 'Başlık 3 (H3)',
    fontFamily: 'Plus Jakarta Sans',
    sizeVar: '--text-h3',
    lineHeightVar: '--leading-h3',
    sample: 'Genel Kültür Bilgi Yarışması',
  },
  body: {
    label: 'Gövde Metni',
    fontFamily: 'Inter',
    sizeVar: '--text-body',
    lineHeightVar: '--leading-body',
    sample: 'Sınıfta veya çevrimiçi ortamda aynı anda canlı yarışmalar düzenleyin.',
  },
  bodySmall: {
    label: 'Küçük Metin',
    fontFamily: 'Inter',
    sizeVar: '--text-body-sm',
    lineHeightVar: '--leading-body-sm',
    sample: 'Türkçe karakter desteği: Ç, Ğ, İ, Ö, Ş, Ü · ç, ğ, ı, ö, ş, ü',
  },
  caption: {
    label: 'Sayısal / Etiket (tabular-nums)',
    fontFamily: 'Inter',
    sizeVar: '--text-caption',
    lineHeightVar: '--leading-caption',
    sample: '482 915 · Soru 3 / 10 · 18 sn · 9.890 puan',
  },
} as const;
