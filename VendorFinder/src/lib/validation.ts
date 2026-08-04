// src/lib/validation.ts
// Small, dependency-free validators used by auth + profile forms. Kept
// framework-agnostic so they can be unit-tested and reused server-side.

export interface ValidationResult {
  valid: boolean;
  message?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateEmail(email: string): ValidationResult {
  const value = email.trim();
  if (!value) return { valid: false, message: 'Email is required' };
  if (!EMAIL_RE.test(value)) return { valid: false, message: 'Enter a valid email address' };
  return { valid: true };
}

export interface PasswordPolicy {
  minLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireNumber: boolean;
  requireSymbol: boolean;
}

export const DEFAULT_PASSWORD_POLICY: PasswordPolicy = {
  minLength: 8,
  requireUppercase: true,
  requireLowercase: true,
  requireNumber: true,
  requireSymbol: false,
};

export function validatePassword(
  password: string,
  policy: PasswordPolicy = DEFAULT_PASSWORD_POLICY,
): ValidationResult {
  if (password.length < policy.minLength) {
    return { valid: false, message: `Password must be at least ${policy.minLength} characters` };
  }
  if (policy.requireUppercase && !/[A-Z]/.test(password)) {
    return { valid: false, message: 'Password must include an uppercase letter' };
  }
  if (policy.requireLowercase && !/[a-z]/.test(password)) {
    return { valid: false, message: 'Password must include a lowercase letter' };
  }
  if (policy.requireNumber && !/[0-9]/.test(password)) {
    return { valid: false, message: 'Password must include a number' };
  }
  if (policy.requireSymbol && !/[^A-Za-z0-9]/.test(password)) {
    return { valid: false, message: 'Password must include a symbol' };
  }
  return { valid: true };
}

export type PasswordStrength = 'weak' | 'fair' | 'good' | 'strong';

/** Heuristic 0–4 strength score, for the strength meter UI. */
export function scorePasswordStrength(password: string): {
  score: 0 | 1 | 2 | 3 | 4;
  label: PasswordStrength;
} {
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;
  const clamped = Math.min(score, 4) as 0 | 1 | 2 | 3 | 4;
  const label: PasswordStrength =
    clamped <= 1 ? 'weak' : clamped === 2 ? 'fair' : clamped === 3 ? 'good' : 'strong';
  return { score: clamped, label };
}

export function validateDisplayName(name: string): ValidationResult {
  const value = name.trim();
  if (value.length < 2) return { valid: false, message: 'Name must be at least 2 characters' };
  if (value.length > 60) return { valid: false, message: 'Name is too long' };
  return { valid: true };
}
