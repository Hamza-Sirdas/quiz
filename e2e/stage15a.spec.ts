import { expect, test } from '@playwright/test';

const VIEWPORTS = [
  { name: 'mobile-320', width: 320, height: 667 },
  { name: 'mobile-390', width: 390, height: 844 },
  { name: 'tablet-768', width: 768, height: 1024 },
  { name: 'laptop-1024', width: 1024, height: 768 },
  { name: 'desktop-1440', width: 1440, height: 900 },
] as const;

test.describe('Aşama 15A — Yaratıcı ve Premium Ana Sayfa E2E Doğrulaması', () => {
  test('tüm yeni bölümler yüklenir, etkileşimli mini quiz oynanır ve sekmeler sorunsuz çalışır', async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    const unexpectedErrorResponses: string[] = [];

    page.on('response', (res) => {
      const status = res.status();
      const url = res.url();
      const isExpectedAnonAuthCheck = url.endsWith('/api/auth/me') && status === 401;
      if (status >= 400 && !isExpectedAnonAuthCheck) {
        unexpectedErrorResponses.push(`${status} ${url}`);
      }
    });
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const text = msg.text();
        // Anonim ana sayfa ziyaretinde /api/auth/me 401 kontrolü tarayıcı tarafından ağ günlüğüne yazılır
        if (!text.includes('401 (Unauthorized)')) {
          consoleErrors.push(text);
        }
      }
    });
    page.on('pageerror', (err) => {
      pageErrors.push(err.message);
    });

    await page.addInitScript(() => {
      const perf = { cls: 0 };
      (window as unknown as { __stage15Perf?: typeof perf }).__stage15Perf = perf;
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

    // 1. Navbar ve 7 bölüm başlığının varlığı
    const banner = page.getByRole('banner');
    const primaryNav = banner.getByRole('navigation', { name: 'Birincil' });
    await expect(
      primaryNav.getByRole('link', { name: 'Ana Sayfa', exact: true }),
    ).toHaveAttribute('aria-current', 'page');
    await expect(banner.getByRole('link', { name: 'Keşfet' })).toBeVisible();
    await expect(banner.getByRole('link', { name: 'Özellikler' })).toBeVisible();
    await expect(banner.getByRole('link', { name: 'Sınıf Modu' })).toBeVisible();
    await expect(banner.getByRole('link', { name: 'Oturum Aç' })).toBeVisible();
    await expect(banner.getByRole('link', { name: 'Quiz Oluştur' })).toBeVisible();

    await expect(
      page.getByRole('heading', { name: /Bilgini\s+Yarışmayla Kanıtla\./i }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Oyuna Katıl' })).toBeVisible();
    await expect(
      page.getByRole('heading', { name: /Hazırlıktan Analize Kadar Tek Öğretmen Stüdyosu\./i }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: /Bir Sonraki Yarışma Senin Sınıfında\./i }),
    ).toBeVisible();
    await expect(page.getByRole('contentinfo')).toBeVisible();

    // 2. Hero sağ kart etkileşimi ("Ankara" tekil seçicisi korunuyor)
    const ankaraButton = page.getByRole('button', { name: 'Ankara' });
    await expect(ankaraButton).toBeVisible();
    await ankaraButton.click();

    // 3. Etkileşimli Mini Quiz oynanışı (3 soru + skor artışı + yanlış cevaba tepki + özet + sıfırlama)
    const scoreBadge = page.getByTestId('mini-quiz-score');
    await expect(scoreBadge).toHaveText('0');

    await page.getByRole('button', { name: /Mars/i }).click();
    await expect(page.getByText(/Doğru Cevap! \+940 Demo Puan/i)).toBeVisible();
    await expect(scoreBadge).toHaveText('940');
    await page.getByRole('button', { name: 'Sonraki Soruya Geç' }).click();

    await page.getByRole('button', { name: /1930/i }).click();
    await expect(page.getByText(/Yanlış Cevap — Doğru seçenek işaretlendi/i)).toBeVisible();
    await expect(scoreBadge).toHaveText('940');
    await page.getByRole('button', { name: 'Sonraki Soruya Geç' }).click();

    await page.getByRole('button', { name: /WebSocket/i }).click();
    await expect(page.getByText(/Doğru Cevap! \+980 Demo Puan/i)).toBeVisible();
    await expect(scoreBadge).toHaveText('1.920');
    await page.getByRole('button', { name: 'Demo Sonucunu Gör' }).click();

    await expect(page.getByText('Demo Tamamlandı')).toBeVisible();
    await expect(page.getByText('Mini Quiz Özetin Hazır')).toBeVisible();

    await page.getByRole('button', { name: 'Mini Quizi Sıfırla' }).click();
    await expect(scoreBadge).toHaveText('0');
    await expect(page.getByText('Soru 1 / 3')).toBeVisible();

    // 4. Canlı Vitrin Sekmeleri
    const liveTabStandings = page.getByRole('tab', { name: 'Sıralama & Puan Değişimi' });
    await liveTabStandings.click();
    await expect(liveTabStandings).toHaveAttribute('aria-selected', 'true');

    const liveTabClassroom = page.getByRole('tab', { name: 'Sınıf & Projeksiyon Modu' });
    await liveTabClassroom.click();
    await expect(liveTabClassroom).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByText(/Projeksiyon Görünümü · Örnek/i)).toBeVisible();

    // 5. Öğretmen Paneli Tanıtımı Sekmeleri
    const aiTab = page.getByRole('tab', { name: /Yapay Zekâ ile Soru Hazırlama/i });
    await aiTab.click();
    await expect(aiTab).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByText(/Konu: Türkiye Cumhuriyeti'nin kuruluş dönemi/i)).toBeVisible();

    const analyticsTab = page.getByRole('tab', {
      name: /Gelişmiş Sonuç ve Soru Analizi/i,
    });
    await analyticsTab.click();
    await expect(analyticsTab).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByText('CSV & PDF')).toBeVisible();

    // 6. Scroll ve CLS kontrolü
    await page.evaluate(() => window.scrollTo(0, 600));
    await page.waitForTimeout(250);
    const cls = await page.evaluate(
      () => (window as unknown as { __stage15Perf?: { cls: number } }).__stage15Perf?.cls ?? 0,
    );
    expect(cls, `CLS beklenenden yüksek: ${cls}`).toBeLessThan(0.25);

    expect(
      unexpectedErrorResponses,
      `Beklenmeyen HTTP hataları: ${unexpectedErrorResponses.join(' | ')}`,
    ).toEqual([]);
    expect(consoleErrors, `Konsol hataları: ${consoleErrors.join(' | ')}`).toEqual([]);
    expect(pageErrors, `Sayfa hataları: ${pageErrors.join(' | ')}`).toEqual([]);
  });

  test('mobil menü açılıp Escape ile kapanır ve 320px–1440px arası yatay taşma olmaz', async ({
    page,
  }) => {
    for (const vp of VIEWPORTS) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('/', { waitUntil: 'networkidle' });
      await page.waitForTimeout(200);

      const overflow = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
      }));
      expect(
        overflow.scrollWidth,
        `${vp.name} yatay taşma (scrollWidth=${overflow.scrollWidth}, innerWidth=${overflow.innerWidth})`,
      ).toBeLessThanOrEqual(overflow.innerWidth);
    }

    // 390px mobilde açılır menü kontrolü
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/', { waitUntil: 'networkidle' });

    const menuButton = page.getByRole('button', { name: 'Menüyü aç' });
    await expect(menuButton).toBeVisible();
    await menuButton.click();

    await expect(page.locator('#mobil-menu')).toBeVisible();
    await expect(
      page.locator('#mobil-menu').getByRole('link', { name: 'Keşfet' }),
    ).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.locator('#mobil-menu')).toHaveCount(0);
  });
});
