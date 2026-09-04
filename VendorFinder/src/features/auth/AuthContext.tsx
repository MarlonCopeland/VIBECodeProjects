// src/features/auth/AuthContext.tsx
// Owns the authenticated session, role, email-verification gate, and admin
// impersonation for the whole app. Restores the session on launch, subscribes
// to backend auth changes, and exposes typed actions + a `can()` RBAC check.
// Route guards read `status` + `needsVerification`.

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { backend } from '../../backend';
import type { AppUser, OAuthProvider, SignInInput } from '../../backend/types';
import * as authService from './authService';
import type { SignUpParams, VendorInfo } from './authService';
import { checkPermission } from './rbac';
import type { PermissionAction, PermissionResource } from './rbac';

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

interface AuthContextValue {
  status: AuthStatus;
  /** The user the app should render as (impersonated target, else the real user). */
  user: AppUser | null;
  /** The truly authenticated identity (an admin, while impersonating). */
  realUser: AppUser | null;
  isImpersonating: boolean;
  /** True when signed in but the real account's email is not yet verified. */
  needsVerification: boolean;

  signIn: (input: SignInInput) => Promise<void>;
  signUp: (params: SignUpParams) => Promise<{ needsEmailConfirmation: boolean }>;
  signInWithProvider: (provider: OAuthProvider) => Promise<void>;
  signInWithMagicLink: (email: string) => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
  updatePassword: (password: string) => Promise<void>;
  resendVerification: () => Promise<void>;
  confirmVerification: (code: string) => Promise<void>;
  refresh: () => Promise<void>;
  refreshUser: () => Promise<void>;
  signOut: () => Promise<void>;

  upgradeToVendor: (vendorInfo: VendorInfo) => Promise<void>;
  impersonate: (userId: string) => Promise<void>;
  stopImpersonating: () => void;

  can: (action: PermissionAction, resource?: PermissionResource) => boolean;
  /** Locally patch the cached real user (e.g. after a profile edit). */
  setUser: (user: AppUser) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [realUser, setRealUser] = useState<AppUser | null>(null);
  const [actingAs, setActingAs] = useState<AppUser | null>(null);
  const [status, setStatus] = useState<AuthStatus>('loading');

