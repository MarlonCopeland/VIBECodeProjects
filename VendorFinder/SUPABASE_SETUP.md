# Supabase Setup — the one guide

**This is the single source of truth for connecting Vendor Finder to a real
Supabase backend** and taking it from the offline `local` demo to full database
functionality: auth + email verification, vendors/favorites/notifications CRUD
with Row-Level Security, realtime, typed broadcasts with server-enforced weekly
quotas, and Stripe-tiered subscriptions.

The app runs on `APP_BACKEND=local` (default) until you finish **Part 1**, so you
can keep developing offline the whole time. Do the parts in order:

- **Part 1 — Connect & verify the database** (required for full DB functionality)
- **Part 2 — Auth providers** (email verification + OAuth)
- **Part 3 — Stripe subscriptions + Edge Functions** (optional, for billing)
- **Part 4 — Push notifications & reference** (how quotas work, admin overrides)

> Deploying the app itself (Web/PWA, iOS TestFlight) is a separate concern —
> see [`DEPLOYMENT.md`](DEPLOYMENT.md), which assumes you've finished Part 1 here.

---

## 0. Prerequisites

```bash
npm install                 # app deps (already done if you pulled the repo)
npm install -g supabase     # Supabase CLI (or use `npx supabase ...`)
```

You'll need a **Supabase** account. Parts 2–3 additionally use **Google /
Facebook** (OAuth) and **Stripe** (billing). Node 20 is required for the Expo
CLI (see the repo `.nvmrc`).

---

# Part 1 — Connect & verify the database

## 1.1 Create the project

1. https://supabase.com/dashboard → **New project**.
2. Pick a name, a region near your users, and a **strong DB password** (save it —
   the CLI needs it in step 1.2).
3. Wait ~2 minutes for it to provision.
4. Open **Project Settings → API** and copy:
   - **Project URL** → `SUPABASE_URL`
   - **anon public** key → `SUPABASE_ANON_KEY` (safe to ship in the app)
   - **service_role** key → keep **secret**; only Edge Functions use it (Part 3).

## 1.2 Apply the database schema

