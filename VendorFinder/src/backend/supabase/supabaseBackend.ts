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
import { applyVendorFilter } from '../vendorFilter';
import { createFollowerActions } from '../followerActions';
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

/** Generic row payload, for writes where the column set is built dynamically. */
type Row = Record<string, unknown>;

// ---- row shapes -------------------------------------------------------------
// Declared explicitly so the mappers below read as plain field copies rather
// than ~40 `row.x as T` casts. Columns are optional because a row may predate a
// migration; the mappers supply the same defaults they always did.

interface ProfileRow {
  id: string;
  username?: string | null;
  email?: string | null;
  display_name?: string | null;
  role?: UserRole | null;
  avatar_url?: string | null;
  email_verified?: boolean | null;
  metadata?: Record<string, unknown> | null;
  provider?: AppUser['provider'] | null;
  provider_id?: string | null;
  interests?: string[] | null;
  vendor_id?: string | null;
  created_at?: string | null;
}

interface VendorRow {
  id: string;
  name: string;
  type?: Vendor['type'] | null;
  tags?: string[] | null;
  description?: string | null;
  owner_id: string;
  blocked_user_ids?: string[] | null;
  schedule?: Vendor['schedule'] | null;
  current_location?: Vendor['currentLocation'];
  is_open?: boolean | null;
  rating?: number | null;
  subscription_tier?: Vendor['subscriptionTier'] | null;
  subscription_status?: Vendor['subscriptionStatus'] | null;
  created_at?: string | null;
}

interface NotificationRow {
  id: string;
  vendor_id: string;
  type: VendorNotification['type'];
  title?: string | null;
  body?: string | null;
  buckets?: VendorNotification['buckets'] | null;
  recipient_ids?: string[] | null;
  created_at?: string | null;
}

interface WeeklyUsageRow {
  bucket: keyof WeeklyUsage;
  count: number | string;
}

/** Auth user_metadata the app writes at sign-up. */
interface UserMetadata {
  display_name?: string;
  full_name?: string;
  username?: string;
  avatar_url?: string;
}

// ---- query helpers ----------------------------------------------------------
// Supabase reports failures in the response payload rather than throwing. These
// unwrap that shape so each method below reads as a single statement, instead of
// repeating get-client / destructure / re-throw ~30 times.

interface SbResponse<T> {
  data: T;
  error: { message: string } | null;
}

/** Await a Supabase query, throwing its error instead of returning it. */
async function unwrap<T>(query: PromiseLike<SbResponse<T>>): Promise<T> {
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

/** Same, for list queries — a null result becomes an empty array. */
async function unwrapRows<T>(query: PromiseLike<SbResponse<T[] | null>>): Promise<T[]> {
  return (await unwrap(query)) ?? [];
}

// ---- row <-> app mappers ----------------------------------------------------

/** Build an AppUser from a profile row alone (directory/cross-user reads). */
function profileToAppUser(row: ProfileRow | null | undefined): AppUser | null {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email || '',
    displayName: row.display_name || row.username || 'User',
    role: row.role || 'user',
    avatarUrl: row.avatar_url ?? null,
    emailVerified: row.email_verified != null ? !!row.email_verified : true,
    metadata: row.metadata ?? {},
    createdAt: row.created_at || new Date().toISOString(),
    username: row.username ?? undefined,
    interests: row.interests ?? [],
    vendorId: row.vendor_id ?? null,
    provider: row.provider ?? 'email',
    providerId: row.provider_id ?? null,
  };
}

/** Build an AppUser from a Supabase auth user + optional profile row. */
function toAppUser(u: SbUser, profile?: ProfileRow | null): AppUser {
  const meta = (u.user_metadata ?? {}) as UserMetadata;
  const base = profileToAppUser(profile) ?? {
    id: u.id,
    email: u.email ?? '',
    displayName:
      meta.display_name ||
      meta.full_name ||
      (u.email ? u.email.split('@')[0] : 'User') ||
      'User',
    role: 'user' as UserRole,
    avatarUrl: meta.avatar_url ?? null,
    emailVerified: false,
    metadata: {},
    createdAt: u.created_at ?? new Date().toISOString(),
    username: meta.username ?? undefined,
    interests: [],
    vendorId: null,
    provider: 'email' as AppUser['provider'],
    providerId: null,
  };
  return { ...base, email: u.email ?? base.email, emailVerified: !!u.email_confirmed_at };
}

