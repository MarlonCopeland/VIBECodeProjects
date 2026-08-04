# Supabase + Stripe + Auth Setup Walkthrough

This is everything you do **on the Supabase / Google / Facebook / Stripe side**
to take the app from the offline `local` backend to a real `supabase` backend
with working auth, typed notifications, weekly quotas, and tiered subscriptions.

The app stays on `APP_BACKEND=local` (default) until you complete this — so you
can keep developing offline the whole time.

---

## 0. Prerequisites

```bash
npm install                       # already done if you pulled deps
npm install -g supabase           # Supabase CLI (or use npx supabase ...)
npm install -g eas-cli            # for TestFlight builds later
```

You'll also want accounts: **Supabase**, **Stripe**, **Expo (EAS)**, and (for
OAuth) **Google Cloud** + **Facebook for Developers**.

---

## 1. Create the Supabase project

1. Go to https://supabase.com/dashboard → **New project**.
2. Pick a name, region close to your users, and a strong DB password.
3. When it finishes, open **Project Settings → API** and copy:
   - **Project URL** → `SUPABASE_URL`
   - **anon public** key → `SUPABASE_ANON_KEY`
   - **service_role** key → keep secret, used only by Edge Functions.

---

## 2. Create the database schema

1. In the dashboard open **SQL Editor → New query**.
2. Paste the entire contents of [`supabase/schema.sql`](supabase/schema.sql) and **Run**.

This creates: `profiles`, `vendors`, `favorites`, `notifications`,
`push_tokens`; the `vendor_weekly_usage` view; the new-user trigger; and all
Row Level Security policies.

> The trigger auto-creates a `profiles` row whenever someone signs up, reading
> `username`, `display_name`, and `role` from the auth metadata the app sends.

---

## 3. Configure Auth providers

### 3a. Email/password (email verification REQUIRED)
- **Authentication → Providers → Email**: ensure it's enabled.
- **Authentication → Providers → Email → "Confirm email" must be ON.**
  The app enforces that users cannot access any feature until their email is
  verified, so confirmation must be enabled here.
- **Authentication → Email Templates → Confirm signup**: customize the email if
  you like. The confirmation link returns the user to the app
  (`vendorfinder://auth-callback` / your web URL), after which the app detects
  the verified status and unlocks the UI.
- OAuth sign-ins (Google/Facebook) arrive already email-verified, so they pass
  the gate immediately.

> If "Confirm email" is OFF, accounts would be auto-verified and the gate would
> never show. Keep it ON.

### 3b. Redirect URLs (needed for OAuth + deep links)
**Authentication → URL Configuration → Redirect URLs**, add:
```
vendorfinder://auth-callback
http://localhost:19006
https://YOUR-WEB-DOMAIN            # your deployed PWA, when you have one
```
`vendorfinder` is the app scheme defined in `app.config.js`.

### 3c. Google OAuth
1. Google Cloud Console → **APIs & Services → Credentials → Create OAuth client ID** (Web application).
2. Authorized redirect URI:
   `https://<your-project-ref>.supabase.co/auth/v1/callback`
3. Copy the **Client ID** + **Client secret**.
4. Supabase → **Authentication → Providers → Google** → paste them, enable.

### 3d. Facebook OAuth
1. https://developers.facebook.com → **Create App** → "Consumer".
2. Add **Facebook Login** product. Settings → Valid OAuth Redirect URIs:
   `https://<your-project-ref>.supabase.co/auth/v1/callback`
3. Copy **App ID** + **App Secret**.
4. Supabase → **Authentication → Providers → Facebook** → paste them, enable.

> The app already handles the OAuth round-trip for web (redirect) and native
> (in-app browser via `expo-auth-session`). No code changes needed.

---

## 4. Point the app at Supabase

Create a `.env` (copy from `.env.example`):

```bash
APP_BACKEND=supabase
SUPABASE_URL=https://<your-project-ref>.supabase.co
SUPABASE_ANON_KEY=<anon public key>
WEB_BASE_URL=http://localhost:19006
```

Run it:
```bash
npm run web        # or: npm start
```
Sign up a new account (email required). Confirm a `profiles` row appears in the
Table editor. Sign up another as a **Vendor** and confirm a `vendors` row is
created with `subscription_tier = 'free'`.

---

## 5. Stripe — subscription billing

### 5a. Products & prices
1. Stripe Dashboard (Test mode) → **Products** → create three recurring
   monthly products: **Vendor Tier 1 / 2 / 3** with your prices.
