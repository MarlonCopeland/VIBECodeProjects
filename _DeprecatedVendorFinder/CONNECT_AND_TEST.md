# Connect the App to Supabase & Test CRUD

A focused, do-this-now guide to point Vendor Finder at a real Supabase project
and verify create/read/update/delete works — both headlessly (script) and in
the app. For the full reference (OAuth, Stripe, Edge Functions) see
[`SUPABASE_SETUP.md`](SUPABASE_SETUP.md).

---

## 1. Create the Supabase project (cloud)

1. Go to https://supabase.com/dashboard → **New project**.
2. Name it, pick a region near you, set a DB password, create.
3. Wait ~2 min for it to provision.

## 2. Apply the database schema

1. Dashboard → **SQL Editor → New query**.
2. Open [`supabase/schema.sql`](supabase/schema.sql), copy **all** of it, paste, **Run**.
3. Confirm success — this creates `profiles`, `vendors`, `favorites`,
   `notifications`, `push_tokens`, the `handle_new_user` trigger, the
   `vendor_weekly_usage` view, and all Row Level Security policies.

> The `handle_new_user` trigger is what auto-creates a `profiles` row on signup.
> If it's missing, the smoke test fails at step 1 with "profile row missing".

## 3. Grab your keys

Dashboard → **Project Settings → API**:
- **Project URL** → `SUPABASE_URL`
- **Project API keys → anon public** → `SUPABASE_ANON_KEY`

(Ignore `service_role` here — that's only for Edge Functions, never the client.)

## 4. Turn OFF email confirmation (temporary, for testing)

Dashboard → **Authentication → Providers → Email** → toggle **"Confirm email" OFF** → Save.

This lets you sign in immediately so you can test CRUD without inbox round
trips. **Re-enable it in step 8** — the app's verification gate depends on it.

## 5. Create your local `.env`

In the project root create a file named `.env` (it's gitignored):

```bash
APP_BACKEND=supabase
SUPABASE_URL=https://YOUR-REF.supabase.co
SUPABASE_ANON_KEY=YOUR-ANON-KEY
WEB_BASE_URL=http://localhost:19006
```

> `app.config.js` reads these via `process.env` and injects them into
> `expo-constants` → `src/config/env.js`. Setting `APP_BACKEND=supabase` flips
> the backend facade from the local AsyncStorage impl to `supabaseBackend.js`.

## 6. Headless CRUD smoke test (fastest verification)

This runs create/read/update/delete against your live project without opening
the app:

```bash
npm run smoke:supabase
```

Expected output ends with:

```
✅ ALL CRUD SMOKE TESTS PASSED
```

What it does (mirrors real app flows + RLS):
1. Creates & signs in a test **user**, verifies the auto-created `profiles` row.
2. Creates & signs in a test **vendor**, **CREATE**s a vendor row.
3. **READ**s it back.
4. **UPDATE**s it (and confirms a non-owner is *blocked* by RLS).
5. **FOLLOW**s it (favorites insert) and reads followers.
6. **UNFOLLOW**s it.
7. **DELETE**s the vendor.

If it stops with **"Email not confirmed"**, you skipped step 4 — turn off
Confirm email and re-run. Test accounts (`smoke.user.*`, `smoke.vendor.*`) are
harmless; delete them anytime under **Authentication → Users**.

### Verify in the dashboard
While/after running, open **Table Editor**:
- `profiles` — two new rows (user + vendor).
- `vendors` — a row appears then disappears (created then deleted by step 7).
Or **SQL Editor**: `select id, name, is_open, subscription_tier from vendors;`

## 7. Test CRUD through the app UI

```bash
npm run web          # or: npm start  (then press w / i / a)
```

Because Confirm email is OFF, signups are usable immediately.

1. **Sign up a Vendor** (Signup screen → toggle **Vendor**, enter email + password
   + vendor name/type).
   - **CREATE**: this creates the `profiles` row **and** a `vendors` row
     (check Table Editor).
2. **Vendor Tools tab**:
   - Toggle **Open right now** → **UPDATE** `vendors.is_open` (+ `current_location`).
   - **Edit Profile** → change type/tags/description → **UPDATE**.
   - Add/remove a **schedule** slot → **UPDATE** `vendors.schedule`.
3. **Sign out**, **sign up a User** (second account, email/password).
4. **Home / Search**: the vendor you created appears → **READ** across accounts
   (proves cross-user reads via the `vendors_read` policy).
5. Tap the **★** on the vendor card → **CREATE** `favorites` row (follow).
   Check the Followers screen from the vendor account → **READ** join.
6. Un-star → **DELETE** `favorites` row (unfollow).
7. **Realtime check**: keep the User's Home open, and in another browser/tab as
   the Vendor toggle Open — the User's list re-sorts open-first without a manual
   refresh (Supabase Realtime on the `vendors` table).

> Every one of these calls flows through `src/services/backend/index.js` →
> `supabaseBackend.js`. No screen code knows which backend is active.

## 8. Re-enable email confirmation

Dashboard → **Authentication → Providers → Email** → **"Confirm email" ON** → Save.

Now new email/password signups land on **VerifyEmailScreen** and cannot use any
feature until they click the link in their email (the app polls
`refreshSession()` and unlocks automatically). OAuth (Google/Facebook) users are
pre-verified. See [`SUPABASE_SETUP.md`](SUPABASE_SETUP.md) §3 for enabling OAuth.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| Script: `Missing SUPABASE_URL / SUPABASE_ANON_KEY` | `.env` not created or wrong keys. |
| Script: `profile row missing` | `schema.sql` not fully run (trigger absent). Re-run it. |
| Script/app: `Email not confirmed` | Turn off Confirm email (step 4) for testing. |
| App still shows demo data / `admin`/`admin123` works | `.env` missing `APP_BACKEND=supabase`, or Metro cached the old env. Stop the dev server and restart: `npx expo start -c`. |
| CREATE/UPDATE denied (RLS error) | You're signed in as a non-owner, or `owner_id` ≠ `auth.uid()`. The app sets this automatically; in SQL tests it's enforced. |
| Nothing loads / network error | Check the Project URL has no trailing slash and the anon key is the **anon public** one (not service_role). |

> Restart the dev server with a clear cache (`npx expo start -c`) any time you
> change `.env`, since env is injected at bundle time.
