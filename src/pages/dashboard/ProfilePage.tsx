import { useEffect, useState, type FormEvent } from 'react';
import { motion } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import {
  evaluatePasswordRules,
  normalizeEmail,
  PASSWORD_POLICY_ERROR,
} from '@shared/authValidation';
import { PasswordRulesChecklist } from '@/components/auth/PasswordRulesChecklist';
import { AlertCircleIcon, UserIcon } from '@/components/ui/Icons';
import { useAuth } from '@/context/AuthContext';
import { useDashboardToast } from '@/layouts/DashboardLayout';
import { ApiError } from '@/services/quizApi';
import { formatShortDate } from '@/utils/formatDate';

export function ProfilePage() {
  const navigate = useNavigate();
  const { teacher, updateProfile, changePassword, logout, logoutAll } = useAuth();
  const { showToast } = useDashboardToast();

  const [name, setName] = useState(teacher?.name ?? '');
  const [email, setEmail] = useState(teacher?.email ?? '');
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newPasswordConfirm, setNewPasswordConfirm] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const [loggingOutAll, setLoggingOutAll] = useState(false);

  useEffect(() => {
    if (teacher) {
      setName(teacher.name);
      setEmail(teacher.email);
    }
  }, [teacher]);

  const handleProfileSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setProfileError(null);

    if (name.trim().length < 2) {
      setProfileError('Ad soyad en az 2 karakter olmalıdır.');
      return;
    }

    const normalized = normalizeEmail(email);
    if (!normalized || !normalized.includes('@')) {
      setProfileError('Lütfen geçerli bir e-posta adresi girin.');
      return;
    }

    setSavingProfile(true);
    try {
      await updateProfile({ name: name.trim(), email: normalized });
      showToast('Profil güncellendi', 'Hesap bilgileriniz veritabanına kaydedildi.');
    } catch (err) {
      setProfileError(
        err instanceof ApiError
          ? err.message
          : 'Profil bilgileri güncellenirken bir hata oluştu.',
      );
    } finally {
      setSavingProfile(false);
    }
  };

  const handlePasswordSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPasswordError(null);

    if (!currentPassword) {
      setPasswordError('Lütfen mevcut şifrenizi girin.');
      return;
    }

    if (!evaluatePasswordRules(newPassword).valid) {
      setPasswordError(PASSWORD_POLICY_ERROR);
      return;
    }

    if (newPassword === currentPassword) {
      setPasswordError('Yeni şifre mevcut şifrenizden farklı olmalıdır.');
      return;
    }

    if (newPassword !== newPasswordConfirm) {
      setPasswordError('Yeni şifreler birbiriyle eşleşmiyor.');
      return;
    }

    setSavingPassword(true);
    try {
      const msg = await changePassword({
        currentPassword,
        newPassword,
        newPasswordConfirm,
      });
      setCurrentPassword('');
      setNewPassword('');
      setNewPasswordConfirm('');
      showToast('Şifre güncellendi', msg);
    } catch (err) {
      setPasswordError(
        err instanceof ApiError
          ? err.message
          : 'Şifre değiştirilirken bir hata oluştu.',
      );
    } finally {
      setSavingPassword(false);
    }
  };

  const handleLogoutAll = async () => {
    setLoggingOutAll(true);
    try {
      await logoutAll();
      navigate('/login', { replace: true });
    } finally {
      setLoggingOutAll(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1
            className="font-display font-bold tracking-tight text-navy-900"
            style={{ fontSize: 'var(--text-h1)', lineHeight: 'var(--leading-h1)' }}
          >
            Öğretmen Profili
          </h1>
          <p className="mt-1.5 text-sm sm:text-base text-navy-600">
            Hesap bilgilerinizi güncelleyin, şifrenizi değiştirin ve aktif oturumlarınızı yönetin.
          </p>
        </div>

        {teacher?.createdAt && (
          <span className="inline-flex items-center gap-2 self-start rounded-xl bg-cream-50 border border-cream-300 px-3.5 py-2 text-xs font-semibold text-navy-700">
            <UserIcon className="h-4 w-4 text-burgundy-600" />
            <span>Kayıt: {formatShortDate(teacher.createdAt)}</span>
          </span>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-2 items-start">
        <section className="rounded-2xl bg-cream-50 border border-cream-300 p-5 sm:p-6 shadow-card">
          <h2
            id="profil-bilgileri-baslik"
            className="font-display font-bold text-lg text-navy-900"
          >
            Profil Bilgileri
          </h2>
          <p className="mt-1 text-xs sm:text-sm text-navy-600">
            Ad soyad ve giriş e-posta adresinizi güncelleyebilirsiniz.
          </p>

          {profileError && (
            <div
              role="alert"
              className="mt-4 rounded-xl bg-burgundy-50 border border-burgundy-500 px-4 py-3 flex items-start gap-2.5 text-xs sm:text-sm font-medium text-burgundy-800"
            >
              <AlertCircleIcon className="h-4 w-4 mt-0.5 shrink-0 text-burgundy-600" />
              <span>{profileError}</span>
            </div>
          )}

          <form
            aria-labelledby="profil-bilgileri-baslik"
            method="post"
            onSubmit={(event) => void handleProfileSubmit(event)}
            noValidate
            className="mt-5 space-y-4"
          >
            <div>
              <label
                htmlFor="profile-name"
                className="block text-sm font-semibold text-navy-900"
              >
                Ad Soyad
              </label>
              <input
                id="profile-name"
                name="name"
                type="text"
                autoComplete="name"
                required
                minLength={2}
                maxLength={80}
                value={name}
                onChange={(event) => {
                  setProfileError(null);
                  setName(event.target.value);
                }}
                className="mt-1.5 w-full min-h-11 rounded-xl border border-cream-300 bg-cream-100 px-4 py-2 text-base text-navy-900 focus:border-burgundy-600"
              />
            </div>

            <div>
              <label
                htmlFor="profile-email"
                className="block text-sm font-semibold text-navy-900"
              >
                E-posta Adresi
              </label>
              <input
                id="profile-email"
                name="email"
                type="email"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                required
                value={email}
                onChange={(event) => {
                  setProfileError(null);
                  setEmail(event.target.value);
                }}
                className="mt-1.5 w-full min-h-11 rounded-xl border border-cream-300 bg-cream-100 px-4 py-2 text-base text-navy-900 focus:border-burgundy-600"
              />
            </div>

            <button
              type="submit"
              disabled={savingProfile}
              className="inline-flex items-center justify-center min-h-11 rounded-xl bg-burgundy-600 hover:bg-burgundy-700 px-5 py-2.5 text-sm font-semibold text-cream-50 transition-colors duration-150 cursor-pointer disabled:opacity-60"
            >
              {savingProfile ? 'Kaydediliyor...' : 'Bilgileri Kaydet'}
            </button>
          </form>
        </section>

        <section className="rounded-2xl bg-cream-50 border border-cream-300 p-5 sm:p-6 shadow-card">
          <h2
            id="sifre-degistir-baslik"
            className="font-display font-bold text-lg text-navy-900"
          >
            Şifre Değiştir
          </h2>
          <p className="mt-1 text-xs sm:text-sm text-navy-600">
            Şifreniz değiştirildiğinde güvenliğiniz için diğer cihazlardaki oturumlar sonlandırılır.
          </p>

          {passwordError && (
            <div
              role="alert"
              className="mt-4 rounded-xl bg-burgundy-50 border border-burgundy-500 px-4 py-3 flex items-start gap-2.5 text-xs sm:text-sm font-medium text-burgundy-800"
            >
              <AlertCircleIcon className="h-4 w-4 mt-0.5 shrink-0 text-burgundy-600" />
              <span>{passwordError}</span>
            </div>
          )}

          <form
            aria-labelledby="sifre-degistir-baslik"
            method="post"
            onSubmit={(event) => void handlePasswordSubmit(event)}
            noValidate
            className="mt-5 space-y-4"
          >
            <div>
              <div className="flex items-center justify-between gap-2">
                <label
                  htmlFor="profile-current-password"
                  className="block text-sm font-semibold text-navy-900"
                >
                  Mevcut Şifre
                </label>
                <button
                  type="button"
                  aria-pressed={showCurrent}
                  onClick={() => setShowCurrent((prev) => !prev)}
                  className="text-xs font-semibold text-burgundy-600 hover:text-burgundy-700 cursor-pointer"
                >
                  {showCurrent ? 'Şifreyi Gizle' : 'Şifreyi Göster'}
                </button>
              </div>
              <input
                id="profile-current-password"
                name="currentPassword"
                type={showCurrent ? 'text' : 'password'}
                autoComplete="current-password"
                required
                value={currentPassword}
                onChange={(event) => {
                  setPasswordError(null);
                  setCurrentPassword(event.target.value);
                }}
                className="mt-1.5 w-full min-h-11 rounded-xl border border-cream-300 bg-cream-100 px-4 py-2 text-base text-navy-900 focus:border-burgundy-600"
              />
            </div>

            <div>
              <div className="flex items-center justify-between gap-2">
                <label
                  htmlFor="profile-new-password"
                  className="block text-sm font-semibold text-navy-900"
                >
                  Yeni Şifre
                </label>
                <button
                  type="button"
                  aria-pressed={showNew}
                  onClick={() => setShowNew((prev) => !prev)}
                  className="text-xs font-semibold text-burgundy-600 hover:text-burgundy-700 cursor-pointer"
                >
                  {showNew ? 'Şifreyi Gizle' : 'Şifreyi Göster'}
                </button>
              </div>
              <input
                id="profile-new-password"
                name="newPassword"
                type={showNew ? 'text' : 'password'}
                autoComplete="new-password"
                aria-describedby="profile-password-rules"
                required
                minLength={8}
                maxLength={128}
                value={newPassword}
                onChange={(event) => {
                  setPasswordError(null);
                  setNewPassword(event.target.value);
                }}
                className="mt-1.5 w-full min-h-11 rounded-xl border border-cream-300 bg-cream-100 px-4 py-2 text-base text-navy-900 focus:border-burgundy-600"
              />
              <PasswordRulesChecklist
                id="profile-password-rules"
                password={newPassword}
              />
            </div>

            <div>
              <div className="flex items-center justify-between gap-2">
                <label
                  htmlFor="profile-new-password-confirm"
                  className="block text-sm font-semibold text-navy-900"
                >
                  Yeni Şifre Tekrarı
                </label>
                <button
                  type="button"
                  aria-pressed={showConfirm}
                  onClick={() => setShowConfirm((prev) => !prev)}
                  className="text-xs font-semibold text-burgundy-600 hover:text-burgundy-700 cursor-pointer"
                >
                  {showConfirm ? 'Şifreyi Gizle' : 'Şifreyi Göster'}
                </button>
              </div>
              <input
                id="profile-new-password-confirm"
                name="newPasswordConfirm"
                type={showConfirm ? 'text' : 'password'}
                autoComplete="new-password"
                required
                minLength={8}
                maxLength={128}
                value={newPasswordConfirm}
                onChange={(event) => {
                  setPasswordError(null);
                  setNewPasswordConfirm(event.target.value);
                }}
                className="mt-1.5 w-full min-h-11 rounded-xl border border-cream-300 bg-cream-100 px-4 py-2 text-base text-navy-900 focus:border-burgundy-600"
              />
            </div>

            <button
              type="submit"
              disabled={savingPassword}
              className="inline-flex items-center justify-center min-h-11 rounded-xl bg-navy-900 hover:bg-navy-950 px-5 py-2.5 text-sm font-semibold text-cream-50 transition-colors duration-150 cursor-pointer disabled:opacity-60"
            >
              {savingPassword ? 'Güncelleniyor...' : 'Şifreyi Güncelle'}
            </button>
          </form>
        </section>
      </div>

      <section className="rounded-2xl bg-cream-50 border border-cream-300 p-5 sm:p-6 shadow-card flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-display font-bold text-lg text-navy-900">
            Oturum Yönetimi
          </h2>
          <p className="mt-1 text-xs sm:text-sm text-navy-600">
            Güvenliğiniz için yalnızca bu cihazdaki oturumu veya tüm aktif cihazlardaki oturumlarınızı kapatabilirsiniz.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={async () => {
              await logout();
              navigate('/login', { replace: true });
            }}
            className="inline-flex items-center justify-center min-h-11 rounded-xl border border-cream-300 bg-cream-100 hover:bg-cream-200 px-4 py-2 text-xs sm:text-sm font-semibold text-navy-900 cursor-pointer"
          >
            Oturumu Kapat
          </button>
          <button
            type="button"
            disabled={loggingOutAll}
            onClick={() => void handleLogoutAll()}
            className="inline-flex items-center justify-center min-h-11 rounded-xl border border-burgundy-500/40 bg-burgundy-50 hover:bg-burgundy-100 px-4 py-2 text-xs sm:text-sm font-semibold text-burgundy-700 cursor-pointer disabled:opacity-60"
          >
            {loggingOutAll ? 'Sonlandırılıyor...' : 'Tüm Cihazlardan Çıkış Yap'}
          </button>
        </div>
      </section>
    </motion.div>
  );
}
