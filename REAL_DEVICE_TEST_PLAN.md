# QUIZORA Gerçek Cihaz Test Planı (Canlı Yayın Sonrası)

Bu test planı, uygulama Vercel + Render üzerine yayınlandıktan sonra masaüstü bilgisayar ve gerçek mobil cihazlar (iOS / Android telefonlar) arasında uçtan uca doğrulama yapmak için kullanılır.

> Bu adımlar yayın sonrası gerçek cihaz doğrulaması içindir; canlı alan adı açılmadan önce yerel otomatik testler (Vitest, Socket.IO yük testi ve Playwright mobil/masaüstü E2E) ile simüle edilmiştir.

---

## Hazırlık

- **Öğretmen Cihazı:** Masaüstü veya dizüstü bilgisayar (Chrome / Edge / Firefox / Safari).
- **Öğrenci Cihazları:** En az 2–5 adet farklı ağlardaki mobil telefon (Wi‑Fi + mobil veri karışık, iOS Safari ve Android Chrome).
- **Yayın URL'si:** Vercel üretim adresi (`https://...`).

---

## Test Senaryoları

### 1. Öğretmen Kimlik Doğrulama ve Quiz Hazırlığı (Masaüstü)
1. Öğretmen cihazından `/register` sayfasına gidin ve yeni bir öğretmen hesabı oluşturun (veya `/login` ile giriş yapın).
2. `/dashboard` sayfasının yalnızca oturum açıkken açıldığını, çıkış yapıldığında `/login` sayfasına yönlendirdiğini doğrulayın.
3. Yeni bir en az 3 sorulu quiz oluşturun (isteğe bağlı kapak/soru görseli yükleyerek görselin yayın ortamında yüklendiğini kontrol edin).
4. **Beklenen:** Quiz veritabanına kaydedilir, listede görünür ve sayfa yenilendiğinde kaybolmaz.

### 2. Canlı Yarışma Odası ve QR Kod ile Katılım (Masaüstü + Telefonlar)
1. Öğretmen quiz kartında **Yarışma Başlat** butonuna tıklar ve `/host/:pin` bekleme odası açılır.
2. 6 haneli PIN ve ekrandaki QR kodun net göründüğünü kontrol edin.
3. Telefon kamerası ile QR kodu okutun (otomatik olarak `/join?pin=XXXXXX` sayfasını PIN dolu şekilde açmalıdır).
4. Başka bir telefondan doğrudan `/join` adresine gidip 6 haneli PIN ve takma adı elle girerek katılın.
5. **Beklenen:** Öğretmen bekleme odasındaki katılımcı listesi ve sayaç her katılımın hemen ardından anlık güncellenir; telefon ekranlarında yatay taşma olmaz.

### 3. Gerçek Zamanlı Soru–Cevap ve Zaman Senkronizasyonu
1. Öğretmen **Yarışmayı Başlat** butonuna basar.
2. Telefonlarda geri sayımın başladığını, şıkların parmakla rahat dokunulabilir boyutta olduğunu (`44px+`) ve seçilen şıkkın anında görsel geri bildirim verdiğini kontrol edin.
3. Öğrenciler soruyu farklı hızlarda cevaplasın; bir öğrenci bilerek geç cevap versin veya süre bitmesini beklesin.
4. **Beklenen:** Hızlı doğru cevap daha yüksek puan alır; yanlış veya boş cevap 0 puan alır. Sonuç ekranı hem öğretmen hem öğrenci cihazında aynı sıralamayı gösterir.

### 4. Ağ Kesintisi, Yeniden Bağlanma ve Sayfa Yenileme Testi
1. Soru devam ederken bir telefonun tarayıcısını yenileyin veya 3–4 saniyeliğine Wi‑Fi kapatıp mobil veriye geçin.
2. **Beklenen:** Üstte bağlantı uyarısı görünür, ağ geldiğinde oyuncu aynı takma ad ve mevcut puanıyla aktif soruya (veya sonuç ekranına) otomatik geri döner.
3. Aynı tarayıcıda aynı oturumla çift cevap gönderilemediğini doğrulayın.

### 5. Yarışma Sonu, Podyum ve Geçmiş Kaydı
1. Tüm sorular tamamlandığında final podyumu ve sıralama tablosunu kontrol edin.
2. Öğretmen panelinden `/dashboard/history` sayfasına gidin.
3. **Beklenen:** Tamamlanan yarışma doğru katılımcı sayısı ve lider sıralamasıyla geçmişte kalıcı olarak listelenir.
