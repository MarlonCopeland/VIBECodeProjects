# Vendor Finder — Feature Documentation

Cross-platform (web / iOS / Android) Expo + React Native app that connects
pop-up vendors with customers. Customers discover, follow, and get alerted about
nearby open vendors. Vendors post schedules, broadcast typed availability alerts
(quota-limited by subscription tier), and manage their followers. An admin can
impersonate any account.

This app is built on the **UnjadedDigital** template architecture. For the
design rationale (backend contract, module system, theming, adding a module) see
[`ARCHITECTURE.md`](./ARCHITECTURE.md). This file focuses on the Vendor Finder
domain.

---

## 1. Tech stack

- **Framework:** Expo SDK 52, React Native 0.76, React 18, **TypeScript**.
- **Navigation:** **Expo Router** (file-based, typed routes) under `app/`.
- **Backend:** swappable via `APP_BACKEND` — `local` (AsyncStorage/localStorage,
  offline) or `supabase` (Postgres + Auth + Realtime + Edge Functions).
- **Auth:** email/password + OAuth (Google/Apple), email-verification gate,
  SecureStore sessions. Local demo auth is offline (console verification code).
- **Payments:** Stripe Checkout via Supabase Edge Functions behind a pluggable
  `PaymentProvider`; a local mock applies tiers instantly.
- **Location:** `expo-location` with a mock LA fallback + Haversine distance.
- **Notifications:** typed vendor→follower broadcasts; local + Expo Push.
- **Config:** env-injected via `app.config.js` → `expo-constants` (`src/config/env.ts`).

## 2. How to run

```bash
nvm use            # Node 20 (see .nvmrc); SDK 52 CLI breaks on Node 22+
npm install
npm run web        # browser (or: npm run ios / android / start)
npm run typecheck  # tsc --noEmit
```

Default backend is `local`. Sign in with the seeded admin (`admin` / `admin123`).

## 3. Architecture (layers)

```
app/                       Expo Router routes — presentation only
  _layout.tsx              Root: providers + auth/verification gate
  (auth)/                  login, signup (user/vendor), forgot-password, verify-email
  (app)/                   Authenticated area (impersonation banner + stack)
    (tabs)/                Home, Search, Favorites, Alerts, Vendor, Admin, Profile, Settings
    vendor/[id], vendor/edit, followers, subscription, profile/edit
src/
  backend/                 Backend contract (types.ts) + facade (index.ts)
    local/  supabase/      the two implementations
  features/                self-contained modules (service + context/components + manifest)
    auth/                  AuthContext (roles, impersonation, can(), verify), authService, rbac
    vendors/               VendorContext (realtime + location + alert loop), VendorCard, SearchBar, ScheduleItem
    favorites/ alerts/     follow service; alert engine + history
    vendorTools/ admin/    vendor open/schedule/broadcast/followers; user directory + ImpersonationBanner
    payments/              data-driven tiers + quota engine + PaymentProvider
    profile/ notifications/settings pieces from the template
  config/                  env.ts (typed config) + features.ts (module registry)
  theme/  lib/  components/ tokens/colors/provider; storage/validation/location/errors; themed primitives
  index.ts                 the `VendorFinder` namespace aggregator
```

Screens depend on stable contracts, never concrete backends. Everything above
`src/backend` calls `backend.vendors.*`, `backend.favorites.*`, etc.

## 4. Roles & RBAC

Three roles on the user record: `user`, `vendor`, `admin`. The permission matrix
lives in `src/features/auth/rbac.ts` (`checkPermission`) and is used via
`useAuth().can(action, resource?)`. Admins inherit everything.

Role-gating in the UI:
- Tabs are rendered from the feature registry **and** the acting user's role
  (`app/(app)/(tabs)/_layout.tsx`): the **Vendor** tab needs `vendorTools`
  enabled + a vendor/admin role; the **Admin** tab needs `admin` enabled + an
  admin role. Disabled → `href: null` removes the tab.
- The Profile screen offers **Become a vendor** for `user` accounts.
- Vendor-owned actions check ownership (`vendor.ownerId === user.id`).

## 5. Authentication & verification

- Email/password sign-in (the local backend also accepts a **username**, e.g.
  `admin`). Sign-up has a **User/Vendor toggle**; vendors also provide a vendor
  name + type, and a paired vendor record is created (or backfilled after
  verification via `ensureVendorRecord`).