2. Copy each **Price ID** (looks like `price_123...`).
3. Add to `.env` (these are not secret):
   ```
   STRIPE_PUBLISHABLE_KEY=pk_test_...
   STRIPE_PRICE_TIER1=price_...
   STRIPE_PRICE_TIER2=price_...
   STRIPE_PRICE_TIER3=price_...
   ```

> Prices/feature mix are also encoded in `src/config/tiers.js`. To change what a
> tier includes (e.g. give Tier 2 three promo sends, or move the follower gate
> off 10), edit that one file — and the matching `supabase/functions/_shared/tiers.ts`.

### 5b. Deploy the Edge Functions
```bash
supabase login
supabase link --project-ref <your-project-ref>

supabase functions deploy send-notification
supabase functions deploy create-checkout-session
supabase functions deploy customer-portal
supabase functions deploy stripe-webhook --no-verify-jwt   # public for Stripe
```

### 5c. Edge Function secrets
```bash
supabase secrets set STRIPE_SECRET_KEY=sk_test_...
supabase secrets set STRIPE_PRICE_TIER1=price_...
supabase secrets set STRIPE_PRICE_TIER2=price_...
supabase secrets set STRIPE_PRICE_TIER3=price_...
# STRIPE_WEBHOOK_SECRET is set after you create the webhook (next step)
```
(`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` are injected
automatically.)

### 5d. Stripe webhook
1. Stripe Dashboard → **Developers → Webhooks → Add endpoint**.
2. Endpoint URL:
   `https://<your-project-ref>.supabase.co/functions/v1/stripe-webhook`
3. Events to send:
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
4. Copy the **Signing secret** (`whsec_...`) and:
   ```bash
   supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...
   ```

### 5e. Test the flow
- As a vendor with ≥10 followers, open **Vendor Tools → Manage Subscription**,
  pick a tier → you're sent to Stripe Checkout (use test card `4242 4242 4242 4242`).
- After payment, the webhook flips `vendors.subscription_tier`. Reopen the app;
  the new weekly quotas apply immediately.

> ⚠️ **Apple note:** selling digital subscriptions via Stripe inside the iOS app
> violates App Store guideline 3.1.1. This Stripe path is perfect for the
> **web / PWA**. For native iOS distribution you must add Apple In-App Purchase
> — the code is ready for it: implement a new provider in
> `src/services/payments/` and register it in `payments/index.js`. Nothing else
> changes.

---

## 6. Push notifications (Expo Push)

Already wired:
- On sign-in the app registers the device's **Expo push token** into
  `push_tokens` (physical devices only).
- When a vendor sends a typed notification, the `send-notification` Edge
  Function enforces quota, inserts the row, and fans out to every follower's
  token via the Expo Push API.

Nothing extra to configure for Expo Push in development. For production iOS you
provide an **APNs key** during `eas credentials` / first iOS build (EAS walks
you through it).

---

## 7. How the quota / notification system works

- Notification types: **Open For Business**, **Sale**, **Stock Update**
  (`src/config/tiers.js → NOTIFICATION_TYPES`).
- Quota buckets: `open_for_business`, `promotions` (sale + stock), and an
  optional `combined` cap (Tier 3's "15 of any type").
- Weekly window resets Monday 00:00.
- Enforcement is **server-side** in `send-notification` (clients can't bypass);
  the local backend runs the identical logic in-process for offline testing.

Default rules (all editable in one file):

| Plan   | Open For Business | Sale / Stock | Any-type cap | Price   |
|--------|-------------------|--------------|--------------|---------|
| Free   | 1 / week          | 0            | —            | $0      |
| Tier 1 | 7 / week          | 0            | —            | $9.99   |
| Tier 2 | 7 / week          | 2 / week     | —            | $19.99  |
| Tier 3 | —                 | —            | 15 / week    | $39.99  |

Follower gate: a free vendor must subscribe once they hit **10 followers**
(`FOLLOWER_GATE`).

---

## 8. Admin overrides (optional)

To make a user an admin, run in SQL editor:
```sql
update public.profiles set role = 'admin' where username = 'you@example.com';
```
Admins bypass RLS-guarded reads and can set tiers directly via
`setSubscriptionTier` (used by the Admin dashboard).

---

That's the full Supabase side. Next: [`DEPLOYMENT.md`](DEPLOYMENT.md) for
TestFlight + PWA.
