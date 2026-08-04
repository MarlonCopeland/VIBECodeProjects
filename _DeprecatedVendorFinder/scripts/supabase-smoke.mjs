// scripts/supabase-smoke.mjs
// Headless CRUD smoke test against your Supabase project.
//
// It exercises the same tables/RLS the app uses:
//   1. Sign up (or sign in) a test USER via Supabase Auth
//   2. Sign up a test VENDOR, CREATE a vendor row
//   3. READ the vendor back
//   4. UPDATE the vendor (toggle is_open, change description)
//   5. FOLLOW the vendor as the user (favorites insert) + READ followers
//   6. UNFOLLOW (favorites delete)
//   7. DELETE the vendor
//   8. Clean exit with a PASS/FAIL summary
//
// Requires (in .env, loaded automatically):
//   SUPABASE_URL, SUPABASE_ANON_KEY
//
// Run:
//   node scripts/supabase-smoke.mjs
//
// NOTE: For a smooth headless run, temporarily turn OFF "Confirm email" in
// Supabase (Authentication -> Providers -> Email). With it ON, sign-in fails
// until the emailed link is clicked, and the script will tell you so.

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';

const URL = process.env.SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY;

if (!URL || !ANON) {
  console.error('✗ Missing SUPABASE_URL / SUPABASE_ANON_KEY in .env');
  process.exit(1);
}

const pass = (m) => console.log(`  ✓ ${m}`);
const step = (m) => console.log(`\n▶ ${m}`);
const die = (m, e) => {
  console.error(`  ✗ ${m}${e ? `: ${e.message || e}` : ''}`);
  process.exit(1);
};

// A fresh identity per run so re-runs don't collide.
const stamp = Date.now();
const userEmail = `smoke.user.${stamp}@example.com`;
const vendorEmail = `smoke.vendor.${stamp}@example.com`;
const password = 'Test123456!';

async function makeClient() {
  return createClient(URL, ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// Sign up then sign in; returns an authed client + the auth user id.
async function authAs(email, meta) {
  const client = await makeClient();
  const { error: suErr } = await client.auth.signUp({
    email, password, options: { data: meta },
  });
  if (suErr && !/already registered/i.test(suErr.message)) die('signUp', suErr);

  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) {
    if (/email not confirmed/i.test(error.message)) {
      die('sign-in blocked: "Email not confirmed". Turn OFF Confirm email in ' +
          'Supabase Auth settings for this headless test, then re-run', error);
    }
    die('signIn', error);
  }
  return { client, uid: data.user.id };
}

(async () => {
  console.log(`Supabase CRUD smoke test → ${URL}`);

  // ---- 1. USER auth --------------------------------------------------------
  step('1. Create + sign in a test USER');
  const { client: userClient, uid: userId } =
    await authAs(userEmail, { username: `smoke_user_${stamp}`, display_name: 'Smoke User', role: 'user' });
  pass(`user authenticated (${userId})`);

  // Profile row should be auto-created by the DB trigger.
  {
    const { data, error } = await userClient.from('profiles').select('*').eq('id', userId).maybeSingle();
    if (error) die('read profile', error);
    if (!data) die('profile row missing — is the handle_new_user trigger installed? (run schema.sql)');
    pass(`profile row exists (username=${data.username}, role=${data.role})`);
  }

  // ---- 2. VENDOR auth + CREATE --------------------------------------------
  step('2. Create + sign in a test VENDOR and CREATE a vendor row');
  const { client: vendorClient, uid: vendorUid } =
    await authAs(vendorEmail, { username: `smoke_vendor_${stamp}`, display_name: 'Smoke Vendor', role: 'vendor' });
  pass(`vendor authenticated (${vendorUid})`);

  let vendorId;
  {
    const { data, error } = await vendorClient.from('vendors').insert({
      name: 'Smoke Test Tacos',
      type: 'Food',
      tags: ['tacos', 'smoke-test'],
      description: 'Created by the smoke test.',
      owner_id: vendorUid,
      is_open: false,
    }).select('*').single();
    if (error) die('CREATE vendor (check vendors_insert_owner RLS)', error);
    vendorId = data.id;
    pass(`vendor CREATED (${vendorId})`);
  }

  // ---- 3. READ -------------------------------------------------------------
  step('3. READ the vendor back');
  {
    const { data, error } = await userClient.from('vendors').select('*').eq('id', vendorId).single();
    if (error) die('READ vendor', error);
    if (data.name !== 'Smoke Test Tacos') die('READ mismatch');
    pass(`READ ok (name="${data.name}", tier=${data.subscription_tier})`);
  }

  // ---- 4. UPDATE -----------------------------------------------------------
  step('4. UPDATE the vendor (owner only)');
  {
    const { data, error } = await vendorClient.from('vendors')
      .update({ is_open: true, description: 'Now open!' })
      .eq('id', vendorId).select('*').single();
    if (error) die('UPDATE vendor', error);
    if (data.is_open !== true) die('UPDATE did not apply');
    pass('UPDATE ok (is_open=true)');

    // RLS negative check: a non-owner must NOT be able to update.
    const { error: denyErr, data: denyData } = await userClient.from('vendors')
      .update({ description: 'hacked' }).eq('id', vendorId).select('*');
    if (!denyErr && denyData && denyData.length > 0) {
      die('RLS FAILURE: a non-owner was able to update the vendor!');
    }
    pass('RLS ok (non-owner update blocked)');
  }

  // ---- 5. FOLLOW + read followers -----------------------------------------
  step('5. FOLLOW as user (favorites) + READ followers');
  {
    const { error } = await userClient.from('favorites')
      .insert({ user_id: userId, vendor_id: vendorId });
    if (error) die('FOLLOW (favorites insert)', error);
    pass('favorite inserted');

    const { data: favs, error: fErr } = await userClient.from('favorites')
      .select('vendor_id').eq('user_id', userId);
    if (fErr) die('read favorites', fErr);
    if (!favs.some((f) => f.vendor_id === vendorId)) die('favorite not found');
    pass(`favorites READ ok (${favs.length})`);

    // Vendor can see their followers via the join policy.
    const { data: followers, error: flErr } = await vendorClient.from('favorites')
      .select('user_id, profiles!inner(username)').eq('vendor_id', vendorId);
    if (flErr) die('read followers', flErr);
    pass(`followers READ ok (${followers.length} follower(s))`);
  }

  // ---- 6. UNFOLLOW ---------------------------------------------------------
  step('6. UNFOLLOW (favorites delete)');
  {
    const { error } = await userClient.from('favorites')
      .delete().eq('user_id', userId).eq('vendor_id', vendorId);
    if (error) die('UNFOLLOW', error);
    pass('favorite deleted');
  }

  // ---- 7. DELETE vendor ----------------------------------------------------
  step('7. DELETE the vendor (owner only)');
  {
    const { error } = await vendorClient.from('vendors').delete().eq('id', vendorId);
    if (error) die('DELETE vendor', error);
    const { data } = await userClient.from('vendors').select('id').eq('id', vendorId).maybeSingle();
    if (data) die('DELETE did not remove the row');
    pass('DELETE ok');
  }

  console.log('\n=============================================');
  console.log('✅ ALL CRUD SMOKE TESTS PASSED');
  console.log('=============================================');
  console.log('Test accounts left in Auth (safe to delete in the dashboard):');
  console.log(`  ${userEmail}`);
  console.log(`  ${vendorEmail}`);
  process.exit(0);
})().catch((e) => die('unexpected', e));
