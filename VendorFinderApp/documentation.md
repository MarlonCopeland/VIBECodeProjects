# Vendor Finder — Feature Documentation

Cross-platform (web / iOS / Android) Expo + React Native app that connects
pop-up vendors with customers. Customers discover, follow, and get alerted
about nearby open vendors. Vendors post schedules, push live availability
alerts, and manage their follower base. An admin can impersonate any account.

---

## Table of contents
1. [Tech stack](#1-tech-stack)
2. [How to run](#2-how-to-run)
3. [Architecture](#3-architecture)
4. [Roles & RBAC](#4-roles--rbac)
5. [Authentication](#5-authentication)
6. [User features](#6-user-features)
7. [Vendor features](#7-vendor-features)
8. [BackendAdmin features](#8-backendadmin-features)
9. [Data model](#9-data-model)
10. [Backend abstraction (Local ↔ Firebase)](#10-backend-abstraction-local--firebase)
11. [Location & alerts](#11-location--alerts)
12. [Project layout](#12-project-layout)
13. [Demo credentials](#13-demo-credentials)

---

## 1. Tech stack
- **Framework:** Expo SDK 50, React Native 0.73, React 18
- **Web:** `react-native-web`, served by Expo's Metro bundler
- **Navigation:** `@react-navigation/native` (stack + bottom tabs)
- **Local storage:** `@react-native-async-storage/async-storage`
- **Location:** `expo-location` with a mock fallback
- **Notifications:** `expo-notifications` on native, browser `Notification` API on web
- **Language:** JavaScript (ES modules)

## 2. How to run
```bash
cd VendorFinderApp
npm install
npm run web        # browser
npm run ios        # iOS simulator (macOS)
npm run android    # Android emulator
npm start          # Expo dev menu — scan QR with Expo Go
```

## 3. Architecture

```
App.js                                # Auth gate + role-based navigation
src/
  config.js                           # BACKEND flag, alert radius, poll interval
  context/
    AuthContext.js                    # Session, role, impersonation, can()
    VendorContext.js                  # Vendors, favorites, location, alert engine
  services/
    authService.js                    # Username/password + OAuth stubs
    locationService.js                # expo-location + Haversine distance
    notificationService.js            # Local + web notifications, alert history
    backend/
      index.js                        # Facade — single swap point
      localBackend.js                 # AsyncStorage implementation (default)
      firebaseBackend.js              # Stub + reference impl in comments
  components/                         # VendorCard, SearchBar, ScheduleItem,
                                      # ImpersonationBanner
  screens/                            # Login, Signup, Home, Search, Favorites,
                                      # VendorDetail, Profile, Alerts,
                                      # VendorTools, EditVendorProfile,
                                      # Followers, AdminDashboard
```

**Layers**
1. **Backend** — `services/backend/*` is the only layer that talks to storage.
   Every screen depends on the facade `index.js`, never on a concrete backend.
2. **Services** — `authService`, `locationService`, `notificationService`
   wrap platform/auth concerns so screens stay declarative.
3. **Contexts** — `AuthContext` and `VendorContext` provide global app state.
4. **Screens & components** — Pure UI consuming context + services.

## 4. Roles & RBAC

Three roles, declared on the `User` record:

| Role           | Purpose                                                     |
| -------------- | ----------------------------------------------------------- |
| `user`         | Consumer of the app — browse, follow, get alerts            |
| `vendor`       | Pop-up vendor with all user powers **plus** Vendor Tools    |
| `admin`        | Backend operator with read/write access and impersonation   |

### Permission matrix
Implemented in `src/context/AuthContext.js → checkPermission()` and used via
`useAuth().can(action, resource?)`. Admins inherit everything.

| Action                  | User | Vendor (own) | Admin |
| ----------------------- | ---- | ------------ | ----- |
| `view:vendors`          | ✓    | ✓            | ✓     |
| `search:vendors`        | ✓    | ✓            | ✓     |
| `favorite:vendor`       | ✓    | ✓            | ✓     |
| `view:profile`          | ✓    | ✓            | ✓     |
| `edit:own-profile`      | ✓    | ✓            | ✓     |
| `view:alerts`           | ✓    | ✓            | ✓     |
| `access:vendor-tools`   |      | ✓            | ✓     |
| `edit:own-vendor`       |      | ✓ (own)      | ✓     |
| `send:broadcast`        |      | ✓ (own)      | ✓     |
| `manage:followers`      |      | ✓ (own)      | ✓     |
| `access:admin`          |      |              | ✓     |
| `impersonate`           |      |              | ✓     |
| `list:users`            |      |              | ✓     |

### How role-gating shows up in the UI
- Bottom tabs are conditionally rendered in `App.js → MainTabs()` based on
  `currentUser.role`. Users see Home/Search/Favorites/Alerts/Profile;
  vendors additionally see a **Vendor Tools** tab; admins additionally see
  an **Admin** tab.
- The Profile screen offers an **"Become a Vendor"** upgrade for `user`
  accounts (calls `authService.upgradeToVendor`).
- Vendor-owned actions (block follower, send broadcast, edit profile)
  check ownership via `vendor.ownerId === user.id`.

## 5. Authentication

### Username + password
- Form on `LoginScreen` / `SignupScreen`.
- Password hashing (`authService.hashPassword`) is a salted djb2 — **demo
  only**. Production should use bcrypt/argon2 on the backend.
- Session is a `{ userId }` JSON blob persisted in AsyncStorage under
  `vf.session` and restored on app launch.

### Google / Facebook OAuth
- Buttons on `LoginScreen` call `authService.signInWithProvider('google' | 'facebook')`.
- The current implementation is a **deterministic local demo**: it creates or
  reuses a stable account per provider so the flow is testable without
  configuring OAuth clients.
- To wire up real OAuth:
  1. `npx expo install expo-auth-session expo-web-browser expo-crypto`
  2. In `authService.signInWithProvider`, replace the demo block with
     `Google.useAuthRequest({...clientIds})` / Facebook's equivalent.
  3. On success, hand the verified `providerId` to
     `backend.getUserByProvider` / `backend.createUser`.
- The rest of the app needs no change because `signInWithProvider` already
  produces a normal `User` record.

### Roles at signup
- Signup form has a User/Vendor toggle.
- Choosing **Vendor** also collects vendor name + type and creates a paired
  `vendor` record (`authService.signUp` calls `backend.registerVendor`).

### Session lifecycle
| Action            | Effect                                                        |
| ----------------- | ------------------------------------------------------------- |
| `signIn`/`signUp` | Stores `vf.session`, sets `realUser`, drops impersonation     |
| `signOut`         | Clears `vf.session`, drops both `realUser` and `actingAs`     |
| App restart       | `AuthContext` loads session → fetches `User` → restores state |

## 6. User features

### Home (`HomeScreen`)
- Vendors sorted by **open-now first**, then by distance.
- Pull to refresh — re-fetches vendors and location.
- Tap a card → vendor detail. Tap the star → follow/unfollow.

### Search (`SearchScreen`)
- Full-text search over name, type, description, and **tags**.
- "Open now" toggle.

### Vendor detail (`VendorDetailScreen`)
- Name, type, status, rating, distance, current address.
- Follow/unfollow button.
- Full description and upcoming schedule.

### Favorites (`FavoritesScreen`)
- Shows every vendor the user follows. Tap to view detail.

### Alerts (`AlertsScreen`)
- History of every notification the app has emitted.
- "Clear" wipes both the history and the dedupe cache.

### Profile (`ProfileScreen`)
- Display name, `@username`, role badge.
- **Interests** — add/remove tags that describe what the user is looking for.
  (Stored on the user record, intended to feed future personalized search.)
- **Followed vendors** — quick list of every vendor they follow.
- **Become a Vendor** — upgrade button for `user` accounts.
- **Sign out**.

## 7. Vendor features

A vendor account has every user feature **plus** the following:

### Vendor Tools tab (`VendorToolsScreen`)
- **Open right now toggle** — flips `vendor.isOpen` and (when opening)
  snapshots the device's current location into `vendor.currentLocation`.
- **Send "I'm available" alert** — composes a message, records it as a
  broadcast in the backend, and fires a local push so every follower sees
  it. (In Firebase this would dispatch an FCM topic message; the facade
  already abstracts the call.)
- **Schedule editor** — add or remove `{day, start, end, address}` slots.
  Each slot inherits the current device location coordinates unless an
  address override is provided.
- **Edit Profile** button → `EditVendorProfileScreen` (name, type, tags,
  description).
- **Manage Followers** button → `FollowersScreen`.

### Edit Vendor Profile (`EditVendorProfileScreen`)
- **Vendor type:** Food / Clothes / Activity / Electronics / Arts /
  Services / Other.
- **Tags:** free-form chips that feed search (`backend.listVendors({ query, tag })`).
- **Description.**

### Followers (`FollowersScreen`)
- Lists every user who follows this vendor (computed by scanning favorites).
- **Remove** — drops a follower (forces unfollow, can re-follow later).
- **Block** — removes the follower and prevents them from seeing or
  re-following the vendor. Blocked vendors are filtered out of the user's
  search / home (`VendorContext` filters `blockedUserIds`).
- **Unblock** — restores access.

## 8. BackendAdmin features

### Admin Dashboard tab (`AdminDashboardScreen`)
- Shows every user with their role and linked vendor (if any).
- Counts at the top: total users and total vendors.
- **Impersonate** button on each row routes the entire app through that
  user's identity. The bottom-tab set automatically updates to whatever
  the impersonated role's tabs are.
- A persistent black **impersonation banner** (`ImpersonationBanner`)
  appears at the top of the app while impersonating, with a one-tap
  **Stop** action that returns to the admin identity.
- Implementation: `AuthContext` stores both `realUser` (the actual admin)
  and `actingAs` (the impersonated user). `currentUser = actingAs ?? realUser`.

## 9. Data model

```js
// User
{
  id, username, email, passwordHash, displayName,
  role: 'admin' | 'vendor' | 'user',
  provider: 'local' | 'google' | 'facebook',
  providerId,
  interests: string[],
  vendorId: string | null,    // back-pointer to the vendor record (if role=vendor)
  createdAt,
}

// Vendor
{
  id, name,
  type: 'Food'|'Clothes'|'Activity'|'Electronics'|'Arts'|'Services'|'Other',
  tags: string[],
  description,
  ownerId,                    // -> User.id
  blockedUserIds: string[],
  schedule: [
    { day, start, end, latitude, longitude, address }
  ],
  currentLocation: { latitude, longitude, address } | null,
  isOpen,
  rating,
  createdAt,
}

// Broadcast (vendor → followers)
{ id, vendorId, message, at }

// Favorites are stored per user under key `vf.favorites.<userId>` -> string[]
// of vendor ids. listFollowers(vendorId) scans these.
```

## 10. Backend abstraction (Local ↔ Firebase)

Every screen imports from `src/services/backend/index.js`, which forwards to
the implementation selected by `BACKEND` in `src/config.js`.

### To switch to Firebase
1. `npm install firebase`
2. Fill in `firebaseConfig` in `src/services/backend/firebaseBackend.js` and
   uncomment the reference implementation (already written in comments at the
   bottom of that file).
3. Set `BACKEND = 'firebase'` in `src/config.js`.

No screen, context, or component needs to change.

### Methods every backend must implement
- **Vendors:** `listVendors`, `getVendor`, `getVendorByOwner`,
  `registerVendor`, `updateVendor`, `deleteVendor`
- **Favorites / Followers:** `listFavorites`, `addFavorite`, `removeFavorite`,
  `listFollowers`, `blockFollower`, `unblockFollower`, `removeFollower`
- **Users:** `createUser`, `getUser`, `getUserByUsername`,
  `getUserByProvider`, `updateUser`, `listUsers`
- **Broadcasts:** `sendBroadcast`, `listBroadcasts`
- **Realtime:** `subscribeVendors(callback) -> unsubscribe`

## 11. Location & alerts

- `locationService.getLocation()` requests foreground permission via
  `expo-location` and reverse-geocodes the result. If permission is denied,
  it falls back to a mock LA coordinate so the app remains usable on
  emulators/web.
- `locationService.distanceKm(a, b)` implements the Haversine formula.
- `VendorContext.withDistances()` enriches each vendor with `distanceKm`.
- `notificationService.evaluateAndAlert()` runs every
  `ALERT_POLL_INTERVAL_MS` (default 60s). For each favorited vendor:
  - If it just became `isOpen`, fire a *"<name> is open!"* alert.
  - If it is open **and** within `NEARBY_RADIUS_KM` (default 2 km), fire a
    *"<name> is nearby"* alert.
- Dedupe keys are scoped to `vendor:condition:date` so the user gets at
  most one alert per condition per day.
- `notificationService.notify()` uses `expo-notifications` on native and
  `window.Notification` on web, and always appends an entry to
  `vf.alertHistory` so the **Alerts** screen has a complete log.

## 12. Project layout

```
VendorFinderApp/
├── App.js
├── index.js
├── app.json
├── babel.config.js
├── package.json
├── README.md
├── ROADMAP.md
├── documentation.md           (this file)
└── src/
    ├── config.js
    ├── context/
    │   ├── AuthContext.js
    │   └── VendorContext.js
    ├── services/
    │   ├── authService.js
    │   ├── locationService.js
    │   ├── notificationService.js
    │   └── backend/
    │       ├── index.js
    │       ├── localBackend.js
    │       └── firebaseBackend.js
    ├── components/
    │   ├── VendorCard.js
    │   ├── SearchBar.js
    │   ├── ScheduleItem.js
    │   └── ImpersonationBanner.js
    └── screens/
        ├── LoginScreen.js
        ├── SignupScreen.js
        ├── HomeScreen.js
        ├── SearchScreen.js
        ├── VendorDetailScreen.js
        ├── FavoritesScreen.js
        ├── AlertsScreen.js
        ├── ProfileScreen.js
        ├── VendorToolsScreen.js
        ├── EditVendorProfileScreen.js
        ├── FollowersScreen.js
        └── AdminDashboardScreen.js
```

## 13. Demo credentials

The local backend seeds a default admin so you can try every flow
immediately:

| Username | Password   | Role  |
| -------- | ---------- | ----- |
| `admin`  | `admin123` | admin |

To try the vendor flow, sign up a new account with the **Vendor** toggle on
the Signup screen, or sign in as `admin` and impersonate one of the seeded
demo vendor owners.
