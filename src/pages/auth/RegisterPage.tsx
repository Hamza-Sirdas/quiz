import { useEffect, useState, type FormEvent } from 'react';
import { motion } from 'motion/react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  evaluatePasswordRules,
  normalizeEmail,
  PASSWORD_POLICY_ERROR,
} from '@shared/authValidation';
import { PasswordRulesChecklist } from '@/components/auth/PasswordRulesChecklist';
import { QuizoraLogo } from '@/components/brand/QuizoraLogo';
import { AlertCircleIcon, ChevronLeftIcon } from '@/components/ui/Icons';
import { useAuth } from '@/context/AuthContext';
import { ApiError } from '@/services/quizApi';

function resolveSafeNext(raw: string | null): string {
  if (!raw) return '/dashboard';
  if (raw.startsWith('/') && !raw.startsWith('//')) return raw;
  return '/dashboard';
}

export function RegisterPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const nextPath = resolveSafeNext(searchParams.get('next'));
  const { teacher, register } = useAuth();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
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

    if (name.trim().length < 2) {
      setError('Ad soyad en az 2 karakter olmalıdır.');
      return;
    }

    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail || !normalizedEmail.includes('@')) {
      setError('Lütfen geçerli bir e-posta adresi girin.');
      return;
    }

    if (!evaluatePasswordRules(password).valid) {
      setError(PASSWORD_POLICY_ERROR);
      return;
    }

    if (password !== passwordConfirm) {
      setError('Girdiğiniz şifreler birbiriyle eşleşmiyor.');
      return;
    }

    if (!acceptedTerms) {
      setError('Devam etmek için kullanım koşullarını onaylamalısınız.');
      return;
    }

    setSubmitting(true);
    try {
      await register({
        name: name.trim(),
        email: normalizedEmail,
        password,
        passwordConfirm,
        acceptedTerms,
      });
      navigate(nextPath, { replace: true });
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Hesap oluşturulurken bir hata oluştu. Lütfen tekrar deneyin.',
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
              id="register-form-heading"
              className="font-display font-extrabold text-navy-900"
              style={{ fontSize: 'var(--text-h1)', lineHeight: 'var(--leading-h1)' }}
            >
              Öğretmen Kaydı
            </h1>
            <p className="mt-2 text-sm text-navy-600">
              Ücretsiz öğretmen hesabınızı oluşturun ve kendi quizlerinizi hazırlayın.
            </p>
          </div>

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
            aria-labelledby="register-form-heading"
            method="post"
            onSubmit={(event) => void handleSubmit(event)}
            noValidate
            className="mt-6 space-y-4"
          >
            <div>
              <label
                htmlFor="register-name"
                className="block text-sm font-semibold text-navy-900"
              >
                Ad Soyad
              </label>
              <input
                id="register-name"
                name="name"
                type="text"
                autoComplete="name"
                enterKeyHint="next"
                required
                minLength={2}
                maxLength={80}
                value={name}
                onChange={(event) => {
                  setError(null);
                  setName(event.target.value);
                }}
                placeholder="Örn. Ayşe Yılmaz"
                className="mt-1.5 w-full min-h-12 rounded-xl border border-cream-300 bg-cream-100 px-4 py-2.5 text-base text-navy-900 placeholder:text-navy-500 focus:border-burgundy-600"
              />
            </div>

            <div>
              <label
                htmlFor="register-email"
                className="block text-sm font-semibold text-navy-900"
              >
                E-posta Adresi
              </label>
              <input
                id="register-email"
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
                  htmlFor="register-password"
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
                id="register-password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                enterKeyHint="next"
                aria-describedby="register-password-rules"
                required
                minLength={8}
                maxLength={128}
                value={password}
                onChange={(event) => {
                  setError(null);
                  setPassword(event.target.value);
                }}
                placeholder="Güçlü bir şifre belirleyin"
                className="mt-1.5 w-full min-h-12 rounded-xl border border-cream-300 bg-cream-100 px-4 py-2.5 text-base text-navy-900 placeholder:text-navy-500 focus:border-burgundy-600"
              />
              <PasswordRulesChecklist
                id="register-password-rules"
                password={password}
              />
            </div>

            <div>
              <div className="flex items-center justify-between gap-2">
                <label
                  htmlFor="register-password-confirm"
                  className="block text-sm font-semibold text-navy-900"
                >
                  Şifre Tekrarı
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
                id="register-password-confirm"
                name="passwordConfirm"
                type={showConfirm ? 'text' : 'password'}
                autoComplete="new-password"
                enterKeyHint="done"
                required
                minLength={8}
                maxLength={128}
                value={passwordConfirm}
                onChange={(event) => {
                  setError(null);
                  setPasswordConfirm(event.target.value);
                }}
                placeholder="Şifrenizi yeniden yazın"
                className="mt-1.5 w-full min-h-12 rounded-xl border border-cream-300 bg-cream-100 px-4 py-2.5 text-base text-navy-900 placeholder:text-navy-500 focus:border-burgundy-600"
              />
            </div>

            <div className="rounded-xl bg-cream-100 border border-cream-300 p-3.5 space-y-2">
              <div className="flex items-start gap-2.5">
                <input
                  id="register-terms"
                  name="acceptedTerms"
                  type="checkbox"
                  checked={acceptedTerms}
                  onChange={(event) => {
                    setError(null);
                    setAcceptedTerms(event.target.checked);
                  }}
                  className="mt-1 h-4 w-4 shrink-0 accent-burgundy-600 cursor-pointer"
                />
                <label
                  htmlFor="register-terms"
                  className="text-xs sm:text-sm leading-relaxed text-navy-900 cursor-pointer select-none"
                >
                  QUIZORA öğretmen hesabı kullanım koşullarını okudum ve onaylıyorum.
                </label>
              </div>
              <p className="text-[11px] leading-relaxed text-navy-600 pl-6.5">
                Hesabınız yalnızca kendi quizlerinizi, canlı yarışmalarınızı ve oyun geçmişinizi yönetmek için kullanılır; parolanız geri döndürülemez biçimde Argon2id ile karma olarak saklanır.
              </p>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="mt-2 w-full min-h-12 rounded-xl bg-burgundy-600 hover:bg-burgundy-700 px-5 py-3 text-base font-semibold text-cream-50 transition-colors duration-150 cursor-pointer disabled:opacity-60"
            >
              {submitting ? 'Hesap Oluşturuluyor...' : 'Hesap Oluştur'}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-navy-600">
            Zaten hesabınız var mı?{' '}
            <Link
              to={`/login?next=${encodeURIComponent(nextPath)}`}
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
