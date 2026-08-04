// src/services/authService.js
//
// Thin auth router. Delegates to the configured backend's `auth` object so the
// app works identically against the local (demo) backend and Supabase.
//
//   - Email/username + password
//   - Google / Facebook OAuth (real on Supabase, deterministic demo on local)
//
// Roles: 'admin' | 'vendor' | 'user'

import * as backend from './backend';

// --- session -------------------------------------------------------------
export async function loadSession() {
  return backend.auth.getSession();
}

export function onAuthStateChange(cb) {
  return backend.auth.onAuthStateChange(cb);
}

// --- email verification --------------------------------------------------
export async function refreshSession() {
  return backend.auth.refreshSession();
}

export async function resendVerification() {
  return backend.auth.resendVerification();
}

// Only present on the local/demo backend (code-based confirm). Supabase
// confirms via the email link.
export async function confirmVerification(code) {
  if (typeof backend.auth.confirmVerification !== 'function') {
    throw new Error('Please confirm using the link sent to your email.');
  }
  return backend.auth.confirmVerification(code);
}

// --- sign up -------------------------------------------------------------
/**
 * @param {object} input { username?, email, password, displayName, role,
 *                         vendorName?, vendorType? }
 */
export async function signUp(input) {
  if (!input.password || input.password.length < 6) {
    throw new Error('Password must be at least 6 characters');
  }
  const role = input.role === 'vendor' ? 'vendor' : 'user';
  const username = (input.username || input.email || '').trim().toLowerCase();

  const user = await backend.auth.signUpWithEmail({
    email: input.email,
    password: input.password,
    username,
    displayName: input.displayName || username,
    role,
  });

  // Vendors get a paired vendor record so they can post immediately.
  // NOTE: with email confirmation enabled on Supabase, sign-up returns no
  // active session yet, so RLS-guarded inserts may not be possible until the
  // user verifies and signs in. We attempt creation but never block sign-up on
  // it; ensureVendorRecord() (called after verification) backfills it.
  if (role === 'vendor' && user?.id) {
    try {
      const vendor = await backend.registerVendor({
        name: input.vendorName || input.displayName || username,
        type: input.vendorType || 'Other',
        description: '',
        ownerId: user.id,
        tags: [],
        isOpen: false,
        schedule: [],
        currentLocation: null,
      });
      await backend.updateUser(user.id, { vendorId: vendor.id });
      user.vendorId = vendor.id;
    } catch (e) {
      console.warn('deferred vendor record creation (will backfill after verify):', e.message);
    }
  }

  return user;
}

/**
 * Ensure a vendor-role user has a paired vendor record. Safe to call any time;
 * used to backfill records that couldn't be created at sign-up (e.g. when email
 * confirmation delayed the first authenticated session).
 */
export async function ensureVendorRecord(userId) {
  const user = await backend.getUser(userId);
  if (!user || user.role !== 'vendor') return null;
  const existing = await backend.getVendorByOwner(userId);
  if (existing) {
    if (!user.vendorId) await backend.updateUser(userId, { vendorId: existing.id });
    return existing;
  }
  const vendor = await backend.registerVendor({
    name: user.displayName || user.username,
    type: 'Other',
    description: '',
    ownerId: user.id,
    tags: [],
    isOpen: false,
    schedule: [],
    currentLocation: null,
  });
  await backend.updateUser(userId, { vendorId: vendor.id });
  return vendor;
}

// --- sign in -------------------------------------------------------------
export async function signIn({ username, email, password }) {
  return backend.auth.signInWithEmail({ username, email, password });
}

export async function signInWithProvider(provider) {
  if (!['google', 'facebook'].includes(provider)) {
    throw new Error(`Unsupported provider: ${provider}`);
  }
  return backend.auth.signInWithProvider(provider);
}

// --- vendor upgrade ------------------------------------------------------
export async function upgradeToVendor(userId, vendorInfo) {
  const user = await backend.getUser(userId);
  if (!user) throw new Error('User not found');
  if (user.role === 'vendor') return user;

  const vendor = await backend.registerVendor({
    name: vendorInfo.name || user.displayName,
    type: vendorInfo.type || 'Other',
    description: vendorInfo.description || '',
    ownerId: user.id,
    tags: vendorInfo.tags || [],
    isOpen: false,
    schedule: [],
    currentLocation: null,
  });
  return backend.updateUser(user.id, { role: 'vendor', vendorId: vendor.id });
}

export async function signOut() {
  await backend.auth.signOut();
}
