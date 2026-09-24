// src/backend/local/localBackend.ts
// In-memory demo backend persisted to AsyncStorage/localStorage. No network
// required — perfect for the first run, UI previews, and tests. It implements
// the SAME contract as the Supabase backend so screens behave identically.
//
// Auth is demo-grade: passwords are stored in plaintext and email verification
// uses a 6-digit code logged to the console ([VERIFY] ...). Production uses the
// Supabase backend where the provider emails a real confirmation link.

import * as Crypto from 'expo-crypto';
import { storage } from '../../lib/storage';
import { applyVendorFilter } from '../vendorFilter';
import { createFollowerActions } from '../followerActions';
import {
  canSend,
  bucketsForSend,
  startOfWeek,
  getNotificationType,
  FREE_TIER,
} from '../../features/payments/tiers';
import type {
  AppUser,
  AuthApi,
  AuthChangeCallback,
  Backend,
  BroadcastsApi,
  EmailOtpKind,
  FavoritesApi,
  NotificationsApi,
  OAuthProvider,
  ProfileApi,
  SendNotificationResult,
  Session,
  SignInInput,
  SignUpInput,
  SignUpResult,
  SubscriptionsApi,
  Unsubscribe,
  UsersApi,
  Vendor,
  VendorFilter,
  VendorNotification,
  VendorRegistration,
  VendorsApi,
  WeeklyUsage,
} from '../types';

interface StoredUser extends AppUser {
  password: string;
}

interface DbShape {
  users: StoredUser[];
  vendors: Vendor[];
  /** userId -> vendorId[] */
  favorites: Record<string, string[]>;
  notifications: VendorNotification[];
  pushTokens: { userId: string; token: string }[];
  /** userId -> 6-digit signup code */
  verifyCodes: Record<string, string>;
  /** lowercased email -> 6-digit password-reset code */
  resetCodes?: Record<string, string>;
  sessionUserId: string | null;
}

const DB_KEY = 'vendorfinder.local.db';
const authListeners = new Set<AuthChangeCallback>();
const vendorSubscribers = new Set<(vendors: Vendor[]) => void>();

let db: DbShape = {
  users: [],
  vendors: [],
  favorites: {},
  notifications: [],
  pushTokens: [],
  verifyCodes: {},
  sessionUserId: null,
};
let loaded = false;

// ---- seed data --------------------------------------------------------------

function seedUsers(): StoredUser[] {
  const now = new Date().toISOString();
  return [
    {
      id: 'u_admin',
      username: 'admin',
      email: 'admin@vendorfinder.local',
      password: 'admin123',
      displayName: 'Site Admin',
      role: 'admin',
      provider: 'local',
      providerId: null,
      interests: [],
      vendorId: null,
      avatarUrl: null,
      emailVerified: true, // seed admin is pre-verified
      metadata: {},
      createdAt: now,
    },
    {
      id: 'demo',
      username: 'demovendor',
      email: 'vendor@vendorfinder.local',
      password: 'vendor123',
      displayName: 'Demo Vendor Owner',
      role: 'vendor',
      provider: 'local',
      providerId: null,
      interests: [],
      vendorId: 'v1',
      avatarUrl: null,
      emailVerified: true,
      metadata: {},
      createdAt: now,
    },
  ];
}

