# Legend — Documentation

**Legend** is a user-first human-networking app — own your contacts, grade
relationship strength with video-game rarity tiers, and act through circles of
influence. Forked from the **UnjadedDigital** Expo + Supabase template.

This document covers what the app is, how to run and build it, and hard-won
toolchain notes: the original SDK 52 first-boot post-mortem, the SDK 54
upgrade, and the dev-workflow gotchas that cost real time.

- Quick tour + commands: [`README.md`](./README.md)
- Architecture + how to extend: [`ARCHITECTURE.md`](./ARCHITECTURE.md)
- Build plan / feature status (source of truth): [`TASKS.md`](./TASKS.md)
- Local-first storage & sync design: [`SYNC_DESIGN.md`](./SYNC_DESIGN.md)
- Manual test walkthrough: [`TESTING.md`](./TESTING.md)
- Backend setup: [`supabase/README.md`](./supabase/README.md)

---

## 1. What this app is

| Module | What you get | Toggle |
| ------ | ------------ | ------ |
| **Auth & Security** | Email/password, OAuth, magic link, reset, verification, secure session storage | always on (core) |
| **Contacts** | Alphabetized fast-scroll list, search, sort/filter (grade tier, favorites), Recent view with one-tap call/text/email, where-met (GPS-prefilled), premises, grading, ME card with QR share | always on (core to Legend) |
| **Circles** | Premise-query circles with live matching, pin/exclude | `FEATURE_CIRCLES` |
| **Outreach** | Text-blast stepper, BCC email blast, stalest-first call list; auto-logs interactions; ME excluded by default | `FEATURE_OUTREACH` |
| **Import/Export** | Phone-book import, CSV import **with a field-mapping step** (foreign CSVs like Google Contacts auto-guess + manual remap), CSV export from Settings | part of Contacts |
| **Profile ("Me" tab)** | Personal contact card + vCard QR, account edit | `FEATURE_PROFILE` |
| **Settings** | Theme, contacts default view, ME bulk-exclusion, CSV export, account actions | `FEATURE_SETTINGS` |
| **Notifications** | Expo push token registration | `FEATURE_NOTIFICATIONS` |
| **Payments** | Stripe tiers via pluggable provider | `FEATURE_PAYMENTS` (off) |

### Core ideas

- **Pluggable backend.** One `Backend` contract (`src/backend/types.ts`):
  `local` (default — on-device **SQLite**, works fully offline, seeded demo
  network) and `supabase` (real). Swap via `APP_BACKEND`; screens never change.
- **Grades are computed, never stored.** The append-only interaction log is
  the truth; `src/features/contacts/grading.ts` derives score/tier/freshness
  at read time (default 45-day half-life decay — no cron).
- **Grading is user-tunable.** `grading.ts` takes a `GradingConfig` (weights,
  decay half-life, decay on/off, tier thresholds + colors). The app resolves
  it from persisted settings in `AppSettingsContext` and threads it through
  `ContactsContext`, so changing a weight or palette re-grades the whole
  network live. Rarity **color palettes** live in `palettes.ts` (free +
  premium cosmetic unlocks); **message templates** for outreach and the ME
  card also live in `AppSettingsContext`.
- **Local-first storage.** `src/backend/local/sql/` implements contacts over a
  small `SqlDriver` interface (expo-sqlite on device, `node:sqlite` in tests)
  with HLC timestamps + tombstones, ready for the future sync engine
  (`SYNC_DESIGN.md`).
- **Feature flags = the module system.** `src/config/features.ts`; disabling a
  module removes its tab and routes automatically.
- **App-level preferences** (ME contact, bulk exclusion, default contacts
  view) live in `src/features/settings/AppSettingsContext.tsx`, persisted as
  one JSON blob in AsyncStorage.

### How a request flows

```
Route (app/*.tsx)  ->  Feature service/context (src/features/*)
                   ->  Backend facade (src/backend)  ->  local (SQLite) | supabase
```

---

## 2. Running it

**Toolchain:** Expo **SDK 54** · React Native 0.81 · React 19 · Node
**≥ 20.19.4** (`.nvmrc` = 20). Unit tests for the SQLite layer additionally
want **Node 22.5+** (built-in `node:sqlite`); the other suites run on 20.

