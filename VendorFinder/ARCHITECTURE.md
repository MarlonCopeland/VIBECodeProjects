# Architecture

This document explains how VendorFinder is put together and how to extend it.
The guiding principle: **screens depend on stable contracts, not concrete
implementations**, so any layer can be swapped without a rewrite.

## Layers

```
 Routes (app/)            Expo Router screens — presentation only.
      │  use hooks/services, never touch Supabase directly
      ▼
 Features (src/features/) Self-contained modules: auth, profile,
      │                   notifications, payments. Each owns its service +
      │                   context + UI + an index manifest.
      ▼
 Backend facade (src/backend)  A single `Backend` contract. `index.ts` picks
      │                        the implementation from config.
      ├── supabase/    real backend (auth, DB, storage, RPC)
      └── local/       in-memory demo backend (same contract)
      ▼
 Config (src/config)     env.ts (typed, from app.config.ts → Constants.extra)
                         features.ts (the module registry / feature flags)
```

Cross-cutting: `src/theme` (design tokens + provider), `src/lib`
(secure/plain storage, validation, error normalization), `src/components`
(themed UI primitives).

## The backend contract

`src/backend/types.ts` defines `Backend = { auth, profile, users, vendors,
favorites, broadcasts, subscriptions, notifications }`. Both `localBackend` and
`supabaseBackend` implement it exactly. `backend/index.ts` resolves one at
startup from `APP_BACKEND`:

- Everything above the facade imports `{ backend }` and calls
  `backend.auth.*`, `backend.profile.*`, etc.
- The Supabase client is `require`d lazily so a `local` build never pulls in
  the network client or its polyfills.

Add a new backend (Firebase, REST, …) by implementing `Backend` and wiring it
into `resolveBackend()`.

## The module system

What makes this a *template*: optional features are flags, not forks.

1. `app.config.ts` reads `FEATURE_*` env vars into `extra.features`.
2. `src/config/features.ts` resolves them into a typed `Features` object and a
   `FEATURE_MANIFESTS` catalog. Core modules (auth) can't be disabled.
3. UI reads `isFeatureEnabled('payments')` to gate tabs, routes, and actions.
   Disabled tabs use Expo Router's `href: null` to disappear from the tab bar.

Each feature's `index.ts` exports a manifest (`{ id, title, description,
enabled, routes }`), so tooling, settings screens, and the `VendorFinder`
namespace can enumerate what's active.

## The `VendorFinder` namespace

`src/index.ts` aggregates config, feature flags, the backend, and every module
into one object:

```ts
import { VendorFinder } from '@app/index';

VendorFinder.features.payments;          // boolean
VendorFinder.backend.auth.getSession();  // active backend
VendorFinder.modules.profile.routes;     // ['(app)/profile/edit']
```

Modules are also importable directly for tree-shaking:
`import { useAuth } from '@app/features/auth'`.

## Auth & security flow

- `AuthProvider` restores the session on launch and subscribes to backend auth
  changes. It exposes `status` (`loading | authenticated | unauthenticated`)
  and `needsVerification`.
- The **gate** lives in `app/_layout.tsx`: a single effect redirects between
  the `(auth)` and `(app)` route groups based on `status`, and pins unverified
  users to `verify-email`. Screens never check auth themselves.
- Sessions persist in SecureStore (Keychain/Keystore) on native.
- Passwords run through `validatePassword` + a live strength meter.
- On the server, RLS scopes every row to its owner; account deletion goes
  through the `delete_own_account()` `SECURITY DEFINER` RPC.

## Adding a feature module

1. Create `src/features/<name>/` with a service (wraps `backend` or its own
   provider) and, if it has UI, a context/components.
2. Add the flag: extend `FEATURE_IDS` + `FEATURE_MANIFESTS` in
   `src/config/features.ts`, and a `FEATURE_<NAME>` var in `app.config.ts` +
   `.env.example`.
3. Export an `index.ts` manifest and register it in `src/index.ts` under
   `VendorFinder.modules`.
4. Add routes under `app/(app)/...` and gate their tab/entry points with
   `isFeatureEnabled('<name>')`.

## Adding a new screen

Drop a file under `app/`. It inherits the nearest `_layout` (theming, headers,
the auth gate). Wrap content in `<Screen>` and use the themed primitives from
`src/components` so it stays consistent in light/dark.
