export type QuizStatus = 'DRAFT' | 'PUBLISHED';

export type QuizVisibility = 'PRIVATE' | 'UNLISTED' | 'PUBLIC';

export const QUIZ_VISIBILITIES: readonly QuizVisibility[] = [
  'PRIVATE',
  'UNLISTED',
  'PUBLIC',
] as const;

export const QUIZ_VISIBILITY_LABELS: Record<QuizVisibility, string> = {
  PRIVATE: 'Özel',
  UNLISTED: 'Bağlantıya Özel',
  PUBLIC: 'Herkese Açık',
};

export const QUIZ_VISIBILITY_DESCRIPTIONS: Record<QuizVisibility, string> = {
  PRIVATE:
    'Yalnızca quiz sahibi erişebilir. Keşfet sayfasında görünmez ve başka öğretmenler tarafından kopyalanamaz.',
  UNLISTED:
    'Keşfet sayfasında görünmez; yalnızca oluşturulan özel paylaşım bağlantısına sahip kullanıcılar görüntüleyebilir ve kopyalayabilir.',
  PUBLIC:
    'Keşfet sayfasında listelenir. Diğer öğretmenler inceleyebilir ve kendi kütüphanelerine kopyalayabilir.',
};

export type QuestionType =
  | 'MULTIPLE_CHOICE'
  | 'TRUE_FALSE'
  | 'MULTI_SELECT'
  | 'ORDERING';

export const QUESTION_TYPES: readonly QuestionType[] = [
  'MULTIPLE_CHOICE',
  'TRUE_FALSE',
  'MULTI_SELECT',
  'ORDERING',
] as const;

export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  MULTIPLE_CHOICE: 'Çoktan Seçmeli',
  TRUE_FALSE: 'Doğru / Yanlış',
  MULTI_SELECT: 'Çoklu Doğru Cevap',
  ORDERING: 'Sıralama Sorusu',
};

export const QUESTION_TYPE_DESCRIPTIONS: Record<QuestionType, string> = {
  MULTIPLE_CHOICE: '2–6 seçenek arasından yalnızca tek doğru cevap işaretlenir.',
  TRUE_FALSE: 'Doğru veya Yanlış olmak üzere iki net seçenek sunar.',
  MULTI_SELECT: '2–6 seçenek arasından birden fazla doğru cevap seçilir.',
  ORDERING: 'Öğrenciler karışık sunulan öğeleri doğru sıraya dizer.',
};

export const OPTION_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'] as const;
export const MIN_CHOICE_OPTIONS = 2;
export const MAX_CHOICE_OPTIONS = 6;
export const MIN_ORDERING_ITEMS = 2;
export const MAX_ORDERING_ITEMS = 6;
export const TRUE_FALSE_OPTIONS = ['Doğru', 'Yanlış'] as const;

export const CANONICAL_QUIZ_CATEGORIES = [
  'Genel Kültür',
  'Matematik',
  'Türkçe',
  'Fen Bilimleri',
  'Tarih',
  'Coğrafya',
  'İngilizce',
  'Teknoloji',
  'Diğer',
] as const;

export const CATEGORY_QUERY_SYNONYMS: Record<string, readonly string[]> = {
  'Genel Kültür': ['Genel Kültür'],
  Matematik: ['Matematik'],
  Türkçe: ['Türkçe', 'Türkçe ve Edebiyat'],
  'Türkçe ve Edebiyat': ['Türkçe', 'Türkçe ve Edebiyat'],
  'Fen Bilimleri': ['Fen Bilimleri'],
  Tarih: ['Tarih'],
  Coğrafya: ['Coğrafya'],
  İngilizce: ['İngilizce', 'Yabancı Dil'],
  'Yabancı Dil': ['İngilizce', 'Yabancı Dil'],
  Teknoloji: ['Teknoloji', 'Bilgisayar ve Teknoloji'],
  'Bilgisayar ve Teknoloji': ['Teknoloji', 'Bilgisayar ve Teknoloji'],
  Diğer: ['Diğer'],
};

export function resolveCategoryFilterValues(category: string): string[] {
  const trimmed = category.trim();
  if (!trimmed || trimmed === 'Tümü') return [];
  const synonyms = CATEGORY_QUERY_SYNONYMS[trimmed];
  return synonyms ? [...synonyms] : [trimmed];
}

/**
 * Sıralama sorularında öğeleri başlangıçtaki doğru sırasından farklı bir sıraya karıştırır.
 */
export function shuffleOrderingIds<T extends { id: string }>(
  items: readonly T[],
): T[] {
  const copy = [...items];
  if (copy.length < 2) {
    return copy;
  }

  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const current = copy[i]!;
    copy[i] = copy[j]!;
    copy[j] = current;
  }

  const unchanged = copy.every((item, idx) => item.id === items[idx]?.id);
  if (unchanged) {
    const first = copy[0]!;
    copy[0] = copy[1]!;
    copy[1] = first;
  }

  return copy;
}
