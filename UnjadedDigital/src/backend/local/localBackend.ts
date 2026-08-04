// src/backend/local/localBackend.ts
// In-memory demo backend. No network required — perfect for the first run,
// UI previews, Storybook-style development, and tests. State is persisted to
// AsyncStorage so a reload keeps you signed in, mirroring real behavior.
//
// It intentionally implements the SAME contract as the Supabase backend so
// screens behave identically regardless of which one is active.

import * as Crypto from 'expo-crypto';
import { storage } from '../../lib/storage';
import type {
  AppUser,
  AuthApi,
  AuthChangeCallback,
  Backend,
  NotificationsApi,
  OAuthProvider,
  ProfileApi,
  Session,
  SignInInput,
  SignUpInput,
  SignUpResult,
  Unsubscribe,
} from '../types';

interface StoredUser extends AppUser {
  password: string;
}

interface DbShape {
  users: StoredUser[];
  sessionUserId: string | null;
  pushTokens: { userId: string; token: string }[];
}

const DB_KEY = 'unjaded.local.db';
const listeners = new Set<AuthChangeCallback>();

let db: DbShape = { users: [], sessionUserId: null, pushTokens: [] };
let loaded = false;

async function load(): Promise<void> {
  if (loaded) return;
  const raw = await storage.getItem(DB_KEY);
  if (raw) {
    try {
      db = JSON.parse(raw) as DbShape;
    } catch {
      /* ignore corrupt cache */
    }
  }
  // Seed a demo account on first run so you can sign in immediately.
  if (db.users.length === 0) {
    db.users.push({
      id: 'demo-user',
      email: 'demo@unjadeddigital.com',
      password: 'Password1',
      displayName: 'Demo User',
      role: 'user',
      avatarUrl: null,
      emailVerified: true,
      metadata: { bio: 'Signed in with the local demo backend.' },
      createdAt: new Date().toISOString(),
    });
    await persist();
  }
  loaded = true;
}

async function persist(): Promise<void> {
  await storage.setItem(DB_KEY, JSON.stringify(db));
}

function publicUser(u: StoredUser): AppUser {
  const { password: _pw, ...rest } = u;
  return rest;
}

function makeSession(u: StoredUser): Session {
  return { user: publicUser(u), accessToken: `local-${u.id}`, expiresAt: Date.now() + 3600_000 };
}

function emit(session: Session | null): void {
  for (const cb of listeners) cb(session);
}

async function uid(): Promise<string> {
  return Crypto.randomUUID();
}

const auth: AuthApi = {
  async getSession() {
    await load();
    const u = db.users.find((x) => x.id === db.sessionUserId);
    return u ? makeSession(u) : null;
  },

  async refreshSession() {
    return auth.getSession();
  },

  onAuthStateChange(cb: AuthChangeCallback): Unsubscribe {
    listeners.add(cb);
    return { unsubscribe: () => listeners.delete(cb) };
  },

  async signUpWithEmail(input: SignUpInput): Promise<SignUpResult> {
    await load();
    const email = input.email.trim().toLowerCase();
    if (db.users.some((u) => u.email.toLowerCase() === email)) {
      throw new Error('User already registered');
    }
    const user: StoredUser = {
      id: await uid(),
      email,
      password: input.password,
      displayName: input.displayName.trim(),
      role: 'user',
      avatarUrl: null,
      emailVerified: true, // demo backend auto-verifies
      metadata: {},
      createdAt: new Date().toISOString(),
    };
    db.users.push(user);
    db.sessionUserId = user.id;
    await persist();
    const session = makeSession(user);
    emit(session);
    return { user: publicUser(user), session, needsEmailConfirmation: false };
  },

  async signInWithEmail(input: SignInInput): Promise<Session> {
    await load();
    const email = input.email.trim().toLowerCase();
    const user = db.users.find((u) => u.email.toLowerCase() === email);
    if (!user || user.password !== input.password) {
      throw new Error('Invalid login credentials');
    }
    db.sessionUserId = user.id;
    await persist();
    const session = makeSession(user);
    emit(session);
    return session;
  },

  async signInWithProvider(provider: OAuthProvider): Promise<Session> {
    await load();
    // Deterministic demo identity per provider.
    const email = `${provider}-user@unjadeddigital.com`;
    let user = db.users.find((u) => u.email === email);
    if (!user) {
      user = {
        id: await uid(),
        email,
        password: '',
        displayName: `${provider.charAt(0).toUpperCase()}${provider.slice(1)} User`,
        role: 'user',
        avatarUrl: null,
        emailVerified: true,
        metadata: { provider },
        createdAt: new Date().toISOString(),
      };
      db.users.push(user);
    }
    db.sessionUserId = user.id;
    await persist();
    const session = makeSession(user);
    emit(session);
    return session;
  },

  async signInWithMagicLink(_email: string): Promise<void> {
    // No-op in demo mode; a real link isn't sent.
    await load();
  },

  async sendPasswordReset(_email: string): Promise<void> {
    await load();
  },

  async updatePassword(newPassword: string): Promise<void> {
    await load();
    const user = db.users.find((u) => u.id === db.sessionUserId);
    if (!user) throw new Error('Not signed in');
    user.password = newPassword;
    await persist();
  },

  async resendVerification(_email: string): Promise<void> {
    await load();
  },

  async signOut(): Promise<void> {
    await load();
    db.sessionUserId = null;
    await persist();
    emit(null);
  },
};

const profile: ProfileApi = {
  async getProfile(userId: string): Promise<AppUser | null> {
    await load();
    const u = db.users.find((x) => x.id === userId);
    return u ? publicUser(u) : null;
  },

  async updateProfile(userId, patch): Promise<AppUser> {
    await load();
    const user = db.users.find((x) => x.id === userId);
    if (!user) throw new Error('User not found');
    if (patch.displayName !== undefined) user.displayName = patch.displayName;
    if (patch.avatarUrl !== undefined) user.avatarUrl = patch.avatarUrl;
    if (patch.metadata !== undefined) user.metadata = patch.metadata;
    await persist();
    return publicUser(user);
  },

  async uploadAvatar(_userId: string, fileUri: string): Promise<string> {
    // Demo mode: just echo the local URI back as the "hosted" URL.
    await load();
    return fileUri;
  },

  async deleteAccount(userId: string): Promise<void> {
    await load();
    db.users = db.users.filter((u) => u.id !== userId);
    db.pushTokens = db.pushTokens.filter((t) => t.userId !== userId);
    if (db.sessionUserId === userId) db.sessionUserId = null;
    await persist();
    emit(null);
  },
};

const notifications: NotificationsApi = {
  async registerPushToken(userId: string, token: string): Promise<void> {
    await load();
    if (!db.pushTokens.some((t) => t.token === token)) {
      db.pushTokens.push({ userId, token });
      await persist();
    }
  },
  async removePushToken(_userId: string, token: string): Promise<void> {
    await load();
    db.pushTokens = db.pushTokens.filter((t) => t.token !== token);
    await persist();
  },
};

export const localBackend: Backend = {
  mode: 'local',
  auth,
  profile,
  notifications,
};
