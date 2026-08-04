// src/services/backend/supabaseBackend.js
// Supabase implementation of the backend facade. Mirrors localBackend.js so
// screens/contexts never change. See SUPABASE_SETUP.md for the SQL schema,
// RLS policies, and Edge Functions this depends on.
//
// Tables: profiles, vendors, favorites, notifications, push_tokens
// Edge Functions: send-notification, create-checkout-session, customer-portal
//
// Quota enforcement for sends happens SERVER-SIDE in the `send-notification`
// Edge Function (so clients can't bypass it). The shared quota engine in
// config/tiers.js is also used there.

import { getSupabase } from './supabaseClient';
import {
  makeRedirectUri, startAsync,
} from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';
import { APP_SCHEME } from '../../config/env';

WebBrowser.maybeCompleteAuthSession();

// ---- row <-> app mappers ----------------------------------------------------
function mapVendor(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    tags: row.tags || [],
    description: row.description || '',
    ownerId: row.owner_id,
    blockedUserIds: row.blocked_user_ids || [],
    schedule: row.schedule || [],
    currentLocation: row.current_location || null,
    isOpen: !!row.is_open,
    rating: row.rating || 0,
    subscriptionTier: row.subscription_tier || 'free',
    subscriptionStatus: row.subscription_status || 'active',
    createdAt: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
  };
}

function mapUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    email: row.email || '',
    displayName: row.display_name || row.username,
    role: row.role || 'user',
    provider: row.provider || 'email',
    providerId: row.provider_id || null,
    interests: row.interests || [],
    vendorId: row.vendor_id || null,
    createdAt: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
  };
}

function vendorPatchToRow(patch) {
  const row = {};
  if ('name' in patch) row.name = patch.name;
  if ('type' in patch) row.type = patch.type;
  if ('tags' in patch) row.tags = patch.tags;
  if ('description' in patch) row.description = patch.description;
  if ('blockedUserIds' in patch) row.blocked_user_ids = patch.blockedUserIds;
  if ('schedule' in patch) row.schedule = patch.schedule;
  if ('currentLocation' in patch) row.current_location = patch.currentLocation;
  if ('isOpen' in patch) row.is_open = patch.isOpen;
  if ('subscriptionTier' in patch) row.subscription_tier = patch.subscriptionTier;
  if ('subscriptionStatus' in patch) row.subscription_status = patch.subscriptionStatus;
  return row;
}

function userPatchToRow(patch) {
  const row = {};
  if ('username' in patch) row.username = patch.username;
  if ('email' in patch) row.email = patch.email;
  if ('displayName' in patch) row.display_name = patch.displayName;
  if ('role' in patch) row.role = patch.role;
  if ('interests' in patch) row.interests = patch.interests;
  if ('vendorId' in patch) row.vendor_id = patch.vendorId;
  return row;
}

// =========================================================================
// VENDORS
// =========================================================================
export async function listVendors(filter = {}) {
  const sb = getSupabase();
  let q = sb.from('vendors').select('*');
  if (filter.type) q = q.eq('type', filter.type);
  if (filter.openOnly) q = q.eq('is_open', true);
  const { data, error } = await q;
  if (error) throw error;
  let vendors = (data || []).map(mapVendor);
  if (filter.viewerUserId) {
    vendors = vendors.filter(v => !(v.blockedUserIds || []).includes(filter.viewerUserId));
  }
  if (filter.query) {
    const ql = filter.query.toLowerCase();
    vendors = vendors.filter(v =>
      v.name.toLowerCase().includes(ql) ||
      v.type.toLowerCase().includes(ql) ||
      (v.description || '').toLowerCase().includes(ql) ||
      (v.tags || []).some(t => t.toLowerCase().includes(ql)));
  }
  if (filter.tag) vendors = vendors.filter(v => (v.tags || []).includes(filter.tag));
  return vendors;
}

export async function getVendor(id) {
  const sb = getSupabase();
  const { data, error } = await sb.from('vendors').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return mapVendor(data);
}

export async function getVendorByOwner(ownerId) {
  const sb = getSupabase();
  const { data, error } = await sb.from('vendors').select('*').eq('owner_id', ownerId).maybeSingle();
  if (error) throw error;
  return mapVendor(data);
}

