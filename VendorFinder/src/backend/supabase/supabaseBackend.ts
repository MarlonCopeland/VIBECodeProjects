// src/backend/supabase/supabaseBackend.ts
// Supabase implementation of the Backend contract. Mirrors localBackend so
// screens/contexts never change. See supabase/ for the SQL schema, RLS
// policies, and Edge Functions this depends on.
//
// Tables: profiles, vendors, favorites, notifications, push_tokens
// View:   vendor_weekly_usage  (bucket, count per vendor for the current week)
// Edge Functions: send-notification, create-checkout-session, customer-portal
//
// Quota enforcement for sends happens SERVER-SIDE in the `send-notification`
// Edge Function (so clients can't bypass it); it reuses the shared quota engine.

import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import type { Session as SbSession, User as SbUser } from '@supabase/supabase-js';
import { getSupabase } from './client';
import type {
  AppUser,
  AuthApi,
  AuthChangeCallback,
  Backend,
  BroadcastsApi,
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
  UserRole,
  UsersApi,
  Vendor,
  VendorFilter,
  VendorNotification,
  VendorPatch,
  VendorRegistration,
  VendorsApi,
  WeeklyUsage,
} from '../types';

WebBrowser.maybeCompleteAuthSession();

const AVATAR_BUCKET = 'avatars';

type Row = Record<string, unknown>;

// ---- row <-> app mappers ----------------------------------------------------

/** Build an AppUser from a profile row alone (directory/cross-user reads). */
function profileToAppUser(row: Row | null | undefined): AppUser | null {
  if (!row) return null;
  return {
    id: row.id as string,
    email: (row.email as string) || '',
    displayName: (row.display_name as string) || (row.username as string) || 'User',
    role: (row.role as UserRole) || 'user',
    avatarUrl: (row.avatar_url as string) ?? null,
    emailVerified: row.email_verified != null ? !!row.email_verified : true,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    createdAt: (row.created_at as string) || new Date().toISOString(),
    username: (row.username as string) ?? undefined,
    interests: (row.interests as string[]) ?? [],
    vendorId: (row.vendor_id as string) ?? null,
    provider: (row.provider as AppUser['provider']) ?? 'email',
    providerId: (row.provider_id as string) ?? null,
  };
}

/** Build an AppUser from a Supabase auth user + optional profile row. */
function toAppUser(u: SbUser, profile?: Row | null): AppUser {
  const meta = (u.user_metadata ?? {}) as Row;
  const base = profileToAppUser(profile) ?? {
    id: u.id,
    email: u.email ?? '',
    displayName:
      (meta.display_name as string) ||
      (meta.full_name as string) ||
      (u.email ? u.email.split('@')[0] : 'User') ||
      'User',
    role: 'user' as UserRole,
    avatarUrl: (meta.avatar_url as string) ?? null,
    emailVerified: false,
    metadata: {},
    createdAt: u.created_at ?? new Date().toISOString(),
    username: (meta.username as string) ?? undefined,
    interests: [],
    vendorId: null,
    provider: 'email' as AppUser['provider'],
    providerId: null,
  };
  return { ...base, email: u.email ?? base.email, emailVerified: !!u.email_confirmed_at };
}

function mapVendor(row: Row | null | undefined): Vendor | null {
  if (!row) return null;
  return {
    id: row.id as string,
    name: row.name as string,
    type: (row.type as Vendor['type']) || 'Other',
    tags: (row.tags as string[]) || [],
    description: (row.description as string) || '',
    ownerId: row.owner_id as string,
    blockedUserIds: (row.blocked_user_ids as string[]) || [],
    schedule: (row.schedule as Vendor['schedule']) || [],
    currentLocation: (row.current_location as Vendor['currentLocation']) || null,
    isOpen: !!row.is_open,
    rating: (row.rating as number) || 0,
    subscriptionTier: (row.subscription_tier as Vendor['subscriptionTier']) || 'free',
    subscriptionStatus: (row.subscription_status as Vendor['subscriptionStatus']) || 'active',
    createdAt: row.created_at ? new Date(row.created_at as string).getTime() : Date.now(),
  };
}

