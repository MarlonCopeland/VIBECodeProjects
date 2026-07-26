# UnjadedDigital — Documentation

A modular, cross-platform **Expo (React Native) + Supabase** app template. This
document explains what the app is, how it's put together, and — importantly — a
post-mortem of the dependency/toolchain issues we hit on first boot, why they
happened, and how to avoid them next time.

- For a quick tour + commands, see [`README.md`](./README.md).
- For deep architecture + how to extend it, see [`ARCHITECTURE.md`](./ARCHITECTURE.md).
- For backend setup, see [`supabase/README.md`](./supabase/README.md).

---

## 1. What this app is

UnjadedDigital is not a product — it's a **starting point you fork** to build
real apps fast. It ships the parts every app re-implements, and makes each one a
*module you can keep or drop*:

| Module            | What you get                                                                 | Toggle              |
| ----------------- | ---------------------------------------------------------------------------- | ------------------- |
| **Auth & Security** | Email/password, OAuth (Google/Apple), magic link, password reset, email verification, password-strength meter, hardware-backed session storage | always on (core)    |
| **Profile**       | View/edit profile, avatar upload to Supabase Storage, delete account          | `FEATURE_PROFILE`   |
| **Settings & Theming** | Light/dark/system theme, preferences, account actions                    | `FEATURE_SETTINGS`  |
| **Notifications** | Expo push token registration + handlers                                       | `FEATURE_NOTIFICATIONS` |
| **Payments**      | Stripe subscription tiers via a pluggable provider (+ local mock)             | `FEATURE_PAYMENTS`  |

### Core ideas

- **Pluggable backend.** One `Backend` contract (`src/backend/types.ts`), two
  implementations: `local` (in-memory demo, the default — no network, seeded
  account) and `supabase` (real). Swap with the single env var `APP_BACKEND`;
  screens never change.
- **Feature flags = the module system.** `src/config/features.ts` resolves
  `FEATURE_*` env vars into a typed registry. Disabling a module removes its tab
  and routes automatically. This is what makes it a *template*.
- **The `UnjadedDigital` namespace.** `src/index.ts` aggregates config, flags,
  the backend, and every module into one discoverable object.
- **Everything runs on config, not code edits.** Re-brand, re-target, and
  enable/disable features from `.env` + `app.config.js`.

### How a request flows

```
Route (app/*.tsx)  ->  Feature service (src/features/*/service)
                   ->  Backend facade (src/backend)  ->  local | supabase
```

Screens depend on stable contracts, never on Supabase directly, so any layer can
be swapped without a rewrite.

---

## 2. Running it

```bash
nvm use            # Node 20 (see .nvmrc) — see §4 for why this matters
npm install
cp .env.example .env
npm run web        # or: npm run start, then press w / i / a
```

Default backend is `local`; sign in with `demo@unjadeddigital.com` / `Password1`.

---

## 3. The first-boot post-mortem (why versions were hard to align)

The app was **type-correct from the start** (`tsc --noEmit` passed immediately),
but it would not *boot* until several toolchain issues were untangled. None of
them were logic bugs — all were **ecosystem/version-coupling issues**. Here's
each one, why it happened, and the fix that stuck.

### The headline symptom

```
Unknown file extension ".ts" for .../node_modules/expo-modules-core/src/index.ts
```

This error is **deeply misleading**. It looks like "your Node/TypeScript setup
is wrong," and it sent us chasing Node versions first. It was actually a
*plugin configuration* problem. Lesson: in the Expo world, an error's location
(a file deep in `node_modules`) is rarely where the actual mistake is.

### Root cause A — Expo packages ship uncompiled TypeScript

`expo-modules-core` (and several Expo packages) declare `"main": "src/index.ts"`
— they ship **TypeScript source with no compiled `build/` output** on purpose,
because they're meant to be consumed **only through Metro**, which transpiles
them. Node's own `require`/`import` cannot load a `.ts` file, so the moment
*anything running under plain Node* tries to import such a package, you get
`Unknown file extension ".ts"`.

So the real question was never "why is the .ts broken" — it was **"who is trying
to load an Expo package through Node instead of Metro?"**

### Root cause B — a package in `plugins[]` that isn't a config plugin

Our `app.config` listed `expo-web-browser` under `plugins`. But
`expo-web-browser` **does not ship a config plugin** (`app.plugin.js`). When
Expo's config resolver can't find `app.plugin.js`, it falls back to
`require()`-ing the **package's runtime entry** — which pulls in
`expo-modules-core`'s `src/index.ts` under Node → the crash above.

**Fix:** only list packages that actually have an `app.plugin.js`. You can check:

```bash
ls node_modules/<pkg>/app.plugin.js   # exists => valid plugin
```

`expo-router`, `expo-secure-store`, `expo-notifications`, `expo-asset`,
`expo-font` have one. `expo-web-browser` does **not** — it just needs to be a
dependency, not a plugin.

### Root cause C — TypeScript app config amplified the confusion

Our config started as `app.config.ts`. Expo loads a `.ts` config through a
just-in-time TypeScript loader, and on newer Node that loader path interacts
badly with (B), making the failure noisier and harder to trace. Converting to
**`app.config.js`** (plain CommonJS, like the sibling `VendorFinderApp`) removed
a whole class of loader ambiguity. Dynamic logic (reading `process.env`) still
works — you just lose type-checking *on the config file itself*, which is a fine
trade.

### Root cause D — missing runtime peer dependencies

Once (B)/(C) were fixed, Metro started but failed on:

```
The required package `expo-asset` cannot be found
```

`@expo/metro-config` needs `expo-asset` (and web needs `@expo/metro-runtime`;
router touches `expo-font`). These are **peer-ish deps that aren't pulled in
automatically** when you hand-write `package.json`. Installing them via
`npx expo install` (which picks SDK-correct versions) resolved it.

