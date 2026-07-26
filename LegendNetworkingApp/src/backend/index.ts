// src/backend/index.ts
// Backend facade. Selects the active implementation from config (APP_BACKEND)
// and re-exports a single, typed `backend` object. Everything else in the app
// imports from here and never touches Supabase or the local store directly —
// swapping backends is a one-line config change.

import { BACKEND } from '../config/env';
import type { Backend } from './types';
import { localBackend } from './local/localBackend';

let cached: Backend | null = null;

function resolveBackend(): Backend {
  if (cached) return cached;
  if (BACKEND === 'supabase') {
    // Lazily require so the Supabase client (and its polyfills) never loads
    // when running purely on the local backend.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { supabaseBackend } = require('./supabase/supabaseBackend') as {
      supabaseBackend: Backend;
    };
    cached = supabaseBackend;
  } else {
    cached = localBackend;
  }
  return cached;
}

export const backend: Backend = resolveBackend();

export * from './types';