function mapNotification(row: Row): VendorNotification {
  return {
    id: row.id as string,
    vendorId: row.vendor_id as string,
    type: row.type as VendorNotification['type'],
    title: (row.title as string) || '',
    body: (row.body as string) || '',
    buckets: (row.buckets as VendorNotification['buckets']) || [],
    recipientIds: (row.recipient_ids as string[]) || [],
    at: row.created_at ? new Date(row.created_at as string).getTime() : Date.now(),
  };
}

function vendorPatchToRow(patch: VendorPatch): Row {
  const row: Row = {};
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

function userPatchToRow(patch: Partial<AppUser>): Row {
  const row: Row = {};
  if ('username' in patch) row.username = patch.username;
  if ('email' in patch) row.email = patch.email;
  if ('displayName' in patch) row.display_name = patch.displayName;
  if ('role' in patch) row.role = patch.role;
  if ('interests' in patch) row.interests = patch.interests;
  if ('vendorId' in patch) row.vendor_id = patch.vendorId;
  if ('avatarUrl' in patch) row.avatar_url = patch.avatarUrl;
  if ('metadata' in patch) row.metadata = patch.metadata;
  return row;
}

async function sessionFromSb(sb: SbSession | null): Promise<Session | null> {
  if (!sb?.user) return null;
  const supabase = getSupabase();
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', sb.user.id)
    .maybeSingle();
  return {
    user: toAppUser(sb.user, profile),
    accessToken: sb.access_token,
    expiresAt: sb.expires_at,
  };
}

// =========================================================================
// AUTH
// =========================================================================

const auth: AuthApi = {
  async getSession() {
    const supabase = getSupabase();
    const { data } = await supabase.auth.getSession();
    return sessionFromSb(data.session);
  },

  async refreshSession() {
    const supabase = getSupabase();
    const { data } = await supabase.auth.refreshSession();
    return sessionFromSb(data.session);
  },

  onAuthStateChange(cb: AuthChangeCallback): Unsubscribe {
    const supabase = getSupabase();
    const { data } = supabase.auth.onAuthStateChange((_event, sb) => {
      void sessionFromSb(sb).then(cb);
    });
    return { unsubscribe: () => data.subscription.unsubscribe() };
  },

  async signUpWithEmail(input: SignUpInput): Promise<SignUpResult> {
    const supabase = getSupabase();
    const redirectTo = Linking.createURL('/verify-email');
    const { data, error } = await supabase.auth.signUp({
      email: input.email.trim(),
      password: input.password,
      options: {
        emailRedirectTo: redirectTo,
        data: {
          display_name: input.displayName,
          username: input.username || input.email.trim(),
          role: input.role || 'user',
        },
      },
    });
    if (error) throw error;
    const session = await sessionFromSb(data.session);
    return {
      user: data.user ? toAppUser(data.user) : null,
      session,
      needsEmailConfirmation: !data.session,
    };
  },

  async signInWithEmail(input: SignInInput): Promise<Session> {
    const supabase = getSupabase();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: input.email.trim(),
      password: input.password,
    });
    if (error) throw error;
    const session = await sessionFromSb(data.session);
    if (!session) throw new Error('Sign-in did not return a session.');
    return session;
  },

  async signInWithProvider(provider: OAuthProvider): Promise<Session | null> {
    const supabase = getSupabase();
    const redirectTo = Linking.createURL('/');
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo, skipBrowserRedirect: true },
    });
    if (error) throw error;
    if (!data?.url) throw new Error('OAuth provider returned no URL.');

    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
    if (result.type !== 'success' || !result.url) return null;

    const url = new URL(result.url);
    const code = url.searchParams.get('code');
    if (code) {
      const { error: exErr } = await supabase.auth.exchangeCodeForSession(code);
      if (exErr) throw exErr;
    }
    const { data: sess } = await supabase.auth.getSession();
    return sessionFromSb(sess.session);
  },

  async signInWithMagicLink(email: string): Promise<void> {
    const supabase = getSupabase();
    const emailRedirectTo = Linking.createURL('/');
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo },
    });
    if (error) throw error;
  },

  async sendPasswordReset(email: string): Promise<void> {
    const supabase = getSupabase();
    const redirectTo = Linking.createURL('/reset-password');
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo });
    if (error) throw error;
  },

  async updatePassword(newPassword: string): Promise<void> {
    const supabase = getSupabase();
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw error;
  },

  async resendVerification(email: string): Promise<void> {
    const supabase = getSupabase();
    const { error } = await supabase.auth.resend({ type: 'signup', email: email.trim() });
    if (error) throw error;
  },

  // Supabase confirms via the email link; re-reading the session picks up the
  // new `email_confirmed_at`. The `code` argument is ignored here.
  async confirmVerification(_code: string): Promise<Session | null> {
    return auth.refreshSession();
  },

  async signOut(): Promise<void> {
    const supabase = getSupabase();
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  },
};

