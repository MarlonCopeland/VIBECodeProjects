// src/services/authService.js
//
// Local-first authentication. Designed to be drop-in replaceable by a real
// provider (Firebase Auth, Auth0, Clerk, WorkOS) by changing the backend
// implementations behind the screens.
//
// Supports:
//   - Username + password (local, hashed)
//   - Google / Facebook OAuth (stubbed; ready for expo-auth-session)
//
// Roles: 'admin' | 'vendor' | 'user'

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as backend from './backend';

const SESSION_KEY = 'vf.session';
const SALT = 'vendor-finder-demo-salt';

// --- password hashing (demo) ---------------------------------------------
// djb2. DO NOT use this for production. Replace with backend-side bcrypt/argon2.
export function hashPassword(plain) {
  let h = 5381;
  const s = SALT + (plain || '');
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  }
  return `djb2$${(h >>> 0).toString(16)}`;
}

export function verifyPassword(plain, stored) {
  return hashPassword(plain) === stored;
}

// --- session persistence -------------------------------------------------
export async function loadSession() {
  const raw = await AsyncStorage.getItem(SESSION_KEY);
  return raw ? JSON.parse(raw) : null;
}

export async function saveSession(session) {
  await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export async function clearSession() {
  await AsyncStorage.removeItem(SESSION_KEY);
}

// --- core auth API -------------------------------------------------------

/**
 * Sign up a new account.
 * @param {object} input { username, email, password, displayName, role, vendorName?, vendorType? }
 */
export async function signUp(input) {
  const username = (input.username || '').trim().toLowerCase();
  if (!username) throw new Error('Username is required');
  if (!input.password || input.password.length < 6) {
    throw new Error('Password must be at least 6 characters');
  }
  const role = input.role === 'vendor' ? 'vendor' : 'user';

  const existing = await backend.getUserByUsername(username);
  if (existing) throw new Error('Username is already taken');

  const user = await backend.createUser({
    username,
    email: input.email || '',
    passwordHash: hashPassword(input.password),
    displayName: input.displayName || input.username,
    role,
    provider: 'local',
    interests: [],
  });

  // Vendors get a paired vendor record so they can start posting immediately.
  if (role === 'vendor') {
    const vendor = await backend.registerVendor({
      name: input.vendorName || input.displayName || input.username,
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
  }

  const session = { userId: user.id };
  await saveSession(session);
  return user;
}

/**
 * Sign in with username + password.
 */
export async function signIn({ username, password }) {
  const u = (username || '').trim().toLowerCase();
  const user = await backend.getUserByUsername(u);
  if (!user || !verifyPassword(password, user.passwordHash)) {
    throw new Error('Invalid username or password');
  }
  await saveSession({ userId: user.id });
  return user;
}

/**
 * OAuth sign-in. Replace the demo stub with a real flow:
 *
 *   import * as Google from 'expo-auth-session/providers/google';
 *   const [request, response, promptAsync] = Google.useAuthRequest({ clientId: '...' });
 *   // on success: response.authentication.accessToken -> fetch userinfo -> call this.
 *
 * For now, a local demo: creates/reuses a deterministic account per provider.
 */
export async function signInWithProvider(provider) {
  if (!['google', 'facebook'].includes(provider)) {
    throw new Error(`Unsupported provider: ${provider}`);
  }
  const providerId = `${provider}-demo-id`;
  const existing = await backend.getUserByProvider(provider, providerId);
  let user = existing;
  if (!user) {
    user = await backend.createUser({
      username: `${provider}_demo`,
      email: `demo@${provider}.example`,
      passwordHash: '',
      displayName: provider === 'google' ? 'Google Demo User' : 'Facebook Demo User',
      role: 'user',
      provider,
      providerId,
      interests: [],
    });
  }
  await saveSession({ userId: user.id });
  return user;
}

/**
 * Promote a user account to vendor. Creates the vendor record if missing.
 */
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
  const updated = await backend.updateUser(user.id, {
    role: 'vendor',
    vendorId: vendor.id,
  });
  return updated;
}

export async function signOut() {
  await clearSession();
}
