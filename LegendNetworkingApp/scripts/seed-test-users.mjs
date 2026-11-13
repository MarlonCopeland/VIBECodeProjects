// scripts/seed-test-users.mjs — `npm run seed:test-users`
// Creates (or resets) Legend's SUPABASE test accounts — the primary way to
// test sign-in now; the local demo backend is for troubleshooting only.
//
//   legend-free        plain confirmed account
//   legend-sync        + active Legend Sync (beta) subscription
//   legend-suite       + owns Legend Full Suite (test grant) → desktop opens
//   legend-unverified  never confirmed → exercises the verify-email screen
//
// Emails are plus-addresses of TEST_EMAIL_BASE (default below), so every
// confirmation / download email lands in one real inbox.
//
// Passwords are generated on first run and kept in scripts/.test-users.local.json
// (gitignored) so re-running is stable; delete that file to rotate them. The
// accounts + passwords are also written into the Obsidian note between the
// `legend-test-logins` markers (OBSIDIAN_NOTE to override the path, or
// OBSIDIAN_NOTE=none to skip).
//
// Needs the SERVICE ROLE key for this one command (Dashboard → Project
// Settings → API keys); never commit it:
//   $env:SUPABASE_SERVICE_ROLE_KEY="…"; npm run seed:test-users

import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const LOCAL = join(root, 'scripts', '.test-users.local.json');
const NOTE =
  process.env.OBSIDIAN_NOTE ??
  join(homedir(), 'Documents', 'MarlonObsVault', 'UNJADEDDIGITAL', 'Legend - Test Logins.md');
const START = '<!-- legend-test-logins:start -->';
const END = '<!-- legend-test-logins:end -->';

function envFrom(key) {
  if (process.env[key]) return process.env[key];
  try {
    const line = readFileSync(join(root, '.env'), 'utf8').split(/\r?\n/).find((l) => l.startsWith(`${key}=`));
    return line?.slice(key.length + 1).trim() || undefined;
  } catch {
    return undefined;
  }
}

const URL_ = envFrom('SUPABASE_URL');
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BASE = process.env.TEST_EMAIL_BASE ?? 'ricachetx@gmail.com';
if (!URL_ || !KEY) {
  console.error('Need SUPABASE_URL (from .env) and SUPABASE_SERVICE_ROLE_KEY in the environment.');
  process.exit(1);
}

const [local, domain] = BASE.split('@');
const ACCOUNTS = [
  { key: 'free', name: 'Legend Free', confirmed: true, role: 'Plain account — no purchases' },
  { key: 'sync', name: 'Legend Sync', confirmed: true, role: 'Active Legend Sync (beta) subscription' },
  { key: 'suite', name: 'Legend Suite', confirmed: true, role: 'Owns Legend Full Suite (test grant) — desktop app opens' },
  { key: 'unverified', name: 'Legend Unverified', confirmed: false, role: 'Never confirmed — lands on verify-email' },
].map((a) => ({ ...a, email: `${local}+legend-${a.key}@${domain}` }));

function newPassword() {
  // Satisfies src/lib/validation.ts (length, upper, lower, number, symbol).
  return `Lg-${randomBytes(9).toString('base64url')}-7a`;
}

const passwords = existsSync(LOCAL) ? JSON.parse(readFileSync(LOCAL, 'utf8')) : {};
for (const a of ACCOUNTS) passwords[a.email] ??= newPassword();
writeFileSync(LOCAL, JSON.stringify(passwords, null, 2));

const headers = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

async function api(path, init = {}) {
  const res = await fetch(`${URL_}${path}`, { ...init, headers: { ...headers, ...(init.headers ?? {}) } });
  const body = await res.text();
  if (!res.ok) throw new Error(`${init.method ?? 'GET'} ${path} → ${res.status}: ${body}`);
  return body ? JSON.parse(body) : null;
}

async function findUser(email) {
  for (let page = 1; page < 50; page += 1) {
    const { users } = await api(`/auth/v1/admin/users?page=${page}&per_page=200`);
    const hit = users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (hit || users.length < 200) return hit ?? null;
  }
  return null;
}

async function upsertUser(a) {
  const body = {
    email: a.email,
    password: passwords[a.email],
    email_confirm: a.confirmed,
    user_metadata: { display_name: a.name },
  };
  const existing = await findUser(a.email);
  if (existing) {
    // Reset to the known state (password, confirmation) on every run.
    return api(`/auth/v1/admin/users/${existing.id}`, { method: 'PUT', body: JSON.stringify(body) });
  }
  return api('/auth/v1/admin/users', { method: 'POST', body: JSON.stringify(body) });
}

const rest = (path, method, body, prefer = 'resolution=merge-duplicates') =>
  api(`/rest/v1/${path}`, { method, body: JSON.stringify(body), headers: { Prefer: prefer } });

const results = [];
for (const a of ACCOUNTS) {
  const user = await upsertUser(a);
  if (a.key === 'sync') {
    await rest('subscriptions?on_conflict=user_id,product', 'POST', {
      user_id: user.id,
      product: 'sync',
      plan: 'yearly',
      status: 'active',
      source: 'beta',
      current_period_end: null,
    });
  }
  if (a.key === 'suite') {
    const [purchase] = await rest(
      'purchases?on_conflict=platform,store_transaction_id',
      'POST',
      {
        user_id: user.id,
        product: 'full_suite',
        platform: 'grant',
        store_transaction_id: `test-grant-${user.id}`,
        store_product_id: 'test-grant',
        environment: 'test',
        status: 'active',
      },
      'resolution=merge-duplicates,return=representation',
    );
    await rest('download_grants?on_conflict=purchase_id', 'POST', { user_id: user.id, purchase_id: purchase.id });
  }
  results.push({ ...a, id: user.id });
  console.log(`✓ ${a.email}  (${a.role})`);
}

if (NOTE !== 'none' && existsSync(NOTE)) {
  const rows = results
    .map((r) => `| ${r.role} | \`${r.email}\` | \`${passwords[r.email]}\` |`)
    .join('\n');
  const block =
    `${START}\n_Last seeded ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC by \`npm run seed:test-users\`._\n\n` +
    `| Account | Email | Password |\n| --- | --- | --- |\n${rows}\n${END}`;
  const note = readFileSync(NOTE, 'utf8');
  const next = note.includes(START)
    ? note.replace(new RegExp(`${START}[\\s\\S]*?${END}`), block)
    : `${note.trimEnd()}\n\n${block}\n`;
  writeFileSync(NOTE, next);
  console.log(`\nUpdated ${NOTE}`);
} else if (NOTE !== 'none') {
  console.log(`\nObsidian note not found at ${NOTE} — passwords are in ${LOCAL}`);
}
