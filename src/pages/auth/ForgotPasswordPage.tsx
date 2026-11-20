import { useEffect, useState, type FormEvent } from 'react';
import { motion } from 'motion/react';
import { Link } from 'react-router-dom';
import { normalizeEmail } from '@shared/authValidation';
import { QuizoraLogo } from '@/components/brand/QuizoraLogo';
import {
  AlertCircleIcon,
  CheckIcon,
  ChevronLeftIcon,
  InfoIcon,
} from '@/components/ui/Icons';
import {
  getPasswordResetStatus,
  requestPasswordReset,
} from '@/services/authApi';
import { ApiError } from '@/services/quizApi';

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [checkingService, setCheckingService] = useState(true);
  const [emailConfigured, setEmailConfigured] = useState<boolean | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getPasswordResetStatus()
      .then((res) => {
        if (active) setEmailConfigured(res.emailDeliveryConfigured);
      })
      .catch(() => {
        if (active) setEmailConfigured(null);
      })
      .finally(() => {
        if (active) setCheckingService(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSuccessMessage(null);

    const normalized = normalizeEmail(email);
    if (!normalized || !normalized.includes('@')) {
      setError('Lütfen geçerli bir e-posta adresi girin.');
      return;
    }

    setSubmitting(true);
    try {
      const result = await requestPasswordReset(normalized);
      setSuccessMessage(result.message);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Şifre sıfırlama isteği gönderilirken bir hata oluştu.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-dvh flex flex-col bg-powder-300 text-navy-900 overflow-x-clip">
      <header className="px-4 sm:px-8 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-4">
          <Link to="/" className="rounded-lg">
            <QuizoraLogo size="md" />
          </Link>
          <Link
            to="/login"
            className="inline-flex items-center gap-1.5 rounded-xl border border-navy-900/20 bg-cream-50/75 hover:bg-cream-50 px-3.5 py-2 text-xs sm:text-sm font-semibold text-navy-900"
          >
            <ChevronLeftIcon />
            <span>Giriş Ekranı</span>
          </Link>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-3 sm:px-4 py-6 sm:py-8">
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          className="w-full max-w-md rounded-3xl bg-cream-50 border border-cream-300 p-5 sm:p-8 shadow-card"
        >
          <div className="text-center">
            <h1
              id="forgot-password-heading"
              className="font-display font-extrabold text-navy-900"
              style={{ fontSize: 'var(--text-h1)', lineHeight: 'var(--leading-h1)' }}
            >
              Şifremi Unuttum
            </h1>
            <p className="mt-2 text-sm text-navy-600">
              Kayıtlı e-posta adresinizi girin; tek kullanımlık sıfırlama bağlantısı gönderelim.
            </p>
          </div>

          {!checkingService && emailConfigured === false && (
            <div
              role="status"
              className="mt-5 rounded-xl bg-powder-100 border border-powder-400 px-4 py-3 flex items-start gap-2.5 text-xs sm:text-sm text-navy-800"
            >
              <InfoIcon className="h-4 w-4 mt-0.5 shrink-0 text-burgundy-600" />
              <span>
                Sunucuda e-posta gönderim servisi (
                <code className="rounded bg-cream-50 px-1 py-0.5 font-mono text-[11px] font-semibold text-navy-900">
                  RESEND_API_KEY
                </code>{' '}
                ve{' '}
                <code className="rounded bg-cream-50 px-1 py-0.5 font-mono text-[11px] font-semibold text-navy-900">
                  EMAIL_FROM
                </code>
                ) henüz yapılandırılmadığı için şifre sıfırlama e-postası gönderimi devre dışıdır.
              </span>
            </div>
          )}

          {error && (
            <div
              role="alert"
              className="mt-5 rounded-xl bg-burgundy-50 border border-burgundy-500 px-4 py-3 flex items-start gap-2.5 text-xs sm:text-sm font-medium text-burgundy-800"
            >
              <AlertCircleIcon className="h-4 w-4 mt-0.5 shrink-0 text-burgundy-600" />
              <span>{error}</span>
            </div>
          )}

          {successMessage && (
            <div
              role="status"
              className="mt-5 rounded-xl bg-powder-100 border border-burgundy-600 px-4 py-3 flex items-start gap-2.5 text-xs sm:text-sm font-medium text-navy-900"
            >
              <CheckIcon className="h-4 w-4 mt-0.5 shrink-0 text-burgundy-600" />
              <span>{successMessage}</span>
            </div>
          )}

          <form
            aria-labelledby="forgot-password-heading"
            method="post"
            onSubmit={(event) => void handleSubmit(event)}
            noValidate
            className="mt-6 space-y-4"
          >
            <div>
              <label
                htmlFor="forgot-email"
                className="block text-sm font-semibold text-navy-900"
              >
                E-posta Adresi
              </label>
              <input
                id="forgot-email"
                name="email"
                type="email"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                enterKeyHint="done"
                required
                value={email}
                onChange={(event) => {
                  setError(null);
                  setEmail(event.target.value);
                }}
                placeholder="ogretmen@okul.edu.tr"
                className="mt-1.5 w-full min-h-12 rounded-xl border border-cream-300 bg-cream-100 px-4 py-2.5 text-base text-navy-900 placeholder:text-navy-500 focus:border-burgundy-600"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full min-h-12 rounded-xl bg-burgundy-600 hover:bg-burgundy-700 px-5 py-3 text-base font-semibold text-cream-50 transition-colors duration-150 cursor-pointer disabled:opacity-60"
            >
              {submitting ? 'Gönderiliyor...' : 'Sıfırlama Bağlantısı Gönder'}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-navy-600">
            Şifrenizi hatırladınız mı?{' '}
            <Link
              to="/login"
              className="font-semibold text-burgundy-600 hover:text-burgundy-700"
            >
              Oturum Aç
            </Link>
          </p>
        </motion.section>
      </main>
    </div>
  );
}
