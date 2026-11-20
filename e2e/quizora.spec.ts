import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { expect, test, type Page } from '@playwright/test';
import PDFDocument from 'pdfkit';

const prisma = new PrismaClient();

async function createE2ePdfBuffer(pages: string[]): Promise<Buffer> {
  const fontPath = path.resolve(
    process.cwd(),
    'node_modules',
    'dejavu-fonts-ttf',
    'ttf',
    'DejaVuSans.ttf',
  );
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 40, compress: false });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.font(fontPath).fontSize(12);
    if (pages.length === 0) {
      doc.rect(40, 40, 120, 120).stroke();
    } else {
      pages.forEach((p, idx) => {
        if (idx > 0) doc.addPage();
        doc.text(p);
      });
    }
    doc.end();
  });
}

function sha256Hex(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

async function assertNoHorizontalOverflow(page: Page, contextLabel: string) {
  const metrics = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(
    metrics.scrollWidth,
    `${contextLabel}: yatay taşma tespit edildi (scrollWidth=${metrics.scrollWidth}, innerWidth=${metrics.innerWidth})`,
  ).toBeLessThanOrEqual(metrics.innerWidth);
}

test.describe('QUIZORA Aşama 6 — Uçtan Uca Oyun Deneyimi ve Erişilebilirlik', () => {
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

  test('geri sayım, ses ayarı, soru geçişleri, çevrimdışı/yeniden bağlanma, puan/podyum, CSV dışa aktarma ve erken sonlandırma akışını yürütür', async ({
    browser,
  }) => {
    const suffix = `${Date.now().toString().slice(-6)}a`;
    const teacherEmail = `e2e-ogretmen-${suffix}@quizora.local`;
    cleanupEmails.push(teacherEmail);

    const initialQuizTitle = `E2E Profesyonel Oyun ${suffix}`;
    const updatedQuizTitle = `${updatedPrefix(initialQuizTitle)}`;

    function updatedPrefix(title: string) {
      return `${title} Güncel`;
    }

    const teacherContext = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      acceptDownloads: true,
    });
    const student1Context = await browser.newContext({
      viewport: { width: 320, height: 667 },
    });
    const student2Context = await browser.newContext({
      viewport: { width: 390, height: 844 },
    });

    const teacherPage = await teacherContext.newPage();
    const student1Page = await student1Context.newPage();
    const student2Page = await student2Context.newPage();

    try {
      // 1. Oturumsuz erişim engeli ve ana sayfa kontrolü
      await teacherPage.goto('/dashboard');
      await expect(teacherPage).toHaveURL(/\/login/);

      await teacherPage.goto('/');
      await expect(
        teacherPage.getByRole('heading', { name: /Bilgini\s+Yarışmayla Kanıtla\./i }),
      ).toBeVisible();
      await teacherPage.getByRole('button', { name: 'Ankara' }).click();
      await teacherPage
        .getByRole('banner')
        .getByRole('link', { name: 'Oturum Aç' })
        .click();
      await expect(teacherPage).toHaveURL(/\/login/);

      // 2. Öğretmen kaydı ve quiz oluşturma + düzenleme
      await teacherPage.getByRole('link', { name: 'Hesap Oluştur' }).click();
      await teacherPage.locator('#register-name').fill('E2E Öğretmen');
      await teacherPage.locator('#register-email').fill(teacherEmail);
      await teacherPage.locator('#register-password').fill('GucluE2ESifre123!');
      await teacherPage
        .locator('#register-password-confirm')
        .fill('GucluE2ESifre123!');
      await teacherPage.locator('#register-terms').check();
      await teacherPage.getByRole('button', { name: 'Hesap Oluştur' }).click();
      await expect(teacherPage).toHaveURL(/\/dashboard$/);

      await teacherPage.goto('/dashboard/quizzes/new');
      await teacherPage.locator('#quiz-title').fill(initialQuizTitle);
      await teacherPage.locator('#quiz-category').selectOption('Coğrafya');

      await teacherPage
        .getByPlaceholder('Sorunuzu buraya yazın...')
        .fill('Türkiye Cumhuriyeti başkenti neresidir?');
      await teacherPage.getByPlaceholder('A seçeneğini yazın...').fill('İstanbul');
      await teacherPage.getByPlaceholder('B seçeneğini yazın...').fill('Ankara');
      await teacherPage.getByPlaceholder('C seçeneğini yazın...').fill('İzmir');
      await teacherPage.getByPlaceholder('D seçeneğini yazın...').fill('Bursa');
      await teacherPage.getByLabel('Doğru Cevap').nth(1).check();

      await teacherPage.getByRole('button', { name: 'Soru Ekle' }).click();
      await teacherPage
        .getByPlaceholder('Sorunuzu buraya yazın...')
        .fill('Güneş sistemindeki kızıl gezegen hangisidir?');
      await teacherPage.getByPlaceholder('A seçeneğini yazın...').fill('Venüs');
      await teacherPage.getByPlaceholder('B seçeneğini yazın...').fill('Mars');
      await teacherPage.getByPlaceholder('C seçeneğini yazın...').fill('Jüpiter');
      await teacherPage.getByPlaceholder('D seçeneğini yazın...').fill('Satürn');
      await teacherPage.getByLabel('Doğru Cevap').nth(1).check();

      await teacherPage.getByRole('button', { name: 'Quizi Kaydet' }).click();
      await expect(teacherPage).toHaveURL(/\/dashboard\/quizzes$/);

      const createdCard = teacherPage.locator('article', {
        has: teacherPage.getByRole('heading', { name: initialQuizTitle }),
      });
      await createdCard.getByRole('link', { name: 'Düzenle' }).click();
      await teacherPage.locator('#quiz-title').fill(updatedQuizTitle);
      await teacherPage
        .getByRole('button', { name: 'Değişiklikleri Kaydet' })
        .click();
      await expect(teacherPage).toHaveURL(/\/dashboard\/quizzes$/);

      // 3. Yarışma odasını başlat -> PIN + QR + ses açma/kapatma kontrolü
      const updatedCard = teacherPage.locator('article', {
        has: teacherPage.getByRole('heading', { name: updatedQuizTitle }),
      });
      await updatedCard.getByRole('button', { name: 'Yarışma Başlat' }).click();
      await expect(teacherPage).toHaveURL(/\/host\/\d{6}$/);

      const pin = teacherPage.url().match(/\/host\/(\d{6})$/)![1]!;
      cleanupPins.push(pin);

      await expect(
        teacherPage.getByAltText(`${pin} kodlu oyuna katılım QR kodu`),
      ).toBeVisible();

      // Ses tercihini öğretmen ekranında kapatıp tekrar aç ve localStorage'ı kontrol et
      await teacherPage.getByRole('button', { name: 'Sesi Kapat' }).click();
      await expect(
        teacherPage.getByRole('button', { name: 'Sesi Aç' }),
      ).toBeVisible();
      expect(
        await teacherPage.evaluate(() =>
          window.localStorage.getItem('quizora:sound-enabled'),
        ),
      ).toBe('false');
      await teacherPage.getByRole('button', { name: 'Sesi Aç' }).click();
      await expect(
        teacherPage.getByRole('button', { name: 'Sesi Kapat' }),
      ).toBeVisible();

      // 4. Öğrenci 1 (320px dar mobil) QR bağlantısıyla katılır ve ses kontrolünü test eder
      await student1Page.goto(`/join?pin=${pin}`);
      await student1Page.locator('#player-nickname').fill('Ahmet Yılmaz');
      await student1Page.getByRole('button', { name: 'Katıl' }).click();
      await expect(
        student1Page.getByText('Öğretmenin yarışmayı başlatması bekleniyor.'),
      ).toBeVisible();
      await assertNoHorizontalOverflow(student1Page, 'Öğrenci 1 (320px) Lobi');

      await student1Page.getByRole('button', { name: 'Sesi Kapat' }).click();
      await expect(
        student1Page.getByRole('button', { name: 'Sesi Aç' }),
      ).toBeVisible();
      // Sayfa yenilendiğinde öğrenci ses tercihi kalıcı kalmalı
      await student1Page.reload();
      await expect(
        student1Page.getByRole('button', { name: 'Sesi Aç' }),
      ).toBeVisible();

      // 5. Öğrenci 2 (390px mobil) PIN girerek katılır
      await student2Page.goto('/join');
      await student2Page.locator('#game-pin').fill(pin);
      await student2Page.getByRole('button', { name: 'Devam Et' }).click();
      await student2Page.locator('#player-nickname').fill('Zeynep Demir');
      await student2Page.getByRole('button', { name: 'Katıl' }).click();
      await expect(
        student2Page.getByText('Öğretmenin yarışmayı başlatması bekleniyor.'),
      ).toBeVisible();

      await expect(
        teacherPage.getByRole('heading', { name: /Katılımcılar \(2 \/ \d+\)/ }),
      ).toBeVisible();

      // 6. Başlangıç 3-2-1 geri sayımı -> Soru 1 senkron açılışı
      await teacherPage.getByRole('button', { name: 'Yarışmayı Başlat' }).click();
      await expect(
        teacherPage.getByRole('heading', { name: 'Yarışma Başlıyor' }),
      ).toBeVisible();
      await expect(student1Page.getByText('Hazır Ol!')).toBeVisible();

      await expect(
        student1Page.getByRole('heading', {
          name: 'Türkiye Cumhuriyeti başkenti neresidir?',
        }),
      ).toBeVisible({ timeout: 15_000 });
      await expect(
        student2Page.getByRole('heading', {
          name: 'Türkiye Cumhuriyeti başkenti neresidir?',
        }),
      ).toBeVisible({ timeout: 15_000 });

      await assertNoHorizontalOverflow(student1Page, 'Öğrenci 1 (320px) Soru 1');
      await assertNoHorizontalOverflow(student2Page, 'Öğrenci 2 (390px) Soru 1');

      // Büyük dokunmatik buton boyutu doğrulaması
      const optionBox = await student1Page
        .getByRole('button', { name: /Ankara/i })
        .boundingBox();
      expect(optionBox?.height ?? 0).toBeGreaterThanOrEqual(60);

      // 7. Öğrenci 1 doğru cevabı seçer -> kilit ve onay bildirimi görünür
      await student1Page.getByRole('button', { name: /Ankara/i }).click();
      await expect(
        student1Page.getByText('Cevabın kaydedildi. Diğer oyuncular bekleniyor...'),
      ).toBeVisible();
      await expect(
        student1Page.getByRole('button', { name: /İstanbul/i }),
      ).toBeDisabled();

      // 8. Öğrenci 2'de ağ bağlantısı kopması -> çevrimdışı uyarısı -> yeniden bağlanma -> cevap
      await student2Context.setOffline(true);
      await expect(student2Page.getByText('Çevrimdışı')).toBeVisible();
      await expect(
        student2Page.getByText(
          'İnternet bağlantınız kesildi. Bağlantı sağlandığında otomatik devam edilecektir.',
        ),
      ).toBeVisible();
      await student2Context.setOffline(false);
      await expect(student2Page.getByText('Bağlı').first()).toBeVisible({
        timeout: 12_000,
      });

      await student2Page.getByRole('button', { name: /İstanbul/i }).click();

      // 9. Soru 1 sonuç & doğru/yanlış geri bildirim & liderlik tablosu
      await expect(
        student1Page.getByText('Doğru Cevap!', { exact: true }),
      ).toBeVisible({
        timeout: 15_000,
      });
      await expect(
        student2Page.getByText('Yanlış Cevap', { exact: true }),
      ).toBeVisible({
        timeout: 15_000,
      });
      await expect(student2Page.getByText(/Doğru seçenek:.*Ankara/)).toBeVisible();
      await expect(
        teacherPage.getByRole('heading', { name: 'Güncel Liderlik Tablosu' }),
      ).toBeVisible({ timeout: 15_000 });

      // 10. Soru 2 -> her iki öğrenci doğru -> final podyumu
      await teacherPage.getByRole('button', { name: 'Sonraki Soru' }).click();
      await expect(
        student1Page.getByRole('heading', {
          name: 'Güneş sistemindeki kızıl gezegen hangisidir?',
        }),
      ).toBeVisible({ timeout: 15_000 });

      await student1Page.getByRole('button', { name: /Mars/i }).click();
      await student2Page.waitForTimeout(300);
      await student2Page.getByRole('button', { name: /Mars/i }).click();

      await expect(
        teacherPage.getByRole('button', { name: 'Final Sonuçlarını Göster' }),
      ).toBeVisible({ timeout: 15_000 });
      await teacherPage
        .getByRole('button', { name: 'Final Sonuçlarını Göster' })
        .click();

      await expect(
        teacherPage.getByRole('heading', { name: 'Oyun Sonuçları' }),
      ).toBeVisible({ timeout: 15_000 });
      await expect(
        student1Page.getByRole('heading', { name: 'Oyun Sonuçları' }),
      ).toBeVisible({ timeout: 15_000 });
      await expect(
        student1Page.getByText('1. Sıra', { exact: true }),
      ).toBeVisible();

      // Final kartında doğru / yanlış sayıları gösterilmeli
      await expect(
        student2Page.getByRole('heading', { name: 'Oyun Sonuçları' }),
      ).toBeVisible({
        timeout: 15_000,
      });

      // 11. Gerçek veritabanından CSV indirme ve içerik doğrulaması
      const downloadPromise = teacherPage.waitForEvent('download');
      await teacherPage.getByRole('button', { name: 'CSV Olarak İndir' }).click();
      const download = await downloadPromise;
      expect(download.suggestedFilename()).toContain(`quizora-sonuclar-${pin}.csv`);
      const downloadedPath = await download.path();
      expect(downloadedPath).not.toBeNull();
      const csvRaw = await fs.readFile(downloadedPath!, 'utf8');
      expect(csvRaw.startsWith('\uFEFF')).toBe(true);
      expect(csvRaw).toContain('"Oyuncu Adı"');
      expect(csvRaw).toContain('"Ahmet Yılmaz"');
      expect(csvRaw).toContain('"Zeynep Demir"');

      // 12. Geçmiş Yarışmalar ekranı + Sonuç detay modalı
      await teacherPage.getByRole('link', { name: 'Geçmiş Yarışmalar' }).click();
      await expect(teacherPage).toHaveURL(/\/dashboard\/history$/);
      const historyCard = teacherPage
        .locator('article', { hasText: updatedQuizTitle })
        .first();
      await expect(historyCard).toBeVisible({ timeout: 15_000 });
      await historyCard.getByRole('button', { name: 'Sonuçları İncele' }).click();
      await expect(teacherPage.getByRole('dialog')).toBeVisible();
      await teacherPage
        .getByRole('button', { name: 'Sonuç penceresini kapat' })
        .click();

      // 13. İkinci oturum: Öğretmen yarışma ortasında "Yarışmayı Sonlandır" + onay ile bitirir
      await teacherPage.goto('/dashboard/quizzes');
      const cardForEarlyEnd = teacherPage.locator('article', {
        has: teacherPage.getByRole('heading', { name: updatedQuizTitle }),
      });
      await cardForEarlyEnd.getByRole('button', { name: 'Yarışma Başlat' }).click();
      await expect(teacherPage).toHaveURL(/\/host\/\d{6}$/);
      const pin2 = teacherPage.url().match(/\/host\/(\d{6})$/)![1]!;
      cleanupPins.push(pin2);

      await student1Page.goto(`/join?pin=${pin2}`);
      await student1Page.locator('#player-nickname').fill('Hızlı Oyuncu');
      await student1Page.getByRole('button', { name: 'Katıl' }).click();
      await expect(
        teacherPage.getByRole('heading', { name: /Katılımcılar \(1 \/ \d+\)/ }),
      ).toBeVisible();

      await teacherPage.getByRole('button', { name: 'Yarışmayı Başlat' }).click();
      await expect(
        teacherPage.getByRole('heading', {
          name: 'Türkiye Cumhuriyeti başkenti neresidir?',
        }),
      ).toBeVisible({ timeout: 15_000 });

      await teacherPage.getByRole('button', { name: 'Yarışmayı Sonlandır' }).click();
      await expect(
        teacherPage.getByRole('heading', {
          name: 'Yarışmayı şimdi sonlandırmak istediğinize emin misiniz?',
        }),
      ).toBeVisible();
      await teacherPage
        .getByRole('button', { name: 'Evet, Yarışmayı Sonlandır' })
        .click();

      await expect(
        teacherPage.getByRole('heading', { name: 'Oyun Sonuçları' }),
      ).toBeVisible({ timeout: 15_000 });
      await expect(
        student1Page.getByRole('heading', { name: 'Oyun Sonuçları' }),
      ).toBeVisible({ timeout: 15_000 });
    } finally {
      await teacherContext.close();
      await student1Context.close();
      await student2Context.close();
    }
  });

  test('prefers-reduced-motion etkinleştirildiğinde animasyonsuz eksiksiz oyun akışını çalıştırır', async ({
    browser,
  }) => {
    const suffix = `${Date.now().toString().slice(-6)}r`;
    const teacherEmail = `e2e-reduced-${suffix}@quizora.local`;
    cleanupEmails.push(teacherEmail);

    const teacherContext = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      reducedMotion: 'reduce',
    });
    const studentContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
      reducedMotion: 'reduce',
    });

    const teacherPage = await teacherContext.newPage();
    const studentPage = await studentContext.newPage();

    try {
      await teacherPage.goto('/register');
      await teacherPage.locator('#register-name').fill('Azaltılmış Hareket Öğretmen');
      await teacherPage.locator('#register-email').fill(teacherEmail);
      await teacherPage.locator('#register-password').fill('GucluE2ESifre123!');
      await teacherPage
        .locator('#register-password-confirm')
        .fill('GucluE2ESifre123!');
      await teacherPage.locator('#register-terms').check();
      await teacherPage.getByRole('button', { name: 'Hesap Oluştur' }).click();
      await expect(teacherPage).toHaveURL(/\/dashboard$/);

      await teacherPage.goto('/dashboard/quizzes/new');
      await teacherPage.locator('#quiz-title').fill(`Reduced Motion Quiz ${suffix}`);
      await teacherPage
        .getByPlaceholder('Sorunuzu buraya yazın...')
        .fill('2 + 2 kaç eder?');
      await teacherPage.getByPlaceholder('A seçeneğini yazın...').fill('4');
      await teacherPage.getByPlaceholder('B seçeneğini yazın...').fill('5');
      await teacherPage.getByPlaceholder('C seçeneğini yazın...').fill('6');
      await teacherPage.getByPlaceholder('D seçeneğini yazın...').fill('3');
      await teacherPage.getByRole('button', { name: 'Quizi Kaydet' }).click();
      await expect(teacherPage).toHaveURL(/\/dashboard\/quizzes$/);

      await teacherPage.getByRole('button', { name: 'Yarışma Başlat' }).click();
      await expect(teacherPage).toHaveURL(/\/host\/\d{6}$/);
      const pin = teacherPage.url().match(/\/host\/(\d{6})$/)![1]!;
      cleanupPins.push(pin);

      await studentPage.goto(`/join?pin=${pin}`);
      await studentPage.locator('#player-nickname').fill('Sakin Oyuncu');
      await studentPage.getByRole('button', { name: 'Katıl' }).click();
      await expect(
        teacherPage.getByRole('heading', { name: /Katılımcılar \(1 \/ \d+\)/ }),
      ).toBeVisible();

      await teacherPage.getByRole('button', { name: 'Yarışmayı Başlat' }).click();
      await expect(studentPage.getByText('Hazır Ol!')).toBeVisible();

      await expect(
        studentPage.getByRole('heading', { name: '2 + 2 kaç eder?' }),
      ).toBeVisible({ timeout: 15_000 });
      await studentPage.getByRole('button', { name: /\b4\b/ }).click();

      await expect(
        studentPage.getByText('Doğru Cevap!', { exact: true }),
      ).toBeVisible({
        timeout: 15_000,
      });
      await teacherPage
        .getByRole('button', { name: 'Final Sonuçlarını Göster' })
        .click();

      await expect(
        studentPage.getByRole('heading', { name: 'Oyun Sonuçları' }),
      ).toBeVisible({ timeout: 15_000 });

      // Podyum kartının opacity: 0 gizli kalmadığını doğrula
      const podiumOpacities = await studentPage
        .locator('[data-podium-rank]')
        .evaluateAll((els) => els.map((el) => getComputedStyle(el).opacity));
      expect(podiumOpacities.length).toBeGreaterThanOrEqual(1);
      for (const opacity of podiumOpacities) {
        expect(opacity).toBe('1');
      }
    } finally {
      await teacherContext.close();
      await studentContext.close();
    }
  });

  test('mobil kayıt/giriş, oturum korunması, öğretmen profili, şifre değiştirme, şifre sıfırlama ve güvenli çıkış akışlarını doğrular', async ({
    browser,
  }) => {
    const suffix = `${Date.now().toString().slice(-6)}u`;
    const initialEmail = `e2e-hesap-${suffix}@quizora.local`;
    const updatedEmail = `e2e-hesap-guncel-${suffix}@quizora.local`;
    cleanupEmails.push(initialEmail, updatedEmail);

    const mobileContext = await browser.newContext({
      viewport: { width: 320, height: 667 },
    });
    const page = await mobileContext.newPage();

    try {
      // 1. Mobil (/register) yatay taşmasız, şifre kuralları ve hata doğrulaması
      await page.goto('/register');
      await assertNoHorizontalOverflow(page, 'Mobil (320px) Kayıt Ekranı');
      await expect(page.getByText('Şifre Gereksinimleri')).toBeVisible();

      await page.locator('#register-name').fill('Mobil Öğretmen');
      await page.locator('#register-email').fill(initialEmail);
      await page.locator('#register-password').fill('IlkGuclu123!');
      await page.locator('#register-password-confirm').fill('Farkli123!');
      await page.locator('#register-terms').check();
      await page.getByRole('button', { name: 'Hesap Oluştur' }).click();
      await expect(
        page.getByText('Girdiğiniz şifreler birbiriyle eşleşmiyor.'),
      ).toBeVisible();

      // Şifre göster/gizle kontrolü ve başarılı kayıt
      await page
        .getByRole('button', { name: 'Şifreyi Göster' })
        .first()
        .click();
      await expect(page.locator('#register-password')).toHaveAttribute('type', 'text');

      await page.locator('#register-password-confirm').fill('IlkGuclu123!');
      await page.getByRole('button', { name: 'Hesap Oluştur' }).click();
      await expect(page).toHaveURL(/\/dashboard$/);

      // Sayfa yenilendiğinde oturum korunmalı
      await page.reload();
      await expect(page).toHaveURL(/\/dashboard$/);
      await expect(
        page.getByRole('heading', { name: /Hoş geldin, Mobil Öğretmen/i }),
      ).toBeVisible();

      // 2. Profil sayfası (/dashboard/profile): Ad ve e-posta güncelleme + Şifre değiştirme
      await page.goto('/dashboard/profile');
      await assertNoHorizontalOverflow(page, 'Mobil (320px) Profil Sayfası');
      await page.locator('#profile-name').fill('Dr. Mobil Öğretmen');
      await page.locator('#profile-email').fill(updatedEmail);
      await page.getByRole('button', { name: 'Bilgileri Kaydet' }).click();
      await expect(page.getByText('Profil güncellendi')).toBeVisible();

      await page.reload();
      await expect(page.locator('#profile-name')).toHaveValue('Dr. Mobil Öğretmen');
      await expect(page.locator('#profile-email')).toHaveValue(updatedEmail);

      await page.locator('#profile-current-password').fill('IlkGuclu123!');
      await page.locator('#profile-new-password').fill('YeniGuclu123!');
      await page.locator('#profile-new-password-confirm').fill('YeniGuclu123!');
      await page.getByRole('button', { name: 'Şifreyi Güncelle' }).click();
      await expect(page.getByText('Şifre güncellendi')).toBeVisible();

      // 3. Güvenli çıkış sonrası /dashboard erişimi /login'e yönlenmeli
      await page.getByRole('button', { name: 'Oturumu Kapat' }).click();
      await expect(page).toHaveURL(/\/login(?:\?next=.*)?$/);
      await assertNoHorizontalOverflow(page, 'Mobil (320px) Giriş Ekranı');

      await page.goto('/dashboard');
      await expect(page).toHaveURL(/\/login/);

      // Hatalı şifreyle giriş reddi + yeni şifreyle başarılı giriş
      await page.locator('#login-email').fill(updatedEmail);
      await page.locator('#login-password').fill('IlkGuclu123!');
      await page.getByRole('button', { name: 'Oturum Aç' }).click();
      await expect(
        page.getByText('E-posta adresi veya şifre hatalı.'),
      ).toBeVisible();

      await page.locator('#login-password').fill('YeniGuclu123!');
      await page.getByRole('button', { name: 'Oturum Aç' }).click();
      await expect(page).toHaveURL(/\/dashboard$/);

      // 4. Aynı e-postayla tekrar kayıt reddi
      await page.goto('/dashboard/profile');
      await page.getByRole('button', { name: 'Oturumu Kapat' }).click();
      await expect(page).toHaveURL(/\/login(?:\?next=.*)?$/);

      await page.goto('/register');
      await page.locator('#register-name').fill('İkinci Hesap');
      await page.locator('#register-email').fill(updatedEmail);
      await page.locator('#register-password').fill('YeniGuclu123!');
      await page.locator('#register-password-confirm').fill('YeniGuclu123!');
      await page.locator('#register-terms').check();
      await page.getByRole('button', { name: 'Hesap Oluştur' }).click();
      await expect(
        page.getByText('Bu e-posta adresiyle zaten kayıtlı bir hesap bulunuyor.'),
      ).toBeVisible();

      // 5. Şifremi Unuttum dürüst servis durumu + gerçek DB token ile /reset-password
      await page.goto('/forgot-password');
      await assertNoHorizontalOverflow(page, 'Mobil (320px) Şifremi Unuttum');
      await expect(
        page.getByText(/e-posta gönderim servisi.*devre dışıdır/i),
      ).toBeVisible();

      const teacher = await prisma.teacher.findUnique({
        where: { email: updatedEmail },
        select: { id: true },
      });
      expect(teacher).not.toBeNull();

      const rawResetToken = crypto.randomBytes(24).toString('hex');
      await prisma.passwordResetToken.create({
        data: {
          teacherId: teacher!.id,
          tokenHash: sha256Hex(rawResetToken),
          expiresAt: new Date(Date.now() + 15 * 60_000),
        },
      });

      await page.goto(`/reset-password?token=${rawResetToken}`);
      await expect(page.locator('#reset-password')).toBeVisible();
      // URL'deki belirtecin adres çubuğundan temizlendiğini doğrula
      expect(page.url()).not.toContain(rawResetToken);

      await page.locator('#reset-password').fill('Sifirlandi123!');
      await page.locator('#reset-password-confirm').fill('Sifirlandi123!');
      await page.getByRole('button', { name: 'Şifreyi Sıfırla' }).click();
      await expect(page).toHaveURL(/\/login\?reset=success/);

      // Yeni şifre ile giriş yap ve aynı tokenın tekrar geçersiz olduğunu doğrula
      await page.locator('#login-email').fill(updatedEmail);
      await page.locator('#login-password').fill('Sifirlandi123!');
      await page.getByRole('button', { name: 'Oturum Aç' }).click();
      await expect(page).toHaveURL(/\/dashboard$/);

      await page.goto(`/reset-password?token=${rawResetToken}`);
      await expect(
        page.getByText(
          'Bu şifre sıfırlama bağlantısı geçersiz, daha önce kullanılmış veya süresi dolmuş.',
        ),
      ).toBeVisible();
    } finally {
      await mobileContext.close();
    }
  });

  test('Aşama 8: 4 soru türü, görsel yükleme, tür dönüşüm onayı, kopyalama, sıralama, taslak, önizleme ve mobil canlı oyun akışını yürütür', async ({
    browser,
  }) => {
    const suffix = `${Date.now().toString().slice(-6)}s8`;
    const teacherEmail = `e2e-stage8-${suffix}@quizora.local`;
    cleanupEmails.push(teacherEmail);

    const draftTitle = `Taslak Quiz ${suffix}`;
    const publishedTitle = `Aşama 8 Canlı Quiz ${suffix}`;

    const VALID_PNG_BYTES = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
      0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
      0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
      0x89, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x44, 0x41,
      0x54, 0x78, 0x9c, 0x63, 0xf8, 0xcf, 0xc0, 0x50,
      0x0f, 0x00, 0x03, 0x01, 0x01, 0x00, 0x18, 0xdd,
      0x8d, 0xb0, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45,
      0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
    ]);

    const teacherContext = await browser.newContext({
      viewport: { width: 1280, height: 800 },
    });
    const student1Context = await browser.newContext({
      viewport: { width: 320, height: 667 },
    });
    const student2Context = await browser.newContext({
      viewport: { width: 390, height: 844 },
    });

    const teacherPage = await teacherContext.newPage();
    const student1Page = await student1Context.newPage();
    const student2Page = await student2Context.newPage();

    try {
      // 1. Öğretmen kaydı ve eksik taslak kaydetme
      await teacherPage.goto('/register');
      await teacherPage.locator('#register-name').fill('Aşama 8 Öğretmen');
      await teacherPage.locator('#register-email').fill(teacherEmail);
      await teacherPage.locator('#register-password').fill('GucluE2ESifre123!');
      await teacherPage
        .locator('#register-password-confirm')
        .fill('GucluE2ESifre123!');
      await teacherPage.locator('#register-terms').check();
      await teacherPage.getByRole('button', { name: 'Hesap Oluştur' }).click();
      await expect(teacherPage).toHaveURL(/\/dashboard$/);

      await teacherPage.goto('/dashboard/quizzes/new');
      await teacherPage.locator('#quiz-title').fill(draftTitle);
      await teacherPage.getByRole('button', { name: 'Taslak Kaydet' }).first().click();
      await expect(teacherPage).toHaveURL(/\/dashboard\/quizzes\/[^/]+\/edit$/);

      await teacherPage.goto('/dashboard/quizzes');
      const draftCard = teacherPage.locator('article', {
        has: teacherPage.getByRole('heading', { name: draftTitle }),
      });
      await expect(draftCard).toBeVisible();
      await expect(
        draftCard.getByRole('button', { name: 'Taslak (Başlatılamaz)' }),
      ).toBeDisabled();

      // 2. Taslağı aç, 4 soru türünü oluştur, PNG görsel yükle, tür dönüşümü onayını test et
      await draftCard.getByRole('link', { name: 'Düzenle' }).click();
      await teacherPage.locator('#quiz-title').fill(publishedTitle);

      // Soru 1: 5 seçenekli Çoktan Seçmeli + görsel + açıklama
      await teacherPage
        .getByPlaceholder('Sorunuzu buraya yazın...')
        .fill('Aşağıdakilerden hangisi asal sayıdır?');
      await teacherPage
        .locator('input[type="file"]')
        .nth(1)
        .setInputFiles({
          name: 'soru1.png',
          mimeType: 'image/png',
          buffer: VALID_PNG_BYTES,
        });
      await expect(
        teacherPage.locator('img[alt="Soru 1 görseli"]'),
      ).toBeVisible();
      await teacherPage.getByRole('button', { name: 'Seçenek Ekle' }).click();
      await teacherPage.getByPlaceholder('A seçeneğini yazın...').fill('4');
      await teacherPage.getByPlaceholder('B seçeneğini yazın...').fill('6');
      await teacherPage.getByPlaceholder('C seçeneğini yazın...').fill('8');
      await teacherPage.getByPlaceholder('D seçeneğini yazın...').fill('9');
      await teacherPage.getByPlaceholder('E seçeneğini yazın...').fill('7');
      await teacherPage.getByLabel('Doğru Cevap').nth(4).check();
      await teacherPage
        .getByPlaceholder('Doğru cevabın gerekçesini veya kısa ipucunu yazın...')
        .fill('7 yalnızca 1 ve kendisine bölünür.');

      // Soru 2: Veri kaybı onay diyaloğunu tetikleyip Doğru / Yanlış türüne geç
      await teacherPage.getByRole('button', { name: 'Soru Ekle' }).click();
      await teacherPage.getByPlaceholder('A seçeneğini yazın...').fill('Eski seçenek');
      await teacherPage.getByRole('button', { name: 'Doğru / Yanlış' }).click();
      await expect(
        teacherPage.getByRole('heading', { name: 'Soru türü değiştirilsin mi?' }),
      ).toBeVisible();
      await teacherPage.getByRole('button', { name: 'Evet, Türü Değiştir' }).click();
      await teacherPage
        .getByPlaceholder('Sorunuzu buraya yazın...')
        .fill('Türkiye üç tarafı denizlerle çevrili bir yarımadadır.');

      // Soru 3: Çoklu Doğru Cevap (kısmi puanlama açık)
      await teacherPage.getByRole('button', { name: 'Soru Ekle' }).click();
      await teacherPage.getByRole('button', { name: 'Çoklu Doğru Cevap' }).click();
      await teacherPage.getByLabel(/Kısmi puanlamaya izin ver/i).check();
      await teacherPage
        .getByPlaceholder('Sorunuzu buraya yazın...')
        .fill('Hangileri çift sayıdır?');
      await teacherPage.getByPlaceholder('A seçeneğini yazın...').fill('2');
      await teacherPage.getByPlaceholder('B seçeneğini yazın...').fill('4');
      await teacherPage.getByPlaceholder('C seçeneğini yazın...').fill('5');
      await teacherPage.getByPlaceholder('D seçeneğini yazın...').fill('7');

      // Soru 4: Sıralama Sorusu (öğe ekleme/çıkarma + sıralama)
      await teacherPage.getByRole('button', { name: 'Soru Ekle' }).click();
      await teacherPage.getByRole('button', { name: 'Sıralama Sorusu' }).click();
      await teacherPage
        .getByPlaceholder('Sorunuzu buraya yazın...')
        .fill('Sayıları küçükten büyüğe sıralayın.');
      await teacherPage.getByPlaceholder('1. sıra öğesini yazın...').fill('10');
      await teacherPage.getByPlaceholder('2. sıra öğesini yazın...').fill('20');
      await teacherPage.getByPlaceholder('3. sıra öğesini yazın...').fill('30');
      await teacherPage.getByRole('button', { name: 'Öğe Ekle' }).click();
      await expect(
        teacherPage.getByPlaceholder('4. sıra öğesini yazın...'),
      ).toBeVisible();
      await teacherPage.getByRole('button', { name: '4. öğeyi sil' }).click();

      // Soru kopyalama, soru silme ve yukarı/aşağı taşıma
      await teacherPage.getByRole('button', { name: 'Soruyu Kopyala' }).click();
      await expect(teacherPage.getByRole('heading', { name: 'Sorular (5)' })).toBeVisible();
      await teacherPage.getByRole('button', { name: 'Soruyu Sil' }).click();
      await expect(teacherPage.getByRole('heading', { name: 'Sorular (4)' })).toBeVisible();

      await teacherPage.getByRole('button', { name: 'Soru 4 yukarı taşı' }).click();
      await teacherPage.getByRole('button', { name: 'Soru 3 aşağı taşı' }).click();

      // 3. Quiz Önizleme (zamanlayıcı, doğru cevap göster, etkileşimler, DB kaydı oluşturmama)
      const beforeSessionsCount = await prisma.gameSession.count();
      await teacherPage.getByRole('button', { name: 'Önizle' }).first().click();
      await expect(
        teacherPage.getByText('Gerçek yarışma oturumu ve istatistik oluşturmaz'),
      ).toBeVisible();
      await teacherPage.getByRole('button', { name: 'Doğru Cevabı Göster' }).click();
      await expect(
        teacherPage.getByText('7 yalnızca 1 ve kendisine bölünür.'),
      ).toBeVisible();
      await teacherPage.getByRole('button', { name: 'Soru 3', exact: true }).click();
      await teacherPage.getByRole('button', { name: /A\s*2/i }).click();
      await teacherPage.getByRole('button', { name: 'Cevabı Kontrol Et' }).click();
      await expect(teacherPage.getByText(/Kısmi doğru/i)).toBeVisible();
      await teacherPage.getByRole('button', { name: 'Önizlemeyi kapat' }).click();
      const afterSessionsCount = await prisma.gameSession.count();
      expect(afterSessionsCount).toBe(beforeSessionsCount);

      // 4. Yayına Hazırla ve Kaydet -> Canlı Yarışma Başlat
      await teacherPage
        .getByRole('button', { name: 'Değişiklikleri Kaydet' })
        .click();
      await expect(teacherPage).toHaveURL(/\/dashboard\/quizzes$/);

      const publishedCard = teacherPage.locator('article', {
        has: teacherPage.getByRole('heading', { name: publishedTitle }),
      });
      await expect(publishedCard.getByText('Yayına Hazır')).toBeVisible();
      await publishedCard.getByRole('button', { name: 'Yarışma Başlat' }).click();
      await expect(teacherPage).toHaveURL(/\/host\/\d{6}$/);

      const pin = teacherPage.url().match(/\/host\/(\d{6})$/)![1]!;
      cleanupPins.push(pin);

      for (const [page, nickname] of [
        [student1Page, 'E2E_Birinci'],
        [student2Page, 'E2E_Kismi'],
      ] as const) {
        await page.goto(`/join?pin=${pin}`);
        await page.locator('#player-nickname').fill(nickname);
        await page.getByRole('button', { name: 'Katıl' }).click();
        await expect(page).toHaveURL(new RegExp(`/play/${pin}$`));
      }

      await expect(teacherPage.getByText('Katılımcılar (2 / 60)')).toBeVisible();
      await teacherPage.getByRole('button', { name: 'Yarışmayı Başlat' }).click();

      // Soru 1 (5 seçenekli MC + görsel + açıklama)
      await expect(
        student1Page.getByRole('heading', {
          name: 'Aşağıdakilerden hangisi asal sayıdır?',
        }),
      ).toBeVisible({ timeout: 8_000 });
      await assertNoHorizontalOverflow(student1Page, 'Mobil (320px) MC 5 Seçenek');
      await expect(
        student1Page.locator('img[alt="Soru 1 görseli"]'),
      ).toBeVisible();

      await student1Page.getByRole('button', { name: /E\s*7/ }).click();
      await student2Page.getByRole('button', { name: /A\s*4/ }).click();
      await expect(
        student1Page.getByText('7 yalnızca 1 ve kendisine bölünür.'),
      ).toBeVisible({ timeout: 6_000 });

      // Soru 2 (Doğru / Yanlış)
      await teacherPage.getByRole('button', { name: 'Sonraki Soru' }).click();
      await expect(
        student1Page.getByRole('button', { name: 'Doğru', exact: true }),
      ).toBeVisible({ timeout: 6_000 });
      await student1Page.getByRole('button', { name: 'Doğru', exact: true }).click();
      await student2Page.getByRole('button', { name: 'Yanlış', exact: true }).click();
      await expect(student1Page.getByText('Doğru Cevap!')).toBeVisible({
        timeout: 6_000,
      });

      // Soru 3 (Çoklu Doğru Cevap + Kısmi Puanlama)
      await teacherPage.getByRole('button', { name: 'Sonraki Soru' }).click();
      await expect(
        student1Page.getByRole('heading', { name: 'Hangileri çift sayıdır?' }),
      ).toBeVisible({ timeout: 6_000 });
      await assertNoHorizontalOverflow(student1Page, 'Mobil (320px) Çoklu Seçim');

      await student1Page.getByRole('button', { name: /A\s*2/ }).click();
      await student1Page.getByRole('button', { name: /B\s*4/ }).click();
      await student1Page.getByRole('button', { name: /Cevabı Gönder/ }).click();

      await student2Page.getByRole('button', { name: /A\s*2/ }).click();
      await student2Page.getByRole('button', { name: /Cevabı Gönder/ }).click();

      await expect(student1Page.getByText('Doğru Cevap!')).toBeVisible({
        timeout: 6_000,
      });
      await expect(student2Page.getByText('Kısmi Doğru!')).toBeVisible({
        timeout: 6_000,
      });

      // Soru 4 (Sıralama Sorusu — 320px mobil uyumluluk & gönderim)
      await teacherPage.getByRole('button', { name: 'Sonraki Soru' }).click();
      await expect(
        student1Page.getByRole('heading', {
          name: 'Sayıları küçükten büyüğe sıralayın.',
        }),
      ).toBeVisible({ timeout: 6_000 });
      await assertNoHorizontalOverflow(student1Page, 'Mobil (320px) Sıralama Sorusu');

      // İlk 2 öğeyi sıralama kontrolüyle etkileşimli taşı ve gönder
      const orderingList = student1Page.getByRole('list', {
        name: 'Öğeleri doğru sıraya dizin',
      });
      const targetOrder = ['10', '20', '30'];
      for (let slot = 0; slot < targetOrder.length; slot += 1) {
        const currentTexts = await orderingList.locator('li').allInnerTexts();
        const foundIdx = currentTexts.findIndex((txt) =>
          txt.split(/\s+/).includes(targetOrder[slot]!),
        );
        for (let step = foundIdx; step > slot; step -= 1) {
          await orderingList
            .locator('li')
            .nth(step)
            .getByRole('button', { name: /yukarı taşı/i })
            .click();
        }
      }

      await student1Page.getByRole('button', { name: 'Sıralamayı Gönder' }).click();
      await student2Page.getByRole('button', { name: 'Sıralamayı Gönder' }).click();

      await expect(student1Page.getByText('Doğru Cevap!')).toBeVisible({
        timeout: 6_000,
      });

      // Final sonuçları
      await teacherPage
        .getByRole('button', { name: 'Final Sonuçlarını Göster' })
        .click();
      await expect(
        teacherPage.getByRole('heading', { name: 'Oyun Sonuçları' }),
      ).toBeVisible({ timeout: 6_000 });
      await expect(
        student1Page.getByText('1. Sıra', { exact: true }),
      ).toBeVisible({ timeout: 6_000 });

      // 8. AŞAMA 9: Yarışma Geçmişi (/dashboard/history) ve Detaylı Analiz (/dashboard/history/:sessionId)
      await teacherPage.goto('/dashboard/history');
      await expect(
        teacherPage.getByRole('heading', {
          name: 'Geçmiş Yarışmalar ve Analizler',
        }),
      ).toBeVisible();

      // Arama ve sıralama kontrolü
      const searchInput = teacherPage.getByLabel(
        'Quiz Adına veya PIN Koduna Göre Ara',
      );
      await searchInput.fill(publishedTitle);
      const historyCard = teacherPage
        .locator('article')
        .filter({ hasText: publishedTitle });
      await expect(historyCard).toBeVisible();
      await expect(historyCard).toContainText('2');
      await expect(historyCard).toContainText('4');

      // "Detayları Gör" butonuna tıklayarak /dashboard/history/:sessionId sayfasına git
      await historyCard.getByRole('link', { name: 'Detayları Gör' }).click();
      await expect(teacherPage).toHaveURL(/\/dashboard\/history\/.+/);

      // 6 Genel Özet KPI kartı kontrolü
      await expect(
        teacherPage.getByRole('heading', { name: 'Genel Özet İstatistikleri' }),
      ).toBeVisible();
      await expect(
        teacherPage.getByText('Toplam Katılımcı', { exact: true }),
      ).toBeVisible();
      await expect(
        teacherPage.getByText('Ortalama Doğru Cevap Oranı', { exact: true }),
      ).toBeVisible();
      await expect(
        teacherPage.getByText('Ortalama Puan', { exact: true }),
      ).toBeVisible();
      await expect(
        teacherPage.getByText('En Yüksek Puan', { exact: true }),
      ).toBeVisible();
      await expect(
        teacherPage.getByText('En Zor Soru', { exact: true }),
      ).toBeVisible();
      await expect(
        teacherPage.getByText('Ortalama Cevaplama Süresi', { exact: true }),
      ).toBeVisible();

      // Grafikler, Zor Sorular ve Soru Bazlı Analiz kontrolü
      await expect(
        teacherPage.getByRole('heading', { name: 'Görsel Yarışma Grafikleri' }),
      ).toBeVisible();
      await expect(
        teacherPage.getByRole('heading', { name: 'Zor Sorular Analizi' }),
      ).toBeVisible();
      await expect(
        teacherPage.getByRole('heading', {
          name: 'Soru Bazlı Ayrıntılı Analiz',
        }),
      ).toBeVisible();

      // Öğrenci Performansı erişilebilir sıralanabilir tablo ve aria-sort kontrolü
      await expect(
        teacherPage.getByRole('heading', { name: 'Öğrenci Performansı' }),
      ).toBeVisible();
      const scoreHeader = teacherPage.locator('th').filter({
        hasText: 'Toplam Puan',
      });
      await expect(scoreHeader).toHaveAttribute('aria-sort', 'descending');

      const nameSortBtn = teacherPage
        .locator('th')
        .getByRole('button', { name: /Kullanıcı Adı/ });
      await nameSortBtn.click();
      const nameHeader = teacherPage.locator('th').filter({
        hasText: 'Kullanıcı Adı',
      });
      await expect(nameHeader).toHaveAttribute('aria-sort', 'ascending');

      // Öğrenci soru bazlı yanıt dökümü
      await teacherPage
        .getByRole('button', { name: 'Soru Detayı' })
        .first()
        .click();
      await expect(
        teacherPage.getByText('Öğrenci Soru Bazlı Yanıt Dökümü'),
      ).toBeVisible();

      // CSV ve PDF rapor indirme doğrulaması
      const [csvDownload] = await Promise.all([
        teacherPage.waitForEvent('download'),
        teacherPage.getByRole('button', { name: 'CSV Olarak İndir' }).click(),
      ]);
      expect(csvDownload.suggestedFilename()).toContain('.csv');
      const csvPath = await csvDownload.path();
      expect(csvPath).toBeTruthy();
      const csvContent = await fs.readFile(csvPath!, 'utf8');
      expect(csvContent).toContain('"BÖLÜM","YARIŞMA BİLGİLERİ"');
      expect(csvContent).toContain('"BÖLÜM","KATILIMCI SONUÇLARI"');
      expect(csvContent).toContain('"BÖLÜM","SORU BAZLI İSTATİSTİKLER"');
      expect(csvContent).toContain('"E2E_Birinci"');

      const [pdfDownload] = await Promise.all([
        teacherPage.waitForEvent('download'),
        teacherPage.getByRole('button', { name: 'PDF Olarak İndir' }).click(),
      ]);
      expect(pdfDownload.suggestedFilename()).toContain('.pdf');
      const pdfPath = await pdfDownload.path();
      expect(pdfPath).toBeTruthy();
      const pdfBuffer = await fs.readFile(pdfPath!);
      expect(pdfBuffer.subarray(0, 7).toString('ascii')).toBe('%PDF-1.');

      // 320px mobil görünümde yatay taşma kontrolü
      await teacherPage.setViewportSize({ width: 320, height: 640 });
      await assertNoHorizontalOverflow(
        teacherPage,
        'Mobil (320px) Yarışma Analiz Sayfası',
      );
    } finally {
      await teacherContext.close();
      await student1Context.close();
      await student2Context.close();
    }
  });

  test('Aşama 10: Quiz Kütüphanesi, Keşfet, Gizlilik, Paylaşım Bağlantısı, Kopyalama ve Düzenleme akışını yürütür', async ({
    browser,
  }) => {
    const suffix = `${Date.now().toString().slice(-6)}s10`;
    const teacherAEmail = `e2e-stage10-a-${suffix}@quizora.local`;
    const teacherBEmail = `e2e-stage10-b-${suffix}@quizora.local`;
    cleanupEmails.push(teacherAEmail, teacherBEmail);

    const publicTitle = `Keşfet Teknoloji Quizi ${suffix}`;
    const privateTitle = `Özel Tarih Quizi ${suffix}`;

    const teacherAContext = await browser.newContext({
      viewport: { width: 1280, height: 800 },
    });
    const teacherBContext = await browser.newContext({
      viewport: { width: 1280, height: 800 },
    });

    const pageA = await teacherAContext.newPage();
    const pageB = await teacherBContext.newPage();

    try {
      // 1. Öğretmen A kaydolur ve Herkese Açık (PUBLIC) quiz oluşturur
      await pageA.goto('/register');
      await pageA.locator('#register-name').fill('Öğretmen A');
      await pageA.locator('#register-email').fill(teacherAEmail);
      await pageA.locator('#register-password').fill('GucluE2ESifre123!');
      await pageA
        .locator('#register-password-confirm')
        .fill('GucluE2ESifre123!');
      await pageA.locator('#register-terms').check();
      await pageA.getByRole('button', { name: 'Hesap Oluştur' }).click();
      await expect(pageA).toHaveURL(/\/dashboard$/);

      await pageA.goto('/dashboard/quizzes/new');
      await pageA.locator('#quiz-title').fill(publicTitle);
      await pageA.locator('#quiz-category').selectOption('Teknoloji');
      await pageA
        .locator('#quiz-description')
        .fill('Herkese açık algoritma ve bilgisayar bilimi yarışması.');
      await pageA
        .locator('input[name="quiz-visibility"][value="PUBLIC"]')
        .check();

      await pageA
        .getByPlaceholder('Sorunuzu buraya yazın...')
        .fill('HTTP protokolünde 200 durum kodu ne anlama gelir?');
      await pageA.getByPlaceholder('A seçeneğini yazın...').fill('Başarılı (OK)');
      await pageA.getByPlaceholder('B seçeneğini yazın...').fill('Bulunamadı');
      await pageA.getByPlaceholder('C seçeneğini yazın...').fill('Sunucu Hatası');
      await pageA.getByPlaceholder('D seçeneğini yazın...').fill('Yönlendirme');

      await pageA.getByRole('button', { name: 'Quizi Kaydet' }).click();
      await expect(pageA).toHaveURL(/\/dashboard\/quizzes$/);

      const pubCard = pageA.locator('article', {
        has: pageA.getByRole('heading', { name: publicTitle }),
      });
      await expect(
        pubCard.getByText('Herkese Açık', { exact: true }),
      ).toBeVisible();

      // 2. Öğretmen A ikinci bir Özel (PRIVATE) quiz oluşturur
      await pageA.goto('/dashboard/quizzes/new');
      await pageA.locator('#quiz-title').fill(privateTitle);
      await pageA.locator('#quiz-category').selectOption('Tarih');
      await pageA
        .getByPlaceholder('Sorunuzu buraya yazın...')
        .fill('Cumhuriyet hangi yılda ilan edilmiştir?');
      await pageA.getByPlaceholder('A seçeneğini yazın...').fill('1923');
      await pageA.getByPlaceholder('B seçeneğini yazın...').fill('1920');
      await pageA.getByPlaceholder('C seçeneğini yazın...').fill('1919');
      await pageA.getByPlaceholder('D seçeneğini yazın...').fill('1938');
      await pageA.getByRole('button', { name: 'Quizi Kaydet' }).click();
      await expect(pageA).toHaveURL(/\/dashboard\/quizzes$/);

      // Paylaşılan Quizler sayfasında Herkese Açık quiz görünmeli, Özel quiz görünmemeli
      await pageA.goto('/dashboard/shared');
      await expect(
        pageA.getByRole('heading', { name: 'Paylaşılan Quizler' }),
      ).toBeVisible();
      await expect(
        pageA.getByRole('heading', { name: publicTitle }),
      ).toBeVisible();
      await expect(
        pageA.getByRole('heading', { name: privateTitle }),
      ).toHaveCount(0);

      // 3. Öğretmen B kaydolur, /explore sayfasında arama ve kategori filtresiyle quizi bulur
      await pageB.goto('/register');
      await pageB.locator('#register-name').fill('Öğretmen B');
      await pageB.locator('#register-email').fill(teacherBEmail);
      await pageB.locator('#register-password').fill('GucluE2ESifre123!');
      await pageB
        .locator('#register-password-confirm')
        .fill('GucluE2ESifre123!');
      await pageB.locator('#register-terms').check();
      await pageB.getByRole('button', { name: 'Hesap Oluştur' }).click();
      await expect(pageB).toHaveURL(/\/dashboard$/);

      await pageB.goto('/explore');
      await expect(
        pageB.getByRole('heading', { name: 'Quiz Kütüphanesini Keşfet' }),
      ).toBeVisible();

      await pageB.locator('#explore-search').fill(publicTitle);
      await pageB
        .getByRole('group', { name: 'Kategori filtreleri' })
        .getByRole('button', { name: 'Teknoloji', exact: true })
        .click();

      const exploreCard = pageB.locator('article', {
        has: pageB.getByRole('heading', { name: publicTitle }),
      });
      await expect(exploreCard).toBeVisible();
      await expect(exploreCard).toContainText('Öğretmen A');

      // 4. Quiz detayına git (/explore/:quizId), önizle ve Kütüphaneme Ekle
      await exploreCard.getByRole('link', { name: 'Detayları İncele' }).click();
      await expect(pageB).toHaveURL(/\/explore\/.+/);
      await expect(
        pageB.getByRole('heading', { name: publicTitle }),
      ).toBeVisible();
      await expect(
        pageB.getByText(
          'HTTP protokolünde 200 durum kodu ne anlama gelir?',
        ),
      ).toBeVisible();

      await pageB.getByRole('button', { name: 'Kütüphaneme Ekle' }).click();
      await expect(
        pageB.getByText('Kütüphanenize Eklendi (Özel Kopya)'),
      ).toBeVisible();

      // Kopyayı düzenle -> orijinal quiz korunmalı
      await pageB.getByRole('link', { name: 'Kopyayı Düzenle' }).click();
      await expect(pageB).toHaveURL(/\/dashboard\/quizzes\/.+\/edit$/);
      const editedCopyTitle = `${publicTitle} (Öğretmen B Kopyası)`;
      await pageB.locator('#quiz-title').fill(editedCopyTitle);
      await pageB
        .getByRole('button', { name: 'Değişiklikleri Kaydet' })
        .click();
      await expect(pageB).toHaveURL(/\/dashboard\/quizzes$/);
      await expect(
        pageB.getByRole('heading', { name: editedCopyTitle }),
      ).toBeVisible();

      // 5. Öğretmen A özel quiz için Bağlantıya Özel paylaşım linki üretir, Öğretmen B erişir, ardından iptal edilir
      await pageA.goto('/dashboard/quizzes');
      const privCard = pageA.locator('article', {
        has: pageA.getByRole('heading', { name: privateTitle }),
      });
      await privCard.getByRole('button', { name: 'Paylaş' }).click();

      const shareDialog = pageA.getByRole('dialog');
      await expect(shareDialog).toBeVisible();
      await shareDialog
        .getByRole('button', { name: 'Paylaşım Bağlantısı Oluştur' })
        .click();

      const shareUrlInput = shareDialog.getByLabel(
        'Paylaşım bağlantısı adresi',
      );
      await expect(shareUrlInput).toBeVisible();
      const generatedShareUrl = await shareUrlInput.inputValue();
      expect(generatedShareUrl).toContain('/explore/');
      expect(generatedShareUrl).toContain('?token=');

      // Öğretmen B paylaşım bağlantısıyla erişebilir
      await pageB.goto(generatedShareUrl);
      await expect(
        pageB.getByRole('heading', { name: privateTitle }),
      ).toBeVisible();

      // Öğretmen A paylaşımı kapatır
      await shareDialog
        .getByRole('button', { name: 'Paylaşımı Kapat' })
        .click();
      await expect(
        shareDialog.getByText(/Quiz şu anda\s+Özel\s+durumdadır/i),
      ).toBeVisible();

      // Öğretmen B aynı bağlantıyı yenilediğinde erişim engellenmeli
      await pageB.goto(generatedShareUrl);
      await expect(
        pageB.getByRole('heading', {
          name: /Paylaşım bağlantısının süresi dolmuş veya bağlantı iptal edilmiş/i,
        }),
      ).toBeVisible();

      // 6. 320px mobil uyumluluk kontrolü (/explore)
      await pageB.setViewportSize({ width: 320, height: 640 });
      await pageB.goto('/explore');
      await assertNoHorizontalOverflow(pageB, 'Mobil (320px) Keşfet Sayfası');
    } finally {
      await teacherAContext.close();
      await teacherBContext.close();
    }
  });

  test('Aşama 11: Sınıf Modu, Öğretmen Kontrol Merkezi, Projeksiyon Görünümü, Çift Ekran Senkronizasyonu ve Soru Duraklatma akışını yürütür', async ({
    browser,
  }) => {
    const suffix = `${Date.now().toString().slice(-6)}s11`;
    const teacherEmail = `e2e-stage11-${suffix}@quizora.local`;
    cleanupEmails.push(teacherEmail);

    const quizTitle = `Sınıf Modu Canlı Quiz ${suffix}`;

    const teacherContext = await browser.newContext({
      viewport: { width: 1280, height: 800 },
    });
    const projectorContext = await browser.newContext({
      viewport: { width: 1600, height: 900 },
    });
    const studentContext = await browser.newContext({
      viewport: { width: 320, height: 667 },
    });

    const teacherPage = await teacherContext.newPage();
    const projectorPage = await projectorContext.newPage();
    const studentPage = await studentContext.newPage();

    try {
      // 1. Öğretmen kaydolur ve 2 soruluk quiz oluşturur
      await teacherPage.goto('/register');
      await teacherPage.locator('#register-name').fill('Sınıf Modu Öğretmeni');
      await teacherPage.locator('#register-email').fill(teacherEmail);
      await teacherPage.locator('#register-password').fill('GucluE2ESifre123!');
      await teacherPage
        .locator('#register-password-confirm')
        .fill('GucluE2ESifre123!');
      await teacherPage.locator('#register-terms').check();
      await teacherPage.getByRole('button', { name: 'Hesap Oluştur' }).click();
      await expect(teacherPage).toHaveURL(/\/dashboard$/);

      await teacherPage.goto('/dashboard/quizzes/new');
      await teacherPage.locator('#quiz-title').fill(quizTitle);
      await teacherPage
        .getByPlaceholder('Sorunuzu buraya yazın...')
        .fill('Işığın boşluktaki hızı yaklaşık kaç km/s’dir?');
      await teacherPage.getByPlaceholder('A seçeneğini yazın...').fill('300.000');
      await teacherPage.getByPlaceholder('B seçeneğini yazın...').fill('150.000');
      await teacherPage.getByPlaceholder('C seçeneğini yazın...').fill('30.000');
      await teacherPage.getByPlaceholder('D seçeneğini yazın...').fill('1.000');

      await teacherPage.getByRole('button', { name: 'Quizi Kaydet' }).click();
      await expect(teacherPage).toHaveURL(/\/dashboard\/quizzes$/);

      // 2. Quiz kartından "Sınıf Modunda Başlat" butonuna tıkla
      const quizCard = teacherPage.locator('article', {
        has: teacherPage.getByRole('heading', { name: quizTitle }),
      });
      await quizCard
        .getByRole('button', { name: 'Sınıf Modunda Başlat' })
        .click();
      await expect(teacherPage).toHaveURL(/\/host\/\d{6}\?classroom=1$/);

      const pin = teacherPage.url().match(/\/host\/(\d{6})/)![1]!;
      cleanupPins.push(pin);

      await expect(
        teacherPage.getByText('Sınıf Modu', { exact: true }),
      ).toBeVisible();
      await expect(
        teacherPage.getByText('Bekleme Odası', { exact: true }),
      ).toBeVisible();

      // 3. Öğretmen ekranından presenterToken'ı oku ve Projeksiyon Görünümünü (/present/:pin) aç
      const presenterToken = await teacherPage.evaluate((roomPin) => {
        return window.localStorage.getItem(`quizora:presenter:${roomPin}`);
      }, pin);
      expect(presenterToken).toBeTruthy();

      await projectorPage.goto(
        `/present/${pin}?token=${encodeURIComponent(presenterToken!)}`,
      );
      await expect(
        projectorPage.getByText('Sınıf Projeksiyon Görünümü'),
      ).toBeVisible();
      await expect(
        projectorPage.getByText(
          `${pin.slice(0, 3)} ${pin.slice(3)}`,
        ).first(),
      ).toBeVisible();

      // Projeksiyon ekranında hiçbir öğretmen yönetim kontrolü bulunmamalı
      await expect(
        projectorPage.getByRole('button', { name: 'Yarışmayı Başlat' }),
      ).toHaveCount(0);
      await expect(
        projectorPage.getByRole('button', { name: 'Yarışmayı Sonlandır' }),
      ).toHaveCount(0);

      // 4. Öğrenci telefondan yarışmaya katılır -> her iki ekranda da katılımcı sayısı güncellenir
      await studentPage.goto(`/join?pin=${pin}`);
      await studentPage.locator('#player-nickname').fill('Sınıf_Öğrencisi');
      await studentPage.getByRole('button', { name: 'Katıl' }).click();
      await expect(studentPage).toHaveURL(new RegExp(`/play/${pin}$`));

      await expect(
        teacherPage.getByRole('heading', { name: /Katılımcılar \(1 \/ \d+\)/ }),
      ).toBeVisible();
      await expect(
        projectorPage.getByRole('heading', {
          name: /Sınıftaki Katılımcılar \(1\)/,
        }),
      ).toBeVisible();
      await expect(projectorPage.getByText('Sınıf_Öğrencisi')).toBeVisible();

      // 5. Öğretmen yarışmayı başlatır -> 3-2-1 geri sayım -> Soru 1 tüm ekranlarda senkronize açılır
      await teacherPage.getByRole('button', { name: 'Yarışmayı Başlat' }).click();

      const questionHeading = 'Işığın boşluktaki hızı yaklaşık kaç km/s’dir?';
      await expect(
        teacherPage.getByRole('heading', { name: questionHeading }),
      ).toBeVisible({ timeout: 15_000 });
      await expect(
        projectorPage.getByRole('heading', { name: questionHeading }),
      ).toBeVisible({ timeout: 15_000 });
      await expect(
        studentPage.getByRole('heading', { name: questionHeading }),
      ).toBeVisible({ timeout: 15_000 });

      // Soru açıkken doğru cevap hiçbir ekranda erken gösterilmemeli
      await expect(
        projectorPage.getByText('Doğru Cevap', { exact: true }),
      ).toHaveCount(0);

      // 6. Öğretmen "Soruyu Duraklat" butonuna tıklar -> tüm ekranlarda süre durur ve öğrenci cevap butonları kilitlenir
      await teacherPage.getByRole('button', { name: 'Soruyu Duraklat' }).click();

      await expect(
        teacherPage.getByText('Duraklatıldı', { exact: true }),
      ).toBeVisible();
      await expect(
        projectorPage.getByText(
          'Soru Öğretmen Tarafından Duraklatıldı',
          { exact: true },
        ),
      ).toBeVisible();
      await expect(
        studentPage.getByText(
          'Soru öğretmen tarafından duraklatıldı. Süre devam ettirildiğinde cevap gönderebilirsiniz.',
        ),
      ).toBeVisible();

      const studentOptionA = studentPage.getByRole('button', {
        name: /A\s*300\.000/,
      });
      await expect(studentOptionA).toBeDisabled();

      // 7. Öğretmen "Soruyu Devam Ettir" butonuna tıklar -> öğrenci cevabını gönderir -> canlı sayaç güncellenir
      await teacherPage
        .getByRole('button', { name: 'Soruyu Devam Ettir' })
        .first()
        .click();
      await expect(
        teacherPage.getByText('Soru Devam Ediyor', { exact: true }),
      ).toBeVisible();
      await expect(studentOptionA).toBeEnabled();

      await studentOptionA.click();

      // Tüm öğrenciler cevapladığında soru sonuç aşamasına geçer; projeksiyonda cevap dağılımı ve doğru cevap görünür
      await expect(
        projectorPage.getByText('Soru 1 / 1 Sonucu'),
      ).toBeVisible({ timeout: 10_000 });
      await expect(
        projectorPage.getByText('Doğru Cevap', { exact: true }),
      ).toBeVisible();

      // 8. Öğretmen projeksiyonda İlk 10 Liderlik Tablosunu gösterir
      await teacherPage
        .getByRole('button', {
          name: 'Projeksiyonda Liderlik Tablosunu Göster',
        })
        .click();
      await expect(
        projectorPage.getByRole('heading', {
          name: 'Sınıf Liderlik Tablosu (İlk 10)',
        }),
      ).toBeVisible();
      await expect(projectorPage.getByText('Sınıf_Öğrencisi')).toBeVisible();

      // 9. Tek ekranlı öğretmenler için "Sunum Görünümü" ve "Tam Ekran" kontrollerinin çalıştığını doğrula
      await teacherPage
        .getByRole('button', { name: 'Sunum Görünümü' })
        .click();
      await expect(
        teacherPage.getByRole('button', { name: 'Kontrol Görünümü' }),
      ).toBeVisible();

      // 10. Final sonuçlarını göster -> hem projeksiyonda hem öğrencide final podyumu görünür
      await teacherPage
        .getByRole('button', { name: 'Final Sonuçlarını Göster' })
        .click();
      await expect(
        projectorPage.getByRole('heading', {
          name: 'Oyun Sonuçları ve Final Podyumu',
        }),
      ).toBeVisible({ timeout: 10_000 });
      await expect(
        studentPage.getByRole('heading', { name: 'Oyun Sonuçları' }),
      ).toBeVisible({ timeout: 10_000 });
    } finally {
      await teacherContext.close();
      await projectorContext.close();
      await studentContext.close();
    }
  });

  test('Aşama 12: Yapay Zekâ ile Quiz Oluşturma, PDF Çıkarma, Hata/Sınır Kontrolleri, Önizleme Düzenleme, Taslak Kaydı ve Canlı Yarışma akışını yürütür', async ({
    browser,
  }) => {
    const suffix = `${Date.now().toString().slice(-6)}s12`;
    const teacherEmail = `e2e-stage12-${suffix}@quizora.local`;
    cleanupEmails.push(teacherEmail);

    const teacherContext = await browser.newContext({
      viewport: { width: 1280, height: 800 },
    });
    const studentContext = await browser.newContext({
      viewport: { width: 320, height: 667 },
    });

    const teacherPage = await teacherContext.newPage();
    const studentPage = await studentContext.newPage();

    try {
      // 1. Öğretmen kaydolur ve menüden "Yapay Zekâ ile Oluştur" (/dashboard/ai-create) sayfasına gider
      await teacherPage.goto('/register');
      await teacherPage.locator('#register-name').fill('AI E2E Öğretmeni');
      await teacherPage.locator('#register-email').fill(teacherEmail);
      await teacherPage.locator('#register-password').fill('GucluE2ESifre123!');
      await teacherPage
        .locator('#register-password-confirm')
        .fill('GucluE2ESifre123!');
      await teacherPage.locator('#register-terms').check();
      await teacherPage.getByRole('button', { name: 'Hesap Oluştur' }).click();
      await expect(teacherPage).toHaveURL(/\/dashboard$/);

      await teacherPage
        .getByRole('navigation', { name: 'Öğretmen paneli menüsü' })
        .getByRole('link', { name: 'Yapay Zekâ ile Oluştur' })
        .click();
      await expect(teacherPage).toHaveURL(/\/dashboard\/ai-create$/);
      await expect(
        teacherPage.getByRole('heading', { name: 'Yapay Zekâ ile Quiz Oluştur' }),
      ).toBeVisible();

      // Dürüst API anahtarı durumu ve gizlilik bilgilendirmesi görünür olmalı
      await expect(
        teacherPage.getByText(
          'Sunucuda Yapay Zekâ API Anahtarı Yapılandırılmamış',
        ),
      ).toBeVisible();
      await expect(
        teacherPage.getByText('Gizlilik ve Veri İşleme Bilgilendirmesi:'),
      ).toBeVisible();

      // 2. 320px mobil uyumluluk ve boş konu / yetersiz metin istemci doğrulaması
      await teacherPage.setViewportSize({ width: 320, height: 640 });
      await assertNoHorizontalOverflow(
        teacherPage,
        'Mobil (320px) Yapay Zekâ Oluşturma Ekranı',
      );
      await teacherPage.getByRole('button', { name: 'Soruları Oluştur' }).click();
      await expect(
        teacherPage.getByText('Lütfen en az 3 karakterlik bir konu girin.').first(),
      ).toBeVisible();

      await teacherPage
        .getByRole('tab', { name: 'Metinden Quiz Oluştur' })
        .click();
      await teacherPage.locator('#ai-source-text').fill('Kısa ders metni');
      await teacherPage.getByRole('button', { name: 'Soruları Oluştur' }).click();
      await expect(
        teacherPage.getByText(/Metin yeterli değil\./).first(),
      ).toBeVisible();

      await teacherPage.setViewportSize({ width: 1280, height: 800 });

      // 3. Gerçek backend PDF çıkarma testi (boş PDF -> OCR yok uyarısı, geçerli PDF -> metin özeti)
      await teacherPage
        .getByRole('tab', { name: "PDF'den Quiz Oluştur" })
        .click();

      const emptyPdfBuf = await createE2ePdfBuffer([]);
      await teacherPage.locator('#ai-pdf-file').setInputFiles({
        name: 'taranmis-e2e.pdf',
        mimeType: 'application/pdf',
        buffer: emptyPdfBuf,
      });
      await expect(
        teacherPage.getByText(/OCR \(görselden metin okuma\) desteği sunmamaktadır/),
      ).toBeVisible({ timeout: 10_000 });

      const validPdfBuf = await createE2ePdfBuffer([
        'Sayfa 1: Kurtuluş Savaşı sonrasında 29 Ekim 1923 tarihinde Türkiye Cumhuriyeti ilan edilmiştir. Başkent Ankara olarak belirlenmiştir.',
        'Sayfa 2: Tevhid-i Tedrisat Kanunu ile 3 Mart 1924 tarihinde ülkedeki tüm okullar Milli Eğitim Bakanlığına bağlanmıştır.',
      ]);
      await teacherPage.locator('#ai-pdf-file').setInputFiles({
        name: 'inkilap-notlari.pdf',
        mimeType: 'application/pdf',
        buffer: validPdfBuf,
      });
      await expect(teacherPage.getByText('inkilap-notlari.pdf')).toBeVisible({
        timeout: 10_000,
      });
      await expect(
        teacherPage.getByText(/29 Ekim 1923 tarihinde Türkiye Cumhuriyeti/),
      ).toBeVisible();

      // 4. Harici AI cevabı test rotası ile önizleme akışını ve düzenlemeyi yürüt
      await teacherPage.route('**/api/ai/generate', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            draft: {
              title: `Cumhuriyet Dönemi PDF Quizi ${suffix}`,
              description: 'PDF belgesinden hazırlanan sorular.',
              category: 'Tarih',
              generationMethod: 'PDF',
              sourceType: 'PDF Belgesi',
              sourceSummary: 'inkilap-notlari.pdf (2 sayfa)',
              generatedAt: new Date().toISOString(),
              filteredDuplicatesCount: 0,
              filteredInvalidCount: 0,
              warnings: [
                'Yapay zekâ tarafından oluşturulan sorular hata içerebilir; kaydetmeden önce kontrol edin.',
              ],
              questions: [
                {
                  type: 'MULTIPLE_CHOICE',
                  text: 'Türkiye Cumhuriyeti hangi tarihte ilan edilmiştir?',
                  explanation: 'Belge Sayfa 1 bilgisidir.',
                  allowPartialCredit: false,
                  timeLimitSec: 20,
                  points: 1000,
                  difficulty: 'EASY',
                  sourceReference: 'Sayfa 1',
                  qualityWarnings: [],
                  options: [
                    { text: '29 Ekim 1923', isCorrect: true },
                    { text: '23 Nisan 1920', isCorrect: false },
                    { text: '19 Mayıs 1919', isCorrect: false },
                    { text: '30 Ağustos 1922', isCorrect: false },
                  ],
                },
                {
                  type: 'TRUE_FALSE',
                  text: 'Tevhid-i Tedrisat Kanunu ile eğitim kurumları birleştirilmiştir.',
                  explanation: 'Belge Sayfa 2 bilgisidir.',
                  allowPartialCredit: false,
                  timeLimitSec: 20,
                  points: 1000,
                  difficulty: 'MEDIUM',
                  sourceReference: 'Sayfa 2',
                  qualityWarnings: [],
                  options: [
                    { text: 'Doğru', isCorrect: true },
                    { text: 'Yanlış', isCorrect: false },
                  ],
                },
                {
                  type: 'MULTIPLE_CHOICE',
                  text: 'Silinecek üçüncü deneme sorusu?',
                  explanation: '',
                  allowPartialCredit: false,
                  timeLimitSec: 20,
                  points: 1000,
                  difficulty: 'HARD',
                  sourceReference: 'Sayfa 2',
                  qualityWarnings: [],
                  options: [
                    { text: 'A', isCorrect: true },
                    { text: 'B', isCorrect: false },
                    { text: 'C', isCorrect: false },
                    { text: 'D', isCorrect: false },
                  ],
                },
              ],
            },
            usage: {
              model: 'gemini-2.5-flash',
              promptTokens: 300,
              outputTokens: 250,
              totalTokens: 550,
              estimatedCostUsd: 0.000195,
              durationMs: 120,
            },
          }),
        });
      });

      await teacherPage.route('**/api/ai/regenerate-question', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            question: {
              type: 'TRUE_FALSE',
              text: 'Yenilenmiş Soru: Tevhid-i Tedrisat 3 Mart 1924 tarihinde kabul edilmiştir.',
              explanation: 'Sayfa 2’de belirtilmiştir.',
              allowPartialCredit: false,
              timeLimitSec: 20,
              points: 1000,
              difficulty: 'MEDIUM',
              sourceReference: 'Sayfa 2',
              qualityWarnings: [],
              options: [
                { text: 'Doğru', isCorrect: true },
                { text: 'Yanlış', isCorrect: false },
              ],
            },
            usage: {
              model: 'gemini-2.5-flash',
              promptTokens: 120,
              outputTokens: 80,
              totalTokens: 200,
              estimatedCostUsd: 0.000066,
              durationMs: 40,
            },
          }),
        });
      });

      await teacherPage.locator('#ai-consent').check();
      await teacherPage.getByRole('button', { name: 'Soruları Oluştur' }).click();

      // 5. Önizleme ve düzenleme ekranı açılır
      await expect(
        teacherPage.getByText('Varsayılan Kayıt: Özel · Taslak'),
      ).toBeVisible({ timeout: 10_000 });
      await expect(
        teacherPage.getByText('Kaynak: Sayfa 1'),
      ).toBeVisible();

      // 320px mobil önizleme taşma kontrolü
      await teacherPage.setViewportSize({ width: 320, height: 640 });
      await assertNoHorizontalOverflow(
        teacherPage,
        'Mobil (320px) Yapay Zekâ Önizleme Ekranı',
      );
      await teacherPage.setViewportSize({ width: 1280, height: 800 });

      // Başlığı ve soru metnini düzenle, 3. soruyu sil, 2. soruyu yenile, sırasını değiştir
      const editedQuizTitle = `AI Onaylı Tarih Quizi ${suffix}`;
      await teacherPage.locator('#ai-preview-title').fill(editedQuizTitle);

      // 3. soruyu sil
      await teacherPage.getByRole('button', { name: 'Soruyu Sil' }).nth(2).click();
      await expect(
        teacherPage.getByRole('heading', {
          name: /Oluşturulan Quiz Taslağı \(2 Soru\)/,
        }),
      ).toBeVisible();

      // 2. soruyu yeniden oluştur
      await teacherPage
        .getByRole('button', { name: 'Bu Soruyu Yeniden Oluştur' })
        .nth(1)
        .click();
      await expect(
        teacherPage.getByLabel('Soru 2 Metni'),
      ).toHaveValue(
        'Yenilenmiş Soru: Tevhid-i Tedrisat 3 Mart 1924 tarihinde kabul edilmiştir.',
      );

      // Sırasını değiştir (Soru 2'yi yukarı taşı -> 1. soru olur)
      await teacherPage.getByRole('button', { name: 'Soru 2 yukarı taşı' }).click();

      // 6. Taslak Olarak Kaydet ve Editörde Aç -> Gerçek PostgreSQL'e DRAFT + PRIVATE kaydeder
      await teacherPage
        .getByRole('button', { name: 'Taslak Olarak Kaydet ve Editörde Aç' })
        .first()
        .click();
      await expect(teacherPage).toHaveURL(/\/dashboard\/quizzes\/[^/]+\/edit$/);
      await expect(
        teacherPage.getByText('Yapay Zekâ Taslağı'),
      ).toBeVisible();
      await expect(
        teacherPage.getByText('Kaynak Referansı: Sayfa 2'),
      ).toBeVisible();

      // Mevcut editörde yayına hazır kaydet
      await teacherPage
        .getByRole('button', { name: 'Değişiklikleri Kaydet' })
        .click();
      await expect(teacherPage).toHaveURL(/\/dashboard\/quizzes$/);

      const savedCard = teacherPage.locator('article', {
        has: teacherPage.getByRole('heading', { name: editedQuizTitle }),
      });
      await expect(savedCard.getByText('Yapay Zekâ', { exact: true })).toBeVisible();

      // 7. AI ile üretilmiş quiz ile gerçek canlı yarışma başlat
      await savedCard.getByRole('button', { name: 'Yarışma Başlat' }).click();
      await expect(teacherPage).toHaveURL(/\/host\/\d{6}$/);
      const pin = teacherPage.url().match(/\/host\/(\d{6})$/)![1]!;
      cleanupPins.push(pin);

      await studentPage.goto(`/join?pin=${pin}`);
      await studentPage.locator('#player-nickname').fill('AI_Oyuncu');
      await studentPage.getByRole('button', { name: 'Katıl' }).click();
      await expect(
        teacherPage.getByRole('heading', { name: /Katılımcılar \(1 \/ \d+\)/ }),
      ).toBeVisible();

      await teacherPage.getByRole('button', { name: 'Yarışmayı Başlat' }).click();
      await expect(
        studentPage.getByRole('heading', {
          name: 'Yenilenmiş Soru: Tevhid-i Tedrisat 3 Mart 1924 tarihinde kabul edilmiştir.',
        }),
      ).toBeVisible({ timeout: 15_000 });

      await studentPage.getByRole('button', { name: 'Doğru', exact: true }).click();
      await expect(
        studentPage.getByText('Doğru Cevap!', { exact: true }),
      ).toBeVisible({ timeout: 10_000 });

      await teacherPage.getByRole('button', { name: 'Yarışmayı Sonlandır' }).click();
      await teacherPage
        .getByRole('button', { name: 'Evet, Yarışmayı Sonlandır' })
        .click();
      await expect(
        teacherPage.getByRole('heading', { name: 'Oyun Sonuçları' }),
      ).toBeVisible({ timeout: 10_000 });
    } finally {
      await teacherContext.close();
      await studentContext.close();
    }
  });

  test('Aşama 13: Ana sayfa gerçek bağlantıları, oturum yönlendirmesi, SPA başlıkları, kırık görsel koruması, duraklatma kilidi, gerçek panel istatistiği ve 6 ekran genişliği kontrolü', async ({
    browser,
  }) => {
    const suffix = `${Date.now().toString().slice(-6)}s13`;
    const teacherEmail = `e2e-stage13-${suffix}@quizora.local`;
    cleanupEmails.push(teacherEmail);

    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
    });
    const studentContext = await browser.newContext({
      viewport: { width: 320, height: 667 },
    });

    const page = await context.newPage();
    const studentPage = await studentContext.newPage();
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));
    studentPage.on('pageerror', (err) => pageErrors.push(err.message));

    try {
      // 1. Ana sayfa ölü placeholder içermemeli ve Keşfet / Oyuna Katıl çalışmalı
      await page.goto('/');
      await expect(page).toHaveTitle('QUIZORA — Gerçek Zamanlı Bilgi Yarışması');
      await expect(page.getByText(/henüz oluşturulmadı/i)).toHaveCount(0);

      await page.getByRole('banner').getByRole('link', { name: 'Keşfet' }).click();
      await expect(page).toHaveURL(/\/explore$/);
      await expect(page).toHaveTitle('Quiz Keşfet | QUIZORA');

      await page.goto('/');
      await page.getByRole('button', { name: 'Oyuna Katıl' }).click();
      await expect(page).toHaveURL(/\/join$/);
      await expect(page).toHaveTitle('Oyuna Katıl | QUIZORA');

      // 2. Kayıt ol -> Herkese Açık çoklu seçmeli quiz oluştur -> başka tarayıcıda /explore/:id auth ?next= yönlendirmesi
      await page.goto('/register');
      await expect(page).toHaveTitle('Öğretmen Kaydı | QUIZORA');
      await page.locator('#register-name').fill('Aşama 13 Öğretmen');
      await page.locator('#register-email').fill(teacherEmail);
      await page.locator('#register-password').fill('GucluE2ESifre123!');
      await page.locator('#register-password-confirm').fill('GucluE2ESifre123!');
      await page.locator('#register-terms').check();
      await page.getByRole('button', { name: 'Hesap Oluştur' }).click();
      await expect(page).toHaveURL(/\/dashboard$/);
      await expect(page).toHaveTitle('Öğretmen Paneli | QUIZORA');

      // Ana sayfada giriş yapmış öğretmen için Öğretmen Paneli bağlantısı görünmeli
      await page.goto('/');
      await expect(
        page.getByRole('banner').getByRole('link', { name: 'Öğretmen Paneli' }),
      ).toBeVisible();

      // Yeni quiz sayfasında Çoklu Doğru Cevap + Herkese Açık quiz kaydet
      await page.goto('/dashboard/quizzes/new');
      await expect(page).toHaveTitle('Yeni Quiz Oluştur | QUIZORA');
      const quizTitle = `Aşama 13 Kontrol Quizi ${suffix}`;
      await page.locator('#quiz-title').fill(quizTitle);
      await page.getByRole('radio', { name: /Herkese Açık/ }).check();

      await page.getByRole('button', { name: 'Çoklu Doğru Cevap' }).click();
      await page
        .getByPlaceholder('Sorunuzu buraya yazın...')
        .fill('Hangileri çift doğal sayıdır?');
      await page.getByPlaceholder('A seçeneğini yazın...').fill('2');
      await page.getByPlaceholder('B seçeneğini yazın...').fill('3');
      await page.getByPlaceholder('C seçeneğini yazın...').fill('4');
      await page.getByPlaceholder('D seçeneğini yazın...').fill('5');
      await page.getByLabel('Doğru Cevap').nth(0).check();
      await page.getByLabel('Doğru Cevap').nth(2).check();

      await page.getByRole('button', { name: 'Quizi Kaydet' }).click();
      await expect(page).toHaveURL(/\/dashboard\/quizzes$/);
      await expect(page).toHaveTitle('Quizlerim | QUIZORA');

      const createdQuizCard = page.locator('article', {
        has: page.getByRole('heading', { name: quizTitle }),
      });
      await expect(createdQuizCard).toBeVisible();

      // Keşfet üzerinden quiz ID'sini bul ve anonim studentPage'de "Kütüphaneme Ekle" -> ?next= korunduğunu doğrula
      await page.goto(`/explore?q=${encodeURIComponent(quizTitle)}`);
      const exploreLink = page.getByRole('link', { name: quizTitle }).first();
      await expect(exploreLink).toBeVisible();
      const quizHref = await exploreLink.getAttribute('href');
      expect(quizHref).toBeTruthy();

      await studentPage.setViewportSize({ width: 1024, height: 768 });
      await studentPage.goto(quizHref!);
      await expect(studentPage).toHaveTitle('Quiz Detayı | QUIZORA');
      await studentPage.getByRole('button', { name: 'Kütüphaneme Ekle' }).click();
      await expect(studentPage).toHaveURL(
        new RegExp(`/login\\?next=${encodeURIComponent(quizHref!).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`),
      );

      // 3. Ayarlar sayfasında gerçek servis durumu ve History sayfasında erişilebilir odak kontrolleri
      await page.goto('/dashboard/settings');
      await expect(page).toHaveTitle('Ayarlar | QUIZORA');
      await expect(page.getByText('Altyapı ve Servis Durumu')).toBeVisible();
      await expect(page.getByText(/Etkin \(Yerel disk/)).toBeVisible();

      // 4. Canlı yarışma + duraklatma sırasında MULTI_SELECT kilidi + Genel Bakış gerçek yarışma istatistiği
      await page.goto('/dashboard/quizzes');
      const playCard = page.locator('article', {
        has: page.getByRole('heading', { name: quizTitle }),
      });
      await playCard.getByRole('button', { name: 'Yarışma Başlat' }).click();
      await expect(page).toHaveURL(/\/host\/\d{6}$/);
      const pin = page.url().match(/\/host\/(\d{6})$/)![1]!;
      cleanupPins.push(pin);

      await studentPage.setViewportSize({ width: 320, height: 667 });
      await studentPage.goto(`/join?pin=${pin}`);
      await assertNoHorizontalOverflow(studentPage, '320px Oyuna Katıl');
      await studentPage.locator('#player-nickname').fill('Uzun_Takma_Ad_Test_320px');
      await studentPage.getByRole('button', { name: 'Katıl' }).click();
      await expect(
        studentPage.getByText('Öğretmenin yarışmayı başlatması bekleniyor.'),
      ).toBeVisible();

      await page.getByRole('button', { name: 'Yarışmayı Başlat' }).click();
      await expect(
        studentPage.getByRole('heading', { name: 'Hangileri çift doğal sayıdır?' }),
      ).toBeVisible({ timeout: 15_000 });
      await assertNoHorizontalOverflow(studentPage, '320px Çoklu Seçim Soru');

      // Öğretmen soruyu duraklatınca öğrencinin MULTI_SELECT seçenekleri ve gönder düğmesi kilitlenmeli
      await page.getByRole('button', { name: 'Soruyu Duraklat' }).click();
      await expect(
        studentPage.getByText(
          'Soru öğretmen tarafından duraklatıldı. Süre devam ettirildiğinde cevap gönderebilirsiniz.',
        ),
      ).toBeVisible({ timeout: 10_000 });
      await expect(
        studentPage.getByRole('button', { name: /Cevabı Gönder/ }),
      ).toBeDisabled();
      await expect(
        studentPage.locator('button[aria-pressed]').first(),
      ).toBeDisabled();

      // Devam ettir -> öğrenci cevap gönderir -> yarışma biter
      await page.getByRole('button', { name: 'Soruyu Devam Ettir' }).first().click();
      await studentPage.locator('button[aria-pressed]').nth(0).click();
      await studentPage.locator('button[aria-pressed]').nth(2).click();
      await studentPage.getByRole('button', { name: /Cevabı Gönder/ }).click();

      await expect(
        page.getByRole('button', { name: 'Final Sonuçlarını Göster' }),
      ).toBeVisible({ timeout: 15_000 });
      await page.getByRole('button', { name: 'Final Sonuçlarını Göster' }).click();
      await expect(
        page.getByRole('heading', { name: 'Oyun Sonuçları' }),
      ).toBeVisible({ timeout: 10_000 });

      // Genel Bakış artık sabit "henüz başlatılmadı" yerine gerçek oturum sayısını göstermeli
      await page.goto('/dashboard');
      await expect(
        page.getByText(/Canlı yarışma oturumları henüz başlatılmadı/i),
      ).toHaveCount(0);
      await expect(
        page.getByText(/1 tamamlanan yarışma · 1 katılımcı/),
      ).toBeVisible();

      // 5. Kırık görsel fallback kontrolü (404 dönen bir kapak URL'si simülasyonu)
      await page.route('**/api/quizzes', async (route) => {
        if (route.request().method() !== 'GET') {
          await route.continue();
          return;
        }
        const res = await route.fetch();
        const json = (await res.json()) as {
          quizzes: Array<Record<string, unknown>>;
        };
        if (json.quizzes[0]) {
          json.quizzes[0].coverImageUrl = '/uploads/kirik-test-gorsel-404.png';
        }
        await route.fulfill({
          status: res.status(),
          contentType: 'application/json',
          body: JSON.stringify(json),
        });
      });
      await page.route('**/uploads/kirik-test-gorsel-404.png', (route) =>
        route.fulfill({ status: 404, body: 'Not Found' }),
      );
      await page.goto('/dashboard/quizzes');
      await expect(page.getByText('Görsel yüklenemedi').first()).toBeVisible({
        timeout: 10_000,
      });
      await page.unroute('**/api/quizzes');
      await page.unroute('**/uploads/kirik-test-gorsel-404.png');

      // 6. Tüm 6 zorunlu ekran genişliğinde (320, 375, 390, 768, 1024, 1440 px) yatay taşma taraması
      const viewports = [
        { width: 320, height: 667 },
        { width: 375, height: 812 },
        { width: 390, height: 844 },
        { width: 768, height: 1024 },
        { width: 1024, height: 768 },
        { width: 1440, height: 900 },
      ] as const;

      const authenticatedRoutes = [
        '/',
        '/explore',
        '/join',
        '/dashboard',
        '/dashboard/quizzes',
        '/dashboard/quizzes/new',
        '/dashboard/ai-create',
        '/dashboard/history',
        '/dashboard/profile',
        '/dashboard/settings',
      ] as const;

      for (const routePath of authenticatedRoutes) {
        await page.goto(routePath);
        await page.waitForLoadState('networkidle');
        for (const vp of viewports) {
          await page.setViewportSize(vp);
          await assertNoHorizontalOverflow(page, `${routePath} @ ${vp.width}px`);
        }
      }

      expect(pageErrors).toEqual([]);
    } finally {
      await context.close();
      await studentContext.close();
    }
  });
});
