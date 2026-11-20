import type { Transition, Variants } from 'motion/react';

/** Aşama 15B: Ana sayfa genelinde tutarlı hareket belirteçleri. */
export const EASE_OUT_EXPO = [0.22, 1, 0.36, 1] as const;

export const DURATION = {
  fast: 0.18,
  base: 0.32,
  slow: 0.5,
} as const;

export const baseTransition: Transition = {
  duration: DURATION.base,
  ease: EASE_OUT_EXPO,
};

/** Hero başlık satırları için sıralı giriş. */
export const heroContainerVariants: Variants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.07, delayChildren: 0.04 },
  },
};

export const heroItemVariants: Variants = {
  hidden: { opacity: 0, y: 18 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.46, ease: EASE_OUT_EXPO },
  },
};

/** Azaltılmış hareket: anında son durum. */
export const staticVariants: Variants = {
  hidden: { opacity: 1, y: 0 },
  visible: { opacity: 1, y: 0 },
};

/** Yanlış cevap için kısa yatay sarsıntı. */
export const shakeKeyframes = [0, -6, 6, -4, 4, 0];

/** Doğru cevap için yumuşak nabız. */
export const pulseKeyframes = [1, 1.025, 1];
