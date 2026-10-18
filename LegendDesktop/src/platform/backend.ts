// src/platform/backend.ts
// Desktop replacement for ../LegendNetworkingApp/src/backend/index.ts
// (swapped in by vite.config.ts). Same selection rule — APP_BACKEND picks
// where ACCOUNTS live; the contact graph is the on-device SQLite vault in
// both modes — but with static imports, since the mobile file's lazy
// CommonJS `require` can't run in an ES-module bundle.

import { BACKEND } from '@legend/config/env';
import type { Backend } from '@legend/backend/types';
import { localBackend } from '@legend/backend/local/localBackend';
import { supabaseBackend } from '@legend/backend/supabase/supabaseBackend';

export const backend: Backend = BACKEND === 'supabase' ? supabaseBackend : localBackend;

export * from '@legend/backend/types';