```bash
nvm use
npm install
cp .env.example .env      # defaults to APP_BACKEND=local
npx expo start --lan      # scan QR with Expo Go (SDK 54) on the phone
npm run typecheck && npm test
```

Sign in with `demo@unjadeddigital.com` / `Password1`. First run seeds 12 demo
contacts + one circle. Sample import files in the repo root:
`sample-contacts.csv` (Legend format), `test-google-format.csv`
(Google-Contacts-style headers — exercises the CSV mapping step).

**Web note:** the local backend is native-SQLite-backed; the web target has no
SQLite driver wired up, so `npm run web` crashes on `ExpoSQLite`. Test on a
device via Expo Go (or build the planned wa-sqlite/Electron drivers first).

---

## 3. Dev-workflow gotchas (learned the hard way)

- **Never `npm install` while Metro is running.** npm prunes/reshuffles
  `node_modules`; Metro's file watcher crashes when watched directories vanish
  (`ENOENT ... watch`). Stop the dev server, install, restart.
- **Phone can't reach the dev server → check which IP the QR encodes.**
  Multi-adapter Windows machines (VMware/Hyper-V/WSL virtual NICs) can get the
  QR pointed at an unreachable virtual adapter. The Wi-Fi adapter's IPv4
  (`Get-NetAdapter` status Up) is the one the phone needs. If the address is
  right and it still times out, allow TCP 8081 through Windows Firewall.
  `expo start --tunnel` works around all of it but depends on ngrok's uptime.
- **Expo Go only runs the latest SDK.** The App Store ships one Expo Go
  version; when Expo bumps the SDK, the project must upgrade to keep testing
  in Expo Go (that's what forced the 52→54 upgrade below).
- **New app icons/splash don't show in Expo Go** — it uses its own shell.
  They appear in real builds (EAS/TestFlight).

---

## 4. SDK 52 → 54 upgrade notes (2026-07)

The upgrade path that worked: `npx expo install expo@^54.0.0` → fix
`package.json` constraints → **delete `node_modules` + lockfile, clean
install** (mid-tree upgrades leave npm in unresolvable peer states) →
`npx expo install --fix` → `npx expo-doctor` until 18/18.

Breaking changes that actually bit:

| Change | Fix |
| ------ | --- |
| Reanimated 4 moved worklets out | dep `react-native-worklets`; babel plugin is now `react-native-worklets/plugin` (was `react-native-reanimated/plugin`) |
| `babel-preset-expo` no longer hoists to top level | added it as an explicit devDependency (pin to the version under `node_modules/expo/node_modules/`) |
| `expo-file-system` moved the classic API | import from `expo-file-system/legacy` for `cacheDirectory` / `readAsStringAsync` / `writeAsStringAsync` |
| React 19 / RN 0.81 / New Architecture default | no code changes needed here, but `@types/react` must be ~19 and TypeScript ~5.9 |
| `expo-splash-screen` 31 throws on repeat `hideAsync()` on iOS | hide exactly once (see `app/_layout.tsx`) — repeat calls surface as "No native splash screen registered for given view controller" |
| Node floor rose | `engines.node >= 20.19.4` (Node 22.22 on this machine broke the SDK 52 CLI; Node 20.20 works for 52 *and* 54) |

---

## 5. Building & TestFlight

`eas.json` profiles:

- `development` — dev client, internal, local backend
- `preview` — internal distribution, Supabase backend
- `production` — store distribution, auto-increment build number, Supabase
- **`testflight`** — extends `production` but `APP_BACKEND=local`: the
  fully-offline demo app, used to validate the store pipeline before Supabase
  is wired up (TASKS.md Phase 7)

iOS builds run **locally on the Mac mini** (`marlons-mac-mini`, reachable over
Tailscale at 100.93.33.11, user `marloncopeland`) via `eas build --local`.
Toolchain installed there: Homebrew node@20 (use
`export PATH="/opt/homebrew/opt/node@20/bin:$PATH"` — system Node is 25),
CocoaPods, watchman, fastlane, eas-cli, `LANG=en_US.UTF-8` for CocoaPods.
Source is synced to `~/legend` (tar-over-ssh from Windows; `node_modules`,
`.git`, `.expo`, `dist` excluded), then `npm install` on the Mac.
**Full Xcode from the App Store is required** (Command Line Tools alone cannot
produce an App Store archive) plus one-time `sudo xcode-select -s
/Applications/Xcode.app/Contents/Developer` and license acceptance.

Interactive/credentialed steps that can't be automated: `eas login` (Expo
account) and the Apple Developer sign-in during credential setup — plus
App Store Connect app creation on first submit (`eas submit -p ios`).

