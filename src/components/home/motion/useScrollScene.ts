import { useLayoutEffect, type RefObject } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

let registered = false;

function ensureRegistered() {
  if (!registered) {
    gsap.registerPlugin(ScrollTrigger);
    registered = true;

    if (typeof document !== 'undefined' && 'fonts' in document) {
      void document.fonts.ready.then(() => ScrollTrigger.refresh());
    }
  }
}

export interface ScrollSceneContext {
  /** Kapsam kök elemanı (bölüm). */
  root: HTMLElement;
  /** Kapsam içindeki seçiciyi diziye çevirir. */
  q: (selector: string) => HTMLElement[];
}

export interface ScrollSceneBuilders {
  /** Masaüstü: hareket serbest, ince işaretçi, >= 1024px. */
  desktop?: (ctx: ScrollSceneContext) => void;
  /** Mobil / tablet: yalnızca hafif tek seferlik görünümler. */
  mobile?: (ctx: ScrollSceneContext) => void;
}

export const DESKTOP_QUERY =
  '(prefers-reduced-motion: no-preference) and (min-width: 1024px)';
export const MOBILE_QUERY =
  '(prefers-reduced-motion: no-preference) and (max-width: 1023.98px)';

/**
 * Aşama 15B: Bölüm kapsamlı GSAP ScrollTrigger sahnesi.
 * - gsap.matchMedia ile masaüstü / mobil / azaltılmış hareket ayrımı
 * - Azaltılmış harekette hiçbir animasyon kurulmaz (içerik statik ve görünür kalır)
 * - Unmount sırasında tüm tween ve ScrollTrigger örnekleri revert edilir
 */
export function useScrollScene(
  rootRef: RefObject<HTMLElement | null>,
  builders: ScrollSceneBuilders,
) {
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root || typeof window === 'undefined') return;

    ensureRegistered();

    const q = (selector: string) =>
      Array.from(root.querySelectorAll<HTMLElement>(selector));

    const mm = gsap.matchMedia(root);

    if (builders.desktop) {
      const build = builders.desktop;
      mm.add(DESKTOP_QUERY, () => build({ root, q }));
    }
    if (builders.mobile) {
      const build = builders.mobile;
      mm.add(MOBILE_QUERY, () => build({ root, q }));
    }

    return () => {
      mm.revert();
    };
    // Sahne kurucuları yalnızca ilk montajda kurulur; yeniden render tetiklemez.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

export { gsap, ScrollTrigger };
