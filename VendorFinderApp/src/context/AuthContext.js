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

  // Restore session on app load.
  useEffect(() => {
    (async () => {
      try {
        const session = await auth.loadSession();
        if (session?.userId) {
          const u = await backend.getUser(session.userId);
          if (u) setRealUser(u);
        }
      } catch (e) {
        console.warn('session restore failed', e);
      } finally {
        setLoading(false);
      }
    })();
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

  const can = useCallback((action, resource = {}) => {
    return checkPermission(currentUser, action, resource);
  }, [currentUser]);

  const value = useMemo(() => ({
    currentUser,
    realUser,
    isImpersonating,
    loading,
    signIn,
    signUp,
    signInWithProvider,
    signOut,
    upgradeToVendor,
    impersonate,
    stopImpersonating,
    refreshUser,
    can,
  }), [currentUser, realUser, isImpersonating, loading, can, refreshUser]);

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
    case 'manage:followers':
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
