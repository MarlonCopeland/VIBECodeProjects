# UnjadedDigital

A modular, cross-platform **Expo (React Native) + Supabase** app template — a
production-minded starting point you can fork to kickstart new apps. It ships
best-in-class authentication, account security, navigation, and profile
management, and every feature is a **module you can include or exclude** per
app via config flags.

> Namespace: everything is organized and exported under the `UnjadedDigital`
> namespace (see `src/index.ts`).

## Highlights

- **TypeScript + Expo Router** (file-based, typed routes, New Architecture).
- **Pluggable backend** — a single `Backend` contract with two implementations:
  - `local` — in-memory demo backend, zero setup, great for previews/tests.
  - `supabase` — real auth, profiles, storage, and push tokens.
  - Swap with one env var (`APP_BACKEND`); screens never change.
- **Best-in-class auth & security**
  - Email/password, OAuth (Google/Apple), magic link, password reset.
  - Email verification gate, password-strength meter, validation.
  - Sessions persisted in the device **Keychain/Keystore** via SecureStore.
  - Row-Level Security on every table; self-service account deletion RPC.
- **Navigation shell** — auth-gated routing, tab bar, light/dark theming.
- **Profile management** — view/edit, avatar upload to Supabase Storage,
  delete account.
- **Optional modules** — push notifications (Expo) and Stripe subscriptions,
  each behind a feature flag and a pluggable provider.

## Quick start

> **Node version:** Expo SDK 52 targets **Node 18 or 20 LTS**. Newer Node (22+)
> breaks the Expo CLI's config loader (`ERR_UNKNOWN_FILE_EXTENSION` /
> type-stripping errors on `expo-modules-core`). An `.nvmrc` is included — run
> `nvm use` (or `nvm install 20 && nvm use 20`) before starting.

```bash
nvm use                   # -> Node 20 (see .nvmrc)
npm install
cp .env.example .env      # defaults to the local demo backend
npm run start             # press w / i / a for web / iOS / Android
```

The default `.env` uses `APP_BACKEND=local`, so you can sign in immediately
with the seeded demo account:

```
email:    demo@unjadeddigital.com
password: Password1
```

To use Supabase, set `APP_BACKEND=supabase`, add `SUPABASE_URL` /
`SUPABASE_ANON_KEY`, and apply the schema — see [`supabase/README.md`](./supabase/README.md).

## Turning modules on/off

Each optional feature is a flag in `.env` (read in `app.config.ts`, resolved in
`src/config/features.ts`). Disable one and its tab/routes disappear
automatically:

```env
FEATURE_PROFILE=true
FEATURE_SETTINGS=true
FEATURE_NOTIFICATIONS=false   # removes push code paths + settings toggle
FEATURE_PAYMENTS=false        # removes the subscription screen + tab entry
```

`auth` is a core module and is always enabled.

## Project structure

```
app/                         Expo Router routes
  _layout.tsx                Root: providers + auth gate (redirects)
  (auth)/                    Unauthenticated flow (login, signup, reset, verify)
  (app)/                     Authenticated area
    (tabs)/                  Home / Profile / Settings (tabs are feature-gated)
    profile/edit.tsx         Edit profile (modal)
    subscription.tsx         Subscription tiers
src/
  config/                    env.ts (typed config) + features.ts (module registry)
  theme/                     tokens, semantic colors, ThemeProvider
  lib/                       secureStore, storage, validation, errors
  components/                shared themed UI primitives
  backend/                   Backend contract + facade
    supabase/                Supabase implementation
    local/                   in-memory demo implementation
  features/                  self-contained modules, each with an index manifest
    auth/  profile/  notifications/  payments/
  providers/                 AppProviders (composes all context providers)
  index.ts                   the `UnjadedDigital` namespace aggregator
supabase/                    SQL migration (RLS, triggers, storage) + setup docs
```

See [`ARCHITECTURE.md`](./ARCHITECTURE.md) for the design rationale and a guide
to adding your own feature module.

## Scripts

| Command             | What it does                          |
| ------------------- | ------------------------------------- |
| `npm run start`     | Start the Expo dev server             |
| `npm run ios`       | Run on iOS                            |
| `npm run android`   | Run on Android                        |
| `npm run web`       | Run on web                           |
| `npm run typecheck` | `tsc --noEmit`                        |

## Security notes

- Only **public** values live on the client (anon key, Stripe publishable key,
  URLs). Secrets (service role, Stripe secret) belong in Supabase Edge
  Functions / server env, never in the app or `.env` committed to git.
- Auth sessions use hardware-backed SecureStore on native.
- Every table enforces Row-Level Security; account deletion runs through a
  scoped `SECURITY DEFINER` RPC.