// =========================================================================
// PROFILE (current user)
// =========================================================================

const profile: ProfileApi = {
  async getProfile(userId: string): Promise<AppUser | null> {
    const supabase = getSupabase();
    const { data: prof } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
    const { data: userRes } = await supabase.auth.getUser();
    if (userRes.user && userRes.user.id === userId) return toAppUser(userRes.user, prof);
    return profileToAppUser(prof);
  },

  async updateProfile(userId, patch): Promise<AppUser> {
    const supabase = getSupabase();
    const row: Row = { updated_at: new Date().toISOString() };
    if (patch.displayName !== undefined) row.display_name = patch.displayName;
    if (patch.avatarUrl !== undefined) row.avatar_url = patch.avatarUrl;
    if (patch.metadata !== undefined) row.metadata = patch.metadata;
    if (patch.interests !== undefined) row.interests = patch.interests;

    const { data, error } = await supabase
      .from('profiles')
      .update(row)
      .eq('id', userId)
      .select('*')
      .single();
    if (error) throw error;

    const { data: userRes } = await supabase.auth.getUser();
    if (userRes.user) return toAppUser(userRes.user, data);
    return profileToAppUser(data)!;
  },

  async uploadAvatar(userId: string, fileUri: string): Promise<string> {
    const supabase = getSupabase();
    const res = await fetch(fileUri);
    const blob = await res.blob();
    const ext = (fileUri.split('.').pop() || 'jpg').split('?')[0];
    const path = `${userId}/avatar-${Date.now()}.${ext}`;

    const { error } = await supabase.storage
      .from(AVATAR_BUCKET)
      .upload(path, blob, { upsert: true, contentType: blob.type || 'image/jpeg' });
    if (error) throw error;

    const { data } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path);
    return data.publicUrl;
  },

  async deleteAccount(_userId: string): Promise<void> {
    const supabase = getSupabase();
    const { error } = await supabase.rpc('delete_own_account');
    if (error) throw error;
    await supabase.auth.signOut();
  },
};

// =========================================================================
// USERS directory
// =========================================================================

const users: UsersApi = {
  async get(id: string): Promise<AppUser | null> {
    const supabase = getSupabase();
    const { data, error } = await supabase.from('profiles').select('*').eq('id', id).maybeSingle();
    if (error) throw error;
    return profileToAppUser(data);
  },

  async list(): Promise<AppUser[]> {
    const supabase = getSupabase();
    const { data, error } = await supabase.from('profiles').select('*');
    if (error) throw error;
    return (data || []).map((r) => profileToAppUser(r)!).filter(Boolean);
  },

  async update(id: string, patch: Partial<AppUser>): Promise<AppUser> {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('profiles')
      .update(userPatchToRow(patch))
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw error;
    return profileToAppUser(data)!;
  },
};

