import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import type { AiServiceStatus } from '@shared/aiTypes';
import { Link, useNavigate } from 'react-router-dom';
import { InfoIcon } from '@/components/ui/Icons';
import { useAuth } from '@/context/AuthContext';
import { getAiStatus } from '@/services/aiApi';
import { ApiError, getHealth, getUploadStatus } from '@/services/quizApi';
import type { HealthStatus, UploadStatusResponse } from '@/types/quiz';

export function SettingsPlaceholderPage() {
  const navigate = useNavigate();
  const { teacher, logout } = useAuth();
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [uploadStatus, setUploadStatus] = useState<UploadStatusResponse | null>(null);
  const [aiStatus, setAiStatus] = useState<AiServiceStatus | null>(null);

  useEffect(() => {
    let active = true;

    getHealth()
      .then((data) => {
        if (active) setHealth(data);
      })
      .catch((err) => {
        if (active) {
          setHealthError(
            err instanceof ApiError
              ? err.message
              : 'Veritabanı bağlantı durumu alınamadı.',
          );
        }
      });

    getUploadStatus()
      .then((data) => {
        if (active) setUploadStatus(data);
      })
      .catch(() => undefined);

    getAiStatus()
      .then((data) => {
        if (active) setAiStatus(data);
      })
      .catch(() => undefined);

    return () => {
      active = false;
    };
  }, []);

  const uploadLimitMb = uploadStatus
    ? `${Math.round(uploadStatus.maxSizeBytes / (1024 * 1024))} MB`
    : '5 MB';

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      <div>
        <h1
          className="font-display font-bold tracking-tight text-navy-900"
          style={{ fontSize: 'var(--text-h1)', lineHeight: 'var(--leading-h1)' }}
        >
          Ayarlar
        </h1>
        <p className="mt-1.5 text-sm sm:text-base text-navy-600">
          Öğretmen hesabı, oturum güvenliği ve sistem yapılandırma özeti.
        </p>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <section className="rounded-2xl bg-cream-50 border border-cream-300 p-6 shadow-card">
          <div className="flex items-start gap-3">
            <InfoIcon className="mt-0.5 shrink-0 text-burgundy-600" />
            <div className="min-w-0 flex-1">
              <h2 className="font-display font-bold text-lg text-navy-900">
                Öğretmen Hesabı ve Oturum Güvenliği
              </h2>
              <dl className="mt-4 space-y-2.5 text-sm">
                <div className="flex items-center justify-between gap-4 border-b border-cream-300 pb-2">
                  <dt className="text-navy-600">Ad Soyad</dt>
                  <dd className="font-semibold text-navy-900 truncate">
                    {teacher?.name ?? '-'}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-4 border-b border-cream-300 pb-2">
                  <dt className="text-navy-600">E-posta</dt>
                  <dd className="font-semibold text-navy-900 truncate">
                    {teacher?.email ?? '-'}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-navy-600">Oturum Koruması</dt>
                  <dd className="font-semibold text-navy-900">
                    HttpOnly Çerez · Argon2id · CSRF
                  </dd>
                </div>
              </dl>
              <div className="mt-5 flex flex-wrap items-center gap-2.5">
                <Link
                  to="/dashboard/profile"
                  className="inline-flex items-center justify-center rounded-xl bg-navy-900 hover:bg-navy-950 px-4 py-2 text-xs sm:text-sm font-semibold text-cream-50 transition-colors duration-150"
                >
                  Profil ve Şifre Ayarları
                </Link>
                <button
                  type="button"
                  onClick={async () => {
                    await logout();
                    navigate('/login', { replace: true });
                  }}
                  className="inline-flex items-center justify-center rounded-xl border border-burgundy-500/40 bg-burgundy-50 hover:bg-burgundy-100 px-4 py-2 text-xs sm:text-sm font-semibold text-burgundy-700 transition-colors duration-150 cursor-pointer"
                >
                  Oturumu Kapat
                </button>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-2xl bg-cream-50 border border-cream-300 p-6 shadow-card">
          <h2 className="font-display font-bold text-lg text-navy-900">
            Altyapı ve Servis Durumu
          </h2>

          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex items-center justify-between gap-4 border-b border-cream-300 pb-2.5">
              <dt className="text-navy-600">PostgreSQL Bağlantısı</dt>
              <dd className="font-semibold text-navy-900">
                {health?.ok
                  ? 'Bağlı'
                  : healthError
                    ? 'Bağlantı Hatası'
                    : 'Kontrol ediliyor...'}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4 border-b border-cream-300 pb-2.5">
              <dt className="text-navy-600">Veri Katmanı</dt>
              <dd className="font-semibold text-navy-900">PostgreSQL + Prisma</dd>
            </div>
            <div className="flex items-center justify-between gap-4 border-b border-cream-300 pb-2.5">
              <dt className="text-navy-600">Görsel Saklama</dt>
              <dd className="font-semibold text-navy-900 text-end">
                {uploadStatus === null
                  ? 'Kontrol ediliyor...'
                  : uploadStatus.configured
                    ? `Etkin (Yerel disk · maks. ${uploadLimitMb})`
                    : 'Yapılandırılmamış'}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-navy-600">Yapay Zekâ Servisi</dt>
              <dd className="font-semibold text-navy-900 text-end">
                {aiStatus === null
                  ? 'Kontrol ediliyor...'
                  : aiStatus.configured
                    ? `Etkin (${aiStatus.model})`
                    : 'API anahtarı yapılandırılmamış'}
              </dd>
            </div>
          </dl>

          {healthError && (
            <p className="mt-3 text-xs text-burgundy-600">{healthError}</p>
          )}
        </section>
      </div>
    </motion.div>
  );
}
