// src/services/backend/localBackend.js
// Local backend using AsyncStorage. Designed to mirror a real backend's API
// so screens don't need to change when swapping to Firebase.

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  canSend, bucketsForSend, startOfWeek, getNotificationType, FREE_TIER,
} from '../../config/tiers';

const VENDORS_KEY = 'vf.vendors';
const FAVORITES_KEY = 'vf.favorites';
const USERS_KEY = 'vf.users';
const BROADCASTS_KEY = 'vf.broadcasts';
const NOTIFICATIONS_KEY = 'vf.notifications'; // typed vendor->follower notifications
const PUSH_TOKENS_KEY = 'vf.pushTokens';      // userId -> [expoPushToken]
const SESSION_KEY = 'vf.session';             // local auth session

// In-memory subscriber list (used to emulate realtime updates).
const subscribers = new Set();

// Same hashing as authService.hashPassword, inlined to avoid a circular import.
function djb2(plain) {
  let h = 5381;
  const s = 'vendor-finder-demo-salt' + (plain || '');
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  }
  return `djb2$${(h >>> 0).toString(16)}`;
}

// Default admin so the app is usable out of the box.
// Username: admin   Password: admin123
const SEED_USERS = [
  {
    id: 'u_admin',
    username: 'admin',
    email: 'admin@vendorfinder.local',
    passwordHash: djb2('admin123'),
    displayName: 'Site Admin',
    role: 'admin',
    provider: 'local',
    providerId: null,
    interests: [],
    vendorId: null,
    emailVerified: true, // seed admin is pre-verified
    createdAt: Date.now(),
  },
];