**Monetization note (premium palettes).** The 3 premium rarity palettes are
sold as $1.99 cosmetic unlocks, but charging isn't wired yet:
`src/features/contacts/paletteStore.ts` is a no-charge stub that unlocks free
during beta (the UI says so). Real revenue requires **StoreKit In-App
Purchase** — iOS forbids selling digital goods through Stripe — which means
non-consumable products in App Store Connect, a purchase/restore flow
(`expo-iap` or `react-native-iap`), and receipt validation. Until then the
`payments`/Stripe module stays reserved for subscriptions, separate from these
consumable cosmetics.

Store-asset facts: `assets/icon.png` is 1024×1024 **opaque** (App Store
rejects icons with alpha); the brand set (icon / adaptive icon / splash /
favicon / notification icon) is generated — concentric circles-of-influence in
the five rarity colors on Legend navy.

---

## 6. First-boot post-mortem (SDK 52 era — lessons still apply)

> Historical: written when the fork first booted on SDK 52. Version specifics
> are superseded by §4, but every root cause below is still how the Expo
> ecosystem behaves — worth reading before debugging any "won't boot."

The app was type-correct from the start, but would not boot until several
toolchain issues were untangled — all ecosystem/version-coupling, not logic.

### The headline symptom

```
Unknown file extension ".ts" for .../node_modules/expo-modules-core/src/index.ts
```

Deeply misleading: it looks like a Node/TypeScript problem; it was a *plugin
configuration* problem. In the Expo world, an error's location (deep in
`node_modules`) is rarely where the mistake is.

### Root cause A — Expo packages ship uncompiled TypeScript

Several Expo packages declare `"main": "src/index.ts"` — TypeScript source,
no compiled output — because they're meant to be consumed **only through
Metro**. The moment anything running under plain Node imports one, you get
`Unknown file extension ".ts"`. The real question is always **"who is loading
an Expo package through Node instead of Metro?"**

### Root cause B — a `plugins[]` entry that isn't a config plugin

`expo-web-browser` was listed in `plugins` but ships no `app.plugin.js`; the
config resolver fell back to `require()`-ing its runtime entry → crash above.
Only list packages where `ls node_modules/<pkg>/app.plugin.js` exists.

### Root cause C — TypeScript app config amplified the confusion

`app.config.ts` goes through a JIT TS loader that interacts badly with (B) on
newer Node. Converted to **`app.config.js`** — dynamic logic still works, one
loader failure mode removed.

### Root cause D — missing runtime peer dependencies

`@expo/metro-config` needs `expo-asset`; web needs `@expo/metro-runtime`;
router touches `expo-font`. Hand-written `package.json` missed them —
`npx expo install` (SDK-correct versions) resolved it.

### Root cause E — optional transitive dep Metro can't resolve

`@supabase/supabase-js` statically references optional `@opentelemetry/api`.
Metro bundles by static analysis (runtime `if`s don't help), so it's stubbed
in `metro.config.js` via `resolver.extraNodeModules` → `src/shims/empty.js`.

### Root cause F — hand-pinned versions drifted from the SDK

The SDK is a tightly-coupled version matrix (~40 packages built and tested
together). `npx expo install --fix` realigns; `npx expo-doctor` audits. Run
doctor first when a fresh project won't boot.

### Standing rules distilled

- Add packages with `npx expo install`, never bare `npm install <pkg>`.
- Scaffold new apps from `create-expo-app`; don't hand-write `package.json`.
- Pin Node to the SDK's supported range and run `nvm use`.
- Read Metro errors as "static import graph," not "runtime."
- When an error points deep into `node_modules`, audit *your* config first.
- Keep `APP_BACKEND=local` the default so "toolchain broken?" stays separable
  from "backend misconfigured?".