export async function registerVendor(data) {
  const sb = getSupabase();
  const row = {
    name: data.name,
    type: data.type || 'Other',
    tags: data.tags || [],
    description: data.description || '',
    owner_id: data.ownerId,
    blocked_user_ids: [],
    schedule: data.schedule || [],
    current_location: data.currentLocation || null,
    is_open: !!data.isOpen,
    rating: 0,
    subscription_tier: data.subscriptionTier || 'free',
    subscription_status: data.subscriptionStatus || 'active',
  };
  const { data: inserted, error } = await sb.from('vendors').insert(row).select('*').single();
  if (error) throw error;
  return mapVendor(inserted);
}

export async function updateVendor(id, patch) {
  const sb = getSupabase();
  const { data, error } = await sb.from('vendors')
    .update(vendorPatchToRow(patch)).eq('id', id).select('*').single();
  if (error) throw error;
  return mapVendor(data);
}

export async function deleteVendor(id) {
  const sb = getSupabase();
  const { error } = await sb.from('vendors').delete().eq('id', id);
  if (error) throw error;
}

// =========================================================================
// FAVORITES / FOLLOWERS
// =========================================================================
export async function listFavorites(userId) {
  const sb = getSupabase();
  const { data, error } = await sb.from('favorites').select('vendor_id').eq('user_id', userId);
  if (error) throw error;
  return (data || []).map(r => r.vendor_id);
}

export async function addFavorite(userId, vendorId) {
  const sb = getSupabase();
  const { error } = await sb.from('favorites').insert({ user_id: userId, vendor_id: vendorId });
  if (error && error.code !== '23505') throw error; // ignore duplicate
}

export async function removeFavorite(userId, vendorId) {
  const sb = getSupabase();
  const { error } = await sb.from('favorites')
    .delete().eq('user_id', userId).eq('vendor_id', vendorId);
  if (error) throw error;
}

export async function listFollowers(vendorId) {
  const sb = getSupabase();
  const { data, error } = await sb.from('favorites')
    .select('user_id, profiles!inner(*)').eq('vendor_id', vendorId);
  if (error) throw error;
  return (data || []).map(r => mapUser(r.profiles));
}

export async function blockFollower(vendorId, userId) {
  const vendor = await getVendor(vendorId);
  if (!vendor) throw new Error('Vendor not found');
  const blocked = new Set(vendor.blockedUserIds || []);
  blocked.add(userId);
  await updateVendor(vendorId, { blockedUserIds: [...blocked] });
  await removeFavorite(userId, vendorId);
}

export async function unblockFollower(vendorId, userId) {
  const vendor = await getVendor(vendorId);
  if (!vendor) throw new Error('Vendor not found');
  await updateVendor(vendorId, {
    blockedUserIds: (vendor.blockedUserIds || []).filter(id => id !== userId),
  });
}

export async function removeFollower(vendorId, userId) {
  await removeFavorite(userId, vendorId);
}

// =========================================================================
// USERS (profiles)
// =========================================================================
export async function createUser(data) {
  const sb = getSupabase();
  const row = {
    id: data.id, // when called post-auth, pass the auth user id
    username: data.username,
    email: data.email || '',
    display_name: data.displayName || data.username,
    role: data.role || 'user',
    provider: data.provider || 'email',
    provider_id: data.providerId || null,
    interests: data.interests || [],
    vendor_id: data.vendorId || null,
  };
  const { data: inserted, error } = await sb.from('profiles').insert(row).select('*').single();
  if (error) throw error;
  return mapUser(inserted);
}

export async function getUser(id) {
  const sb = getSupabase();
  const { data, error } = await sb.from('profiles').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return mapUser(data);
}

export async function getUserByUsername(username) {
  const sb = getSupabase();
  const { data, error } = await sb.from('profiles').select('*').eq('username', username).maybeSingle();
  if (error) throw error;
  return mapUser(data);
}

export async function getUserByProvider(provider, providerId) {
  const sb = getSupabase();
  const { data, error } = await sb.from('profiles')
    .select('*').eq('provider', provider).eq('provider_id', providerId).maybeSingle();
  if (error) throw error;
  return mapUser(data);
}