// =========================================================================
// VENDORS
// =========================================================================

const vendors: VendorsApi = {
  async list(filter: VendorFilter = {}): Promise<Vendor[]> {
    const supabase = getSupabase();
    let q = supabase.from('vendors').select('*');
    if (filter.type) q = q.eq('type', filter.type);
    if (filter.openOnly) q = q.eq('is_open', true);
    const { data, error } = await q;
    if (error) throw error;
    let result = (data || []).map((r) => mapVendor(r)!).filter(Boolean);
    if (filter.viewerUserId) {
      const viewer = filter.viewerUserId;
      result = result.filter((v) => !(v.blockedUserIds || []).includes(viewer));
    }
    if (filter.query) {
      const ql = filter.query.toLowerCase();
      result = result.filter(
        (v) =>
          v.name.toLowerCase().includes(ql) ||
          v.type.toLowerCase().includes(ql) ||
          (v.description || '').toLowerCase().includes(ql) ||
          (v.tags || []).some((t) => t.toLowerCase().includes(ql)),
      );
    }
    if (filter.tag) result = result.filter((v) => (v.tags || []).includes(filter.tag!));
    return result;
  },

  async get(id: string): Promise<Vendor | null> {
    const supabase = getSupabase();
    const { data, error } = await supabase.from('vendors').select('*').eq('id', id).maybeSingle();
    if (error) throw error;
    return mapVendor(data);
  },

  async getByOwner(ownerId: string): Promise<Vendor | null> {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('vendors')
      .select('*')
      .eq('owner_id', ownerId)
      .maybeSingle();
    if (error) throw error;
    return mapVendor(data);
  },

  async register(data: VendorRegistration): Promise<Vendor> {
    const supabase = getSupabase();
    const row: Row = {
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
    const { data: inserted, error } = await supabase.from('vendors').insert(row).select('*').single();
    if (error) throw error;
    return mapVendor(inserted)!;
  },

  async update(id: string, patch: VendorPatch): Promise<Vendor> {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('vendors')
      .update(vendorPatchToRow(patch))
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw error;
    return mapVendor(data)!;
  },

  async remove(id: string): Promise<void> {
    const supabase = getSupabase();
    const { error } = await supabase.from('vendors').delete().eq('id', id);
    if (error) throw error;
  },

  subscribe(cb: (vendors: Vendor[]) => void): () => void {
    const supabase = getSupabase();
    vendors.list().then(cb).catch(() => {});
    const channel = supabase
      .channel('vendors-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vendors' }, () => {
        vendors.list().then(cb).catch(() => {});
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  },
};

// =========================================================================
// FAVORITES / FOLLOWERS
// =========================================================================

const favorites: FavoritesApi = {
  async list(userId: string): Promise<string[]> {
    const supabase = getSupabase();
    const { data, error } = await supabase.from('favorites').select('vendor_id').eq('user_id', userId);
    if (error) throw error;
    return (data || []).map((r) => r.vendor_id as string);
  },

  async add(userId: string, vendorId: string): Promise<void> {
    const supabase = getSupabase();
    const { error } = await supabase.from('favorites').insert({ user_id: userId, vendor_id: vendorId });
    if (error && error.code !== '23505') throw error; // ignore duplicate
  },

  async remove(userId: string, vendorId: string): Promise<void> {
    const supabase = getSupabase();
    const { error } = await supabase
      .from('favorites')
      .delete()
      .eq('user_id', userId)
      .eq('vendor_id', vendorId);
    if (error) throw error;
  },

  async listFollowers(vendorId: string): Promise<AppUser[]> {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('favorites')
      .select('user_id, profiles!inner(*)')
      .eq('vendor_id', vendorId);
    if (error) throw error;
    return (data || [])
      .map((r) => profileToAppUser((r as Row).profiles as Row))
      .filter((u): u is AppUser => !!u);
  },

  async blockFollower(vendorId: string, userId: string): Promise<void> {
    const vendor = await vendors.get(vendorId);
    if (!vendor) throw new Error('Vendor not found');
    const blocked = new Set(vendor.blockedUserIds || []);
    blocked.add(userId);
    await vendors.update(vendorId, { blockedUserIds: [...blocked] });
    await favorites.remove(userId, vendorId);
  },

  async unblockFollower(vendorId: string, userId: string): Promise<void> {
    const vendor = await vendors.get(vendorId);
    if (!vendor) throw new Error('Vendor not found');
    await vendors.update(vendorId, {
      blockedUserIds: (vendor.blockedUserIds || []).filter((id) => id !== userId),
    });
  },

  async removeFollower(vendorId: string, userId: string): Promise<void> {
    await favorites.remove(userId, vendorId);
  },
};

// =========================================================================
// BROADCASTS — server-enforced quota via Edge Function
// =========================================================================

const broadcasts: BroadcastsApi = {
  async send(vendorId, input): Promise<SendNotificationResult> {
    const supabase = getSupabase();
    const { data, error } = await supabase.functions.invoke('send-notification', {
      body: { vendorId, type: input.type, title: input.title, body: input.body },
    });
    if (error) {
      const e = new Error(error.message || 'Failed to send notification') as Error & {
        code?: string;
        decision?: unknown;
      };
      const ctx = (error as { context?: { status?: number; body?: { decision?: unknown } } }).context;
      if (ctx?.status === 429) {
        e.code = 'QUOTA_EXCEEDED';
        e.decision = ctx?.body?.decision;
      }
      throw e;
    }
    return data as SendNotificationResult;
  },

  async list(vendorId?: string): Promise<VendorNotification[]> {
    const supabase = getSupabase();
    let q = supabase.from('notifications').select('*').order('created_at', { ascending: false });
    if (vendorId) q = q.eq('vendor_id', vendorId);
    const { data, error } = await q;
    if (error) throw error;
    return (data || []).map(mapNotification);
  },

  async listForUser(userId: string): Promise<VendorNotification[]> {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .contains('recipient_ids', [userId])
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data || []).map(mapNotification);
  },

  async getWeeklyUsage(vendorId: string): Promise<WeeklyUsage> {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('vendor_weekly_usage')
      .select('bucket, count')
      .eq('vendor_id', vendorId);
    if (error) throw error;
    const usage: WeeklyUsage = {};
    (data || []).forEach((r) => {
      usage[(r as Row).bucket as keyof WeeklyUsage] = Number((r as Row).count);
    });
    return usage;
  },
};

// =========================================================================
// SUBSCRIPTIONS
// =========================================================================

const subscriptions: SubscriptionsApi = {
  async get(vendorId: string) {
    const vendor = await vendors.get(vendorId);
    if (!vendor) return null;
    return { vendorId, tier: vendor.subscriptionTier, status: vendor.subscriptionStatus };
  },

  // On Supabase, tier changes normally flow through Stripe + a webhook. This
  // direct setter exists for admin overrides / local parity and is RLS-guarded.
  async setTier(vendorId, tierId, status = 'active') {
    return vendors.update(vendorId, { subscriptionTier: tierId, subscriptionStatus: status });
  },
};

// =========================================================================
// PUSH TOKENS
// =========================================================================

const notifications: NotificationsApi = {
  async registerPushToken(userId: string, token: string): Promise<void> {
    if (!userId || !token) return;
    const supabase = getSupabase();
    const { error } = await supabase
      .from('push_tokens')
      .upsert({ user_id: userId, token }, { onConflict: 'token' });
    if (error) throw error;
  },
  async removePushToken(_userId: string, token: string): Promise<void> {
    const supabase = getSupabase();
    const { error } = await supabase.from('push_tokens').delete().eq('token', token);
    if (error) throw error;
  },
};

export const supabaseBackend: Backend = {
  mode: 'supabase',
  auth,
  profile,
  users,
  vendors,
  favorites,
  broadcasts,
  subscriptions,
  notifications,
};
