import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { chromium, expect, test, type Page } from '@playwright/test';

const prisma = new PrismaClient();

async function assertNoHorizontalOverflow(page: Page, label: string) {
  const metrics = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(
    metrics.scrollWidth,
    `${label}: yatay taşma tespit edildi (scrollWidth=${metrics.scrollWidth}, innerWidth=${metrics.innerWidth})`,
  ).toBeLessThanOrEqual(metrics.innerWidth);
}

interface WebVitalSample {
  route: string;
  mode: string;
  ttfbMs: number;
  domContentLoadedMs: number;
  loadMs: number;
  fcpMs: number | null;
  lcpMs: number | null;
  cls: number;
  transferKb: number;
  jsKb: number;
}

async function measureRoutePerformance(
  page: Page,
  url: string,
  routeLabel: string,
  modeLabel: string,
): Promise<WebVitalSample> {
  await page.addInitScript(() => {
    const perfStore = {
      lcpMs: null as number | null,
      cls: 0,
    };
    (window as unknown as { __quizoraPerf?: typeof perfStore }).__quizoraPerf =
      perfStore;

    try {
      new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const last = entries[entries.length - 1];
        if (last) {
          perfStore.lcpMs = Math.round(last.startTime);
        }
      }).observe({ type: 'largest-contentful-paint', buffered: true });
    } catch {
      // ignore unsupported
    }

    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as Array<{
          value?: number;
          hadRecentInput?: boolean;
        }>) {
          if (!entry.hadRecentInput && typeof entry.value === 'number') {
            perfStore.cls += entry.value;
          }
        }
      }).observe({ type: 'layout-shift', buffered: true });
    } catch {
      // ignore unsupported
    }
  });

  await page.goto(url, { waitUntil: 'load' });
  await page.waitForTimeout(700);

  return page.evaluate(
    ({ route, mode }) => {
      const nav = performance.getEntriesByType(
        'navigation',
      )[0] as PerformanceNavigationTiming | undefined;
      const paint = performance.getEntriesByName('first-contentful-paint')[0];
      const resources = performance.getEntriesByType(
        'resource',
      ) as PerformanceResourceTiming[];
      const totalBytes = resources.reduce(
        (sum, r) => sum + (r.transferSize || r.encodedBodySize || 0),
        nav?.transferSize || 0,
      );
      const jsBytes = resources
        .filter((r) => r.initiatorType === 'script' || /\.m?js(\?|$)/.test(r.name))
        .reduce((sum, r) => sum + (r.transferSize || r.encodedBodySize || 0), 0);

      const store = (
        window as unknown as {
          __quizoraPerf?: { lcpMs: number | null; cls: number };
        }
      ).__quizoraPerf;

      return {
        route,
        mode,
        ttfbMs: Math.round(nav ? nav.responseStart - nav.requestStart : 0),
        domContentLoadedMs: Math.round(nav ? nav.domContentLoadedEventEnd : 0),
        loadMs: Math.round(nav ? nav.loadEventEnd : 0),
        fcpMs: paint ? Math.round(paint.startTime) : null,
        lcpMs: store?.lcpMs ?? null,
        cls: Number((store?.cls ?? 0).toFixed(4)),
        transferKb: Number((totalBytes / 1024).toFixed(1)),
        jsKb: Number((jsBytes / 1024).toFixed(1)),
      };
    },
    { route: routeLabel, mode: modeLabel },
  );
}