  /**
   * Adopt `user` as the signed-in identity. Always drops impersonation: a new
   * session must never inherit the previous admin's acting-as target.
   */
  const applySession = useCallback((user: AppUser | null) => {
    setRealUser(user);
    setActingAs(null);
    setStatus(user ? 'authenticated' : 'unauthenticated');
  }, []);

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const session = await authService.loadSession();
        if (!mounted) return;
        setRealUser(session?.user ?? null);
        setStatus(session?.user ? 'authenticated' : 'unauthenticated');
      } catch {
        if (mounted) setStatus('unauthenticated');
      }
    })();

    const sub = authService.onAuthStateChange((session) => {
      if (!mounted) return;
      applySession(session?.user ?? null);
    });

    return () => {
      mounted = false;
      sub.unsubscribe();
    };
  }, [applySession]);

  const ensureVendorIfNeeded = useCallback(
    async (user: AppUser | null, vendorInfo?: VendorInfo) => {
      if (user?.role === 'vendor' && !user.vendorId) {
        try {
          return await authService.ensureVendorRecord(user.id, vendorInfo);
        } catch (e) {
          console.warn('ensureVendorRecord failed', e);
        }
      }
      return user;
    },
    [],
  );

  const signIn = useCallback(
    async (input: SignInInput) => {
      const session = await authService.signIn(input);
      applySession(session.user);
    },
    [applySession],
  );

  const signUp = useCallback(
    async (params: SignUpParams) => {
      const result = await authService.signUp(params);
      let user = result.session?.user ?? result.user ?? null;
      if (user && params.role === 'vendor') {
        user = (await ensureVendorIfNeeded(user, params.vendorInfo)) ?? user;
      }
      if (user) applySession(user);
      return { needsEmailConfirmation: result.needsEmailConfirmation };
    },
    [ensureVendorIfNeeded, applySession],
  );

  const signInWithProvider = useCallback(
    async (provider: OAuthProvider) => {
      const session = await authService.signInWithProvider(provider);
      if (session?.user) applySession(session.user);
    },
    [applySession],
  );

  const refresh = useCallback(async () => {
    const session = await authService.refreshSession();
    setRealUser(session?.user ?? null);
    setStatus(session?.user ? 'authenticated' : 'unauthenticated');
  }, []);

  const refreshUser = useCallback(async () => {
    if (realUser) {
      const fresh = await backend.users.get(realUser.id);
      if (fresh) setRealUser(fresh);
    }
    if (actingAs) {
      const freshActing = await backend.users.get(actingAs.id);
      if (freshActing) setActingAs(freshActing);
    }
  }, [realUser, actingAs]);

  const resendVerification = useCallback(async () => {
    if (!realUser?.email) throw new Error('No email on file');
    await authService.resendVerification(realUser.email);
  }, [realUser?.email]);

  const confirmVerification = useCallback(
    async (code: string) => {
      const session = await authService.confirmVerification(code);
      let user = session?.user ?? null;
      if (user) user = (await ensureVendorIfNeeded(user)) ?? user;
      if (user) {
        setRealUser(user);
        setStatus('authenticated');
      }
    },
    [ensureVendorIfNeeded],
  );

  const upgradeToVendor = useCallback(
    async (vendorInfo: VendorInfo) => {
      if (!realUser) throw new Error('Not signed in');
      const updated = await authService.upgradeToVendor(realUser.id, vendorInfo);
      setRealUser(updated);
    },
    [realUser],
  );

  const impersonate = useCallback(
    async (userId: string) => {
      if (realUser?.role !== 'admin') throw new Error('Only admins can impersonate');
      if (userId === realUser.id) {
        setActingAs(null);
        return;
      }
      const target = await backend.users.get(userId);
      if (!target) throw new Error('User not found');
      setActingAs(target);
    },
    [realUser],
  );

  const stopImpersonating = useCallback(() => setActingAs(null), []);

  const signOut = useCallback(async () => {
    await authService.signOut();
    applySession(null);
  }, [applySession]);

  // The user the rest of the app sees. Admin impersonation transparently routes
  // role checks through `actingAs`.
  const currentUser = actingAs ?? realUser;
  const isImpersonating = !!actingAs;

  // Email-verification gate keys off the REAL identity. Admins (the only role
  // that can impersonate) are always verified, so impersonation keeps access.
  const emailVerified = realUser?.emailVerified === true;
  const needsVerification = !!realUser && !emailVerified;

  const can = useCallback(
    (action: PermissionAction, resource: PermissionResource = {}) => {
      if (!emailVerified) return false; // defense-in-depth behind the nav gate
      return checkPermission(currentUser, action, resource);
    },
    [currentUser, emailVerified],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user: currentUser,
      realUser,
      isImpersonating,
      needsVerification,
      signIn,
      signUp,
      signInWithProvider,
      signInWithMagicLink: authService.signInWithMagicLink,
      sendPasswordReset: authService.sendPasswordReset,
      updatePassword: authService.updatePassword,
      resendVerification,
      confirmVerification,
      refresh,
      refreshUser,
      signOut,
      upgradeToVendor,
      impersonate,
      stopImpersonating,
      can,
      setUser: setRealUser,
    }),
    [
      status,
      currentUser,
      realUser,
      isImpersonating,
      needsVerification,
      signIn,
      signUp,
      signInWithProvider,
      resendVerification,
      confirmVerification,
      refresh,
      refreshUser,
      signOut,
      upgradeToVendor,
      impersonate,
      stopImpersonating,
      can,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}
