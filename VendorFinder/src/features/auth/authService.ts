// src/features/auth/authService.ts
// Thin, validated wrapper over the backend auth API. Screens/contexts call
// these functions rather than the backend directly, so validation, error
// normalization, and vendor-record wiring live in one place.

import { backend } from '../../backend';
import type {
  AppUser,
  OAuthProvider,
  Session,
  SignInInput,
  SignUpInput,
  SignUpResult,
  UserRole,
  VendorType,
} from '../../backend/types';
import { validateEmail, validatePassword } from '../../lib/validation';

/** Extra info collected when signing up (or upgrading) as a vendor. */
export interface VendorInfo {
  name: string;
  type?: VendorType;
}

export interface SignUpParams extends SignUpInput {
  /** Present when creating a vendor account. */
  vendorInfo?: VendorInfo;
}

export async function loadSession(): Promise<Session | null> {
  return backend.auth.getSession();
}

export function onAuthStateChange(cb: (s: Session | null) => void) {
  return backend.auth.onAuthStateChange(cb);
}

export async function refreshSession(): Promise<Session | null> {
  return backend.auth.refreshSession();
}

export async function signUp(params: SignUpParams): Promise<SignUpResult> {
  const email = validateEmail(params.email);
  if (!email.valid) throw new Error(email.message);
  const pw = validatePassword(params.password);
  if (!pw.valid) throw new Error(pw.message);
  return backend.auth.signUpWithEmail({
    email: params.email,
    password: params.password,
    displayName: params.displayName,
    username: params.username,
    role: params.role,
  });
}

export async function signIn(input: SignInInput): Promise<Session> {
  const identifier = input.email?.trim();
  if (!identifier) throw new Error('Email or username is required');
  // Only enforce email format when it looks like an email — the local demo
  // backend also accepts a username (e.g. the seeded `admin` account).
  if (identifier.includes('@')) {
    const email = validateEmail(identifier);
    if (!email.valid) throw new Error(email.message);
  }
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

export async function resendVerification(email: string): Promise<void> {
  return backend.auth.resendVerification(email);
}

export async function confirmVerification(code: string): Promise<Session | null> {
  return backend.auth.confirmVerification(code);
}

export async function signOut(): Promise<void> {
  return backend.auth.signOut();
}

// ---- Vendor wiring ---------------------------------------------------------

/**
 * Ensure a vendor-role user has a linked vendor record. Idempotent — safe to
 * call after sign-up AND after email verification (covers Supabase's deferred-
 * session case where the profile isn't writable until the email is confirmed).
 */
export async function ensureVendorRecord(userId: string, vendorInfo?: VendorInfo): Promise<AppUser> {
  const user = await backend.users.get(userId);
  if (!user) throw new Error('User not found');
  if (user.role !== 'vendor' || user.vendorId) return user;
  const vendor = await backend.vendors.register({
    name: vendorInfo?.name || `${user.displayName}'s Stand`,
    type: vendorInfo?.type,
    ownerId: userId,
  });
  return backend.users.update(userId, { vendorId: vendor.id });
}

/** Promote a plain user to a vendor, creating the paired vendor record. */
export async function upgradeToVendor(userId: string, vendorInfo: VendorInfo): Promise<AppUser> {
  const user = await backend.users.get(userId);
  if (!user) throw new Error('User not found');
  let vendorId = user.vendorId ?? null;
  if (!vendorId) {
    const vendor = await backend.vendors.register({
      name: vendorInfo.name || `${user.displayName}'s Stand`,
      type: vendorInfo.type,
      ownerId: userId,
    });
    vendorId = vendor.id;
  }
  return backend.users.update(userId, { role: 'vendor' as UserRole, vendorId });
}