function seedVendors(): Vendor[] {
  return [
    {
      id: 'v1',
      name: 'The Gourmet Bistro Truck',
      type: 'Food',
      tags: ['pizza', 'sandwiches', 'lunch'],
      description: 'Wood-fired pizzas and craft sandwiches.',
      ownerId: 'demo',
      blockedUserIds: [],
      schedule: [
        { day: 'Mon', start: '11:00', end: '14:00', latitude: 34.0522, longitude: -118.2437, address: 'Grand Park, LA' },
        { day: 'Fri', start: '17:00', end: '21:00', latitude: 34.0407, longitude: -118.2468, address: 'LA Live' },
      ],
      currentLocation: { latitude: 34.0522, longitude: -118.2437, address: 'Grand Park, LA' },
      isOpen: true,
      rating: 4.8,
      subscriptionTier: 'tier3',
      subscriptionStatus: 'active',
      createdAt: Date.now() - 1000 * 60 * 60 * 24,
    },
    {
      id: 'v2',
      name: 'TechGadget Pop-Up',
      type: 'Electronics',
      tags: ['gadgets', 'accessories', 'discount'],
      description: 'Discounted gadgets and accessories.',
      ownerId: 'demo',
      blockedUserIds: [],
      schedule: [
        { day: 'Sat', start: '10:00', end: '18:00', latitude: 34.0617, longitude: -118.2477, address: 'Chinatown LA' },
      ],
      currentLocation: { latitude: 34.0617, longitude: -118.2477, address: 'Chinatown LA' },
      isOpen: true,
      rating: 4.2,
      subscriptionTier: 'free',
      subscriptionStatus: 'active',
      createdAt: Date.now() - 1000 * 60 * 60 * 48,
    },
    {
      id: 'v3',
      name: 'Local Coffee Bean Shop',
      type: 'Food',
      tags: ['coffee', 'cafe', 'breakfast'],
      description: 'Single-origin pour-over coffee on the go.',
      ownerId: 'demo',
      blockedUserIds: [],
      schedule: [
        { day: 'Sun', start: '07:00', end: '12:00', latitude: 34.0488, longitude: -118.2518, address: 'Arts District' },
      ],
      currentLocation: null,
      isOpen: false,
      rating: 4.9,
      subscriptionTier: 'free',
      subscriptionStatus: 'active',
      createdAt: Date.now() - 1000 * 60 * 60 * 72,
    },
  ];
}

