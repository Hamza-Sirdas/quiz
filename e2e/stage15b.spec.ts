import { expect, test, type Page } from '@playwright/test';

const SECTION_HEADINGS = [
  '#ana-sayfa-baslik',
  '#mini-quiz-baslik',
  '#nasil-calisir-baslik',
  '#canli-vitrin-baslik',
  '#ozellikler-baslik',
  '#kapanis-cta-baslik',
] as const;

const RESPONSIVE_VIEWPORTS = [
  { name: 'mobile-320', width: 320, height: 667 },
  { name: 'mobile-390', width: 390, height: 844 },
  { name: 'tablet-768', width: 768, height: 1024 },
  { name: 'laptop-1024', width: 1024, height: 768 },
  { name: 'desktop-1440', width: 1440, height: 900 },
] as const;

async function attachErrorTrackers(page: Page) {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const unexpectedHttp: string[] = [];

  page.on('response', (res) => {
    const status = res.status();
    const url = res.url();
    const isAnonAuth = url.endsWith('/api/auth/me') && status === 401;
    if (status >= 400 && !isAnonAuth) {
      unexpectedHttp.push(`${status} ${url}`);
    }
  });

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const text = msg.text();
      if (!text.includes('401 (Unauthorized)')) {
        consoleErrors.push(text);
      }
    }
  });

  page.on('pageerror', (err) => {
    pageErrors.push(err.message);
  });

  return {
    assertClean: () => {
      expect(unexpectedHttp, `Beklenmeyen HTTP hatası: ${unexpectedHttp.join(' | ')}`).toEqual([]);
      expect(consoleErrors, `Konsol hatası: ${consoleErrors.join(' | ')}`).toEqual([]);
      expect(pageErrors, `Sayfa hatası: ${pageErrors.join(' | ')}`).toEqual([]);
    },
  };
}

