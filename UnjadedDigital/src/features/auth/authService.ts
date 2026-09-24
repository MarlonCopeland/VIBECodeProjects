// src/features/auth/authService.ts
// Thin, validated wrapper over the backend auth API. Screens/contexts call
// these functions rather than the backend directly, so validation and error
// normalization live in one place.

import { backend } from '../../backend';
import type {
  EmailOtpKind,
  OAuthProvider,
  Session,
  SignInInput,
  SignUpInput,
  SignUpResult,
} from '../../backend/types';
import { validateEmail, validatePassword } from '../../lib/validation';

export async function loadSession(): Promise<Session | null> {
  return backend.auth.getSession();
}

export function onAuthStateChange(cb: (s: Session | null) => void) {
  return backend.auth.onAuthStateChange(cb);
}

export async function refreshSession(): Promise<Session | null> {
  return backend.auth.refreshSession();
}

export async function signUp(input: SignUpInput): Promise<SignUpResult> {
  const email = validateEmail(input.email);
  if (!email.valid) throw new Error(email.message);
  const pw = validatePassword(input.password);
  if (!pw.valid) throw new Error(pw.message);
  return backend.auth.signUpWithEmail(input);
}

export async function signIn(input: SignInInput): Promise<Session> {
  const email = validateEmail(input.email);
  if (!email.valid) throw new Error(email.message);
  if (!input.password) throw new Error('Password is required');
  return backend.auth.signInWithEmail(input);
}

export async function signInWithProvider(provider: OAuthProvider): Promise<Session | null> {
  return backend.auth.signInWithProvider(provider);
}

export async function signInWithMagicLink(email: string): Promise<void> {
  const check = validateEmail(email);
  if (!check.valid) throw new Error(check.message);
  return backend.auth.signInWithMagicLink(email);
}

export async function sendPasswordReset(email: string): Promise<void> {
  const check = validateEmail(email);
  if (!check.valid) throw new Error(check.message);
  return backend.auth.sendPasswordReset(email);
}

export async function updatePassword(newPassword: string): Promise<void> {
  const pw = validatePassword(newPassword);
  if (!pw.valid) throw new Error(pw.message);
  return backend.auth.updatePassword(newPassword);
}

export async function verifyEmailOtp(
  email: string,
  token: string,
  kind: EmailOtpKind,
): Promise<Session> {
  const check = validateEmail(email);
  if (!check.valid) throw new Error(check.message);
  const code = token.replace(/[^0-9A-Za-z]/g, '');
  if (code.length < 6) throw new Error('That code looks too short — check your email.');
  return backend.auth.verifyEmailOtp(email, code, kind);
}

export async function redeemAuthLink(url: string): Promise<Session | null> {
  return backend.auth.redeemAuthLink(url);
}

export async function resendVerification(email: string): Promise<void> {
  return backend.auth.resendVerification(email);
}

export async function signOut(): Promise<void> {
  return backend.auth.signOut();
}
