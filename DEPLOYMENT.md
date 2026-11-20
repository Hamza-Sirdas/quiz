# QUIZORA Yayınlama (Deployment) Rehberi

Bu rehber QUIZORA uygulamasını gerçek kullanıcıların erişebileceği üretim ortamına almak için hazırlanmıştır:

- **Frontend (React + Vite):** Vercel (statik SPA)
- **Backend + Socket.IO (Express + Socket.IO):** Render Web Service (tek instance)
- **Veritabanı:** Render Managed PostgreSQL (veya Neon / Supabase PostgreSQL)

> **Önemli Mimari Notu:** Canlı yarışma odaları ve zamanlayıcılar `server/game/GameManager.ts` içinde tek Node.js süreci belleğinde yönetilir (`single-instance`). Backend servisini yatayda birden fazla kopyaya (instance) bölmeyin; çoklu instance gerekirse `@socket.io/redis-adapter` eklenmelidir.

---

## 1. Ön Koşullar ve Ortam Değişkenleri

Projede bulunan [`.env.example`](./.env.example) dosyasını referans alın. Üretimde kullanılan ortam değişkenleri:

### Backend (Render)
| Değişken | Açıklama | Örnek Değer |
| --- | --- | --- |
| `NODE_ENV` | Üretim modu (HTTPS çerezleri ve katı CORS için zorunlu) | `production` |
| `PORT` | Render tarafından otomatik sağlanır (`10000`) | `10000` |
| `DATABASE_URL` | Managed PostgreSQL bağlantı dizesi | `postgresql://...` |
| `CORS_ORIGINS` | İzin verilen frontend adresleri (virgülle ayrılmış, sondaki `/` yok) | `https://quizora.vercel.app` |
| `COOKIE_SAME_SITE` | Farklı alan adları (`*.vercel.app` ↔ `*.onrender.com`) için `none`, aynı üst alan adı (`quizora.com` ↔ `api.quizora.com`) için `lax` | `none` |
| `APP_BASE_URL` | Şifre sıfırlama bağlantılarında kullanılacak frontend adresi | `https://quizora.vercel.app` |
| `RESEND_API_KEY` | Şifre sıfırlama e-postaları için Resend API anahtarı (isteğe bağlı) | `re_...` |
| `EMAIL_FROM` | Gönderen e-posta adresi (isteğe bağlı, doğrulanan alan adı) | `QUIZORA <no-reply@quizora.yourdomain.com>` |
| `UPLOADS_DIR` | Kalıcı quiz ve soru görselleri depolama klasörü (varsayılan: `server/uploads`) | `/var/data/uploads` |

### Frontend (Vercel)
| Değişken | Açıklama | Örnek Değer |
| --- | --- | --- |
| `VITE_API_URL` | Render backend HTTPS adresi (sondaki `/` yok) | `https://quizora-api.onrender.com` |
| `VITE_SOCKET_URL` | Render Socket.IO HTTPS adresi (genellikle `VITE_API_URL` ile aynı) | `https://quizora-api.onrender.com` |

---

## 2. Backend ve PostgreSQL Kurulumu (Render)

1. Kodu GitHub/GitLab deposuna yükleyin.
2. Render Dashboard üzerinden **New + → Blueprint** seçerek depo kökündeki [`render.yaml`](./render.yaml) dosyasını içe aktarın (veya manuel olarak PostgreSQL + Web Service oluşturun):
   - **Build Command:** `npm ci && npx prisma generate && npm run build`
   - **Start Command:** `npx prisma migrate deploy && npm start`
   - **Health Check Path:** `/api/health`
   - **Instance Count:** `1` (tek instance)
3. Ortam değişkenlerini ayarlayın:
   - `NODE_ENV=production`
   - `DATABASE_URL=<Managed PostgreSQL Connection String>`
   - `CORS_ORIGINS=https://<vercel-projeniz>.vercel.app`
   - `COOKIE_SAME_SITE=none` (özel alan adı alt domaini kullanıyorsanız `lax` önerilir)
4. Yüklenen görseller için not: Quiz kapak ve soru görselleri yerel diskte `server/uploads` dizinine yazılır. Render üzerinde dosya kalıcılığı için ya Render **Persistent Disk** bağlayın ya da ileride S3/R2 nesne depolamasına geçin.
5. Deploy tamamlandığında `https://<render-servisiniz>.onrender.com/api/health` adresinden aşağıdaki yanıtı doğrulayın:
   ```json
   {
     "ok": true,
     "database": "connected",
     "uptimeSec": 12,
     "activeRooms": 0
   }
   ```

---

## 3. Frontend Kurulumu (Vercel)

Depo kökünde [`vercel.json`](./vercel.json) SPA yönlendirmesi (`/(.*)` → `/index.html`, `/assets/*` hariç) tanımlıdır.

1. Vercel Dashboard → **Add New Project** ile depoyu seçin.
2. **Framework Preset:** Vite, **Build Command:** `npm run build:client`, **Output Directory:** `dist`.
3. **Environment Variables** bölümüne aşağıdaki değişkenleri ekleyin:
   - `VITE_API_URL=https://<render-servisiniz>.onrender.com`
   - `VITE_SOCKET_URL=https://<render-servisiniz>.onrender.com`
4. Deploy tamamlandıktan sonra Vercel üretim URL'sini (`https://<proje>.vercel.app`) Render üzerindeki `CORS_ORIGINS` değişkenine yazıp Render servisini yeniden başlatın.

---

## 4. iOS Safari ve Özel Alan Adı Notu

- Öğrenciler kimlik doğrulama çerezi kullanmaz; yalnızca 6 haneli PIN, takma ad ve tarayıcı `localStorage`/`sessionStorage` üzerinde tutulan `playerToken` + Socket.IO ile oynar. Bu nedenle öğrenciler tüm mobil tarayıcılarda (iOS Safari dahil) sorunsuz katılabilir.
- Öğretmen oturumları `HttpOnly` çerez (`quizora_session`) ile korunur. Frontend `*.vercel.app` ve backend `*.onrender.com` gibi farklı üst alan adlarındaysa bazı katı tarayıcılar (özellikle iOS Safari ITP) üçüncü taraf çerezleri engelleyebilir. Öğretmenlerin mobil Safari üzerinden de kesintisiz giriş yapabilmesi için canlı ortamda özel alan adı (ör. `quizora.alanadiniz.com` ve `api.alanadiniz.com`) bağlayıp `COOKIE_SAME_SITE=lax` kullanmanız önerilir.

---

## 5. Yayın Sonrası Doğrulama Kontrol Listesi

1. `GET https://<api>/api/health` → `200 OK` ve `"database": "connected"`.
2. Vercel ana sayfası (`/`) hatasız açılıyor ve sağdaki quiz önizleme kartı etkileşimli çalışıyor.
3. Öğretmen `/register` ile kayıt olup `/dashboard` sayfasına yönlendiriliyor; sayfa yenilenince oturum korunuyor.
4. Öğretmen `/dashboard/quizzes/new` ile yeni quiz oluşturup kaydediyor ve ardından **Yarışma Başlat** ile `/host/:pin` bekleme odasını açıyor.
5. Tarayıcı konsolunda CORS, Mixed Content veya Socket.IO bağlantı hatası görünmüyor (`wss://` üzerinden bağlantı sağlanıyor).
6. En az iki farklı cihazdan (bilgisayar + telefon) gerçek yarışma akışı [`REAL_DEVICE_TEST_PLAN.md`](./REAL_DEVICE_TEST_PLAN.md) adımlarına göre doğrulanıyor.
