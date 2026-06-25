// src/services/backend/localBackend.js
// Local backend using AsyncStorage. Designed to mirror a real backend's API
// so screens don't need to change when swapping to Firebase.

import AsyncStorage from '@react-native-async-storage/async-storage';

const VENDORS_KEY = 'vf.vendors';
const FAVORITES_KEY = 'vf.favorites';
const USERS_KEY = 'vf.users';
const BROADCASTS_KEY = 'vf.broadcasts';

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
// BROADCASTS (vendor → followers)
// =========================================================================

export async function sendBroadcast(vendorId, message) {
  const raw = await AsyncStorage.getItem(BROADCASTS_KEY);
  const list = raw ? JSON.parse(raw) : [];
  const entry = { id: `b_${Date.now()}`, vendorId, message, at: Date.now() };
  list.unshift(entry);
  await AsyncStorage.setItem(BROADCASTS_KEY, JSON.stringify(list.slice(0, 200)));
  return entry;
}

export async function listBroadcasts(vendorId) {
  const raw = await AsyncStorage.getItem(BROADCASTS_KEY);
  const list = raw ? JSON.parse(raw) : [];
  return vendorId ? list.filter(b => b.vendorId === vendorId) : list;
}

// =========================================================================
// REALTIME
// =========================================================================

export function subscribeVendors(callback) {
  subscribers.add(callback);
  readVendors().then(callback).catch(() => {});
  return () => subscribers.delete(callback);
}
