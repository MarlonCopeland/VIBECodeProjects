// src/backend/supabase/supabaseBackend.ts
// Supabase implementation of the Backend contract.
//
// Data model expectation (see supabase/migrations/0001_init.sql):
//   - auth.users            : managed by Supabase Auth
//   - public.profiles       : 1:1 with auth.users (id FK), holds app profile
//   - public.push_tokens    : (user_id, token) unique
//
// A DB trigger creates a `profiles` row on sign-up, so the client never has to.

import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import type { Session as SbSession, User as SbUser } from '@supabase/supabase-js';
import { getSupabase } from './client';
import { supabaseContacts } from './supabaseContacts';
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
  UserRole,
} from '../types';

WebBrowser.maybeCompleteAuthSession();

const AVATAR_BUCKET = 'avatars';

/** Build an AppUser from a Supabase auth user + optional profile row. */
function toAppUser(u: SbUser, profile?: Record<string, unknown> | null): AppUser {
  const meta = (u.user_metadata ?? {}) as Record<string, unknown>;
  const role = (profile?.role as UserRole) ?? 'user';
  return {
    id: u.id,
    email: u.email ?? '',
    displayName:
      (profile?.display_name as string) ||
      (meta.display_name as string) ||
      (meta.full_name as string) ||
      (u.email ? u.email.split('@')[0] : 'User') ||
      'User',
    role: role === 'admin' ? 'admin' : 'user',
    avatarUrl: (profile?.avatar_url as string) ?? (meta.avatar_url as string) ?? null,
    emailVerified: !!u.email_confirmed_at,
    metadata: (profile?.metadata as Record<string, unknown>) ?? {},
    createdAt: u.created_at ?? new Date().toISOString(),
  };
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
        data: { display_name: input.displayName },
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

    // Exchange the returned code/fragment for a session.
    const { params, errorCode } = Linking.parse(result.url) as unknown as {
      params?: Record<string, string>;
      errorCode?: string;
    };
    if (errorCode) throw new Error(errorCode);

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

  async signOut(): Promise<void> {
    const supabase = getSupabase();
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  },
};

const profile: ProfileApi = {
  async getProfile(userId: string): Promise<AppUser | null> {
    const supabase = getSupabase();
    const { data: prof } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
    const { data: userRes } = await supabase.auth.getUser();
    if (!userRes.user) return null;
    return toAppUser(userRes.user, prof);
  },

  async updateProfile(userId, patch): Promise<AppUser> {
    const supabase = getSupabase();
    const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (patch.displayName !== undefined) row.display_name = patch.displayName;
    if (patch.avatarUrl !== undefined) row.avatar_url = patch.avatarUrl;
    if (patch.metadata !== undefined) row.metadata = patch.metadata;

    const { data, error } = await supabase
      .from('profiles')
      .update(row)
      .eq('id', userId)
      .select('*')
      .single();
    if (error) throw error;

    const { data: userRes } = await supabase.auth.getUser();
    if (!userRes.user) throw new Error('Not authenticated.');
    return toAppUser(userRes.user, data);
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

  async deleteAccount(userId: string): Promise<void> {
    // Deleting an auth user requires the service role, so this calls a
    // Postgres RPC (`delete_own_account`) that runs with SECURITY DEFINER and
    // verifies auth.uid() == the caller. See supabase/migrations.
    const supabase = getSupabase();
    const { error } = await supabase.rpc('delete_own_account');
    if (error) throw error;
    await supabase.auth.signOut();
  },
};

const notifications: NotificationsApi = {
  async registerPushToken(userId: string, token: string): Promise<void> {
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
  notifications,
  contacts: supabaseContacts,
};
