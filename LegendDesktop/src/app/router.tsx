// src/app/router.tsx
// A tiny hash router — Electron loads the app from file://, where history
// routing has nothing to fall back on. Paths look like `/contacts/abc`, with
// optional `?key=value` params: `navigate('/outreach/text', { circle: id })`.

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { IconButton } from '../ui/components';

export interface Route {
  path: string;
  query: Record<string, string>;
}

function parseHash(): Route {
  const raw = window.location.hash.replace(/^#/, '') || '/';
  const [path, qs] = raw.split('?');
  return { path: path || '/', query: Object.fromEntries(new URLSearchParams(qs ?? '').entries()) };
}

function toHash(path: string, query?: Record<string, string | undefined>): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query ?? {})) if (v !== undefined) params.set(k, v);
  const qs = params.toString();
  return `#${path}${qs ? `?${qs}` : ''}`;
}

interface RouterValue {
  route: Route;
  navigate(path: string, query?: Record<string, string | undefined>): void;
  replace(path: string, query?: Record<string, string | undefined>): void;
  back(fallback?: string): void;
}

const RouterContext = createContext<RouterValue | null>(null);

export function RouterProvider({ children }: { children: React.ReactNode }) {
  const [route, setRoute] = useState<Route>(parseHash);

  useEffect(() => {
    const onChange = () => setRoute(parseHash());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  const navigate = useCallback((path: string, query?: Record<string, string | undefined>) => {
    window.location.hash = toHash(path, query);
  }, []);
  const replace = useCallback((path: string, query?: Record<string, string | undefined>) => {
    window.history.replaceState(null, '', toHash(path, query));
    setRoute(parseHash());
  }, []);
  const back = useCallback(
    (fallback = '/contacts') => {
      if (window.history.length > 1) window.history.back();
      else navigate(fallback);
    },
    [navigate],
  );

  const value = useMemo(() => ({ route, navigate, replace, back }), [route, navigate, replace, back]);
  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>;
}

export function useRouter(): RouterValue {
  const ctx = useContext(RouterContext);
  if (!ctx) throw new Error('useRouter must be used inside RouterProvider');
  return ctx;
}

/**
 * Match `pattern` (e.g. `/contacts/:id`) against a path. Returns params, or
 * null when it doesn't match.
 */
export function matchPath(pattern: string, path: string): Record<string, string> | null {
  const p = pattern.split('/').filter(Boolean);
  const s = path.split('/').filter(Boolean);
  if (p.length !== s.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < p.length; i += 1) {
    const seg = p[i]!;
    if (seg.startsWith(':')) params[seg.slice(1)] = decodeURIComponent(s[i]!);
    else if (seg !== s[i]) return null;
  }
  return params;
}

export function BackButton({ fallback }: { fallback?: string }) {
  const { back } = useRouter();
  return (
    <IconButton label="Back" onClick={() => back(fallback)}>
      <ArrowLeft size={20} />
    </IconButton>
  );
}
