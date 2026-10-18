// scripts/publish-release.mjs — `npm run publish:release`
// Uploads the installers electron-builder produced in release/ to the private
// `desktop-releases` Supabase Storage bucket and records them in
// `desktop_releases`, so every Full Suite download link (desktop-download
// Edge Function) starts serving the new version immediately.
//
// Needs the SERVICE ROLE key (Dashboard → Project Settings → API keys). Pass
// it in the environment for this one command; never commit it:
//   $env:SUPABASE_SERVICE_ROLE_KEY="…"; npm run publish:release
// SUPABASE_URL is read from ../LegendNetworkingApp/.env if not set.

import { createClient } from '@supabase/supabase-js';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;

function envFrom(file, key) {
  try {
    const line = readFileSync(file, 'utf8').split(/\r?\n/).find((l) => l.startsWith(`${key}=`));
    return line?.slice(key.length + 1).trim() || undefined;
  } catch {
    return undefined;
  }
}

const url = process.env.SUPABASE_URL ?? envFrom(join(root, '../LegendNetworkingApp/.env'), 'SUPABASE_URL');
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Set SUPABASE_SERVICE_ROLE_KEY (and SUPABASE_URL if ../LegendNetworkingApp/.env lacks it).');
  process.exit(1);
}

const OS_BY_EXT = { '.exe': 'windows', '.dmg': 'mac', '.appimage': 'linux' };
const releaseDir = join(root, 'release');
const files = readdirSync(releaseDir)
  .filter((f) => statSync(join(releaseDir, f)).isFile())
  .map((f) => ({ f, os: OS_BY_EXT[f.slice(f.lastIndexOf('.')).toLowerCase()] }))
  .filter((x) => x.os && !x.f.endsWith('.blockmap'));

if (files.length === 0) {
  console.error(`No installers in ${releaseDir}. Run \`npm run dist\` on each OS first.`);
  process.exit(1);
}

const db = createClient(url, key, { auth: { persistSession: false } });

for (const { f, os } of files) {
  const path = `${version}/${os}/${f}`;
  const body = readFileSync(join(releaseDir, f));
  console.log(`uploading ${f} (${(body.length / 1e6).toFixed(1)} MB) → desktop-releases/${path}`);
  const { error: upErr } = await db.storage
    .from('desktop-releases')
    .upload(path, body, { upsert: true, contentType: 'application/octet-stream' });
  if (upErr) throw upErr;
  const { error: rowErr } = await db
    .from('desktop_releases')
    .upsert(
      { version, os, storage_path: path, file_name: f, size_bytes: body.length, published_at: new Date().toISOString() },
      { onConflict: 'version,os' },
    );
  if (rowErr) throw rowErr;
}
console.log(`\nPublished Legend ${version} for ${files.map((x) => x.os).join(', ')}. Existing download links now serve it.`);