// ---- persistence ------------------------------------------------------------

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
  if (db.users.length === 0) {
    db.users = seedUsers();
    db.vendors = seedVendors();
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

function emitAuth(session: Session | null): void {
  for (const cb of authListeners) cb(session);
}

function emitVendors(): void {
  for (const cb of vendorSubscribers) {
    try {
      cb(db.vendors);
    } catch (e) {
      console.warn('vendor subscriber error', e);
    }
  }
}

async function uid(): Promise<string> {
  return Crypto.randomUUID();
}

/**
 * Demo reset-code store. Lazily created so a database persisted before this
 * existed still loads.
 */
function resetCodes(): Record<string, string> {
  if (!db.resetCodes) db.resetCodes = {};
  return db.resetCodes;
}

function setVerifyCode(userId: string): string {
  const code = String(Math.floor(100000 + Math.random() * 900000));
  db.verifyCodes[userId] = code;
  // Surface the code so testers can "receive" it offline.
  console.log(`[VERIFY] Demo verification code for ${userId}: ${code}`);
  return code;
}

// =========================================================================
// AUTH
// =========================================================================

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
    authListeners.add(cb);
    return { unsubscribe: () => authListeners.delete(cb) };
  },

  async signUpWithEmail(input: SignUpInput): Promise<SignUpResult> {
    await load();
    const email = input.email.trim().toLowerCase();
    const username = (input.username || email).trim().toLowerCase();
    if (db.users.some((u) => u.email.toLowerCase() === email || u.username === username)) {
      throw new Error('Account already exists');
    }
    const user: StoredUser = {
      id: await uid(),
      username,
      email,
      password: input.password,
      displayName: input.displayName.trim() || username,
      role: input.role === 'vendor' ? 'vendor' : 'user',
      provider: 'local',
      providerId: null,
      interests: [],
      vendorId: null,
      avatarUrl: null,
      emailVerified: false, // must verify before using the app
      metadata: {},
      createdAt: new Date().toISOString(),
    };
    db.users.push(user);
    db.sessionUserId = user.id;
    setVerifyCode(user.id);
    await persist();
    const session = makeSession(user);
    emitAuth(session);
    // Session exists but the user is unverified — the auth gate routes them to
    // the verify-email screen until confirmVerification() succeeds.
    return { user: publicUser(user), session, needsEmailConfirmation: true };
  },

  async signInWithEmail(input: SignInInput): Promise<Session> {
    await load();
    const id = input.email.trim().toLowerCase();
    const user = db.users.find((u) => u.email.toLowerCase() === id || u.username === id);
    if (!user || user.password !== input.password) {
      throw new Error('Invalid login credentials');
    }
    db.sessionUserId = user.id;
    await persist();
    const session = makeSession(user);
    emitAuth(session);
    return session;
  },

  async signInWithProvider(provider: OAuthProvider): Promise<Session> {
    await load();
    const providerId = `${provider}-demo-id`;
    let user = db.users.find((u) => u.provider === provider && u.providerId === providerId);
    if (!user) {
      user = {
        id: await uid(),
        username: `${provider}_demo`,
        email: `demo@${provider}.example`,
        password: '',
        displayName: `${provider.charAt(0).toUpperCase()}${provider.slice(1)} Demo User`,
        role: 'user',
        provider,
        providerId,
        interests: [],
        vendorId: null,
        avatarUrl: null,
        emailVerified: true, // OAuth providers return verified emails
        metadata: {},
        createdAt: new Date().toISOString(),
      };
      db.users.push(user);
    }
    db.sessionUserId = user.id;
    await persist();
    const session = makeSession(user);
    emitAuth(session);
    return session;
  },

  async signInWithMagicLink(_email: string): Promise<void> {
    await load();
  },

  async sendPasswordReset(email: string): Promise<void> {
    await load();
    // No email goes out offline, so the code is logged instead. Only issue one
    // for a known account, matching the real backend's silence about whether an
    // address exists.
    const target = email.trim().toLowerCase();
    if (!db.users.some((u) => u.email.toLowerCase() === target)) return;
    const code = String(Math.floor(100000 + Math.random() * 900000));
    resetCodes()[target] = code;
    console.log(`[RESET] Demo password-reset code for ${target}: ${code}`);
    await persist();
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
    const user = db.users.find((u) => u.id === db.sessionUserId);
    if (!user) throw new Error('Not signed in');
    if (user.emailVerified) return;
    setVerifyCode(user.id);
    await persist();
  },

  async redeemAuthLink(_url: string): Promise<Session | null> {
    // Demo mode never sends real emails, so there is no link to redeem; the
    // screens fall back to asking for the code logged to the console.
    await load();
    return null;
  },

  async verifyEmailOtp(email: string, token: string, kind: EmailOtpKind): Promise<Session> {
    await load();
    const entered = token.trim();
    const target = email.trim().toLowerCase();
    // Fall back to the session user: a signed-up-but-unverified demo user is
    // already signed in, and may not have retyped their address.
    const user =
      db.users.find((u) => u.email.toLowerCase() === target) ??
      db.users.find((u) => u.id === db.sessionUserId);
    if (!user) throw new Error('No account found for that email.');

    if (kind === 'recovery') {
      const expected = resetCodes()[user.email.toLowerCase()];
      if (!expected || entered !== expected) {
        throw new Error('That reset code is not valid. Check the console for the demo code.');
      }
      delete resetCodes()[user.email.toLowerCase()];
    } else {
      const expected = db.verifyCodes[user.id];
      if (!expected || entered !== expected) {
        throw new Error('That confirmation code is not valid. Check the console for the demo code.');
      }
      user.emailVerified = true;
      delete db.verifyCodes[user.id];
    }

    db.sessionUserId = user.id;
    await persist();
    const session = makeSession(user);
    emitAuth(session);
    return session;
  },

  async signOut(): Promise<void> {
    await load();
    db.sessionUserId = null;
    await persist();
    emitAuth(null);
  },
};

// =========================================================================
// PROFILE (current user)
// =========================================================================

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
    if (patch.interests !== undefined) user.interests = patch.interests;
    await persist();
    return publicUser(user);
  },

  async uploadAvatar(_userId: string, fileUri: string): Promise<string> {
    await load();
    return fileUri; // demo: echo the local URI back as the "hosted" URL
  },

  async deleteAccount(userId: string): Promise<void> {
    await load();
    db.users = db.users.filter((u) => u.id !== userId);
    db.vendors = db.vendors.filter((v) => v.ownerId !== userId);
    db.pushTokens = db.pushTokens.filter((t) => t.userId !== userId);
    delete db.favorites[userId];
    if (db.sessionUserId === userId) db.sessionUserId = null;
    await persist();
    emitVendors();
    emitAuth(null);
  },
};