test.describe('Aşama 15B — Premium Animasyon ve Etkileşim Sistemi Doğrulaması', () => {
  test('masaüstü hero, parallax, hızlı kaydırma, sayfa yenileme, mini quiz, canlı sıralama ve klavye senaryoları geçer', async ({
    page,
  }) => {
    const errors = await attachErrorTrackers(page);

    await page.addInitScript(() => {
      const perf = { cls: 0 };
      (window as unknown as { __stage15bPerf?: typeof perf }).__stage15bPerf = perf;
      try {
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries() as Array<{
            value?: number;
            hadRecentInput?: boolean;
          }>) {
            if (!entry.hadRecentInput && typeof entry.value === 'number') {
              perf.cls += entry.value;
            }
          }
        }).observe({ type: 'layout-shift', buffered: true });
      } catch {
        // ignore unsupported
      }
    });

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/', { waitUntil: 'networkidle' });

    // 1. Hero yükleme sonrası 1.2s içinde görünür ve parallax dinlenme halinde ~0
    await page.waitForTimeout(1000);
    const h1 = page.getByRole('heading', { name: /Bilgini\s+Yarışmayla Kanıtla\./i });
    const joinBtn = page.getByRole('button', { name: 'Oyuna Katıl' });
    await expect(h1).toBeVisible();
    await expect(joinBtn).toBeVisible();

    const heroRest = await page.evaluate(() => {
      const h1El = document.querySelector('#ana-sayfa-baslik');
      const joinEl = Array.from(document.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Oyuna Katıl'),
      );
      const previewEl = document.querySelector('[data-testid="hero-preview"] > div > div');
      return {
        h1Opacity: h1El ? Number(getComputedStyle(h1El).opacity) : 0,
        h1ChildOpacities: h1El
          ? Array.from(h1El.children).map((c) => Number(getComputedStyle(c).opacity))
          : [],
        joinOpacity: joinEl ? Number(getComputedStyle(joinEl).opacity) : 0,
        previewTransform: previewEl ? getComputedStyle(previewEl).transform : 'none',
      };
    });

    expect(heroRest.h1Opacity).toBeGreaterThanOrEqual(0.99);
    for (const op of heroRest.h1ChildOpacities) {
      expect(op).toBeGreaterThanOrEqual(0.99);
    }
    expect(heroRest.joinOpacity).toBeGreaterThanOrEqual(0.99);
    expect(
      heroRest.previewTransform === 'none' ||
        heroRest.previewTransform === 'matrix(1, 0, 0, 1, 0, 0)',
    ).toBeTruthy();

    // Fare parallax sınırı (±6px içinde) ve ayrılmada sıfırlanma
    const previewBox = await page.getByTestId('hero-preview').boundingBox();
    expect(previewBox).not.toBeNull();
    if (previewBox) {
      await page.mouse.move(previewBox.x + previewBox.width - 8, previewBox.y + previewBox.height - 8);
      await page.waitForTimeout(350);
      const movedMatrix = await page.evaluate(() => {
        const layer = document.querySelector('[data-testid="hero-preview"] > div + div > div');
        return layer ? getComputedStyle(layer).transform : 'none';
      });
      expect(movedMatrix.startsWith('matrix(')).toBeTruthy();
      const nums = movedMatrix
        .slice(7, -1)
        .split(',')
        .map((n) => Number(n.trim()));
      expect(Math.abs(nums[4] ?? 0)).toBeGreaterThan(1);
      expect(Math.abs(nums[4] ?? 0)).toBeLessThanOrEqual(6.5);
      expect(Math.abs(nums[5] ?? 0)).toBeLessThanOrEqual(6.5);

      // Parallax karttan ayrılınca sıfıra yakın değere dönmeli
      await page.mouse.move(4, 4);
      await page.waitForTimeout(450);
      const resetMatrix = await page.evaluate(() => {
        const layer = document.querySelector('[data-testid="hero-preview"] > div + div > div');
        return layer ? getComputedStyle(layer).transform : 'none';
      });
      if (resetMatrix.startsWith('matrix(')) {
        const resetNums = resetMatrix
          .slice(7, -1)
          .split(',')
          .map((n) => Number(n.trim()));
        expect(Math.abs(resetNums[4] ?? 0)).toBeLessThan(0.5);
        expect(Math.abs(resetNums[5] ?? 0)).toBeLessThan(0.5);
      }
    }

    // 2. Hızlı kaydırma: alta zıpla sonra üste dön -> 1.5s sonra tüm başlıklar & CTA opacity === 1
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(250);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(1500);

    const fastScrollStates = await page.evaluate((selectors) => {
      const headingStates = selectors.map((sel) => {
        const el = document.querySelector(sel);
        return { sel, opacity: el ? Number(getComputedStyle(el).opacity) : -1 };
      });
      const ctaLinks = Array.from(
        document.querySelectorAll('[data-anim="cta-actions"] > a'),
      ).map((a) => Number(getComputedStyle(a).opacity));
      return { headingStates, ctaLinks };
    }, [...SECTION_HEADINGS]);

    for (const item of fastScrollStates.headingStates) {
      expect(item.opacity, `${item.sel} opacity 1 olmalı`).toBeGreaterThanOrEqual(0.99);
    }
    expect(fastScrollStates.ctaLinks.length).toBeGreaterThanOrEqual(3);
    for (const op of fastScrollStates.ctaLinks) {
      expect(op).toBeGreaterThanOrEqual(0.99);
    }

    // 3. Sayfa ortada iken yenileme: içerik görünür kalmalı
    await page.evaluate(() => window.scrollTo(0, 2000));
    await page.waitForTimeout(200);
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(1100);
    const reloadedVisible = await page.evaluate(() => {
      const headings = ['#mini-quiz-baslik', '#nasil-calisir-baslik', '#canli-vitrin-baslik'];
      return headings.map((sel) => {
        const el = document.querySelector(sel);
        return el ? Number(getComputedStyle(el).opacity) : 0;
      });
    });
    for (const op of reloadedVisible) {
      expect(op).toBeGreaterThanOrEqual(0.99);
    }

    // 4. Mini quiz tam akış + animasyonlu puan bitiş değerleri + klavye Enter seçimi
    const miniSection = page.locator('#mini-quiz');
    await miniSection.scrollIntoViewIfNeeded();
    await page.waitForTimeout(350);

    const scoreBadge = page.getByTestId('mini-quiz-score');
    await expect(scoreBadge).toHaveText('0');

    // Klavye Enter ile soru 1 seçimi
    const marsBtn = miniSection.getByRole('button', { name: /Mars/i });
    await marsBtn.focus();
    await page.keyboard.press('Enter');
    await expect(miniSection.getByText(/Doğru Cevap! \+940 Demo Puan/i)).toBeVisible();
    await expect(scoreBadge).toHaveText('940');

    await miniSection.getByRole('button', { name: 'Sonraki Soruya Geç' }).click();
    await miniSection.getByRole('button', { name: /1930/i }).click();
    await expect(miniSection.getByText(/Yanlış Cevap — Doğru seçenek işaretlendi/i)).toBeVisible();
    await expect(scoreBadge).toHaveText('940');

    await miniSection.getByRole('button', { name: 'Sonraki Soruya Geç' }).click();
    await miniSection.getByRole('button', { name: /WebSocket/i }).click();
    await expect(scoreBadge).toHaveText('1.920');

    await miniSection.getByRole('button', { name: 'Demo Sonucunu Gör' }).click();
    await expect(miniSection.getByText('Demo Tamamlandı')).toBeVisible();
    await miniSection.getByRole('button', { name: 'Mini Quizi Sıfırla' }).click();
    await expect(scoreBadge).toHaveText('0');

    // 5. Canlı Sıralama Demosu: otomatik tur dönüşümü ve Demoyu Duraklat kilidi
    const liveSection = page.locator('#canli-vitrin');
    await liveSection.scrollIntoViewIfNeeded();
    await page.waitForTimeout(250);

    const tourBadge = liveSection.getByText(/Tur \d \/ 4 · Demo/);
    const initialTourText = await tourBadge.textContent();
    await expect(initialTourText).toContain('Tur 1 / 4');

    const firstRowNameBefore = await liveSection.locator('ul li p').first().textContent();
    expect(firstRowNameBefore).toBe('Örnek Oyuncu A');

    // ~4.5 s içinde ilk sıradaki ad değişmeli
    await expect
      .poll(async () => liveSection.locator('ul li p').first().textContent(), {
        timeout: 4800,
      })
      .not.toBe(firstRowNameBefore);

    // WCAG 2.2.2 Duraklatma kontrolü (aria-pressed olmamalı)
    const pauseBtn = liveSection.getByRole('button', { name: 'Demoyu Duraklat' });
    await expect(pauseBtn).not.toHaveAttribute('aria-pressed', /.*/);
    await pauseBtn.click();

    const playBtn = liveSection.getByRole('button', { name: 'Demoyu Oynat' });
    await expect(playBtn).toBeVisible();
    const pausedName = await liveSection.locator('ul li p').first().textContent();
    const pausedTour = await tourBadge.textContent();

    await page.waitForTimeout(4500);
    expect(await liveSection.locator('ul li p').first().textContent()).toBe(pausedName);
    expect(await tourBadge.textContent()).toBe(pausedTour);

    // 6. Klavye: Navbar Tab focus-visible + Özellikler ArrowDown
    await page.evaluate(() => window.scrollTo(0, 0));
    await page
      .getByRole('banner')
      .getByRole('navigation', { name: 'Birincil' })
      .getByRole('link', { name: 'Ana Sayfa', exact: true })
      .focus();
    await page.keyboard.press('Tab');
    const focusedHasRing = await page.evaluate(() => {
      const active = document.activeElement as HTMLElement | null;
      if (!active) return false;
      const style = getComputedStyle(active);
      return active.matches(':focus-visible') && style.outlineWidth !== '0px';
    });
    expect(focusedHasRing).toBeTruthy();

    const firstFeatureTab = page.locator('#feature-tab-quiz-olusturma');
    await firstFeatureTab.scrollIntoViewIfNeeded();
    await firstFeatureTab.focus();
    await page.keyboard.press('ArrowDown');
    const secondFeatureTab = page.locator('#feature-tab-ai-uretim');
    await expect(secondFeatureTab).toHaveAttribute('aria-selected', 'true');
    await expect(secondFeatureTab).toBeFocused();

    const cls = await page.evaluate(
      () => (window as unknown as { __stage15bPerf?: { cls: number } }).__stage15bPerf?.cls ?? 0,
    );
    expect(cls, `CLS < 0.25 olmalı (ölçülen=${cls})`).toBeLessThan(0.25);

    errors.assertClean();
  });

  test('prefers-reduced-motion: reduce altında animasyonsuz anında görünürlük ve sabit sıralama', async ({
    browser,
  }) => {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      reducedMotion: 'reduce',
    });
    const page = await context.newPage();

    try {
      const errors = await attachErrorTrackers(page);
      await page.goto('/', { waitUntil: 'networkidle' });

      // Kaydırmadan sonra bölümler bekletmeden opacity 1
      await page.locator('#canli-vitrin').scrollIntoViewIfNeeded();
      await page.waitForTimeout(150);

      const opacities = await page.evaluate((selectors) =>
        selectors.map((sel) => {
          const el = document.querySelector(sel);
          return el ? Number(getComputedStyle(el).opacity) : 0;
        }),
      [...SECTION_HEADINGS]);

      for (const op of opacities) {
        expect(op).toBeGreaterThanOrEqual(0.99);
      }

      // Sıralama otomatik dönmemeli
      const tourBadge = page.locator('#canli-vitrin').getByText(/Tur \d \/ 4 · Demo/);
      await expect(tourBadge).toHaveText('Tur 1 / 4 · Demo');
      await page.waitForTimeout(4200);
      await expect(tourBadge).toHaveText('Tur 1 / 4 · Demo');

      // Mini quiz seçildiğinde skor anında son değere gelmeli
      const mini = page.locator('#mini-quiz');
      await mini.scrollIntoViewIfNeeded();
      await mini.getByRole('button', { name: /Mars/i }).click();
      await expect(mini.getByTestId('mini-quiz-score')).toHaveText('940');

      errors.assertClean();
    } finally {
      await context.close();
    }
  });

  test('mobil dokunmatik etkileşim ve 320px–1440px tüm genişliklerde yatay taşma olmaması', async ({
    browser,
  }) => {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      isMobile: true,
    });
    const page = await context.newPage();

    try {
      const errors = await attachErrorTrackers(page);

      for (const vp of RESPONSIVE_VIEWPORTS) {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await page.goto('/', { waitUntil: 'networkidle' });
        await page.waitForTimeout(150);

        const metrics = await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          innerWidth: window.innerWidth,
        }));
        expect(
          metrics.scrollWidth,
          `${vp.name} yatay taşma (${metrics.scrollWidth} > ${metrics.innerWidth})`,
        ).toBeLessThanOrEqual(metrics.innerWidth);
      }

      // 390px dokunmatik menü ve Mini Quiz tap testi
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto('/', { waitUntil: 'networkidle' });

      const menuBtn = page.getByRole('button', { name: 'Menüyü aç' });
      await menuBtn.tap();
      await expect(page.locator('#mobil-menu')).toBeVisible();
      await page.getByRole('button', { name: 'Menüyü kapat' }).tap();
      await expect(page.locator('#mobil-menu')).toHaveCount(0);

      const marsTapBtn = page.locator('#mini-quiz').getByRole('button', { name: /Mars/i });
      await marsTapBtn.scrollIntoViewIfNeeded();
      await marsTapBtn.tap();
      await expect(page.locator('#mini-quiz').getByText(/Doğru Cevap! \+940 Demo Puan/i)).toBeVisible();

      errors.assertClean();
    } finally {
      await context.close();
    }
  });
});