- **Email verification gates the whole app.** An authenticated-but-unverified
  user only sees `verify-email` (enforced in `app/_layout.tsx`); `can()` returns
  false while unverified.
  - Local demo: a 6-digit code is logged to the console (`[VERIFY] ...`); enter
    it on the verify screen (`confirmVerification`).
  - Supabase: click the emailed link, then "I've verified — continue" (`refresh`).
  - OAuth accounts arrive verified.

## 6. Admin impersonation

`AuthContext` holds `realUser` (the actual admin) and `actingAs` (the target);
`user = actingAs ?? realUser`. From the **Admin** tab, "Impersonate" routes the
whole app through that identity — tabs update to the impersonated role. A
persistent black **ImpersonationBanner** offers one-tap **Stop**.

## 7. Location & alerts

- `src/lib/location.ts` — `getLocation` (expo-location + mock fallback),
  `distanceKm` (Haversine), `withDistances` (enrich vendors).
- `src/features/alerts/alertService.ts` — `evaluateAndAlert` runs every
  `ALERT_POLL_INTERVAL_MS` (60s) from `VendorContext`. For each followed vendor:
  fire *"<name> is open!"* when open, and *"<name> is nearby"* when open and
  within `NEARBY_RADIUS_KM` (2 km). Dedupe keys are `condition:vendor:date` so at
  most one alert per condition per day. Every alert is logged to history for the
  **Alerts** screen.

## 8. Vendor tools, broadcasts & quotas

The **Vendor** tab (`vendor-tools`) provides: open toggle (snapshots current
location when opening), schedule editor, follower management, and **typed
broadcasts**. Broadcast types (`open_for_business`, `sale`, `stock_update`) and
per-tier **weekly quotas** are defined in `src/features/payments/tiers.ts`. The
pure quota engine (`canSend` / `bucketsForSend` / `startOfWeek`) is shared by the
local backend and the `send-notification` Edge Function, so enforcement is
identical across backends. Exceeding a quota throws `code: 'QUOTA_EXCEEDED'`,
which the UI surfaces as an upgrade prompt.

## 9. Subscriptions

A subscription belongs to a **vendor** (tier + status stored on the vendor
record). `SubscriptionScreen` reads/writes via `paymentProvider`
(`src/features/payments`): the local mock calls `backend.subscriptions.setTier`
immediately; Stripe invokes `create-checkout-session` / `customer-portal` Edge
Functions and the `stripe-webhook` updates the vendor row.

## 10. Data model (backend contract)

Defined in `src/backend/types.ts`:

```ts
AppUser   { id, email, displayName, role, avatarUrl, emailVerified, metadata,
            createdAt, username?, interests?, vendorId?, provider?, providerId? }
Vendor    { id, name, type, tags[], description, ownerId, blockedUserIds[],
            schedule: ScheduleSlot[], currentLocation: GeoPoint|null, isOpen,
            rating, subscriptionTier, subscriptionStatus, createdAt, distanceKm? }
VendorNotification { id, vendorId, type, title, body, buckets[], recipientIds[], at }
```

Backend sub-APIs: `auth`, `profile`, `users`, `vendors`, `favorites`,
`broadcasts`, `subscriptions`, `notifications`.

## 11. Supabase

`supabase/migrations/0001_init.sql` provisions profiles, vendors, favorites,
notifications, push_tokens, the `vendor_weekly_usage` view, RLS (public reads;
owner/admin writes; server-only notification inserts), an auto-profile trigger,
the avatars bucket, and `delete_own_account`. Edge Functions live under
`supabase/functions/` (`create-checkout-session`, `customer-portal`,
`stripe-webhook`, `send-notification`). See [`SUPABASE_SETUP.md`](./SUPABASE_SETUP.md)
and [`DEPLOYMENT.md`](./DEPLOYMENT.md).

## 12. Demo credentials (local backend)

| Login   | Password   | Role  | Notes                              |
| ------- | ---------- | ----- | ---------------------------------- |
| `admin` | `admin123` | admin | Pre-verified. Impersonate anyone.  |

The seed also creates a **Demo Vendor Owner** (role `vendor`) owning the three
demo vendors — impersonate it from the Admin tab to explore Vendor Tools. Sign up
new customer/vendor accounts to exercise the verification flow.