export async function updateUser(id, patch) {
  const sb = getSupabase();
  const { data, error } = await sb.from('profiles')
    .update(userPatchToRow(patch)).eq('id', id).select('*').single();
  if (error) throw error;
  return mapUser(data);
}

export async function listUsers() {
  const sb = getSupabase();
  const { data, error } = await sb.from('profiles').select('*');
  if (error) throw error;
  return (data || []).map(mapUser);
}

// =========================================================================
// NOTIFICATIONS — server-enforced quota via Edge Function
// =========================================================================
export async function sendNotification(vendorId, { type, title, body }) {
  const sb = getSupabase();
  const { data, error } = await sb.functions.invoke('send-notification', {
    body: { vendorId, type, title, body },
  });
  if (error) {
    // Surface quota rejections with a stable code for the UI.
    const e = new Error(error.message || 'Failed to send notification');
    const ctx = error.context;
    if (ctx?.status === 429) { e.code = 'QUOTA_EXCEEDED'; e.decision = ctx?.body?.decision; }
    throw e;
  }
  return data; // { notification, followers, remaining }
}

export async function listNotifications(vendorId) {
  const sb = getSupabase();
  let q = sb.from('notifications').select('*').order('created_at', { ascending: false });
  if (vendorId) q = q.eq('vendor_id', vendorId);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

export async function listNotificationsForUser(userId) {
  const sb = getSupabase();
  const { data, error } = await sb.from('notifications')
    .select('*').contains('recipient_ids', [userId])
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function getWeeklyUsage(vendorId) {
  const sb = getSupabase();
  // A SQL view `vendor_weekly_usage` returns { bucket, count } rows.
  const { data, error } = await sb.from('vendor_weekly_usage')
    .select('bucket, count').eq('vendor_id', vendorId);
  if (error) throw error;
  const usage = {};
  (data || []).forEach(r => { usage[r.bucket] = Number(r.count); });
  return usage;
}

// Compat shims
export async function sendBroadcast(vendorId, message) {
  const res = await sendNotification(vendorId, { type: 'open_for_business', body: message });
  return res.notification;
}
export async function listBroadcasts(vendorId) {
  return listNotifications(vendorId);
}

// =========================================================================
// SUBSCRIPTIONS
// =========================================================================
export async function getSubscription(vendorId) {
  const vendor = await getVendor(vendorId);
  if (!vendor) return null;
  return { vendorId, tier: vendor.subscriptionTier, status: vendor.subscriptionStatus };
}

// On Supabase, tier changes flow through Stripe + webhook. This direct setter
// exists for admin overrides / local parity and is RLS-guarded to admins.
export async function setSubscriptionTier(vendorId, tierId, status = 'active') {
  return updateVendor(vendorId, { subscriptionTier: tierId, subscriptionStatus: status });
}

// =========================================================================
// PUSH TOKENS
// =========================================================================
export async function registerPushToken(userId, token) {
  if (!userId || !token) return;
  const sb = getSupabase();
  const { error } = await sb.from('push_tokens')
    .upsert({ user_id: userId, token }, { onConflict: 'token' });
  if (error) throw error;
}

export async function getPushTokens(userIds) {
  const sb = getSupabase();
  const ids = Array.isArray(userIds) ? userIds : [userIds];
  const { data, error } = await sb.from('push_tokens').select('token').in('user_id', ids);
  if (error) throw error;
  return (data || []).map(r => r.token);
}

// =========================================================================
// AUTH
// =========================================================================

// A Supabase auth user's email is verified once `email_confirmed_at` is set.
// OAuth providers (Google/Facebook) set this immediately.
function isAuthUserVerified(authUser) {
  return !!(authUser?.email_confirmed_at || authUser?.confirmed_at);
}

// Merge the verification flag from the auth user onto the app profile.
function withVerification(profile, authUser) {
  if (!profile) return profile;
  return { ...profile, emailVerified: isAuthUserVerified(authUser) };
}

export const auth = {
  async signUpWithEmail({ email, password, displayName, username, role }) {
    const sb = getSupabase();
    const { data, error } = await sb.auth.signUp({
      email,
      password,
      options: { data: { display_name: displayName, username, role } },
    });
    if (error) throw error;
    const authUser = data.user;
    if (!authUser) throw new Error('Check your email to confirm your account.');
    // Profile row is created by a DB trigger (see SUPABASE_SETUP.md). If a
    // vendor signup, the screen will call registerVendor afterward.
    const profile = await getUser(authUser.id);
    const base = profile || mapUser({ id: authUser.id, username, email, role, display_name: displayName });
    // Brand-new email/password accounts are unverified until they confirm.
    return withVerification(base, authUser);
  },

  async signInWithEmail({ email, username, password }) {
    const sb = getSupabase();
    const { data, error } = await sb.auth.signInWithPassword({
      email: email || username, password,
    });
    if (error) throw error;
    const profile = await getUser(data.user.id);
    return withVerification(profile, data.user);
  },

  async signInWithProvider(provider) {
    const sb = getSupabase();
    const redirectTo = makeRedirectUri({ scheme: APP_SCHEME, path: 'auth-callback' });

    if (Platform.OS === 'web') {
      const { error } = await sb.auth.signInWithOAuth({ provider, options: { redirectTo } });
      if (error) throw error;
      return null; // web redirects; onAuthStateChange resolves the session
    }

    // Native: open the provider URL, capture the redirect, set the session.
    const { data, error } = await sb.auth.signInWithOAuth({
      provider,
      options: { redirectTo, skipBrowserRedirect: true },
    });
    if (error) throw error;

    const result = await startAsync({ authUrl: data.url, returnUrl: redirectTo });
    if (result.type !== 'success') throw new Error('OAuth cancelled');

    const params = new URLSearchParams(result.url.split('#')[1] || result.url.split('?')[1]);
    const access_token = params.get('access_token');
    const refresh_token = params.get('refresh_token');
    if (access_token && refresh_token) {
      const { error: sErr } = await sb.auth.setSession({ access_token, refresh_token });
      if (sErr) throw sErr;
    }
    const { data: sess } = await sb.auth.getUser();
    if (!sess?.user) return null;
    const profile = await getUser(sess.user.id);
    return withVerification(profile, sess.user);
  },

  async getSession() {
    const sb = getSupabase();
    const { data } = await sb.auth.getSession();
    if (!data?.session?.user) return null;
    const profile = await getUser(data.session.user.id);
    return profile ? { user: withVerification(profile, data.session.user) } : null;
  },

  // Force a fresh read from the server so a just-confirmed email is reflected.
  async refreshSession() {
    const sb = getSupabase();
    // refreshSession pulls updated user claims (incl. email_confirmed_at).
    await sb.auth.refreshSession().catch(() => {});
    const { data } = await sb.auth.getUser();
    if (!data?.user) return null;
    const profile = await getUser(data.user.id);
    return profile ? { user: withVerification(profile, data.user) } : null;
  },

  // Re-send the confirmation email to the signed-in (unverified) user.
  async resendVerification() {
    const sb = getSupabase();
    const { data: u } = await sb.auth.getUser();
    const email = u?.user?.email;
    if (!email) throw new Error('No email on file');
    if (isAuthUserVerified(u.user)) return { alreadyVerified: true };
    const redirectTo = makeRedirectUri({ scheme: APP_SCHEME, path: 'auth-callback' });
    const { error } = await sb.auth.resend({
      type: 'signup',
      email,
      options: { emailRedirectTo: redirectTo },
    });
    if (error) throw error;
    return { sent: true };
  },

  async signOut() {
    const sb = getSupabase();
    await sb.auth.signOut();
  },

  onAuthStateChange(callback) {
    const sb = getSupabase();
    const { data } = sb.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        const profile = await getUser(session.user.id);
        callback(profile ? { user: withVerification(profile, session.user) } : null);
      } else {
        callback(null);
      }
    });
    return { unsubscribe: () => data?.subscription?.unsubscribe?.() };
  },
};

// =========================================================================
// REALTIME
// =========================================================================
export function subscribeVendors(callback) {
  const sb = getSupabase();
  // Initial load.
  listVendors().then(callback).catch(() => {});
  const channel = sb.channel('vendors-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'vendors' },
      () => { listVendors().then(callback).catch(() => {}); })
    .subscribe();
  return () => { sb.removeChannel(channel); };
}
