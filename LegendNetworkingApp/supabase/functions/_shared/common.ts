// supabase/functions/_shared/common.ts
// Plumbing shared by the Full Suite functions: JSON/CORS responses, the
// service-role client, resolving the calling user from their JWT, and the
// product catalog.

import { createClient, type SupabaseClient, type User } from 'npm:@supabase/supabase-js@2';

export const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

export function text(body: string, status = 200): Response {
  return new Response(body, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Service-role client — bypasses RLS. Server-side only. */
export function admin(): SupabaseClient {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** The signed-in caller, from the request's Authorization header. */
export async function callerOf(req: Request): Promise<User> {
  const jwt = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!jwt) throw new HttpError(401, 'Sign in first.');
  const { data, error } = await admin().auth.getUser(jwt);
  if (error || !data.user) throw new HttpError(401, 'Your session expired — sign in again.');
  return data.user;
}

/**
 * Store SKUs that count as the Full Suite. Defaults match app.config.js;
 * override with the FULL_SUITE_PRODUCT_IDS secret (comma-separated).
 */
export function fullSuiteProductIds(): string[] {
  const raw = Deno.env.get('FULL_SUITE_PRODUCT_IDS') ?? 'com.unjadeddigital.legend.fullsuite,full_suite';
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

export function handleError(e: unknown): Response {
  if (e instanceof HttpError) return json({ error: e.message }, e.status);
  console.error(e);
  return json({ error: e instanceof Error ? e.message : 'Unexpected error' }, 500);
}