// =========================================================================
// USERS directory (admin listing + impersonation)
// =========================================================================

const users: UsersApi = {
  async get(id: string): Promise<AppUser | null> {
    await load();
    const u = db.users.find((x) => x.id === id);
    return u ? publicUser(u) : null;
  },

  async list(): Promise<AppUser[]> {
    await load();
    return db.users.map(publicUser);
  },

  async update(id: string, patch: Partial<AppUser>): Promise<AppUser> {
    await load();
    const user = db.users.find((u) => u.id === id);
    if (!user) throw new Error('User not found');
    // Never let a caller clobber the password via the public patch shape.
    const { password: _drop, ...safe } = patch as Partial<StoredUser>;
    Object.assign(user, safe);
    await persist();
    return publicUser(user);
  },
};

// =========================================================================
// VENDORS
// =========================================================================

const vendors: VendorsApi = {
  async list(filter: VendorFilter = {}): Promise<Vendor[]> {
    await load();
    return applyVendorFilter(db.vendors, filter);
  },

  async get(id: string): Promise<Vendor | null> {
    await load();
    return db.vendors.find((v) => v.id === id) ?? null;
  },

  async getByOwner(ownerId: string): Promise<Vendor | null> {
    await load();
    return db.vendors.find((v) => v.ownerId === ownerId) ?? null;
  },

  async register(data: VendorRegistration): Promise<Vendor> {
    await load();
    const vendor: Vendor = {
      id: `v_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      name: data.name,
      type: data.type || 'Other',
      tags: data.tags || [],
      description: data.description || '',
      ownerId: data.ownerId,
      blockedUserIds: [],
      schedule: data.schedule || [],
      currentLocation: data.currentLocation || null,
      isOpen: !!data.isOpen,
      rating: 0,
      subscriptionTier: data.subscriptionTier || FREE_TIER.id,
      subscriptionStatus: data.subscriptionStatus || 'active',
      createdAt: Date.now(),
    };
    db.vendors = [vendor, ...db.vendors];
    await persist();
    emitVendors();
    return vendor;
  },

  async update(id, patch): Promise<Vendor> {
    await load();
    const idx = db.vendors.findIndex((v) => v.id === id);
    const current = idx === -1 ? undefined : db.vendors[idx];
    if (!current) throw new Error(`Vendor not found: ${id}`);
    const updated: Vendor = { ...current, ...patch };
    db.vendors[idx] = updated;
    await persist();
    emitVendors();
    return updated;
  },

  async remove(id: string): Promise<void> {
    await load();
    db.vendors = db.vendors.filter((v) => v.id !== id);
    await persist();
    emitVendors();
  },

  subscribe(cb: (vendors: Vendor[]) => void): () => void {
    vendorSubscribers.add(cb);
    load()
      .then(() => cb(db.vendors))
      .catch(() => {});
    return () => vendorSubscribers.delete(cb);
  },
};

// =========================================================================
// FAVORITES / FOLLOWERS
// =========================================================================

const favorites: FavoritesApi = {
  async list(userId: string): Promise<string[]> {
    await load();
    return db.favorites[userId] || [];
  },

  async add(userId: string, vendorId: string): Promise<void> {
    await load();
    const vendor = db.vendors.find((v) => v.id === vendorId);
    if (vendor && (vendor.blockedUserIds || []).includes(userId)) {
      throw new Error('You have been blocked by this vendor.');
    }
    const ids = db.favorites[userId] || [];
    if (!ids.includes(vendorId)) {
      db.favorites[userId] = [...ids, vendorId];
      await persist();
    }
  },

  async remove(userId: string, vendorId: string): Promise<void> {
    await load();
    const ids = db.favorites[userId] || [];
    db.favorites[userId] = ids.filter((i) => i !== vendorId);
    await persist();
  },

  async listFollowers(vendorId: string): Promise<AppUser[]> {
    await load();
    const followerIds = Object.entries(db.favorites)
      .filter(([, vendorIds]) => vendorIds.includes(vendorId))
      .map(([userId]) => userId);
    return db.users.filter((u) => followerIds.includes(u.id)).map(publicUser);
  },

  ...createFollowerActions({
    getVendor: (id) => vendors.get(id),
    updateVendor: (id, patch) => vendors.update(id, patch),
    removeFavorite: (userId, vendorId) => favorites.remove(userId, vendorId),
  }),
};

// =========================================================================
// BROADCASTS (typed notifications with weekly-quota enforcement)
// =========================================================================

async function computeWeeklyUsage(vendorId: string, now = Date.now()): Promise<WeeklyUsage> {
  const since = startOfWeek(now);
  const usage: WeeklyUsage = {};
  for (const n of db.notifications) {
    if (n.vendorId !== vendorId || n.at < since) continue;
    for (const b of n.buckets || []) {
      usage[b] = (usage[b] || 0) + 1;
    }
  }
  return usage;
}

const broadcasts: BroadcastsApi = {
  async send(vendorId, input): Promise<SendNotificationResult> {
    await load();
    const nType = getNotificationType(input.type);
    if (!nType) {
      const e = new Error('Unknown notification type') as Error & { code?: string };
      e.code = 'BAD_TYPE';
      throw e;
    }
    const vendor = db.vendors.find((v) => v.id === vendorId);
    if (!vendor) throw new Error('Vendor not found');

    const tierId = vendor.subscriptionTier || FREE_TIER.id;
    const usage = await computeWeeklyUsage(vendorId);
    const decision = canSend(tierId, input.type, usage);
    if (!decision.allowed) {
      const e = new Error(decision.reason || 'Weekly limit reached') as Error & {
        code?: string;
        decision?: unknown;
      };
      e.code = 'QUOTA_EXCEEDED';
      e.decision = decision;
      throw e;
    }

    const followerUsers = await favorites.listFollowers(vendorId);
    const entry: VendorNotification = {
      id: `n_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      vendorId,
      type: input.type,
      title: input.title || nType.defaultTitle(vendor.name),
      body: input.body || '',
      buckets: bucketsForSend(tierId, input.type),
      recipientIds: followerUsers.map((f) => f.id),
      at: Date.now(),
    };
    db.notifications = [entry, ...db.notifications].slice(0, 500);
    await persist();

    return { notification: entry, followers: followerUsers, remaining: decision.remaining };
  },

  async list(vendorId?: string): Promise<VendorNotification[]> {
    await load();
    return vendorId ? db.notifications.filter((n) => n.vendorId === vendorId) : db.notifications;
  },

  async listForUser(userId: string): Promise<VendorNotification[]> {
    await load();
    return db.notifications.filter((n) => (n.recipientIds || []).includes(userId));
  },

  async getWeeklyUsage(vendorId: string): Promise<WeeklyUsage> {
    await load();
    return computeWeeklyUsage(vendorId);
  },
};

// =========================================================================
// SUBSCRIPTIONS
// =========================================================================

const subscriptions: SubscriptionsApi = {
  async get(vendorId: string) {
    await load();
    const vendor = db.vendors.find((v) => v.id === vendorId);
    if (!vendor) return null;
    return {
      vendorId,
      tier: vendor.subscriptionTier || FREE_TIER.id,
      status: vendor.subscriptionStatus || 'active',
    };
  },

  async setTier(vendorId, tierId, status = 'active') {
    // Local backend applies the tier immediately (no real payment).
    return vendors.update(vendorId, { subscriptionTier: tierId, subscriptionStatus: status });
  },
};

// =========================================================================
// PUSH TOKENS
// =========================================================================

const notifications: NotificationsApi = {
  async registerPushToken(userId: string, token: string): Promise<void> {
    await load();
    if (!userId || !token) return;
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
  users,
  vendors,
  favorites,
  broadcasts,
  subscriptions,
  notifications,
};