const SEED_VENDORS = [
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

// --- internal helpers ---
async function readVendors() {
  const raw = await AsyncStorage.getItem(VENDORS_KEY);
  if (raw) return JSON.parse(raw);
  await AsyncStorage.setItem(VENDORS_KEY, JSON.stringify(SEED_VENDORS));
  return SEED_VENDORS;
}

async function writeVendors(vendors) {
  await AsyncStorage.setItem(VENDORS_KEY, JSON.stringify(vendors));
  notify(vendors);
}

function notify(vendors) {
  subscribers.forEach(cb => {
    try { cb(vendors); } catch (e) { console.warn('subscriber error', e); }
  });
}

async function readUsers() {
  const raw = await AsyncStorage.getItem(USERS_KEY);
  if (raw) return JSON.parse(raw);
  await AsyncStorage.setItem(USERS_KEY, JSON.stringify(SEED_USERS));
  return SEED_USERS;
}

async function writeUsers(users) {
  await AsyncStorage.setItem(USERS_KEY, JSON.stringify(users));
}

async function readFavorites(userId) {
  const raw = await AsyncStorage.getItem(`${FAVORITES_KEY}.${userId}`);
  return raw ? JSON.parse(raw) : [];
}

async function writeFavorites(userId, ids) {
  await AsyncStorage.setItem(`${FAVORITES_KEY}.${userId}`, JSON.stringify(ids));
}

async function readAllFavorites() {
  // Walk all keys with the favorites prefix.
  const keys = await AsyncStorage.getAllKeys();
  const favKeys = keys.filter(k => k.startsWith(`${FAVORITES_KEY}.`));
  const pairs = await AsyncStorage.multiGet(favKeys);
  return pairs.map(([k, v]) => ({
    userId: k.slice(FAVORITES_KEY.length + 1),
    vendorIds: v ? JSON.parse(v) : [],
  }));
}

// =========================================================================
// VENDOR API
// =========================================================================

export async function listVendors(filter = {}) {
  const vendors = await readVendors();
  let result = vendors;
  if (filter.viewerUserId) {
    // Hide vendors that blocked the viewer.
    result = result.filter(v => !(v.blockedUserIds || []).includes(filter.viewerUserId));
  }
  if (filter.query) {
    const q = filter.query.toLowerCase();
    result = result.filter(v =>
      v.name.toLowerCase().includes(q) ||
      v.type.toLowerCase().includes(q) ||
      (v.description || '').toLowerCase().includes(q) ||
      (v.tags || []).some(t => t.toLowerCase().includes(q))
    );
  }
  if (filter.type) {
    result = result.filter(v => v.type === filter.type);
  }
  if (filter.tag) {
    result = result.filter(v => (v.tags || []).includes(filter.tag));
  }
  if (filter.openOnly) {
    result = result.filter(v => v.isOpen);
  }
  return result;
}

export async function getVendor(id) {
  const vendors = await readVendors();
  return vendors.find(v => v.id === id) || null;
}

export async function getVendorByOwner(ownerId) {
  const vendors = await readVendors();
  return vendors.find(v => v.ownerId === ownerId) || null;
}

export async function registerVendor(data) {
  const vendors = await readVendors();
  const vendor = {
    id: `v_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    name: data.name,
    type: data.type || 'Other',
    tags: data.tags || [],
    description: data.description || '',
    ownerId: data.ownerId || 'anonymous',
    blockedUserIds: [],
    schedule: data.schedule || [],
    currentLocation: data.currentLocation || null,
    isOpen: !!data.isOpen,
    rating: 0,
    subscriptionTier: data.subscriptionTier || FREE_TIER.id,
    subscriptionStatus: data.subscriptionStatus || 'active',
    createdAt: Date.now(),
  };
  const next = [vendor, ...vendors];
  await writeVendors(next);
  return vendor;
}

export async function updateVendor(id, patch) {
  const vendors = await readVendors();
  const idx = vendors.findIndex(v => v.id === id);
  if (idx === -1) throw new Error(`Vendor not found: ${id}`);
  const updated = { ...vendors[idx], ...patch };
  const next = [...vendors];
  next[idx] = updated;
  await writeVendors(next);
  return updated;
}

export async function deleteVendor(id) {
  const vendors = await readVendors();
  const next = vendors.filter(v => v.id !== id);
  await writeVendors(next);
}

// =========================================================================
// FAVORITES / FOLLOWERS
// =========================================================================

export async function listFavorites(userId) {
  return readFavorites(userId);
}

export async function addFavorite(userId, vendorId) {
  // If the user is blocked by this vendor, refuse.
  const vendor = await getVendor(vendorId);
  if (vendor && (vendor.blockedUserIds || []).includes(userId)) {
    throw new Error('You have been blocked by this vendor.');
  }
  const ids = await readFavorites(userId);
  if (!ids.includes(vendorId)) {
    ids.push(vendorId);
    await writeFavorites(userId, ids);
  }
}

export async function removeFavorite(userId, vendorId) {
  const ids = await readFavorites(userId);
  const next = ids.filter(i => i !== vendorId);
  await writeFavorites(userId, next);
}

/** Users following a given vendor (i.e. users who favorited it). */
export async function listFollowers(vendorId) {
  const all = await readAllFavorites();
  const followerIds = all.filter(p => p.vendorIds.includes(vendorId)).map(p => p.userId);
  const users = await readUsers();
  return users.filter(u => followerIds.includes(u.id));
}

export async function blockFollower(vendorId, userId) {
  const vendor = await getVendor(vendorId);
  if (!vendor) throw new Error('Vendor not found');
  const blocked = new Set(vendor.blockedUserIds || []);
  blocked.add(userId);
  await updateVendor(vendorId, { blockedUserIds: [...blocked] });
  // Also remove their favorite so they no longer follow.
  await removeFavorite(userId, vendorId);
}

export async function unblockFollower(vendorId, userId) {
  const vendor = await getVendor(vendorId);
  if (!vendor) throw new Error('Vendor not found');
  const blocked = (vendor.blockedUserIds || []).filter(id => id !== userId);
  await updateVendor(vendorId, { blockedUserIds: blocked });
}

export async function removeFollower(vendorId, userId) {
  // Same as forcing an unfollow; doesn't block re-following.
  await removeFavorite(userId, vendorId);
}

// =========================================================================
// USERS
// =========================================================================

export async function createUser(data) {
  const users = await readUsers();
  if (users.some(u => u.username === data.username)) {
    throw new Error('Username already exists');
  }
  const user = {
    id: `u_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    username: data.username,
    email: data.email || '',
    passwordHash: data.passwordHash || '',
    displayName: data.displayName || data.username,
    role: data.role || 'user',
    provider: data.provider || 'local',
    providerId: data.providerId || null,
    interests: data.interests || [],
    vendorId: data.vendorId || null,
    // Email verification. Email/password signups start unverified; OAuth
    // accounts (Google/Facebook) arrive with a provider-verified email.
    emailVerified: data.emailVerified === true,
    createdAt: Date.now(),
  };
  await writeUsers([...users, user]);
  return user;
}

export async function getUser(id) {
  const users = await readUsers();
  return users.find(u => u.id === id) || null;
}

export async function getUserByUsername(username) {
  const users = await readUsers();
  return users.find(u => u.username === username) || null;
}

export async function getUserByProvider(provider, providerId) {
  const users = await readUsers();
  return users.find(u => u.provider === provider && u.providerId === providerId) || null;
}

export async function updateUser(id, patch) {
  const users = await readUsers();
  const idx = users.findIndex(u => u.id === id);
  if (idx === -1) throw new Error('User not found');
  const updated = { ...users[idx], ...patch };
  const next = [...users];
  next[idx] = updated;
  await writeUsers(next);
  return updated;
}

export async function listUsers() {
  return readUsers();
}

// =========================================================================
// TYPED NOTIFICATIONS (vendor → followers) with weekly quota enforcement
// =========================================================================
//
// A notification has a `type` (open_for_business | sale | stock_update) and is
// quota-limited per the vendor's subscription tier (see config/tiers.js). The
// SAME quota engine runs here and in the Supabase Edge Function so behavior is
// identical across backends.

async function readNotifications() {
  const raw = await AsyncStorage.getItem(NOTIFICATIONS_KEY);
  return raw ? JSON.parse(raw) : [];
}

async function writeNotifications(list) {
  await AsyncStorage.setItem(NOTIFICATIONS_KEY, JSON.stringify(list.slice(0, 500)));
}

/** Count this week's sends per quota bucket for a vendor. */
export async function getWeeklyUsage(vendorId, now = Date.now()) {
  const since = startOfWeek(now);
  const all = await readNotifications();
  const usage = {};
  for (const n of all) {
    if (n.vendorId !== vendorId) continue;
    if (n.at < since) continue;
    for (const b of (n.buckets || [])) {
      usage[b] = (usage[b] || 0) + 1;
    }
  }
  return usage;
}

/**
 * Send a typed notification to followers, enforcing the vendor's weekly quota.
 * Returns { notification, followers, remaining }.
 * Throws { code: 'QUOTA_EXCEEDED' | 'BAD_TYPE' } on rejection so the UI can
 * route the vendor to upgrade.
 */
export async function sendNotification(vendorId, { type, title, body }) {
  const nType = getNotificationType(type);
  if (!nType) {
    const e = new Error('Unknown notification type'); e.code = 'BAD_TYPE'; throw e;
  }
  const vendor = await getVendor(vendorId);
  if (!vendor) throw new Error('Vendor not found');

  const tierId = vendor.subscriptionTier || FREE_TIER.id;
  const usage = await getWeeklyUsage(vendorId);
  const decision = canSend(tierId, type, usage);
  if (!decision.allowed) {
    const e = new Error(decision.reason || 'Weekly limit reached');
    e.code = 'QUOTA_EXCEEDED';
    e.decision = decision;
    throw e;
  }

  const followers = await listFollowers(vendorId);
  const entry = {
    id: `n_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    vendorId,
    type,
    title: title || nType.defaultTitle(vendor.name),
    body: body || '',
    buckets: bucketsForSend(tierId, type),
    recipientIds: followers.map(f => f.id),
    at: Date.now(),
  };
  const all = await readNotifications();
  all.unshift(entry);
  await writeNotifications(all);

  return { notification: entry, followers, remaining: decision.remaining };
}

export async function listNotifications(vendorId) {
  const all = await readNotifications();
  return vendorId ? all.filter(n => n.vendorId === vendorId) : all;
}

/** Notifications addressed to a given follower (for their Alerts feed). */
export async function listNotificationsForUser(userId) {
  const all = await readNotifications();
  return all.filter(n => (n.recipientIds || []).includes(userId));
}

// ---- Backward-compatible broadcast shims --------------------------------
// Existing callers used sendBroadcast/listBroadcasts. Keep them working by
// mapping to the typed API with the "open_for_business" type.
export async function sendBroadcast(vendorId, message) {
  const { notification } = await sendNotification(vendorId, {
    type: 'open_for_business',
    body: message,
  });
  return notification;
}

export async function listBroadcasts(vendorId) {
  return listNotifications(vendorId);
}

// =========================================================================
// SUBSCRIPTIONS
// =========================================================================

/** Read a vendor's subscription summary. */
export async function getSubscription(vendorId) {
  const vendor = await getVendor(vendorId);
  if (!vendor) return null;
  return {
    vendorId,
    tier: vendor.subscriptionTier || FREE_TIER.id,
    status: vendor.subscriptionStatus || 'active',
  };
}

/**
 * Set a vendor's tier. In the local backend this is applied immediately (no
 * real payment). Supabase routes this through Stripe + a webhook instead.
 */
export async function setSubscriptionTier(vendorId, tierId, status = 'active') {
  return updateVendor(vendorId, {
    subscriptionTier: tierId,
    subscriptionStatus: status,
  });
}

// =========================================================================
// PUSH TOKENS (device registration for Expo Push fan-out)
// =========================================================================

async function readPushTokens() {
  const raw = await AsyncStorage.getItem(PUSH_TOKENS_KEY);
  return raw ? JSON.parse(raw) : {};
}

export async function registerPushToken(userId, token) {
  if (!userId || !token) return;
  const map = await readPushTokens();
  const set = new Set(map[userId] || []);
  set.add(token);
  map[userId] = [...set];
  await AsyncStorage.setItem(PUSH_TOKENS_KEY, JSON.stringify(map));
}

export async function getPushTokens(userIds) {
  const map = await readPushTokens();
  const ids = Array.isArray(userIds) ? userIds : [userIds];
  return ids.flatMap(id => map[id] || []);
}

// =========================================================================
// AUTH (local) — mirrors the shape of the Supabase auth API so AuthContext
// can route through backend.auth uniformly. Local auth is demo-grade.
// =========================================================================

function djb2Hash(plain) { return djb2(plain); }

// Demo verification "tokens": userId -> 6-digit code. In a real backend the
// provider emails a link/code; here we generate one and expose it so the demo
// flow is testable offline (see VerifyEmailScreen dev hint).
const VERIFY_CODES_KEY = 'vf.verifyCodes';

async function readVerifyCodes() {
  const raw = await AsyncStorage.getItem(VERIFY_CODES_KEY);
  return raw ? JSON.parse(raw) : {};
}
async function setVerifyCode(userId) {
  const codes = await readVerifyCodes();
  const code = String(Math.floor(100000 + Math.random() * 900000));
  codes[userId] = code;
  await AsyncStorage.setItem(VERIFY_CODES_KEY, JSON.stringify(codes));
  // Surface the code to the console so testers can "receive" it.
  console.log(`[VERIFY] Demo verification code for ${userId}: ${code}`);
  return code;
}

export const auth = {
  async signUpWithEmail({ email, password, displayName, username, role }) {
    const uname = (username || email || '').trim().toLowerCase();
    const existing = await getUserByUsername(uname);
    if (existing) throw new Error('Account already exists');
    const user = await createUser({
      username: uname,
      email: email || '',
      passwordHash: djb2Hash(password),
      displayName: displayName || uname,
      role: role || 'user',
      provider: 'local',
      emailVerified: false, // must verify before using the app
    });
    await setVerifyCode(user.id);
    await AsyncStorage.setItem(SESSION_KEY, JSON.stringify({ userId: user.id }));
    return user;
  },

  async signInWithEmail({ email, username, password }) {
    const uname = (username || email || '').trim().toLowerCase();
    const user = await getUserByUsername(uname);
    if (!user || user.passwordHash !== djb2Hash(password)) {
      throw new Error('Invalid credentials');
    }
    await AsyncStorage.setItem(SESSION_KEY, JSON.stringify({ userId: user.id }));
    return user;
  },

  // Local OAuth is a deterministic demo (no real provider round-trip).
  async signInWithProvider(provider) {
    if (!['google', 'facebook'].includes(provider)) {
      throw new Error(`Unsupported provider: ${provider}`);
    }
    const providerId = `${provider}-demo-id`;
    let user = await getUserByProvider(provider, providerId);
    if (!user) {
      user = await createUser({
        username: `${provider}_demo`,
        email: `demo@${provider}.example`,
        passwordHash: '',
        displayName: provider === 'google' ? 'Google Demo User' : 'Facebook Demo User',
        role: 'user',
        provider,
        providerId,
        emailVerified: true, // OAuth providers return verified emails
      });
    }
    await AsyncStorage.setItem(SESSION_KEY, JSON.stringify({ userId: user.id }));
    return user;
  },

  async getSession() {
    const raw = await AsyncStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const { userId } = JSON.parse(raw);
    const user = await getUser(userId);
    return user ? { user } : null;
  },

  // Re-fetch the session user (used to pick up a freshly-verified email).
  async refreshSession() {
    return this.getSession();
  },

  // Re-issue a verification code (demo: logs to console).
  async resendVerification() {
    const raw = await AsyncStorage.getItem(SESSION_KEY);
    if (!raw) throw new Error('Not signed in');
    const { userId } = JSON.parse(raw);
    const user = await getUser(userId);
    if (!user) throw new Error('User not found');
    if (user.emailVerified) return { alreadyVerified: true };
    await setVerifyCode(userId);
    return { sent: true };
  },

  // Confirm the emailed code. Returns the updated, verified user.
  async confirmVerification(code) {
    const raw = await AsyncStorage.getItem(SESSION_KEY);
    if (!raw) throw new Error('Not signed in');
    const { userId } = JSON.parse(raw);
    const codes = await readVerifyCodes();
    if (!code || String(code).trim() !== codes[userId]) {
      throw new Error('Invalid verification code');
    }
    const updated = await updateUser(userId, { emailVerified: true });
    delete codes[userId];
    await AsyncStorage.setItem(VERIFY_CODES_KEY, JSON.stringify(codes));
    return updated;
  },

  async signOut() {
    await AsyncStorage.removeItem(SESSION_KEY);
  },

  // No-op on local; Supabase uses this to react to auth changes.
  onAuthStateChange() {
    return { unsubscribe() {} };
  },
};

// =========================================================================
// REALTIME
// =========================================================================

export function subscribeVendors(callback) {
  subscribers.add(callback);
  readVendors().then(callback).catch(() => {});
  return () => subscribers.delete(callback);
}
