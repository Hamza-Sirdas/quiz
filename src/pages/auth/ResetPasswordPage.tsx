import { useEffect, useState, type FormEvent } from 'react';
import { motion } from 'motion/react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  evaluatePasswordRules,
  PASSWORD_POLICY_ERROR,
} from '@shared/authValidation';
import { PasswordRulesChecklist } from '@/components/auth/PasswordRulesChecklist';
import { QuizoraLogo } from '@/components/brand/QuizoraLogo';
import { AlertCircleIcon, ChevronLeftIcon } from '@/components/ui/Icons';
import {
  resetPassword,
  verifyPasswordResetToken,
} from '@/services/authApi';
import { ApiError } from '@/services/quizApi';

export function ResetPasswordPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [token] = useState<string>(() => searchParams.get('token')?.trim() ?? '');
  const [verifying, setVerifying] = useState(true);
  const [tokenValid, setTokenValid] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);

  const [newPassword, setNewPassword] = useState('');
  const [newPasswordConfirm, setNewPasswordConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.search) {
      window.history.replaceState({}, '', '/reset-password');
    }

    if (!token) {
      setTokenValid(false);
      setVerifyError(null);
      setVerifying(false);
      return;
    }

    let active = true;
    setVerifyError(null);
    verifyPasswordResetToken(token)
      .then((res) => {
        if (active) setTokenValid(res.valid);
      })
      .catch((err) => {
        if (active) {
          setTokenValid(false);
          if (err instanceof ApiError && err.status >= 429) {
            setVerifyError(err.message);
          }
        }
      })
      .finally(() => {
        if (active) setVerifying(false);
      });

    return () => {
      active = false;
    };
  }, [token]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (!evaluatePasswordRules(newPassword).valid) {
      setError(PASSWORD_POLICY_ERROR);
      return;
    }

    if (newPassword !== newPasswordConfirm) {
      setError('Girdiğiniz yeni şifreler birbiriyle eşleşmiyor.');
      return;
    }

    setSubmitting(true);
    try {
      await resetPassword({
        token,
        newPassword,
        newPasswordConfirm,
      });
      navigate('/login?reset=success', { replace: true });
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Şifre sıfırlanırken bir hata oluştu.',
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
              id="reset-password-heading"
              className="font-display font-extrabold text-navy-900"
              style={{ fontSize: 'var(--text-h1)', lineHeight: 'var(--leading-h1)' }}
            >
              Yeni Şifre Belirle
            </h1>
            <p className="mt-2 text-sm text-navy-600">
              Hesabınız için güçlü ve yeni bir şifre oluşturun.
            </p>
          </div>

          {verifying ? (
            <p className="mt-6 text-center text-sm font-medium text-navy-600">
              Sıfırlama bağlantısı doğrulanıyor...
            </p>
          ) : !tokenValid ? (
            <div className="mt-6 space-y-5 text-center">
              <div
                role="alert"
                className="rounded-xl bg-burgundy-50 border border-burgundy-500 px-4 py-3 flex items-start gap-2.5 text-start text-xs sm:text-sm font-medium text-burgundy-800"
              >
                <AlertCircleIcon className="h-4 w-4 mt-0.5 shrink-0 text-burgundy-600" />
                <span>
                  {verifyError ??
                    'Bu şifre sıfırlama bağlantısı geçersiz, daha önce kullanılmış veya süresi dolmuş.'}
                </span>
              </div>
              <Link
                to="/forgot-password"
                className="inline-flex w-full items-center justify-center min-h-12 rounded-xl bg-burgundy-600 hover:bg-burgundy-700 px-5 py-3 text-sm font-semibold text-cream-50"
              >
                Yeni Sıfırlama Bağlantısı İste
              </Link>
            </div>
          ) : (
            <>
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
                aria-labelledby="reset-password-heading"
                method="post"
                onSubmit={(event) => void handleSubmit(event)}
                noValidate
                className="mt-6 space-y-4"
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <label
                      htmlFor="reset-password"
                      className="block text-sm font-semibold text-navy-900"
                    >
                      Yeni Şifre
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
                    id="reset-password"
                    name="newPassword"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    enterKeyHint="next"
                    aria-describedby="reset-password-rules"
                    required
                    minLength={8}
                    maxLength={128}
                    value={newPassword}
                    onChange={(event) => {
                      setError(null);
                      setNewPassword(event.target.value);
                    }}
                    placeholder="Yeni şifrenizi girin"
                    className="mt-1.5 w-full min-h-12 rounded-xl border border-cream-300 bg-cream-100 px-4 py-2.5 text-base text-navy-900 placeholder:text-navy-500 focus:border-burgundy-600"
                  />
                  <PasswordRulesChecklist
                    id="reset-password-rules"
                    password={newPassword}
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between gap-2">
                    <label
                      htmlFor="reset-password-confirm"
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
                    id="reset-password-confirm"
                    name="newPasswordConfirm"
                    type={showConfirm ? 'text' : 'password'}
                    autoComplete="new-password"
                    enterKeyHint="done"
                    required
                    minLength={8}
                    maxLength={128}
                    value={newPasswordConfirm}
                    onChange={(event) => {
                      setError(null);
                      setNewPasswordConfirm(event.target.value);
                    }}
                    placeholder="Yeni şifrenizi tekrar yazın"
                    className="mt-1.5 w-full min-h-12 rounded-xl border border-cream-300 bg-cream-100 px-4 py-2.5 text-base text-navy-900 placeholder:text-navy-500 focus:border-burgundy-600"
                  />
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full min-h-12 rounded-xl bg-burgundy-600 hover:bg-burgundy-700 px-5 py-3 text-base font-semibold text-cream-50 transition-colors duration-150 cursor-pointer disabled:opacity-60"
                >
                  {submitting ? 'Şifre Güncelleniyor...' : 'Şifreyi Sıfırla'}
                </button>
              </form>
            </>
          )}
        </motion.section>
      </main>
    </div>
  );
}