### Root cause E — an optional transitive dep Metro can't resolve

```
Unable to resolve "@opentelemetry/api" from @supabase/supabase-js
```

`@supabase/supabase-js` references `@opentelemetry/api` for **optional**
tracing. The app never uses it, but **Metro bundles by static analysis** — it
follows every `import` it can see, regardless of runtime branches — so it tries
to resolve a package that isn't installed. We stubbed it in `metro.config.js`:

```js
config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  '@opentelemetry/api': path.resolve(__dirname, 'src/shims/empty.js'),
};
```

`@opentelemetry/api` is a no-op when no provider is registered, so aliasing it to
an empty module is safe.

### Root cause F — hand-pinned versions drifted from the SDK

Because `package.json` was written by hand, some packages resolved to versions
slightly newer than Expo SDK 52 expects (`react-native`, `react-native-screens`,
`@expo/vector-icons`). Expo warns about this at startup. `npx expo install --fix`
rewrote them to the **exact** versions the installed SDK was built and tested
against.

### The one thing that was genuinely Node-related

Node **22.x** is newer than what Expo SDK 52's CLI was validated against, and its
ESM/type-stripping loader made (A)/(B) fail in *even more* confusing ways
(`ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`). Moving to **Node 20 LTS** made
the errors legible and stable. Node 20 didn't *fix* B–F on its own — but it
stopped adding noise on top of them.

---

## 4. Why this whole class of problem exists

It comes down to **three compounding realities of the Expo/React Native
ecosystem**:

1. **Two module systems, one project.** Your app code is consumed by **Metro**
   (understands TS/JSX, platform extensions, `react-native` package fields).
   Your *build config* is consumed by **Node** (does not). A package that's
   perfectly valid for Metro (ships `.ts`) is unloadable by Node. Most confusing
   errors live on that boundary.

2. **The SDK is a tightly-coupled version matrix.** `expo@52` implies exact
   versions of ~40 packages (`react-native`, `metro`, `expo-modules-core`,
   `react-native-screens`, …) that were built and tested together. Hand-picking
   versions — or letting `npm` pick "latest compatible" — silently breaks that
   matrix. Expo publishes the correct set; you should *ask it*, not guess.

3. **Config plugins are code, resolved by convention.** Listing a string in
   `plugins[]` triggers a `require()`. If the package isn't a plugin, that
   `require()` runs the wrong file. There's no schema stopping you.

---

## 5. Tips to avoid this next time

**Scaffold from Expo, don't hand-write `package.json`.**
The fastest reliable path is to start from a real template and layer your code
on top:

```bash
npx create-expo-app@latest MyApp --template tabs   # or: default, blank-typescript
```

This gives you a version-correct `package.json`, `app.json`, babel/metro configs,
and the exact SDK matrix. Then port in the `src/` + `app/` structure.

**Always add packages with `expo install`, never bare `npm install`.**

```bash
npx expo install <pkg>        # picks the SDK-correct version
npx expo install --fix        # realigns everything to the installed SDK
npx expo-doctor               # audits versions, config, and common mistakes
```

`npx expo-doctor` would have flagged the plugin and version issues up front —
**run it first when a fresh project won't boot.**

**Pin Node to the SDK's supported LTS.** Expo SDK 52 → Node 18/20. This repo has
`.nvmrc` (`20`) and an `engines` field. Run `nvm use` before working. Newer Node
is not "more compatible" — for a given SDK it's usually *less*.

**Only put real config plugins in `plugins[]`.** Verify with
`ls node_modules/<pkg>/app.plugin.js`. If it's absent, the package is a plain
dependency — remove it from `plugins`.

**Prefer `app.config.js` over `app.config.ts`** unless you specifically need
typed config. It removes an entire loader failure mode.

**Read Metro errors as "static import graph," not "runtime."** If Metro can't
resolve an optional/transitive dep (like `@opentelemetry/api`), your choices are:
install it, or stub it via `resolver.extraNodeModules` → `src/shims/empty.js`.
A runtime `if` will *not* keep Metro from trying to bundle it.

**When an error points deep into `node_modules`, look at *your* config first.**
The `expo-modules-core/src/index.ts` crash had nothing to do with that file — it
was our `plugins` array. Trace *who imported it*, not *what failed to load*.

**Keep the local backend as the default.** `APP_BACKEND=local` lets a fresh
clone run with zero external setup, which isolates "is my toolchain working?"
from "is my Supabase configured?" — debug one problem at a time.

---

## 6. Quick reference — what we changed to get it booting

| # | Problem                                             | Fix                                                                 |
| - | --------------------------------------------------- | ------------------------------------------------------------------- |
| A | Expo pkgs ship `.ts`, unloadable by Node            | (understanding) consume via Metro, not Node                         |
| B | `expo-web-browser` listed as a plugin (has no plugin) | removed it from `plugins[]`                                        |
| C | `app.config.ts` loader ambiguity                    | converted to `app.config.js`                                        |
| D | missing `expo-asset` / `@expo/metro-runtime` / `expo-font` | `npx expo install expo-asset @expo/metro-runtime expo-font`  |
| E | Metro can't resolve `@opentelemetry/api` (Supabase) | `metro.config.js` alias → `src/shims/empty.js`                      |
| F | drifted `react-native` / `screens` / `vector-icons` | `npx expo install --fix`                                            |
| — | Node 22 added confusing loader errors               | switched to Node 20 LTS (`.nvmrc`)                                  |

**Verified result:** `Web Bundled (1357 modules)`, HTTP 200, correct title, no
runtime errors; `npx tsc --noEmit` clean.
