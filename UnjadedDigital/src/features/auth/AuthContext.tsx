// src/features/auth/AuthContext.tsx
// Owns the authenticated session for the whole app. Restores the session on
// launch, subscribes to backend auth changes (OAuth redirect, token refresh,
// sign-out elsewhere), and exposes typed actions. Route guards read `status`.

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import type {
  AppUser,
  EmailOtpKind,
  OAuthProvider,
  SignInInput,
  SignUpInput,
} from '../../backend/types';
import * as authService from './authService';

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

interface AuthContextValue {
  status: AuthStatus;
  user: AppUser | null;
  /** True when signed in but the email is not yet verified. */
  needsVerification: boolean;

  signIn: (input: SignInInput) => Promise<void>;
  signUp: (input: SignUpInput) => Promise<{ needsEmailConfirmation: boolean }>;
  signInWithProvider: (provider: OAuthProvider) => Promise<void>;
  signInWithMagicLink: (email: string) => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
  updatePassword: (password: string) => Promise<void>;
  /** Defaults to the signed-in user's address when called with no argument. */
  resendVerification: (email?: string) => Promise<void>;
  /** Redeem an emailed 6-digit code. Resolves to a real session. */
  verifyEmailCode: (email: string, token: string, kind: EmailOtpKind) => Promise<void>;
  /** Consume an auth deep link. True when it carried a session. */
  redeemAuthLink: (url: string) => Promise<boolean>;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
  /** Locally patch the cached user (e.g. after a profile edit). */
  setUser: (user: AppUser) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUserState] = useState<AppUser | null>(null);
  const [status, setStatus] = useState<AuthStatus>('loading');

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const session = await authService.loadSession();
        if (!mounted) return;
        setUserState(session?.user ?? null);
        setStatus(session?.user ? 'authenticated' : 'unauthenticated');
      } catch {
        if (mounted) setStatus('unauthenticated');
      }
    })();

    const sub = authService.onAuthStateChange((session) => {
      if (!mounted) return;
      setUserState(session?.user ?? null);
      setStatus(session?.user ? 'authenticated' : 'unauthenticated');
    });

    return () => {
      mounted = false;
      sub.unsubscribe();
    };
  }, []);

  const signIn = useCallback(async (input: SignInInput) => {
    const session = await authService.signIn(input);
    setUserState(session.user);
    setStatus('authenticated');
  }, []);

  const signUp = useCallback(async (input: SignUpInput) => {
    const result = await authService.signUp(input);
    if (result.session?.user) {
      setUserState(result.session.user);
      setStatus('authenticated');
    }
    return { needsEmailConfirmation: result.needsEmailConfirmation };
  }, []);

  const signInWithProvider = useCallback(async (provider: OAuthProvider) => {
    const session = await authService.signInWithProvider(provider);
    if (session?.user) {
      setUserState(session.user);
      setStatus('authenticated');
    }
  }, []);

  const refresh = useCallback(async () => {
    const session = await authService.refreshSession();
    setUserState(session?.user ?? null);
    setStatus(session?.user ? 'authenticated' : 'unauthenticated');
  }, []);

  const resendVerification = useCallback(
    async (email?: string) => {
      const target = (email ?? user?.email ?? '').trim();
      if (!target) throw new Error('No email on file');
      await authService.resendVerification(target);
    },
    [user?.email],
  );

  const verifyEmailCode = useCallback(
    async (email: string, token: string, kind: EmailOtpKind) => {
      const session = await authService.verifyEmailOtp(email, token, kind);
      setUserState(session.user);
      setStatus('authenticated');
    },
    [],
  );

  const redeemAuthLink = useCallback(async (url: string) => {
    const session = await authService.redeemAuthLink(url);
    if (session?.user) {
      setUserState(session.user);
      setStatus('authenticated');
      return true;
    }
    return false;
  }, []);

  const signOut = useCallback(async () => {
    await authService.signOut();
    setUserState(null);
    setStatus('unauthenticated');
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      needsVerification: !!user && !user.emailVerified,
      signIn,
      signUp,
      signInWithProvider,
      signInWithMagicLink: authService.signInWithMagicLink,
      sendPasswordReset: authService.sendPasswordReset,
      updatePassword: authService.updatePassword,
      resendVerification,
      verifyEmailCode,
      redeemAuthLink,
      refresh,
      signOut,
      setUser: setUserState,
    }),
    [
      status,
      user,
      signIn,
      signUp,
      signInWithProvider,
      refresh,
      resendVerification,
      verifyEmailCode,
      redeemAuthLink,
      signOut,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}
