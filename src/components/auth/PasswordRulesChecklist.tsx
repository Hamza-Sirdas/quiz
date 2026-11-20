import { evaluatePasswordRules } from '@shared/authValidation';
import { CheckIcon } from '@/components/ui/Icons';
import { cn } from '@/utils/cn';

interface PasswordRulesChecklistProps {
  id: string;
  password: string;
}

export function PasswordRulesChecklist({
  id,
  password,
}: PasswordRulesChecklistProps) {
  const status = evaluatePasswordRules(password);
  const touched = password.length > 0;

  const rules = [
    { key: 'len', label: 'En az 8 karakter', ok: status.minLength },
    { key: 'upper', label: 'En az bir büyük harf (A–Z / İ, Ğ, Ü...)', ok: status.hasUppercase },
    { key: 'lower', label: 'En az bir küçük harf (a–z / ı, ğ, ü...)', ok: status.hasLowercase },
    { key: 'digit', label: 'En az bir rakam (0–9)', ok: status.hasDigit },
  ] as const;

  return (
    <div
      id={id}
      className="mt-2 rounded-xl bg-cream-100 border border-cream-300 px-3.5 py-2.5"
    >
      <p className="text-[11px] font-semibold uppercase tracking-wide text-navy-600">
        Şifre Gereksinimleri
      </p>
      <ul className="mt-1.5 space-y-1 text-xs">
        {rules.map((rule) => (
          <li
            key={rule.key}
            className={cn(
              'flex items-center gap-2',
              rule.ok
                ? 'text-navy-900 font-semibold'
                : touched
                  ? 'text-burgundy-700'
                  : 'text-navy-600',
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                'inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[10px]',
                rule.ok
                  ? 'bg-burgundy-600 border-burgundy-600 text-cream-50'
                  : 'border-cream-300 bg-cream-50 text-navy-500',
              )}
            >
              {rule.ok ? <CheckIcon className="h-3 w-3" /> : '·'}
            </span>
            <span>{rule.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