function mapVendor(row: VendorRow | null | undefined): Vendor | null {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    type: row.type || 'Other',
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

function mapNotification(row: NotificationRow): VendorNotification {
  return {
    id: row.id,
    vendorId: row.vendor_id,
    type: row.type,
    title: row.title || '',
    body: row.body || '',
    buckets: row.buckets || [],
    recipientIds: row.recipient_ids || [],
    at: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
  };
}

// app field -> database column. Doubles as the allow-list of what a patch may
// write: a field with no entry here is silently ignored, which is what keeps
// callers from pushing `id` or `createdAt` into an UPDATE.
const VENDOR_COLUMNS: Record<keyof VendorPatch, string> = {
  name: 'name',
  type: 'type',
  tags: 'tags',
  description: 'description',
  blockedUserIds: 'blocked_user_ids',
  schedule: 'schedule',
  currentLocation: 'current_location',
  isOpen: 'is_open',
  subscriptionTier: 'subscription_tier',
  subscriptionStatus: 'subscription_status',
};

const PROFILE_COLUMNS: Partial<Record<keyof AppUser, string>> = {
  username: 'username',
  email: 'email',
  displayName: 'display_name',
  role: 'role',
  interests: 'interests',
  vendorId: 'vendor_id',
  avatarUrl: 'avatar_url',
  metadata: 'metadata',
};

/** Project a partial app object onto its row columns, skipping absent fields. */
function toRow<T extends object>(patch: T, columns: Partial<Record<keyof T, string>>): Row {
  const row: Row = {};
  for (const key of Object.keys(patch) as (keyof T)[]) {
    const column = columns[key];
    if (column && patch[key] !== undefined) row[column] = patch[key];
  }
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
    const { data } = await getSupabase().auth.getSession();
    return sessionFromSb(data.session);
  },

  async refreshSession() {
    const { data } = await getSupabase().auth.refreshSession();
    return sessionFromSb(data.session);
  },

  onAuthStateChange(cb: AuthChangeCallback): Unsubscribe {
    const { data } = getSupabase().auth.onAuthStateChange((_event, sb) => {
      void sessionFromSb(sb).then(cb);
    });
    return { unsubscribe: () => data.subscription.unsubscribe() };
  },

  async signUpWithEmail(input: SignUpInput): Promise<SignUpResult> {
    const redirectTo = Linking.createURL('/verify-email');
    const { data, error } = await getSupabase().auth.signUp({
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
    const { data, error } = await getSupabase().auth.signInWithPassword({
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
    const emailRedirectTo = Linking.createURL('/');
    const { error } = await getSupabase().auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo },
    });
    if (error) throw error;
  },

  async sendPasswordReset(email: string): Promise<void> {
    const redirectTo = Linking.createURL('/reset-password');
    const { error } = await getSupabase().auth.resetPasswordForEmail(email.trim(), { redirectTo });
    if (error) throw error;
  },

  async updatePassword(newPassword: string): Promise<void> {
    const { error } = await getSupabase().auth.updateUser({ password: newPassword });
    if (error) throw error;
  },

  async resendVerification(email: string): Promise<void> {
    const { error } = await getSupabase().auth.resend({ type: 'signup', email: email.trim() });
    if (error) throw error;
  },

  // Supabase confirms via the email link; re-reading the session picks up the
  // new `email_confirmed_at`. The `code` argument is ignored here.
  async confirmVerification(_code: string): Promise<Session | null> {
    return auth.refreshSession();
  },

  async signOut(): Promise<void> {
    const { error } = await getSupabase().auth.signOut();
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
    const row: Row = { ...toRow(patch, PROFILE_COLUMNS), updated_at: new Date().toISOString() };

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
    return profileToAppUser(
      await unwrap(getSupabase().from('profiles').select('*').eq('id', id).maybeSingle()),
    );
  },

  async list(): Promise<AppUser[]> {
    const rows = await unwrapRows(getSupabase().from('profiles').select('*'));
    return rows.map((r) => profileToAppUser(r)!).filter(Boolean);
  },

  async update(id: string, patch: Partial<AppUser>): Promise<AppUser> {
    const row = await unwrap(
      getSupabase()
        .from('profiles')
        .update(toRow(patch, PROFILE_COLUMNS))
        .eq('id', id)
        .select('*')
        .single(),
    );
    return profileToAppUser(row)!;
  },
};

// =========================================================================
// VENDORS
// =========================================================================

const vendors: VendorsApi = {
  async list(filter: VendorFilter = {}): Promise<Vendor[]> {
    // Narrow in SQL where we can; applyVendorFilter still enforces every clause.
    let q = getSupabase().from('vendors').select('*');
    if (filter.type) q = q.eq('type', filter.type);
    if (filter.openOnly) q = q.eq('is_open', true);
    const rows = await unwrapRows(q);
    return applyVendorFilter(rows.map((r) => mapVendor(r)!).filter(Boolean), filter);
  },

  async get(id: string): Promise<Vendor | null> {
    return mapVendor(
      await unwrap(getSupabase().from('vendors').select('*').eq('id', id).maybeSingle()),
    );
  },

  async getByOwner(ownerId: string): Promise<Vendor | null> {
    return mapVendor(
      await unwrap(
        getSupabase().from('vendors').select('*').eq('owner_id', ownerId).maybeSingle(),
      ),
    );
  },

  async register(data: VendorRegistration): Promise<Vendor> {
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
    return mapVendor(
      await unwrap(getSupabase().from('vendors').insert(row).select('*').single()),
    )!;
  },

  async update(id: string, patch: VendorPatch): Promise<Vendor> {
    return mapVendor(
      await unwrap(
        getSupabase()
          .from('vendors')
          .update(toRow(patch, VENDOR_COLUMNS))
          .eq('id', id)
          .select('*')
          .single(),
      ),
    )!;
  },

  async remove(id: string): Promise<void> {
    await unwrap(getSupabase().from('vendors').delete().eq('id', id));
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
    const rows = await unwrapRows(
      getSupabase().from('favorites').select('vendor_id').eq('user_id', userId),
    );
    return rows.map((r) => r.vendor_id as string);
  },

  async add(userId: string, vendorId: string): Promise<void> {
    const { error } = await getSupabase()
      .from('favorites')
      .insert({ user_id: userId, vendor_id: vendorId });
    if (error && error.code !== '23505') throw error; // ignore duplicate
  },

  async remove(userId: string, vendorId: string): Promise<void> {
    await unwrap(
      getSupabase().from('favorites').delete().eq('user_id', userId).eq('vendor_id', vendorId),
    );
  },

  async listFollowers(vendorId: string): Promise<AppUser[]> {
    const rows = await unwrapRows(
      getSupabase().from('favorites').select('user_id, profiles!inner(*)').eq('vendor_id', vendorId),
    );
    // `profiles!inner(*)` embeds exactly one row, but supabase-js types every
    // embed as an array — so its inferred type has to be overridden here.
    return rows
      .map((r) => profileToAppUser((r as unknown as { profiles: ProfileRow }).profiles))
      .filter((u): u is AppUser => !!u);
  },

  ...createFollowerActions({
    getVendor: (id) => vendors.get(id),
    updateVendor: (id, patch) => vendors.update(id, patch),
    removeFavorite: (userId, vendorId) => favorites.remove(userId, vendorId),
  }),
};

// =========================================================================
// BROADCASTS — server-enforced quota via Edge Function
// =========================================================================

const broadcasts: BroadcastsApi = {
  async send(vendorId, input): Promise<SendNotificationResult> {
    const { data, error } = await getSupabase().functions.invoke('send-notification', {
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
    let q = getSupabase().from('notifications').select('*').order('created_at', { ascending: false });
    if (vendorId) q = q.eq('vendor_id', vendorId);
    return (await unwrapRows(q)).map(mapNotification);
  },

  async listForUser(userId: string): Promise<VendorNotification[]> {
    const rows = await unwrapRows(
      getSupabase()
        .from('notifications')
        .select('*')
        .contains('recipient_ids', [userId])
        .order('created_at', { ascending: false }),
    );
    return rows.map(mapNotification);
  },

  async getWeeklyUsage(vendorId: string): Promise<WeeklyUsage> {
    const rows = await unwrapRows(
      getSupabase().from('vendor_weekly_usage').select('bucket, count').eq('vendor_id', vendorId),
    );
    const usage: WeeklyUsage = {};
    rows.forEach((r: WeeklyUsageRow) => {
      usage[r.bucket] = Number(r.count);
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
    await unwrap(
      getSupabase().from('push_tokens').upsert({ user_id: userId, token }, { onConflict: 'token' }),
    );
  },
  async removePushToken(_userId: string, token: string): Promise<void> {
    await unwrap(getSupabase().from('push_tokens').delete().eq('token', token));
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