The entire schema lives in **[`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql)**.
It creates `profiles`, `vendors`, `favorites`, `notifications`, `push_tokens`,
the `vendor_weekly_usage` view, the `handle_new_user` trigger, all Row-Level
Security policies, the `avatars` storage bucket, and the `delete_own_account()`
RPC.

**Option A — Supabase CLI (recommended):**

```bash
supabase login                              # opens a browser once
supabase link --project-ref <your-ref>      # <ref> is in your project URL / Settings
supabase db push                            # applies migrations/0001_init.sql
```

**Option B — SQL editor:** open the dashboard → **SQL Editor → New query**, paste
the full contents of `supabase/migrations/0001_init.sql`, and **Run**.

> The `handle_new_user` trigger auto-creates a `profiles` row on sign-up, reading
> `username`, `display_name`, and `role` from the auth metadata the app sends. If
> it's missing, verification (step 1.4) fails with "profile row missing".

## 1.3 Point the app at Supabase

Create a `.env` in the project root (copy from `.env.example`; it's gitignored):

```bash
APP_BACKEND=supabase
SUPABASE_URL=https://<your-ref>.supabase.co
SUPABASE_ANON_KEY=<anon public key>
WEB_BASE_URL=http://localhost:8081
```

`app.config.js` injects these into `expo-constants` → `src/config/env.ts`, and
`src/backend/index.ts` flips the facade from the local store to
`src/backend/supabase/supabaseBackend.ts`. Every screen is unchanged.

> Restart the dev server with a clear cache after any `.env` change
> (`npx expo start -c`) — env is injected at bundle time.

## 1.4 Verify the connection

### Fastest: headless CRUD smoke test

The test needs to sign in without an inbox round-trip, and "Confirm email" is ON
by default. Pick one of:

**Recommended — pre-confirm the test users with a service-role key.** Nothing
about the project changes and no email is sent; the throwaway accounts are
deleted when the run finishes. Grab the key from **Settings → API** (or
`supabase projects api-keys --project-ref <ref>`) and pass it for the one run —
**do not put it in `.env`**, it bypasses RLS:

```bash
SUPABASE_SERVICE_ROLE_KEY=<service_role key> npm run smoke:supabase
```

**Alternative — flip the setting.** Turn **Authentication → Providers → Email →
"Confirm email" OFF**, run `npm run smoke:supabase`, then turn it back ON
(Part 2 depends on it).

> Run this under **Node 22+**. `supabase-js` needs a native `WebSocket` and
> fails on Node 20 with *"native WebSocket not found"*. Node 20 is still what the
> Expo CLI itself needs — only this script wants the newer runtime.

It creates a test user + vendor and exercises the real tables/RLS
(create → read → update → follow → unfollow → delete), including a negative
check that a non-owner *cannot* update someone else's vendor. It ends with:

```
✅ ALL CRUD SMOKE TESTS PASSED
```

Every CRUD call runs through an ordinary **anon-key** client carrying a real
user JWT, so RLS is genuinely exercised either way. Without a service-role key
the test accounts (`smoke.user.*`, `smoke.vendor.*` at `@vendorfinder.test`) are
left behind — harmless, delete them anytime under **Authentication → Users**.

### Then: verify through the app UI

```bash
npm run web          # or: npm start (press w / i / a)
```

With Confirm email still OFF you can sign in immediately:

1. **Sign up a Vendor** (Signup → toggle **Vendor**, add name/type). Creates a
   `profiles` row **and** a `vendors` row (check the Table Editor).
2. **Vendor tab**: toggle **Open** → updates `vendors.is_open` + `current_location`;
   edit profile / add a schedule slot → updates `vendors`.
3. **Sign out**, sign up a **Customer** (second account).
4. **Home / Search**: the vendor appears (cross-user read via `vendors_read` RLS).
5. Tap **★** to follow → inserts a `favorites` row; check the vendor's Followers
   screen. Un-star → deletes it.
6. **Realtime**: with the customer's Home open, toggle the vendor Open in another
   tab — the list re-sorts open-first with no manual refresh.

Every call flows through `src/backend/index.ts` →
`src/backend/supabase/supabaseBackend.ts`; no screen knows which backend is live.

---

# Part 2 — Auth providers

## 2.1 Email/password (verification REQUIRED)

- **Authentication → Providers → Email**: enabled, and **"Confirm email" ON**.
  The app blocks every feature until the email is verified, so confirmation must
  be on (turn it back on now if you disabled it for the smoke test).
- OAuth sign-ins arrive already verified and pass the gate immediately.

### The email templates must include the CODE

The app confirms signups and password resets with a **6-digit code**, not just a
link — a link only works on the device that opens it, which strands anyone who
signs up on an emulator and reads email on their phone. Supabase only puts the
code in the email if the template asks for it, via `{{ .Token }}`.

Edit both templates under **Authentication → Email Templates**:

| Template | Must contain |
|---|---|
| **Confirm signup** | `{{ .Token }}` |
| **Reset password** | `{{ .Token }}` |

For example, in **Confirm signup**:

```html
<h2>Confirm your email</h2>
<p>Enter this code in the app:</p>
<p style="font-size:28px;letter-spacing:4px"><b>{{ .Token }}</b></p>
<p>Or, on this device, <a href="{{ .ConfirmationURL }}">tap here</a>.</p>
```

Keep `{{ .ConfirmationURL }}` too — the app still redeems the link as a
same-device fast path. **If you leave the templates at their link-only default,
the code screens will reject every code the user types**, because no code was
ever sent.

## 2.2 Redirect URLs

**Authentication → URL Configuration → Redirect URLs**, add:

```
vendorfinder://auth-callback
vendorfinder://reset-password
vendorfinder://verify-email
http://localhost:8081
https://YOUR-WEB-DOMAIN        # your deployed PWA, once you have one
```

`vendorfinder` is the app scheme (`app.config.js`). The reset/verify entries are
the same-device link fast path — the 6-digit code works without them, but the
emailed link will not.

## 2.3 Google / Facebook OAuth (optional)

For each provider, create an OAuth app and set the authorized redirect URI to
`https://<your-ref>.supabase.co/auth/v1/callback`:

- **Google:** Google Cloud Console → APIs & Services → Credentials → OAuth client
  ID (Web). Copy Client ID + secret.
- **Facebook:** developers.facebook.com → Create App (Consumer) → add Facebook
  Login. Copy App ID + secret.

Then **Authentication → Providers → Google / Facebook** → paste the credentials
and enable. The app already handles the OAuth round-trip (web redirect + native
in-app browser) — no code changes. Toggle availability with
`AUTH_GOOGLE_ENABLED` / `AUTH_APPLE_ENABLED` in `.env`.

---

# Part 3 — Stripe subscriptions + Edge Functions (optional)

A vendor's subscription tier lives on its `vendors` row and drives the weekly
broadcast quota. The client only holds the **publishable** key; all secret work
happens in Edge Functions.

## 3.1 Products & prices

1. Stripe Dashboard (Test mode) → **Products** → create three recurring monthly
   products: **Vendor Tier 1 / 2 / 3**.
2. Copy each **Price ID** (`price_...`) and add the public values to `.env`:

   ```bash
   STRIPE_PUBLISHABLE_KEY=pk_test_...
   STRIPE_PRICE_TIER1=price_...
   STRIPE_PRICE_TIER2=price_...
   STRIPE_PRICE_TIER3=price_...
   ```

> Tier quotas and the 10-follower gate live in
> **`supabase/functions/_shared/quotaEngine.ts`** — one file, imported by both the
> app and the `send-notification` Edge Function, so client and server always
> agree. Edit quotas there; edit display names, price labels, and Stripe price
> ids in **`src/features/payments/tiers.ts`**.

## 3.2 Deploy the Edge Functions

```bash
supabase functions deploy send-notification
supabase functions deploy create-checkout-session
supabase functions deploy customer-portal
supabase functions deploy stripe-webhook --no-verify-jwt   # public, for Stripe
```

## 3.3 Function secrets

```bash
supabase secrets set STRIPE_SECRET_KEY=sk_test_...
supabase secrets set STRIPE_PRICE_TIER1=price_...
supabase secrets set STRIPE_PRICE_TIER2=price_...
supabase secrets set STRIPE_PRICE_TIER3=price_...
# STRIPE_WEBHOOK_SECRET is set in the next step
```

(`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` are injected
into functions automatically.)

## 3.4 Stripe webhook

1. Stripe → **Developers → Webhooks → Add endpoint**.
2. URL: `https://<your-ref>.supabase.co/functions/v1/stripe-webhook`
3. Events: `checkout.session.completed`, `customer.subscription.updated`,
   `customer.subscription.deleted`.
4. Copy the **Signing secret** (`whsec_...`):
   ```bash
   supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...
   ```

## 3.5 Test

As a vendor, **Vendor tab → Manage subscription** → pick a tier → Stripe Checkout
(test card `4242 4242 4242 4242`). The `stripe-webhook` flips
`vendors.subscription_tier`; the new weekly quotas apply immediately.
`StripePaymentProvider` reads the current subscription back through the backend
facade (`backend.subscriptions.get`), so no separate "get-subscription" function
is needed.

> ⚠️ **Apple note:** selling digital subscriptions via Stripe inside the iOS app
> violates App Store guideline 3.1.1 — this Stripe path is for **web / PWA**. For
> native iOS, add an Apple IAP provider (the payment layer is pluggable; see
> [`DEPLOYMENT.md`](DEPLOYMENT.md) §C).

---

# Part 4 — Push notifications & reference

## 4.1 Push notifications (already wired)

- On sign-in the app registers the device's **Expo push token** into
  `push_tokens` (physical devices only).
- When a vendor sends a typed broadcast, the `send-notification` Edge Function
  enforces the weekly quota, inserts the `notifications` row, and fans out to
  every follower's token via the Expo Push API.

Nothing extra to configure for Expo Push in development. Production iOS needs an
**APNs key**, which `eas credentials` / the first EAS build sets up for you.

## 4.2 How the quota system works

- Types: **Open For Business**, **Sale**, **Stock Update**
  (`src/features/payments/tiers.ts → NOTIFICATION_TYPES`).
- Buckets: `open_for_business`, `promotions` (sale + stock), and an optional
  `combined` cap. Weekly window resets Monday 00:00.
- Enforcement is **server-side** in `send-notification` (clients can't bypass);
  the local backend runs the identical pure engine in-process for offline tests.

| Plan   | Open For Business | Sale / Stock | Any-type cap | Price  |
|--------|-------------------|--------------|--------------|--------|
| Free   | 1 / week          | 0            | —            | $0     |
| Tier 1 | 7 / week          | 0            | —            | $9.99  |
| Tier 2 | 7 / week          | 2 / week     | —            | $19.99 |
| Tier 3 | —                 | —            | 15 / week    | $39.99 |

A free vendor must subscribe once they reach **10 followers** (`FOLLOWER_GATE`).

## 4.3 Make a user an admin

```sql
update public.profiles set role = 'admin' where email = 'you@example.com';
```

Admins bypass RLS-guarded reads, can impersonate any account, and can set tiers
directly via `backend.subscriptions.setTier` (used by the Admin console).

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| Smoke: `Missing SUPABASE_URL / SUPABASE_ANON_KEY` | `.env` missing or wrong keys. |
| Smoke: `profile row missing` | Schema not fully applied — re-run `supabase db push` (or the SQL). |
| Smoke: `native WebSocket not found` | Running on Node 20 — run the smoke test with Node 22+ (step 1.4). |
| Smoke: `Email address ... is invalid` | Supabase rejects RFC-reserved `example.com`; the script uses `@vendorfinder.test`. |
| Smoke: `email rate limit exceeded` | Default SMTP is throttled. Use the service-role option in step 1.4 so no mail is sent. |
| **App sign-up: "Too many attempts. Please wait a moment and try again."** | Not a login throttle. It's Supabase `over_email_send_rate_limit` (HTTP 429) — the built-in SMTP allows only ~2 confirmation emails/hour, and `src/lib/errors.ts` maps any "rate limit" error to that friendly text. Fix by configuring custom SMTP (Part 2). |
| Smoke/app: `Email not confirmed` | Re-run with `SUPABASE_SERVICE_ROLE_KEY`, or turn OFF "Confirm email" for the test (step 1.4) and re-enable in Part 2. |
| CLI: `'auth' has invalid keys: enable_confirmations` | `supabase/config.toml` — `enable_confirmations` belongs under `[auth.email]`, not `[auth]`. |
| CLI: `failed to parse environment file: .env` | `.env` was saved UTF-8 **with BOM**. Re-save without a BOM. |
| App still shows demo data / `admin`/`admin123` works | `.env` missing `APP_BACKEND=supabase`, or Metro cached old env → `npx expo start -c`. |
| CREATE/UPDATE denied (RLS) | Signed in as a non-owner, or `owner_id` ≠ `auth.uid()`. The app sets this automatically. |
| Nothing loads / network error | Project URL has no trailing slash; use the **anon public** key (not service_role). |
