// src/context/AuthContext.js
// Owns the current session, role, and admin impersonation state.

import React, {
  createContext, useCallback, useContext, useEffect, useMemo, useState,
} from 'react';
import * as auth from '../services/authService';
import * as backend from '../services/backend';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [realUser, setRealUser]   = useState(null); // authenticated identity
  const [actingAs, setActingAs]   = useState(null); // admin impersonation target
  const [loading, setLoading]     = useState(true);

  // Restore session on app load, and react to auth changes (Supabase OAuth
  // redirects, token refresh, sign-out from another tab, etc.).
  useEffect(() => {
    let sub;
    (async () => {
      try {
        const session = await auth.loadSession();
        if (session?.user) setRealUser(session.user);
      } catch (e) {
        console.warn('session restore failed', e);
      } finally {
        setLoading(false);
      }
    })();

    try {
      sub = auth.onAuthStateChange((session) => {
        setRealUser(session?.user || null);
        setActingAs(null);
      });
    } catch (e) {
      console.warn('auth subscribe failed', e);
    }
    return () => { sub?.unsubscribe?.(); };
  }, []);

  const refreshUser = useCallback(async () => {
    if (!realUser) return;
    const fresh = await backend.getUser(realUser.id);
    if (fresh) setRealUser(fresh);
    if (actingAs) {
      const ai = await backend.getUser(actingAs.id);
      if (ai) setActingAs(ai);
    }
  }, [realUser, actingAs]);

  const signIn = async (credentials) => {
    const user = await auth.signIn(credentials);
    setRealUser(user);
    setActingAs(null);
    return user;
  };

  const signUp = async (input) => {
    const user = await auth.signUp(input);
    setRealUser(user);
    setActingAs(null);
    return user;
  };

  const signInWithProvider = async (provider) => {
    const user = await auth.signInWithProvider(provider);
    setRealUser(user);
    setActingAs(null);
    return user;
  };

  const signOut = async () => {
    await auth.signOut();
    setRealUser(null);
    setActingAs(null);
  };

  // --- Email verification ------------------------------------------------
  // Backfill a vendor's record once they're verified (covers the case where
  // sign-up couldn't create it because email confirmation deferred the session).
  const ensureVendorIfNeeded = async (user) => {
    if (user?.emailVerified && user.role === 'vendor' && !user.vendorId) {
      try { await auth.ensureVendorRecord(user.id); } catch (e) {
        console.warn('ensureVendorRecord failed', e);
      }
    }
  };

  // Re-check the auth provider for an updated verification status (e.g. after
  // the user clicks the confirmation link in their email).
  const refreshSession = useCallback(async () => {
    const session = await auth.refreshSession();
    const user = session?.user || null;
    setRealUser(user);
    await ensureVendorIfNeeded(user);
    return user;
  }, []);

  // Re-send the verification email / code to the signed-in user.
  const resendVerification = useCallback(async () => {
    return auth.resendVerification();
  }, []);

  // Local/demo backend only: confirm an emailed code. (Supabase confirms via
  // the email link, surfaced through refreshSession.)
  const confirmVerification = useCallback(async (code) => {
    const user = await auth.confirmVerification(code);
    setRealUser(user);
    await ensureVendorIfNeeded(user);
    return user;
  }, []);

  const upgradeToVendor = async (vendorInfo) => {
    if (!realUser) throw new Error('Not signed in');
    const updated = await auth.upgradeToVendor(realUser.id, vendorInfo);
    setRealUser(updated);
    return updated;
  };

  const impersonate = async (userId) => {
    if (realUser?.role !== 'admin') throw new Error('Only admins can impersonate');
    if (userId === realUser.id) { setActingAs(null); return; }
    const u = await backend.getUser(userId);
    if (!u) throw new Error('User not found');
    setActingAs(u);
  };

  const stopImpersonating = () => setActingAs(null);

  // The user the rest of the app sees. Admin impersonation transparently
  // routes role checks through `actingAs`.
  const currentUser = actingAs || realUser;
  const isImpersonating = !!actingAs;

  // Email-verification gate. The authenticated identity (realUser) must have a
  // verified email before ANY app feature is accessible. Admin impersonation
  // of an already-verified user keeps access. We treat a missing flag as
  // unverified to fail safe.
  const emailVerified = isImpersonating
    ? actingAs?.emailVerified === true
    : realUser?.emailVerified === true;

  const can = useCallback((action, resource = {}) => {
    // Defense-in-depth: an unverified account can do nothing. The navigation
    // gate (VerifyEmailScreen) is the primary block; this backs it up.
    if (!emailVerified) return false;
    return checkPermission(currentUser, action, resource);
  }, [currentUser, emailVerified]);

  const value = useMemo(() => ({
    currentUser,
    realUser,
    isImpersonating,
    emailVerified,
    loading,
    signIn,
    signUp,
    signInWithProvider,
    signOut,
    upgradeToVendor,
    impersonate,
    stopImpersonating,
    refreshUser,
    refreshSession,
    resendVerification,
    confirmVerification,
    can,
  }), [
    currentUser, realUser, isImpersonating, emailVerified, loading, can,
    refreshUser, refreshSession, resendVerification, confirmVerification,
  ]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

// ---- RBAC matrix ---------------------------------------------------------
// Single source of truth for what each role can do.
//
// action: string verb
// resource: optional object (e.g. { vendor } or { user })
function checkPermission(user, action, resource) {
  if (!user) return false;
  if (user.role === 'admin') return true;

  switch (action) {
    // User actions
    case 'view:vendors':
    case 'search:vendors':
    case 'favorite:vendor':
    case 'view:profile':
    case 'edit:own-profile':
    case 'view:alerts':
      return true;

    // Vendor-only actions
    case 'access:vendor-tools':
    case 'edit:own-vendor':
    case 'send:broadcast':
    case 'send:notification':
    case 'manage:followers':
    case 'manage:subscription':
      return user.role === 'vendor' &&
             (!resource.vendor || resource.vendor.ownerId === user.id);

    // Admin-only actions
    case 'access:admin':
    case 'impersonate':
    case 'list:users':
      return false;

    default:
      return false;
  }
}