test.describe('QUIZORA Aşama 14 — Kapsamlı Uçtan Uca, Bağlantı Kopması, Yavaş Ağ, Çoklu Tarayıcı ve Performans Testleri', () => {
  const cleanupEmails: string[] = [];
  const cleanupPins: string[] = [];

  test.afterAll(async () => {
    try {
      if (cleanupPins.length > 0) {
        await prisma.gameSession.deleteMany({
          where: { pin: { in: cleanupPins } },
        });
      }
      if (cleanupEmails.length > 0) {
        const teachers = await prisma.teacher.findMany({
          where: { email: { in: cleanupEmails } },
          select: { id: true },
        });
        const teacherIds = teachers.map((t) => t.id);
        if (teacherIds.length > 0) {
          await prisma.gameSession.deleteMany({
            where: { hostTeacherId: { in: teacherIds } },
          });
          await prisma.quiz.deleteMany({
            where: { ownerId: { in: teacherIds } },
          });
          await prisma.teacher.deleteMany({
            where: { id: { in: teacherIds } },
          });
        }
      }
    } finally {
      await prisma.$disconnect();
    }
  });

  test('1. Bütünleşik 17 adımlı öğretmen + öğrenci akışı (kayıt, çıkış, giriş, 4 soru türü oluşturma/düzenleme, PIN, oyun, podyum, DB, analiz)', async ({
    browser,
  }) => {
    const suffix = `${Date.now().toString().slice(-6)}s14`;
    const teacherEmail = `stage14-flow-${suffix}@quizora.local`;
    cleanupEmails.push(teacherEmail);

    const quizTitle = `Aşama 14 Bütünleşik Quiz ${suffix}`;
    const editedQuizTitle = `${quizTitle} Düzenlenmiş`;

    const teacherCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const stu1Ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const stu2Ctx = await browser.newContext({ viewport: { width: 375, height: 667 } });

    const teacherPage = await teacherCtx.newPage();
    const stu1Page = await stu1Ctx.newPage();
    const stu2Page = await stu2Ctx.newPage();

    try {
      // Adım 1-2: Kayıt ol -> Çıkış yap -> Tekrar giriş yap
      await teacherPage.goto('/register');
      await teacherPage.locator('#register-name').fill('Aşama 14 Öğretmen');
      await teacherPage.locator('#register-email').fill(teacherEmail);
      await teacherPage.locator('#register-password').fill('Stage14Sifre123!');
      await teacherPage.locator('#register-password-confirm').fill('Stage14Sifre123!');
      await teacherPage.locator('#register-terms').check();
      await teacherPage.getByRole('button', { name: 'Hesap Oluştur' }).click();
      await expect(teacherPage).toHaveURL(/\/dashboard$/);

      await teacherPage.goto('/dashboard/profile');
      await teacherPage.getByRole('button', { name: 'Oturumu Kapat' }).click();
      await expect(teacherPage).toHaveURL(/\/login/);

      await teacherPage.locator('#login-email').fill(teacherEmail);
      await teacherPage.locator('#login-password').fill('Stage14Sifre123!');
      await teacherPage.getByRole('button', { name: 'Oturum Aç' }).click();
      await expect(teacherPage).toHaveURL(/\/dashboard(?:\/profile)?$/);

      // Adım 3-5: 4 soru türünü içeren yeni quiz oluştur ve kaydet
      await teacherPage.goto('/dashboard/quizzes/new');
      await teacherPage.locator('#quiz-title').fill(quizTitle);
      await teacherPage.locator('#quiz-category').selectOption('Fen Bilimleri');

      // Soru 1: Çoktan seçmeli
      await teacherPage
        .getByPlaceholder('Sorunuzu buraya yazın...')
        .fill('Güneşe en yakın gezegen hangisidir?');
      await teacherPage.getByPlaceholder('A seçeneğini yazın...').fill('Merkür');
      await teacherPage.getByPlaceholder('B seçeneğini yazın...').fill('Venüs');
      await teacherPage.getByPlaceholder('C seçeneğini yazın...').fill('Mars');
      await teacherPage.getByPlaceholder('D seçeneğini yazın...').fill('Dünya');
      await teacherPage.getByLabel('Doğru Cevap').nth(0).check();

      // Soru 2: Doğru / Yanlış
      await teacherPage.getByRole('button', { name: 'Soru Ekle' }).click();
      await teacherPage.getByRole('button', { name: 'Doğru / Yanlış' }).click();
      await teacherPage
        .getByPlaceholder('Sorunuzu buraya yazın...')
        .fill('Su 100 santigrat derecede (deniz seviyesinde) kaynar.');

      // Soru 3: Çoklu Doğru Cevap (kısmi puanlama açık)
      await teacherPage.getByRole('button', { name: 'Soru Ekle' }).click();
      await teacherPage.getByRole('button', { name: 'Çoklu Doğru Cevap' }).click();
      await teacherPage.getByLabel(/Kısmi puanlamaya izin ver/i).check();
      await teacherPage
        .getByPlaceholder('Sorunuzu buraya yazın...')
        .fill('Hangileri asal sayıdır?');
      await teacherPage.getByPlaceholder('A seçeneğini yazın...').fill('2');
      await teacherPage.getByPlaceholder('B seçeneğini yazın...').fill('3');
      await teacherPage.getByPlaceholder('C seçeneğini yazın...').fill('4');
      await teacherPage.getByPlaceholder('D seçeneğini yazın...').fill('6');

      // Soru 4: Sıralama Sorusu
      await teacherPage.getByRole('button', { name: 'Soru Ekle' }).click();
      await teacherPage.getByRole('button', { name: 'Sıralama Sorusu' }).click();
      await teacherPage
        .getByPlaceholder('Sorunuzu buraya yazın...')
        .fill('Birimleri küçükten büyüğe sıralayın.');
      await teacherPage.getByPlaceholder('1. sıra öğesini yazın...').fill('Milimetre');
      await teacherPage.getByPlaceholder('2. sıra öğesini yazın...').fill('Santimetre');
      await teacherPage.getByPlaceholder('3. sıra öğesini yazın...').fill('Metre');

      await teacherPage.getByRole('button', { name: 'Quizi Kaydet' }).click();
      await expect(teacherPage).toHaveURL(/\/dashboard\/quizzes$/);

      // Adım 6: Quizi tekrar açıp düzenle
      const createdCard = teacherPage.locator('article', {
        has: teacherPage.getByRole('heading', { name: quizTitle }),
      });
      await createdCard.getByRole('link', { name: 'Düzenle' }).click();
      await expect(teacherPage).toHaveURL(/\/dashboard\/quizzes\/[^/]+\/edit$/);
      await teacherPage.locator('#quiz-title').fill(editedQuizTitle);
      await teacherPage.getByRole('button', { name: 'Değişiklikleri Kaydet' }).click();
      await expect(teacherPage).toHaveURL(/\/dashboard\/quizzes$/);

      // Adım 7-8: Yarışma başlat & PIN oluşumu
      const editedCard = teacherPage.locator('article', {
        has: teacherPage.getByRole('heading', { name: editedQuizTitle }),
      });
      await editedCard.getByRole('button', { name: 'Yarışma Başlat' }).click();
      await expect(teacherPage).toHaveURL(/\/host\/\d{6}$/);
      const pin = teacherPage.url().match(/\/host\/(\d{6})$/)![1]!;
      cleanupPins.push(pin);

      // Adım 9: Öğrenciler PIN formu ve QR URL bağlantısı ile katılır
      await stu1Page.goto('/join');
      await stu1Page.locator('#game-pin').fill(pin);
      await stu1Page.getByRole('button', { name: 'Devam Et' }).click();
      await stu1Page.locator('#player-nickname').fill('Elif_Birinci');
      await stu1Page.getByRole('button', { name: 'Katıl' }).click();
      await expect(stu1Page).toHaveURL(new RegExp(`/play/${pin}$`));

      await stu2Page.goto(`/join?pin=${pin}`);
      await stu2Page.locator('#player-nickname').fill('Can_Ikinci');
      await stu2Page.getByRole('button', { name: 'Katıl' }).click();
      await expect(stu2Page).toHaveURL(new RegExp(`/play/${pin}$`));

      await expect(
        teacherPage.getByRole('heading', { name: /Katılımcılar \(2 \/ \d+\)/ }),
      ).toBeVisible();

      // Adım 10-13: Yarışmayı başlat, 4 soruyu cevapla, puan + liderlik tablosu güncellemesini gör
      await teacherPage.getByRole('button', { name: 'Yarışmayı Başlat' }).click();

      // Soru 1 (MC)
      await expect(
        stu1Page.getByRole('heading', { name: 'Güneşe en yakın gezegen hangisidir?' }),
      ).toBeVisible({ timeout: 10_000 });
      await stu1Page.getByRole('button', { name: /Merkür/ }).click();
      await stu2Page.getByRole('button', { name: /Venüs/ }).click();
      await expect(stu1Page.getByText('Doğru Cevap!')).toBeVisible({ timeout: 10_000 });
      await expect(
        teacherPage.getByRole('heading', { name: 'Güncel Liderlik Tablosu' }),
      ).toBeVisible();

      // Soru 2 (Doğru/Yanlış)
      await teacherPage.getByRole('button', { name: 'Sonraki Soru' }).click();
      await expect(
        stu1Page.getByRole('button', { name: 'Doğru', exact: true }),
      ).toBeVisible({ timeout: 10_000 });
      await stu1Page.getByRole('button', { name: 'Doğru', exact: true }).click();
      await stu2Page.getByRole('button', { name: 'Doğru', exact: true }).click();
      await expect(stu1Page.getByText('Doğru Cevap!')).toBeVisible({ timeout: 10_000 });

      // Soru 3 (Çoklu Doğru Cevap)
      await teacherPage.getByRole('button', { name: 'Sonraki Soru' }).click();
      await expect(
        stu1Page.getByRole('heading', { name: 'Hangileri asal sayıdır?' }),
      ).toBeVisible({ timeout: 10_000 });
      await stu1Page.getByRole('button', { name: /A\s*2/ }).click();
      await stu1Page.getByRole('button', { name: /B\s*3/ }).click();
      await stu1Page.getByRole('button', { name: /Cevabı Gönder/ }).click();

      await stu2Page.getByRole('button', { name: /A\s*2/ }).click();
      await stu2Page.getByRole('button', { name: /Cevabı Gönder/ }).click();

      await expect(stu1Page.getByText('Doğru Cevap!')).toBeVisible({ timeout: 10_000 });
      await expect(stu2Page.getByText('Kısmi Doğru!')).toBeVisible({ timeout: 10_000 });

      // Soru 4 (Sıralama Sorusu)
      await teacherPage.getByRole('button', { name: 'Sonraki Soru' }).click();
      await expect(
        stu1Page.getByRole('heading', {
          name: 'Birimleri küçükten büyüğe sıralayın.',
        }),
      ).toBeVisible({ timeout: 10_000 });

      const orderingList = stu1Page.getByRole('list', {
        name: 'Öğeleri doğru sıraya dizin',
      });
      const targetOrder = ['Milimetre', 'Santimetre', 'Metre'];
      for (let slot = 0; slot < targetOrder.length; slot += 1) {
        const currentTexts = await orderingList.locator('li').allInnerTexts();
        const foundIdx = currentTexts.findIndex((txt) =>
          txt.includes(targetOrder[slot]!),
        );
        for (let step = foundIdx; step > slot; step -= 1) {
          await orderingList
            .locator('li')
            .nth(step)
            .getByRole('button', { name: /yukarı taşı/i })
            .click();
        }
      }
      await stu1Page.getByRole('button', { name: 'Sıralamayı Gönder' }).click();
      await stu2Page.getByRole('button', { name: 'Sıralamayı Gönder' }).click();
      await expect(stu1Page.getByText('Doğru Cevap!')).toBeVisible({ timeout: 10_000 });

      // Adım 14-15: Yarışma biter & Final Podyumu gösterilir
      await teacherPage.getByRole('button', { name: 'Final Sonuçlarını Göster' }).click();
      await expect(
        teacherPage.getByRole('heading', { name: 'Oyun Sonuçları' }),
      ).toBeVisible({ timeout: 10_000 });
      await expect(
        stu1Page.getByRole('heading', { name: 'Oyun Sonuçları' }),
      ).toBeVisible({ timeout: 10_000 });
      await expect(stu1Page.getByText('1. Sıra', { exact: true })).toBeVisible();

      // Adım 16: Sonuçların PostgreSQL veritabanına yazıldığı doğrulanır
      const savedSession = await prisma.gameSession.findFirst({
        where: { pin, status: 'FINISHED' },
        include: { results: true, answers: true },
      });
      expect(savedSession).not.toBeNull();
      expect(savedSession!.results).toHaveLength(2);
      expect(savedSession!.answers).toHaveLength(8);

      // Adım 17: Öğretmen yarışma analiz sayfasını (/dashboard/history/:sessionId) görüntüler
      await teacherPage.goto('/dashboard/history');
      const card = teacherPage.locator('article', { hasText: editedQuizTitle }).first();
      await expect(card).toBeVisible({ timeout: 10_000 });
      await card.getByRole('link', { name: 'Detayları Gör' }).click();

      await expect(teacherPage).toHaveURL(
        new RegExp(`/dashboard/history/${savedSession!.id}$`),
      );
      await expect(
        teacherPage.getByRole('heading', { name: editedQuizTitle }),
      ).toBeVisible();
      await expect(teacherPage.getByText('Elif_Birinci').first()).toBeVisible();
      await expect(teacherPage.getByText('Can_Ikinci').first()).toBeVisible();
      await expect(teacherPage.locator('svg.recharts-surface').first()).toBeVisible({
        timeout: 10_000,
      });
    } finally {
      await teacherCtx.close();
      await stu1Ctx.close();
      await stu2Ctx.close();
    }
  });

  test('2. Bağlantı kopması, sayfa yenileme, sekme değiştirme, Slow 3G ve gönderim anında ağ kaybı kilidi kurtarma akışını doğrular', async ({
    browser,
  }) => {
    const suffix = `${Date.now().toString().slice(-6)}net`;
    const teacherEmail = `stage14-net-${suffix}@quizora.local`;
    cleanupEmails.push(teacherEmail);

    const teacherCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const stu1Ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const stu2Ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const presenterCtx = await browser.newContext({ viewport: { width: 1280, height: 720 } });

    const teacherPage = await teacherCtx.newPage();
    const stu1Page = await stu1Ctx.newPage();
    const stu2Page = await stu2Ctx.newPage();
    const presenterPage = await presenterCtx.newPage();

    try {
      await teacherPage.goto('/register');
      await teacherPage.locator('#register-name').fill('Ağ Dayanıklılık Öğretmeni');
      await teacherPage.locator('#register-email').fill(teacherEmail);
      await teacherPage.locator('#register-password').fill('Stage14Sifre123!');
      await teacherPage.locator('#register-password-confirm').fill('Stage14Sifre123!');
      await teacherPage.locator('#register-terms').check();
      await teacherPage.getByRole('button', { name: 'Hesap Oluştur' }).click();
      await expect(teacherPage).toHaveURL(/\/dashboard$/);

      await teacherPage.goto('/dashboard/quizzes/new');
      await teacherPage.locator('#quiz-title').fill(`Ağ ve Bağlantı Quizi ${suffix}`);
      await teacherPage
        .getByPlaceholder('Sorunuzu buraya yazın...')
        .fill('Soru 1: Slow 3G altında cevaplanacak soru');
      await teacherPage.getByPlaceholder('A seçeneğini yazın...').fill('Doğru A');
      await teacherPage.getByPlaceholder('B seçeneğini yazın...').fill('Yanlış B');
      await teacherPage.getByPlaceholder('C seçeneğini yazın...').fill('Yanlış C');
      await teacherPage.getByPlaceholder('D seçeneğini yazın...').fill('Yanlış D');
      await teacherPage.getByLabel('Doğru Cevap').nth(0).check();
      await teacherPage.getByRole('radio', { name: '60 sn' }).check();

      await teacherPage.getByRole('button', { name: 'Soru Ekle' }).click();
      await teacherPage
        .getByPlaceholder('Sorunuzu buraya yazın...')
        .fill('Soru 2: Ağ kopması sonrası gönderim ve sayfa yenileme');
      await teacherPage.getByPlaceholder('A seçeneğini yazın...').fill('Doğru İki');
      await teacherPage.getByPlaceholder('B seçeneğini yazın...').fill('Yanlış İki');
      await teacherPage.getByPlaceholder('C seçeneğini yazın...').fill('Yanlış Üç');
      await teacherPage.getByPlaceholder('D seçeneğini yazın...').fill('Yanlış Dört');
      await teacherPage.getByLabel('Doğru Cevap').nth(0).check();
      await teacherPage.getByRole('radio', { name: '60 sn' }).check();

      await teacherPage.getByRole('button', { name: 'Quizi Kaydet' }).click();
      await expect(teacherPage).toHaveURL(/\/dashboard\/quizzes$/);

      const card = teacherPage.locator('article', {
        has: teacherPage.getByRole('heading', { name: `Ağ ve Bağlantı Quizi ${suffix}` }),
      });
      await card.getByRole('button', { name: 'Sınıf Modunda Başlat' }).click();
      await expect(teacherPage).toHaveURL(/\/host\/\d{6}/);
      const pin = teacherPage.url().match(/\/host\/(\d{6})/)![1]!;
      cleanupPins.push(pin);

      // Projeksiyon ekranı bağlantısı
      const popupPromise = teacherCtx.waitForEvent('page');
      await teacherPage.getByRole('button', { name: 'Projeksiyon Görünümü' }).click();
      const presPopup = await popupPromise;
      await presPopup.waitForLoadState('domcontentloaded');
      const presenterUrl = presPopup.url();
      await presPopup.close();
      await presenterPage.goto(presenterUrl);

      // Öğrenciler katılır
      await stu1Page.goto(`/join?pin=${pin}`);
      await stu1Page.locator('#player-nickname').fill('YavasAg_Ogrenci');
      await stu1Page.getByRole('button', { name: 'Katıl' }).click();
      await expect(stu1Page).toHaveURL(new RegExp(`/play/${pin}$`));

      await stu2Page.goto(`/join?pin=${pin}`);
      await stu2Page.locator('#player-nickname').fill('KopmaTest_Ogrenci');
      await stu2Page.getByRole('button', { name: 'Katıl' }).click();
      await expect(stu2Page).toHaveURL(new RegExp(`/play/${pin}$`));

      await teacherPage.getByRole('button', { name: 'Yarışmayı Başlat' }).click();
      await expect(
        stu1Page.getByRole('heading', {
          name: 'Soru 1: Slow 3G altında cevaplanacak soru',
        }),
      ).toBeVisible({ timeout: 10_000 });

      // Slow 3G ağ kısıtlaması (CDP) altında Öğrenci 1 cevap verir — ekran donmamalı
      const stu1Cdp = await stu1Ctx.newCDPSession(stu1Page);
      await stu1Cdp.send('Network.enable');
      await stu1Cdp.send('Network.emulateNetworkConditions', {
        offline: false,
        latency: 450,
        downloadThroughput: 50 * 1024,
        uploadThroughput: 25 * 1024,
      });

      await stu1Page.getByRole('button', { name: /Doğru A/ }).click();
      await expect(
        stu1Page.getByText('Cevabın kaydedildi. Diğer oyuncular bekleniyor...'),
      ).toBeVisible({ timeout: 12_000 });

      // Slow 3G kapat
      await stu1Cdp.send('Network.emulateNetworkConditions', {
        offline: false,
        latency: 0,
        downloadThroughput: -1,
        uploadThroughput: -1,
      });

      // Öğrenci 2 sayfa yeniler + sekme değiştirir + geri dönüp cevaplar
      await stu2Page.reload();
      await expect(
        stu2Page.getByRole('heading', {
          name: 'Soru 1: Slow 3G altında cevaplanacak soru',
        }),
      ).toBeVisible({ timeout: 10_000 });

      const otherTab = await stu2Ctx.newPage();
      await otherTab.goto('about:blank');
      await otherTab.waitForTimeout(350);
      await stu2Page.bringToFront();
      await otherTab.close();

      await stu2Page.getByRole('button', { name: /Doğru A/ }).click();
      await expect(stu1Page.getByText('Doğru Cevap!')).toBeVisible({ timeout: 12_000 });

      // Soru 2: Öğretmen + Projeksiyon sayfa yenileme kurtarması
      await teacherPage.getByRole('button', { name: 'Sonraki Soru' }).click();
      await expect(
        stu2Page.getByRole('heading', {
          name: 'Soru 2: Ağ kopması sonrası gönderim ve sayfa yenileme',
        }),
      ).toBeVisible({ timeout: 10_000 });

      await Promise.all([teacherPage.reload(), presenterPage.reload()]);
      await expect(teacherPage.getByText('Katılımcı yok')).toHaveCount(0);
      await expect(
        teacherPage.getByRole('heading', {
          name: /Soru 2: Ağ kopması sonrası gönderim ve sayfa yenileme/,
        }),
      ).toBeVisible({ timeout: 10_000 });
      await expect(
        presenterPage.getByRole('heading', {
          name: /Soru 2: Ağ kopması sonrası gönderim ve sayfa yenileme/,
        }),
      ).toBeVisible({ timeout: 10_000 });

      // KRİTİK TEST: Cevap gönderilirken ağ paketleri düşerse / çevrimdışı olunursa:
      // 1) "Cevabın kaydedildi..." YANLIŞLIKLA gösterilmemeli
      // 2) Gönderim kilidi sonsuza dek donmamalı, timeout sonrası açılmalı ve tekrar gönderebilmeli
      const stu2Cdp = await stu2Ctx.newCDPSession(stu2Page);
      await stu2Cdp.send('Network.enable');
      await stu2Cdp.send('Network.emulateNetworkConditions', {
        offline: true,
        latency: 0,
        downloadThroughput: 0,
        uploadThroughput: 0,
      });

      const stu2Option = stu2Page.getByRole('button', { name: /Doğru İki/ });
      await stu2Option.click();

      // Bağlantı yokken cevabı kabul edilmiş göstermemeli ve butonu kilitlememeli
      await expect(
        stu2Page.getByText('Cevabın kaydedildi. Diğer oyuncular bekleniyor...'),
      ).toHaveCount(0);
      await expect(
        stu2Page.getByText(/Bağlantı kesildi veya sunucuya ulaşılamıyor/i),
      ).toBeVisible();
      await expect(stu2Option).toBeEnabled();

      // Bağlantı döndükten sonra Öğrenci 1 ve Öğrenci 2 soruyu başarıyla gönderip yarışı bitirir
      await stu2Cdp.send('Network.emulateNetworkConditions', {
        offline: false,
        latency: 0,
        downloadThroughput: -1,
        uploadThroughput: -1,
      });

      await expect(stu2Page.getByText('Bağlı').first()).toBeVisible({
        timeout: 10_000,
      });
      await stu2Option.click();
      await expect(
        stu2Page.getByText('Cevabın kaydedildi. Diğer oyuncular bekleniyor...'),
      ).toBeVisible({ timeout: 10_000 });

      await stu1Page.getByRole('button', { name: /Doğru İki/ }).click();
      await expect(
        teacherPage.getByRole('button', { name: 'Final Sonuçlarını Göster' }),
      ).toBeVisible({ timeout: 12_000 });
      await teacherPage.getByRole('button', { name: 'Final Sonuçlarını Göster' }).click();
      await expect(
        teacherPage.getByRole('heading', { name: 'Oyun Sonuçları' }),
      ).toBeVisible({ timeout: 10_000 });
    } finally {
      await teacherCtx.close();
      await stu1Ctx.close();
      await stu2Ctx.close();
      await presenterCtx.close();
    }
  });

  test('3. Çoklu ekran boyutu (320..1440 px) mobil emülasyon ve yerel Chrome / Edge tarayıcı doğrulaması', async ({
    browser,
  }) => {
    const suffix = `${Date.now().toString().slice(-6)}br`;
    const teacherEmail = `stage14-browser-${suffix}@quizora.local`;
    cleanupEmails.push(teacherEmail);

    const viewports = [
      { width: 320, height: 667, isMobile: true, hasTouch: true, label: '320px Mobil' },
      { width: 375, height: 667, isMobile: true, hasTouch: true, label: '375px Mobil' },
      { width: 390, height: 844, isMobile: true, hasTouch: true, label: '390px Mobil' },
      { width: 768, height: 1024, isMobile: true, hasTouch: true, label: '768px Tablet' },
      { width: 1024, height: 768, isMobile: false, hasTouch: false, label: '1024px Dizüstü' },
      { width: 1440, height: 900, isMobile: false, hasTouch: false, label: '1440px Masaüstü' },
    ];

    for (const vp of viewports) {
      const ctx = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        isMobile: vp.isMobile,
        hasTouch: vp.hasTouch,
      });
      const p = await ctx.newPage();
      await p.goto('/join');
      await assertNoHorizontalOverflow(p, `${vp.label} /join`);
      await p.goto('/explore');
      await assertNoHorizontalOverflow(p, `${vp.label} /explore`);
      await ctx.close();
    }

    // Canlı oyunda 375px mobil dokunmatik öğrenci akışı + Edge / Chrome tarayıcı motorları
    const teacherCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const teacherPage = await teacherCtx.newPage();

    await teacherPage.goto('/register');
    await teacherPage.locator('#register-name').fill('Tarayıcı Test Öğretmeni');
    await teacherPage.locator('#register-email').fill(teacherEmail);
    await teacherPage.locator('#register-password').fill('Stage14Sifre123!');
    await teacherPage.locator('#register-password-confirm').fill('Stage14Sifre123!');
    await teacherPage.locator('#register-terms').check();
    await teacherPage.getByRole('button', { name: 'Hesap Oluştur' }).click();
    await expect(teacherPage).toHaveURL(/\/dashboard$/);

    await teacherPage.goto('/dashboard/quizzes/new');
    await teacherPage.locator('#quiz-title').fill(`Tarayıcı Uyum Quizi ${suffix}`);
    await teacherPage
      .getByPlaceholder('Sorunuzu buraya yazın...')
      .fill('Başkentimiz neresidir?');
    await teacherPage.getByPlaceholder('A seçeneğini yazın...').fill('Ankara');
    await teacherPage.getByPlaceholder('B seçeneğini yazın...').fill('İzmir');
    await teacherPage.getByPlaceholder('C seçeneğini yazın...').fill('Bursa');
    await teacherPage.getByPlaceholder('D seçeneğini yazın...').fill('Adana');
    await teacherPage.getByLabel('Doğru Cevap').nth(0).check();
    await teacherPage.getByRole('button', { name: 'Quizi Kaydet' }).click();
    await expect(teacherPage).toHaveURL(/\/dashboard\/quizzes$/);

    await teacherPage
      .locator('article', {
        has: teacherPage.getByRole('heading', { name: `Tarayıcı Uyum Quizi ${suffix}` }),
      })
      .getByRole('button', { name: 'Yarışma Başlat' })
      .click();
    await expect(teacherPage).toHaveURL(/\/host\/\d{6}$/);
    const pin = teacherPage.url().match(/\/host\/(\d{6})$/)![1]!;
    cleanupPins.push(pin);

    // Chrome (channel: 'chrome') + Edge (channel: 'msedge') gerçek tarayıcı oturumları
    const chromeBrowser = await chromium.launch({ channel: 'chrome', headless: true });
    const edgeBrowser = await chromium.launch({ channel: 'msedge', headless: true });

    try {
      const chromeCtx = await chromeBrowser.newContext({
        viewport: { width: 375, height: 812 },
        isMobile: true,
        hasTouch: true,
      });
      const edgeCtx = await edgeBrowser.newContext({
        viewport: { width: 1280, height: 800 },
      });

      const chromePage = await chromeCtx.newPage();
      const edgePage = await edgeCtx.newPage();

      await chromePage.goto(`/join?pin=${pin}`);
      await assertNoHorizontalOverflow(chromePage, 'Chrome 375px Mobil Katılım');
      await chromePage.locator('#player-nickname').fill('Chrome_Mobil');
      await chromePage.getByRole('button', { name: 'Katıl' }).click();
      await expect(chromePage).toHaveURL(new RegExp(`/play/${pin}$`));

      await edgePage.goto('/join');
      await assertNoHorizontalOverflow(edgePage, 'Edge Masaüstü Katılım');
      await edgePage.locator('#game-pin').fill(pin);
      await edgePage.getByRole('button', { name: 'Devam Et' }).click();
      await edgePage.locator('#player-nickname').fill('Edge_Masaustu');
      await edgePage.getByRole('button', { name: 'Katıl' }).click();
      await expect(edgePage).toHaveURL(new RegExp(`/play/${pin}$`));

      await expect(
        teacherPage.getByRole('heading', { name: /Katılımcılar \(2 \/ \d+\)/ }),
      ).toBeVisible();
      await teacherPage.getByRole('button', { name: 'Yarışmayı Başlat' }).click();

      await expect(
        chromePage.getByRole('heading', { name: 'Başkentimiz neresidir?' }),
      ).toBeVisible({ timeout: 10_000 });
      await expect(
        edgePage.getByRole('heading', { name: 'Başkentimiz neresidir?' }),
      ).toBeVisible({ timeout: 10_000 });
      await assertNoHorizontalOverflow(chromePage, 'Chrome 375px Mobil Soru');

      const ansBtnBox = await chromePage
        .getByRole('button', { name: /Ankara/ })
        .boundingBox();
      expect(ansBtnBox?.height ?? 0).toBeGreaterThanOrEqual(48);

      await chromePage.getByRole('button', { name: /Ankara/ }).click();
      await expect(
        chromePage.getByText('Cevabın kaydedildi. Diğer oyuncular bekleniyor...'),
      ).toBeVisible();
      await edgePage.getByRole('button', { name: /İzmir/ }).click();

      await expect(chromePage.getByText('Doğru Cevap!')).toBeVisible({
        timeout: 10_000,
      });
      await assertNoHorizontalOverflow(chromePage, 'Chrome 375px Liderlik');

      await teacherPage.getByRole('button', { name: 'Final Sonuçlarını Göster' }).click();
      await expect(
        chromePage.getByRole('heading', { name: 'Oyun Sonuçları' }),
      ).toBeVisible({ timeout: 10_000 });
      await assertNoHorizontalOverflow(chromePage, 'Chrome 375px Final Podyumu');

      await chromeCtx.close();
      await edgeCtx.close();
    } finally {
      await chromeBrowser.close();
      await edgeBrowser.close();
      await teacherCtx.close();
    }
  });

  test('4. Gerçek frontend performans ölçümleri (TTFB, FCP, LCP, CLS, paket boyutları ve canlı zamanlayıcı render yükü)', async ({
    browser,
  }) => {
    const suffix = `${Date.now().toString().slice(-6)}pf`;
    const teacherEmail = `stage14-perf-${suffix}@quizora.local`;
    cleanupEmails.push(teacherEmail);

    const desktopCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const mobileCtx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });

    const dPage = await desktopCtx.newPage();
    const mPage = await mobileCtx.newPage();

    try {
      const mCdp = await mobileCtx.newCDPSession(mPage);
      await mCdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
      await mCdp.send('Network.enable');
      await mCdp.send('Network.emulateNetworkConditions', {
        offline: false,
        latency: 150,
        downloadThroughput: 1.6 * 1024 * 1024 / 8,
        uploadThroughput: 750 * 1024 / 8,
      });

      const samples: WebVitalSample[] = [];
      samples.push(await measureRoutePerformance(dPage, '/', 'Ana Sayfa (/)', 'Masaüstü'));
      samples.push(
        await measureRoutePerformance(mPage, '/', 'Ana Sayfa (/)', 'Mobil 4x CPU + Yavaş 4G'),
      );

      await dPage.goto('/register');
      await dPage.locator('#register-name').fill('Perf Öğretmen');
      await dPage.locator('#register-email').fill(teacherEmail);
      await dPage.locator('#register-password').fill('Stage14Sifre123!');
      await dPage.locator('#register-password-confirm').fill('Stage14Sifre123!');
      await dPage.locator('#register-terms').check();
      await dPage.getByRole('button', { name: 'Hesap Oluştur' }).click();
      await expect(dPage).toHaveURL(/\/dashboard$/);

      samples.push(
        await measureRoutePerformance(
          dPage,
          '/dashboard',
          'Öğretmen Paneli (/dashboard)',
          'Masaüstü',
        ),
      );
      samples.push(
        await measureRoutePerformance(
          dPage,
          '/dashboard/quizzes/new',
          'Quiz Editörü (/dashboard/quizzes/new)',
          'Masaüstü',
        ),
      );

      // Öğrenci yarışma ekranı (/play/:pin) ölçümü ve zamanlayıcı mutasyon yükü
      await dPage.goto('/dashboard/quizzes/new');
      await dPage.locator('#quiz-title').fill(`Perf Test Quizi ${suffix}`);
      await dPage.getByPlaceholder('Sorunuzu buraya yazın...').fill('Perf soru 1');
      await dPage.getByPlaceholder('A seçeneğini yazın...').fill('A');
      await dPage.getByPlaceholder('B seçeneğini yazın...').fill('B');
      await dPage.getByPlaceholder('C seçeneğini yazın...').fill('C');
      await dPage.getByPlaceholder('D seçeneğini yazın...').fill('D');
      await dPage.getByLabel('Doğru Cevap').nth(0).check();
      await dPage.getByRole('radio', { name: '30 sn' }).check();
      await dPage.getByRole('button', { name: 'Quizi Kaydet' }).click();
      await expect(dPage).toHaveURL(/\/dashboard\/quizzes$/);

      await dPage
        .locator('article', {
          has: dPage.getByRole('heading', { name: `Perf Test Quizi ${suffix}` }),
        })
        .getByRole('button', { name: 'Yarışma Başlat' })
        .click();
      await expect(dPage).toHaveURL(/\/host\/\d{6}$/);
      const pin = dPage.url().match(/\/host\/(\d{6})$/)![1]!;
      cleanupPins.push(pin);

      await mPage.goto(`/join?pin=${pin}`);
      await mPage.locator('#player-nickname').fill('Perf_Ogrenci');
      await mPage.getByRole('button', { name: 'Katıl' }).click();
      await expect(mPage).toHaveURL(new RegExp(`/play/${pin}$`));

      samples.push(
        await measureRoutePerformance(
          mPage,
          `/play/${pin}`,
          'Öğrenci Yarışma Ekranı (/play/:pin)',
          'Mobil 4x CPU + Yavaş 4G',
        ),
      );

      await dPage.getByRole('button', { name: 'Yarışmayı Başlat' }).click();
      await expect(mPage.getByRole('heading', { name: 'Perf soru 1' })).toBeVisible({
        timeout: 10_000,
      });

      // Giriş animasyonlarının tamamlanmasını bekleyip yalnızca kararlı durum zamanlayıcı DOM mutasyonunu ölç
      await mPage.waitForTimeout(350);

      // Canlı soru geri sayımı sırasında 2 saniyelik pencerede DOM metin/stil mutasyon sayısı
      const timerMutations2s = await mPage.evaluate(
        () =>
          new Promise<number>((resolve) => {
            let count = 0;
            const obs = new MutationObserver((list) => {
              count += list.length;
            });
            obs.observe(document.body, {
              childList: true,
              characterData: true,
              subtree: true,
              attributes: true,
            });
            setTimeout(() => {
              obs.disconnect();
              resolve(count);
            }, 2000);
          }),
      );

      console.log(
        '\n[STAGE14_FRONTEND_PERF]',
        JSON.stringify({ samples, timerMutations2s }, null, 2),
      );

      for (const s of samples) {
        expect(s.cls).toBeLessThan(0.25);
        expect(s.ttfbMs).toBeLessThan(1500);
      }
      // Zamanlayıcı optimizasyonu (20Hz -> 10Hz bar + 1Hz badge) sonrası 2sn DOM mutasyonu <= 28 olmalı (öncesi: 48)
      expect(timerMutations2s).toBeLessThanOrEqual(28);

      await mPage.getByRole('button', { name: /A/ }).click();
      await dPage.getByRole('button', { name: 'Final Sonuçlarını Göster' }).click({
        timeout: 10_000,
      });
    } finally {
      await desktopCtx.close();
      await mobileCtx.close();
    }
  });
});
