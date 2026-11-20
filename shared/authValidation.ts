export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

export const PASSWORD_POLICY_ERROR =
  'Şifre en az 8 karakter olmalı; en az bir büyük harf, bir küçük harf ve bir rakam içermelidir.';

export interface PasswordRuleStatus {
  minLength: boolean;
  hasUppercase: boolean;
  hasLowercase: boolean;
  hasDigit: boolean;
  valid: boolean;
}

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export function evaluatePasswordRules(password: string): PasswordRuleStatus {
  const minLength =
    password.length >= PASSWORD_MIN_LENGTH &&
    password.length <= PASSWORD_MAX_LENGTH;
  const hasUppercase = /\p{Lu}/u.test(password);
  const hasLowercase = /\p{Ll}/u.test(password);
  const hasDigit = /\d/.test(password);

  return {
    minLength,
    hasUppercase,
    hasLowercase,
    hasDigit,
    valid: minLength && hasUppercase && hasLowercase && hasDigit,
  };
}
