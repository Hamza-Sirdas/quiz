import { useEffect, useState, type FormEvent } from 'react';
import { motion } from 'motion/react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { QuizoraLogo } from '@/components/brand/QuizoraLogo';
import { AlertCircleIcon, CheckIcon, ChevronLeftIcon } from '@/components/ui/Icons';
import { useAuth } from '@/context/AuthContext';
import { ApiError } from '@/services/quizApi';

function resolveSafeNext(raw: string | null): string {
  if (!raw) return '/dashboard';
  if (raw.startsWith('/') && !raw.startsWith('//')) return raw;
  return '/dashboard';
}

export function LoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const nextPath = resolveSafeNext(searchParams.get('next'));
  const reason = searchParams.get('reason');
  const resetSuccess = searchParams.get('reset') === 'success';
  const { teacher, login } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (teacher) {
      navigate(nextPath, { replace: true });
    }
  }, [teacher, navigate, nextPath]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (!email.trim() || !password) {
      setError('Lütfen e-posta adresinizi ve şifrenizi girin.');
      return;
    }

    setSubmitting(true);
    try {
      await login(email.trim(), password);
      navigate(nextPath, { replace: true });
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Oturum açılırken bir hata oluştu. Lütfen tekrar deneyin.',
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
            to="/"
            className="inline-flex items-center gap-1.5 rounded-xl border border-navy-900/20 bg-cream-50/75 hover:bg-cream-50 px-3.5 py-2 text-xs sm:text-sm font-semibold text-navy-900"
          >
            <ChevronLeftIcon />
            <span>Ana Sayfa</span>
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
              id="login-form-heading"
              className="font-display font-extrabold text-navy-900"
              style={{ fontSize: 'var(--text-h1)', lineHeight: 'var(--leading-h1)' }}
            >
              Öğretmen Girişi
            </h1>
            <p className="mt-2 text-sm text-navy-600">
              Quizlerinizi yönetmek ve canlı yarışma başlatmak için oturum açın.
            </p>
          </div>

          {reason === 'expired' && !error && (
            <div
              role="status"
              className="mt-5 rounded-xl bg-powder-100 border border-powder-400 px-4 py-3 text-xs sm:text-sm font-medium text-navy-900"
            >
              Oturumunuzun süresi doldu veya geçersiz kılındı. Devam etmek için lütfen yeniden oturum açın.
            </div>
          )}

          {resetSuccess && !error && (
            <div
              role="status"
              className="mt-5 rounded-xl bg-powder-100 border border-burgundy-600 px-4 py-3 flex items-start gap-2.5 text-xs sm:text-sm font-medium text-navy-900"
            >
              <CheckIcon className="h-4 w-4 mt-0.5 shrink-0 text-burgundy-600" />
              <span>Şifreniz başarıyla güncellendi. Yeni şifrenizle oturum açabilirsiniz.</span>
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

          <form
            aria-labelledby="login-form-heading"
            method="post"
            onSubmit={(event) => void handleSubmit(event)}
            noValidate
            className="mt-6 space-y-4"
          >
            <div>
              <label
                htmlFor="login-email"
                className="block text-sm font-semibold text-navy-900"
              >
                E-posta Adresi
              </label>
              <input
                id="login-email"
                name="email"
                type="email"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                enterKeyHint="next"
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

            <div>
              <div className="flex items-center justify-between gap-2">
                <label
                  htmlFor="login-password"
                  className="block text-sm font-semibold text-navy-900"
                >
                  Şifre
                </label>
                <button
                  type="button"
                  aria-pressed={showPassword}
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="text-xs font-semibold text-burgundy-600 hover:text-burgundy-700 cursor-pointer"
                >
                  {showPassword ? 'Şifreyi Gizle' : 'Şifreyi Göster'}
                </button>
              </div>
              <input
                id="login-password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                enterKeyHint="done"
                required
                value={password}
                onChange={(event) => {
                  setError(null);
                  setPassword(event.target.value);
                }}
                placeholder="Şifrenizi girin"
                className="mt-1.5 w-full min-h-12 rounded-xl border border-cream-300 bg-cream-100 px-4 py-2.5 text-base text-navy-900 placeholder:text-navy-500 focus:border-burgundy-600"
              />
              <div className="mt-2 flex justify-end">
                <Link
                  to="/forgot-password"
                  className="text-xs font-semibold text-burgundy-600 hover:text-burgundy-700"
                >
                  Şifremi Unuttum
                </Link>
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="mt-2 w-full min-h-12 rounded-xl bg-burgundy-600 hover:bg-burgundy-700 px-5 py-3 text-base font-semibold text-cream-50 transition-colors duration-150 cursor-pointer disabled:opacity-60"
            >
              {submitting ? 'Oturum Açılıyor...' : 'Oturum Aç'}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-navy-600">
            Henüz hesabınız yok mu?{' '}
            <Link
              to={`/register?next=${encodeURIComponent(nextPath)}`}
              className="font-semibold text-burgundy-600 hover:text-burgundy-700"
            >
              Hesap Oluştur
            </Link>
          </p>
        </motion.section>
      </main>
    </div>
  );
}
