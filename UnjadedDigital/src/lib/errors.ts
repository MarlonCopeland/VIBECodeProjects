// src/lib/errors.ts
// Normalizes errors from any backend into a user-safe message. Keeps raw
// technical strings (and Supabase auth codes) out of the UI while preserving
// enough signal for callers to branch on.

export interface AppError {
  message: string;
  code?: string;
}

/** Map known Supabase / network errors to friendly copy. */
export function toAppError(err: unknown): AppError {
  if (err == null) return { message: 'Something went wrong. Please try again.' };

  const raw =
    typeof err === 'string'
      ? err
      : err instanceof Error
        ? err.message
        : (err as { message?: string }).message ?? 'Unexpected error';

  const code = (err as { code?: string })?.code;
  const lower = raw.toLowerCase();

  if (lower.includes('invalid login credentials')) {
    return { message: 'Incorrect email or password.', code: 'invalid_credentials' };
  }
  if (lower.includes('email not confirmed')) {
    return { message: 'Please verify your email before signing in.', code: 'email_unconfirmed' };
  }
  if (lower.includes('user already registered')) {
    return { message: 'An account with this email already exists.', code: 'user_exists' };
  }
  if (lower.includes('network') || lower.includes('fetch')) {
    return { message: 'Network error. Check your connection and try again.', code: 'network' };
  }
  if (lower.includes('rate limit')) {
    return { message: 'Too many attempts. Please wait a moment and try again.', code: 'rate_limit' };
  }

  return { message: raw, code };
}
