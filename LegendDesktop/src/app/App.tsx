// src/app/App.tsx
// Root: providers, the auth gate, and the signed-in shell (sidebar + page).
//
// Providers are Legend's OWN — AuthProvider, AppSettingsProvider,
// ContactsProvider and SyncProvider come straight from the phone app's
// src/, so desktop state, grading, Knows resolution and sync behave
// identically. The gate mirrors app/_layout.tsx on the phone.

import React, { Suspense, useEffect, useRef } from 'react';
import { BookUser, Network, CircleDot, UserRound, Settings, RefreshCw } from 'lucide-react';
import { AuthProvider, useAuth } from '@legend/features/auth/AuthContext';
import { AppSettingsProvider, useAppSettings } from '@legend/features/settings/AppSettingsContext';
import { ContactsProvider, useContacts } from '@legend/features/contacts/ContactsContext';
import { SyncProvider, useSync } from '@legend/features/sync/SyncProvider';
import { isFeatureEnabled } from '@legend/config/features';
import { countKnowsSuggestions } from '@legend/features/contacts/knows';
import { DesktopThemeProvider } from './theme';
import { SuiteGate } from './SuiteGate';
import { RouterProvider, matchPath, useRouter } from './router';
import { APP_ROUTES, AUTH_ROUTES, type RouteDef } from './routes';

function findRoute(routes: RouteDef[], path: string): RouteDef | undefined {
  return routes.find((r) => matchPath(r.pattern, path));
}

const Loading = () => (
  <div className="empty">
    <span className="spinner" />
  </div>
);

function Gate() {
  const { status, needsVerification } = useAuth();
  const { route, replace } = useRouter();
  const path = route.path;

  useEffect(() => {
    if (status === 'loading') return;
    const inAuth = !!findRoute(AUTH_ROUTES, path);
    const inApp = !!findRoute(APP_ROUTES, path);
    if (status === 'unauthenticated') {
      if (!inAuth) replace('/login');
    } else if (path === '/reset-password') {
      // A recovery code signs the user in; let them finish setting the password.
    } else if (needsVerification) {
      if (path !== '/verify-email') replace('/verify-email');
    } else if (!inApp) {
      replace('/contacts');
    }
  }, [status, needsVerification, path, replace]);

  if (status === 'loading') return <Loading />;

  const auth = findRoute(AUTH_ROUTES, path);
  if (auth && (status === 'unauthenticated' || path === '/reset-password' || path === '/verify-email')) {
    const Screen = auth.screen;
    return (
      <Suspense fallback={<Loading />}>
        <Screen />
      </Suspense>
    );
  }
  if (status !== 'authenticated') return <Loading />;
  return (
    <SuiteGate>
      <Shell />
    </SuiteGate>
  );
}

function SyncIndicator() {
  const { syncState, entitled } = useSync();
  const { syncEnabled } = useAppSettings();
  const { navigate } = useRouter();
  if (!isFeatureEnabled('sync') || !syncEnabled || entitled !== true) return null;
  const label =
    syncState.status === 'syncing' ? 'Syncing…' : syncState.status === 'error' ? 'Sync error' : 'Synced';
  return (
    <button type="button" className="nav-item small" onClick={() => navigate('/settings/sync')} title={syncState.error ?? label}>
      <RefreshCw size={14} />
      <span className={syncState.status === 'error' ? 'danger-text' : undefined}>{label}</span>
    </button>
  );
}

function Shell() {
  const { route, navigate } = useRouter();
  const { resolvedKnows } = useContacts();
  const { ready, hasSeenTutorial } = useAppSettings();
  const tutorialShown = useRef(false);

  // First-run tutorial, exactly once — same as the phone's (app)/_layout.
  useEffect(() => {
    if (!ready || hasSeenTutorial || tutorialShown.current) return;
    tutorialShown.current = true;
    navigate('/tutorial');
  }, [ready, hasSeenTutorial, navigate]);

  const suggestions = countKnowsSuggestions(resolvedKnows);
  const section = route.path.split('/')[1] ?? '';
  const nav: { id: string; to: string; label: string; icon: React.ReactNode; match: string[]; badge?: number; show?: boolean }[] = [
    { id: 'contacts', to: '/contacts', label: 'Contacts', icon: <BookUser size={18} />, match: ['contacts', 'contact', 'import'], badge: suggestions },
    { id: 'network', to: '/network', label: 'Network', icon: <Network size={18} />, match: ['network'] },
    { id: 'circles', to: '/circles', label: 'Circles', icon: <CircleDot size={18} />, match: ['circles', 'circle', 'outreach'], show: isFeatureEnabled('circles') },
    { id: 'profile', to: '/profile', label: 'Profile', icon: <UserRound size={18} />, match: ['profile'], show: isFeatureEnabled('profile') },
    { id: 'settings', to: '/settings', label: 'Settings', icon: <Settings size={18} />, match: ['settings', 'subscription', 'tutorial'] },
  ];

  const current = findRoute(APP_ROUTES, route.path);
  const Screen = current?.screen;

  return (
    <div className="shell">
      <nav className="sidebar" aria-label="Main">
        <div className="brand">LEGEND</div>
        {nav
          .filter((n) => n.show !== false)
          .map((n) => (
            <button
              key={n.id}
              type="button"
              className={`nav-item${n.match.includes(section) ? ' active' : ''}`}
              onClick={() => navigate(n.to)}
            >
              {n.icon}
              <span>{n.label}</span>
              {n.badge ? <span className="badge" title="Knows Connections to review">{n.badge}</span> : null}
            </button>
          ))}
        <div className="grow" />
        <SyncIndicator />
      </nav>
      <main className="main">
        <Suspense fallback={<Loading />}>{Screen ? <Screen key={current.pattern} /> : null}</Suspense>
      </main>
    </div>
  );
}

export function App() {
  return (
    <DesktopThemeProvider>
      <RouterProvider>
        <AuthProvider>
          <AppSettingsProvider>
            <ContactsProvider>
              <SyncProvider>
                <Gate />
              </SyncProvider>
            </ContactsProvider>
          </AppSettingsProvider>
        </AuthProvider>
      </RouterProvider>
    </DesktopThemeProvider>
  );
}
