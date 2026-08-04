# Vendor Finder

A cross-platform **Expo (React Native) + Supabase** app that connects pop-up
vendors with customers. Customers discover, follow, and get alerted about nearby
open vendors; vendors post schedules, broadcast live availability (with weekly
quotas by subscription tier), and manage their followers; admins can impersonate
any account.

Built on the **UnjadedDigital** template architecture: a pluggable backend
contract, a feature-flag module registry, themed UI primitives, and a single
aggregating namespace (see `src/index.ts`, exported as `VendorFinder`).

## Highlights

- **TypeScript + Expo Router** (file-based, typed routes, New Architecture).
- **Pluggable backend** — a single `Backend` contract with two implementations:
  - `local` — in-memory demo backend, zero setup, great for previews/tests.
  - `supabase` — real auth, Postgres, storage, realtime, and Edge Functions.
  - Swap with one env var (`APP_BACKEND`); screens never change.
- **Roles + RBAC** — `user`, `vendor`, `admin`, with a `can()` permission matrix
  and admin **impersonation** (a persistent banner + one-tap stop).
- **Vendor discovery** — open-now-first home feed, full-text search, vendor
  detail with schedule, distance via device location (Haversine + mock fallback).
- **Follow + alerts** — follow vendors; proximity/open **alerts** with per-day
  dedupe and an in-app history.
- **Vendor tools** — open toggle, schedule editor, follower management, and
  **typed broadcasts** (Open / Sale / Stock) enforced against **weekly quotas**.
- **Subscriptions** — data-driven tiers with a pluggable payment provider
  (Stripe when configured, local mock otherwise).
- **Auth & security** — email/password, OAuth, email verification gate,
  SecureStore sessions, and Row-Level Security on every table.

## Quick start

> **Node version:** Expo SDK 52 targets **Node 18 or 20 LTS**. Newer Node (22+)
> breaks the Expo CLI's config loader. An `.nvmrc` is included — run `nvm use`
> (or `nvm install 20 && nvm use 20`) before starting.

```bash
nvm use                   # -> Node 20 (see .nvmrc)
npm install
cp .env.example .env      # defaults to the local demo backend
npm run start             # press w / i / a for web / iOS / Android
```

The default `.env` uses `APP_BACKEND=local`, so you can sign in immediately with
the seeded demo admin:

```
username: admin
password: admin123
```

From there, impersonate the seeded **Demo Vendor Owner** to explore Vendor Tools,
or sign up a new account (customer or vendor). Email/password sign-ups start
**unverified**; on the local backend a 6-digit code is logged to the console
(`[VERIFY] ...`) — enter it on the verify screen to unlock the app.

To connect a real backend (auth, database, realtime, subscriptions), follow the
one complete guide: **[`SUPABASE_SETUP.md`](./SUPABASE_SETUP.md)**. For shipping
the app to Web/PWA or iOS TestFlight afterward, see
[`DEPLOYMENT.md`](./DEPLOYMENT.md).

> **This checkout is already connected to Supabase** — the local `.env` sets
> `APP_BACKEND=supabase`, so the demo admin above does **not** apply; sign up a
> real account instead. See [`NEXT_STEPS.md`](./NEXT_STEPS.md) for current state.
> Set `APP_BACKEND=local` to go back to the offline demo.

## Turning modules on/off

Each optional feature is a flag in `.env` (read in `app.config.js`, resolved in
`src/config/features.ts`). Disable one and its tab/routes disappear
automatically:

```env
FEATURE_FAVORITES=true
FEATURE_ALERTS=false        # removes the Alerts tab + proximity engine
FEATURE_VENDOR_TOOLS=true   # Vendor tab (also requires vendor/admin role)
FEATURE_ADMIN=true          # Admin tab (also requires admin role)
FEATURE_PROFILE=true
FEATURE_SETTINGS=true
FEATURE_NOTIFICATIONS=true
FEATURE_PAYMENTS=true
```

`auth` and `vendors` are core modules and are always enabled.

## Project structure

```
app/                         Expo Router routes
  _layout.tsx                Root: providers + auth/verification gate
  (auth)/                    login, signup (user/vendor), forgot-password, verify-email
  (app)/                     Authenticated area (impersonation banner + stack)
    (tabs)/                  Home, Search, Favorites, Alerts, Vendor, Admin, Profile, Settings
    vendor/[id].tsx          Vendor detail
    vendor/edit.tsx          Edit vendor profile
    followers.tsx            Follower management
    subscription.tsx         Vendor subscription tiers
    profile/edit.tsx         Edit profile (modal)
src/
  config/                    env.ts (typed config) + features.ts (module registry)
  theme/                     tokens, semantic colors, ThemeProvider
  lib/                       secureStore, storage, validation, errors, location
  components/                shared themed UI primitives
  backend/                   Backend contract + facade
    local/  supabase/        the two implementations
  features/                  self-contained modules, each with an index manifest
    auth/ vendors/ favorites/ alerts/ vendorTools/ admin/
    profile/ notifications/ payments/
  providers/                 AppProviders (composes all context providers)
  index.ts                   the `VendorFinder` namespace aggregator
supabase/                    SQL migration (RLS, triggers, views, storage) +
                             Edge Functions (Stripe + send-notification) + docs
```

See [`ARCHITECTURE.md`](./ARCHITECTURE.md) and
[`documentation.md`](./documentation.md) for the design rationale, the data
model, and a guide to adding your own feature module.

## Scripts

| Command             | What it does              |
| ------------------- | ------------------------- |
| `npm run start`     | Start the Expo dev server |
| `npm run ios`       | Run on iOS                |
| `npm run android`   | Run on Android            |
| `npm run web`       | Run on web                |
| `npm run typecheck` | `tsc --noEmit`            |

## Security notes

- Only **public** values live on the client (anon key, Stripe publishable key,
  URLs). Secrets (service role, Stripe secret) belong in Supabase Edge Functions
  / server env, never in the app or a committed `.env`.
- Auth sessions use hardware-backed SecureStore on native.
- Every table enforces Row-Level Security. Broadcast quota is enforced
  **server-side** in the `send-notification` Edge Function; account deletion runs
  through a scoped `SECURITY DEFINER` RPC.
