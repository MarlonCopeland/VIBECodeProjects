# Integration & Deployment Guide — Vendor Finder and Legend

This is the end-to-end runbook for connecting the apps built on this template,
**Vendor Finder** (`VendorFinder/`) and **Legend** (`LegendNetworkingApp/`), to
their external services (**Supabase**, **Resend**, **Expo / EAS**) and for
shipping them to **TestFlight / the App Store** and **Google Play**.

It covers every layer: accounts, CLI commands, dashboard clicks, DNS records,
secrets, and how the pieces connect to each other. Every section is collapsible.
Click a heading to expand it, and tick the checkboxes as you go.

> **Last checked against the repo:** 2026-09-24. Facts about the code (profiles,
> env vars, bundle IDs, migrations) come from the files cited. Dashboard menu
> labels (Supabase, Resend, App Store Connect, Play Console) change every few
> months. If a label doesn't match exactly, look for the nearest equivalent. The
> flow stays the same.

---

## Contents

1. [Big picture: how the services connect](#big-picture)
2. [Current status snapshot](#status)
3. [Part 0: Accounts, toolchain & golden rules](#part-0)
4. [Part 1: Supabase (database, auth, storage, functions)](#part-1)
5. [Part 2: Resend (transactional email through Supabase Auth)](#part-2)
6. [Part 3: Expo & EAS (builds, env, credentials, push)](#part-3)
7. [Part 4: iOS: TestFlight and the App Store](#part-4)
8. [Part 5: Android: Google Play](#part-5)
9. [Part 6: Release runbook cheat sheet](#part-6)
10. [Part 7: Reference: IDs, URLs, files](#part-7)

---

<a id="big-picture"></a>

<details>
<summary><strong>1. Big picture: how the services connect</strong></summary>

<br>

```
                        ┌─────────────────────────────── build time ──────────────────────────────┐
  your repo (git) ──►  EAS Build (Expo cloud or local Mac)                                          │
   app.config.js        reads eas.json profile env + EAS environment variables                     │
   eas.json             signs with EAS-managed credentials (iOS cert/profile, Android keystore)    │
                        produces .ipa (iOS) / .aab or .apk (Android)                               │
                        └──────────────┬───────────────────────────────┬──────────────────────────┘
                                       │ eas submit                    │ eas submit (after 1st manual upload)
                                       ▼                               ▼
                            App Store Connect                   Google Play Console
                            (TestFlight → App Store)            (Internal → Closed → Production)

  ───────────────────────────────────────── run time ─────────────────────────────────────────────
   Installed app ──HTTPS (anon key + user JWT)──► Supabase  ──SMTP (smtp.resend.com)──► Resend ──► user inbox
      │                                           (Postgres + RLS, Auth, Storage,
      │                                            Edge Functions)
      │                                                │
      └── registers Expo push token ──► push_tokens    └── send-notification fn ──► Expo Push API ──► APNs / FCM ──► device
```

**What each service does:**

| Service | Role | Used by |
| --- | --- | --- |
| **Supabase** | Postgres database with Row-Level Security, Auth (email/password, OTP codes, OAuth), Storage (`avatars` bucket), Edge Functions (VendorFinder: notifications + Stripe) | Both |
| **Resend** | Sends Supabase Auth email (confirm-signup codes, password-reset codes). Plugs into Supabase's **custom SMTP**; the apps never call Resend directly | Both (Supabase side) |
| **Expo / EAS** | EAS Build compiles and signs the native apps, EAS Submit uploads to the stores, EAS manages credentials, and Expo Push relays push notifications to APNs/FCM | Both |
| **Apple** | Developer Program (signing identity), App Store Connect (TestFlight, store listing, review), APNs (push) | Both |
| **Google** | Play Console (tracks, listing, review), Google Cloud service account (automated submit), Firebase/FCM (Android push) | Both |

**Key rules the whole setup depends on:**

1. **Public values ship in the app, secrets never do.** `app.config.js` copies
   only public values (Supabase URL, anon/publishable key, Stripe *publishable*
   key) into `extra`. The service-role key, Resend API key, Stripe secret key,
   Apple `.p8` keys and the Google service-account JSON live only in dashboards,
   EAS, Supabase secrets, or files outside git.
2. **The app talks only to Supabase.** Email goes Supabase → Resend. Push goes
   Supabase Edge Function → Expo → APNs/FCM. Payments go through Supabase Edge
   Function → Stripe. The client never holds a server secret.
3. **EAS builds from the git archive, not your working tree.** Uncommitted
   files and gitignored files (including `.env`) do **not** reach the cloud
   builder.

</details>

---

<a id="status"></a>

<details open>
<summary><strong>2. Current status snapshot (as of 2026-09-24)</strong></summary>

<br>

| Item | Vendor Finder | Legend |
| --- | --- | --- |
| App dir | `VendorFinder/` | `LegendNetworkingApp/` |
| Expo SDK / Node | SDK 52 / **Node 20** (`.nvmrc` = 20) | SDK 54 / **Node 22** (`.nvmrc` = 22, `engine-strict`) |
| Bundle ID / package | `com.vendorfinder.app` | `com.unjadeddigital.legend` |
| URL scheme | `vendorfinder://` | `legend://` |
| Supabase project ref | `dpavkiyozlamuqhdemmr` (live, migrated) | `krxszvviuqlzxxcvhyss` (live, linked, migrated) |
| Supabase Edge Functions | 4 (`send-notification`, `create-checkout-session`, `customer-portal`, `stripe-webhook`) | none |
| Auth email flow | Confirmation **link** | 8-digit **code** (+ same-device link) |
| Custom email templates in repo | no | `supabase/templates/confirmation.html`, `recovery.html` (**not pushed yet**) |
| Resend / custom SMTP | **Not configured.** Sign-up hits the ~2 emails/hour built-in limit | **Not configured.** Needed before the code templates can go live |
| EAS project ID | not set (`EAS_PROJECT_ID` env, empty fallback) | `9a2a8a94-9199-468a-a479-98c5b1627a54` (hardcoded fallback) |
| Build env source | `.env` only (**won't reach cloud builds**, see Part 3) | explicit `env` in every `eas.json` profile |
| iOS store config | `usesNonExemptEncryption` not set | set to `false` |
| Android push (FCM) | not configured | not configured |
| Store listings | not started | Play: in progress (`PLAY_CONSOLE.md`); App Store Connect: record not created yet |
| Known store blockers | Stripe subscriptions inside the native app (Apple 3.1.1 / Play Billing policy); SDK 52 may be too old for current store target-SDK/Xcode minimums | Palette store hidden in `production` builds (`FEATURE_PALETTE_STORE=false`) until StoreKit IAP exists |

</details>

---

<a id="part-0"></a>

<details>
<summary><strong>Part 0: Accounts, toolchain & golden rules</strong></summary>

<br>

<details>
<summary><strong>0.1 Accounts you need (and who pays what)</strong></summary>

<br>

| Account | URL | Cost | Needed for | Notes |
| --- | --- | --- | --- | --- |
| Supabase | https://supabase.com/dashboard | Free tier; Pro ~$25/mo/org | Backend | Free projects **pause after ~1 week of inactivity**. Upgrade before real users. |
| Resend | https://resend.com | Free tier (low monthly/daily caps); paid plans above | Auth email | Check current free-tier limits on resend.com/pricing |
| Expo | https://expo.dev/signup | Free tier covers a limited number of cloud builds/month (lower priority queue) | EAS Build/Submit, push | Paid plans give faster queues and more builds |
| Apple Developer Program | https://developer.apple.com/programs/enroll | **$99/year** | TestFlight, App Store, APNs | Organization enrollment needs a D-U-N-S number and can take days |
| Google Play Console | https://play.google.com/console/signup | **$25 one-time** | Play Store | Identity verification required; new *personal* accounts need a 12-tester/14-day closed test before production |
| Google Cloud | https://console.cloud.google.com | Free for this use | Service account for `eas submit` (Android) | Same Google account as Play Console is simplest |
| Firebase | https://console.firebase.google.com | Free | Android push (FCM V1) | Only if you ship push on Android |
| Domain DNS host (e.g. Cloudflare, registrar) | wherever `unjaded.net` is managed | n/a | Resend domain verification | You need to be able to add TXT/MX records |

- [ ] Supabase account (and access to both projects)
- [ ] Resend account
- [ ] Expo account (`eas whoami` shows it)
- [ ] Apple Developer Program membership active
- [ ] Google Play developer account verified
- [ ] DNS access for the sending domain

</details>

<details>
<summary><strong>0.2 Golden rules (read before running anything)</strong></summary>

<br>

These come from real incidents in this repo (see the root `CLAUDE.md`):

1. **Always `cd` into the app directory first.** There is no root
   `package.json`. Running `npm install` at the repo root silently creates a
   stray `package.json` + `node_modules` that shadows the real ones.
2. **Check Node against that app's `.nvmrc` every time:**

   ```bash
   node -v && cat .nvmrc
   ```

   A mismatch fails **silently and partially**. For example, Legend on Node 20
   installs and typechecks fine but skips `test/sqliteContacts.test.ts`
   because `node:sqlite` doesn't exist before Node 22.
3. **Windows `nvm` switches Node globally.** `nvm use 22.17.0` affects every
   terminal and every other project. Switch back when you change apps.
   Global npm packages (like `eas-cli`) are installed **per Node version**
   under nvm-windows. That's why this guide uses `npx eas-cli` / `npx supabase`,
   which work regardless of the active Node.
4. **Commit before you build.** EAS uploads the git archive. Untracked or
   gitignored files (including `.env`) are not in the build. Legend's
   `npm run check:imports` catches untracked imports and case-mismatched paths
   that work on Windows but break on EAS's case-sensitive Linux builders.
5. **`.env` must be saved without a BOM.** The Supabase CLI's dotenv parser
   rejects UTF-8-with-BOM (`failed to parse environment file: .env`). In VS
   Code, check the encoding shown in the status bar and choose "UTF-8", not
   "UTF-8 with BOM".
6. **Restart Metro with a clear cache after any `.env` change:**
   `npx expo start -c`. Env is baked in at bundle time.

</details>

<details>
<summary><strong>0.3 Install the toolchain (Windows)</strong></summary>

<br>

**Node via nvm-windows** (https://github.com/coreybutler/nvm-windows/releases):

```powershell
nvm install 20.19.4
nvm install 22.17.0
nvm list
```

Switch per app:

```powershell
cd C:\repo\VIBES\VendorFinder;        nvm use 20.19.4; node -v
cd C:\repo\VIBES\LegendNetworkingApp; nvm use 22.17.0; node -v
```

**Git**: https://git-scm.com/download/win (EAS requires the project to be a
git repo; it is).

**EAS CLI**: use through `npx` so it follows whichever Node is active:

```bash
npx eas-cli@latest --version
npx eas-cli@latest login
npx eas-cli@latest whoami
```

(Or `npm install -g eas-cli` once **per Node version**, then use plain `eas`.
The rest of this guide writes `eas …`. Substitute `npx eas-cli@latest …` if
you didn't install it globally.)

**Supabase CLI**: Supabase does **not** support `npm install -g supabase`. Use
one of:

```powershell
# Option A: Scoop (recommended on Windows)
scoop bucket add supabase https://github.com/supabase/scoop-bucket.git
scoop install supabase
supabase --version

# Option B: no install, via npx (downloads the binary on first run)
npx supabase@latest --version
```

**Optional:** Docker Desktop, only if you want a local Supabase stack
(`supabase start`). Not needed for anything in this guide.

**For iOS local builds only:** a Mac with full Xcode (from the App Store),
CocoaPods, and fastlane. Cloud EAS builds don't need a Mac. Legend's Mac mini
setup is documented in `LegendNetworkingApp/Documentation.md` §5.

</details>

</details>

---

<a id="part-1"></a>

<details>
<summary><strong>Part 1: Supabase (database, auth, storage, functions)</strong></summary>

<br>

Both apps talk to Supabase only through the backend facade
(`src/backend/index.ts` → `src/backend/supabase/supabaseBackend.ts`).
`APP_BACKEND=local` runs an in-memory demo with no network, and
`APP_BACKEND=supabase` switches to the real project. Screens never know which
one is live.

Each app has **its own Supabase project**. Don't point both apps at one
project: their schemas (`supabase/migrations/`) are different.

<details>
<summary><strong>1.1 Create the project (dashboard)</strong></summary>

<br>

*Skip this if the project already exists. Both current apps already have one
(see Part 7).*

1. Go to https://supabase.com/dashboard and sign in.
2. Pick (or create) the **organization** in the top-left switcher.
3. Click **New project**.
4. Fill in:
   - **Name**: e.g. `legend` / `vendorfinder`.
   - **Database password**: click **Generate a password**, then **copy it
     into your password manager now**. `supabase link` asks for it, and you
     can only reset it, not view it.
   - **Region**: closest to your users (e.g. East US).
   - **Pricing plan**: Free to start.
5. Click **Create new project** and wait ~2 minutes while it provisions.
6. Note the **project ref**: the 20-character ID in the URL
   `https://supabase.com/dashboard/project/<ref>`. The API URL is
   `https://<ref>.supabase.co`.

</details>

<details>
<summary><strong>1.2 Get the API keys and know where each one goes</strong></summary>

<br>

In the project: click **Connect** (top bar), or go to **Project Settings → API
Keys** (and **Project Settings → Data API** for the URL).

| Key | Looks like | Where it goes | Secret? |
| --- | --- | --- | --- |
| Project URL | `https://<ref>.supabase.co` | App `SUPABASE_URL` (.env / eas.json / EAS env) | No |
| **anon** (legacy) *or* **publishable** key | `eyJhbGci…` / `sb_publishable_…` | App `SUPABASE_ANON_KEY` | **No.** It ships in every app bundle and RLS protects the data |
| **service_role** (legacy) *or* **secret** key | `eyJhbGci…` / `sb_secret_…` | Only Edge Functions (auto-injected), one-off admin scripts | **YES.** It bypasses RLS. Never put it in `.env`, `eas.json`, or git |
| Database password | your generated password | `supabase link`, direct Postgres connections | **YES** |
| Personal access token | `sbp_…` | `SUPABASE_ACCESS_TOKEN` for CLI in CI/non-interactive shells | **YES** |

> The legacy JWT keys are under the **Legacy API Keys** tab. Either the legacy
> `anon` key or the new publishable key works in `SUPABASE_ANON_KEY`. Legend
> currently uses the legacy anon JWT (committed in `eas.json`, which is fine
> because it's public by design).

</details>

<details>
<summary><strong>1.3 Log in and link the CLI to the project</strong></summary>

<br>

```bash
cd VendorFinder            # or: cd LegendNetworkingApp
npx supabase login         # opens a browser once; stores an access token locally
npx supabase projects list # confirms you can see the project
npx supabase link --project-ref <ref>
# prompts for the DATABASE password from step 1.1
```

Non-interactive alternative (CI, or if the browser flow fails): create a token
at **Dashboard → avatar (bottom-left) → Account preferences → Access Tokens →
Generate new token**, then:

```powershell
$env:SUPABASE_ACCESS_TOKEN = "sbp_..."
npx supabase link --project-ref <ref> --password "<db password>"
```

`link` writes to `supabase/.temp/` (gitignored). Every command below runs from
the app directory and targets the linked project.

</details>

<details>
<summary><strong>1.4 Apply the database schema (migrations)</strong></summary>

<br>

| App | Migrations |
| --- | --- |
| VendorFinder | `0001_init.sql`: `profiles`, `vendors`, `favorites`, `notifications`, `push_tokens`, `vendor_weekly_usage` view, `handle_new_user` trigger, RLS, `avatars` bucket, `delete_own_account()` |
| Legend | `0001_init.sql` (profiles, push_tokens, avatars bucket, `delete_own_account`) → `0002_contacts.sql` → `0003_account_usage.sql` (`usage_events`, `record_app_open`) → `0004_sync_subscriptions.sql` → `0005_zero_knowledge.sql` (`sync_changes`) |

**CLI (recommended):**

```bash
npx supabase migration list      # Local vs Remote columns: what's applied
npx supabase db push --dry-run   # shows what would run
npx supabase db push             # applies pending migrations in order
npx supabase migration list      # confirm every row has a Remote timestamp
```

**Dashboard alternative:** **SQL Editor → New query** → paste each migration
file's contents **in numeric order** → **Run**. (The CLI records applied
migrations in `supabase_migrations.schema_migrations`; the SQL editor doesn't,
so if you mix methods, `db push` may try to re-run files. Pick one method per
project.)

**Adding a new migration later:**

```bash
npx supabase migration new add_something   # creates supabase/migrations/<timestamp>_add_something.sql
# edit the file, then:
npx supabase db push
```

**Check it worked:** **Table Editor** should list the tables above, and
**Authentication → Policies** should show RLS enabled on each.

</details>

<details>
<summary><strong>1.5 Point the app at Supabase (local dev)</strong></summary>

<br>

```bash
cd LegendNetworkingApp      # or VendorFinder
cp .env.example .env        # PowerShell: Copy-Item .env.example .env
```

Edit `.env` (no BOM):

```ini
APP_BACKEND=supabase
SUPABASE_URL=https://<ref>.supabase.co
SUPABASE_ANON_KEY=<anon or publishable key>
```

Then:

```bash
npx expo start -c
```

How it flows: `.env` → `app.config.js` (`require('dotenv').config()`) →
`extra.supabaseUrl` / `extra.supabaseAnonKey` → `src/config/env.ts` →
`src/backend/index.ts` picks the Supabase implementation.

> `.env` only affects **local** runs. For EAS builds, see Part 3.4.

</details>

<details>
<summary><strong>1.6 Auth settings: providers, confirmation, OTP codes</strong></summary>

<br>

**Dashboard:** **Authentication → Sign In / Providers** (older UI:
*Authentication → Providers*).

1. **Email** provider: **Enabled**.
2. **Confirm email**: **ON**. Both apps gate every feature behind a verified
   email.
3. **Secure email change** (double confirm): ON.
4. **Email OTP Length**: Legend uses **8** (`otp_length = 8` in
   `supabase/config.toml`; the verify screen expects 8 digits). VendorFinder
   uses links, so leave it at the default.
5. **Email OTP Expiration**: `3600` seconds (Legend's email copy says "expires
   in one hour").
6. **Save**.

**How Legend's code flow works** (commit `9e3f136a`): sign-up calls
`supabase.auth.signUp`, and Supabase emails `{{ .Token }}` (8 digits) using the
confirmation template. The user types the code on `app/(auth)/verify-email.tsx`,
which calls `verifyOtp` (trying `type: 'signup'`, then `'email'`). Password reset
works the same way through `resetPasswordForEmail` → recovery template → code
phase in `reset-password.tsx`. The link in each email is only a same-device
shortcut.

> ⚠️ Until the custom templates are pushed (1.8) **and** custom SMTP is live
> (Part 2), Legend's emails contain only Supabase's default **link**, so the
> code field has nothing to accept.

</details>

<details>
<summary><strong>1.7 URL configuration: Site URL and redirect allow-list</strong></summary>

<br>

**Dashboard:** **Authentication → URL Configuration**.

If a redirect the app asks for is not allow-listed, Supabase **silently
replaces it with the Site URL**. That's how Legend's confirmation links used
to dead-end at `http://localhost:3000`.

| Setting | Legend | VendorFinder |
| --- | --- | --- |
| **Site URL** | `legend://` | `vendorfinder://` (or the PWA URL once deployed on web) |
| Redirect URLs | `legend://**` | `vendorfinder://**` |
| | `exp://**` (Expo Go; remove before public launch) | `exp://**` (Expo Go; remove before public launch) |
| | `http://localhost:8081/**` (web dev) | `http://localhost:8081/**` |
| | | `https://<your-pwa-domain>/**` (production web) |

The apps build redirect targets with `Linking.createURL(...)`: e.g.
`legend://verify-email`, `legend://reset-password`, `vendorfinder://verify-email`.
The `**` wildcard covers all of them.

For Legend this is **source-controlled** in `LegendNetworkingApp/supabase/config.toml`,
so apply it with `config push` (next section) rather than by hand.

</details>

<details>
<summary><strong>1.8 Push auth config + email templates from the repo (Legend)</strong></summary>

<br>

Legend keeps its `[auth]` settings, redirect list, OTP length and both email
templates in `supabase/config.toml` + `supabase/templates/*.html`.

```bash
cd LegendNetworkingApp
npx supabase login                          # if not already
npx supabase link --project-ref krxszvviuqlzxxcvhyss
npx supabase config push                    # shows a diff and asks to confirm
```

What to check in the diff before confirming:

- `site_url = "legend://"`, the three `additional_redirect_urls`.
- `enable_confirmations = true`, `otp_length = 8`.
- Template subjects "Confirm your Legend account" / "Reset your Legend password".
- **Anything you configured only in the dashboard.** `config push` sends the
  whole `[auth]` block, and unset keys revert to CLI defaults. In particular,
  add SMTP to `config.toml` (Part 2.6, Option C) **before** pushing, or a push
  can undo dashboard-only SMTP settings. After every push, re-open
  **Authentication → Emails → SMTP Settings** and confirm it's still enabled.

> Hosted Supabase only lets you customize email templates once **custom SMTP**
> is configured. Do Part 2 first, then push.

**Verify:** **Authentication → Emails → Templates → Confirm signup**. The body
should start with the 8-digit `{{ .Token }}` block.

**VendorFinder** has a minimal `config.toml` (`enable_confirmations = true`)
and no custom templates. Its template edits are done in the dashboard
(**Authentication → Emails → Templates**). If you later add templates to its
repo, use the same `config push` flow.

</details>

<details>
<summary><strong>1.9 Storage (avatars bucket)</strong></summary>

<br>

Both apps' `0001_init.sql` creates a **public** `avatars` bucket with
owner-scoped write policies. Nothing to click. Verify under **Storage**:
`avatars` exists and is marked **Public**.

> Legend's `PLAY_CONSOLE.md` flags this: "public" means anyone with the URL can
> view an avatar. That's fine for internal testing. Consider a private bucket +
> signed URLs before an external launch, and declare it accurately in the store
> privacy forms either way.

</details>

<details>
<summary><strong>1.10 Edge Functions & secrets (VendorFinder)</strong></summary>

<br>

VendorFinder ships four Deno functions in `VendorFinder/supabase/functions/`:

| Function | Purpose | JWT verification |
| --- | --- | --- |
| `send-notification` | Enforces weekly broadcast quota, inserts `notifications`, fans out to followers via `https://exp.host/--/api/v2/push/send` | on (called by signed-in vendors) |
| `create-checkout-session` | Creates a Stripe Checkout session | on |
| `customer-portal` | Opens the Stripe billing portal | on |
| `stripe-webhook` | Receives Stripe events, updates `vendors.subscription_tier` | **off** (`--no-verify-jwt`; Stripe signs requests instead) |

**Deploy:**

```bash
cd VendorFinder
npx supabase functions deploy send-notification
npx supabase functions deploy create-checkout-session
npx supabase functions deploy customer-portal
npx supabase functions deploy stripe-webhook --no-verify-jwt
npx supabase functions list
```

(Deploying doesn't need Docker. Recent CLIs bundle functions remotely.)

**Secrets** (the functions read these with `Deno.env.get`):

```bash
npx supabase secrets set STRIPE_SECRET_KEY=sk_test_...
npx supabase secrets set STRIPE_PRICE_TIER1=price_... STRIPE_PRICE_TIER2=price_... STRIPE_PRICE_TIER3=price_...
npx supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...
npx supabase secrets list
```

`SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are
injected automatically. Don't set them. Dashboard equivalent: **Edge
Functions → Secrets** (older UI: *Project Settings → Edge Functions*).

**Logs:** **Edge Functions → select a function → Logs / Invocations**.

The Stripe side (products, prices, webhook endpoint
`https://dpavkiyozlamuqhdemmr.supabase.co/functions/v1/stripe-webhook`) is
covered step by step in `VendorFinder/SUPABASE_SETUP.md` Part 3.

**Expo push note:** `send-notification` calls the Expo Push API **without** an
access token. Leave **expo.dev → Account settings → Access tokens → "Enhanced
Security for Push Notifications"** turned **off**, or add an
`Authorization: Bearer <EXPO_ACCESS_TOKEN>` header to the function and store the
token with `supabase secrets set EXPO_ACCESS_TOKEN=...`.

Legend has no Edge Functions.

</details>

<details>
<summary><strong>1.11 OAuth providers (Google / Apple), optional, currently off</strong></summary>

<br>

Legend forces `AUTH_GOOGLE_ENABLED=false` / `AUTH_APPLE_ENABLED=false` in
every `eas.json` profile, and `src/config/env.ts` hides the buttons unless the
backend is Supabase. VendorFinder defaults both to `true` in `.env.example`.
**Set them to `false` for any build until the provider below is configured**,
or reviewers will see buttons that don't work.

The app flow (both apps): `signInWithOAuth({ redirectTo: Linking.createURL('/'), skipBrowserRedirect: true })`
→ `WebBrowser.openAuthSessionAsync` → Supabase callback → back into the app via
the scheme. The Supabase callback URL for every provider is:

```
https://<ref>.supabase.co/auth/v1/callback
```

**Google**

1. https://console.cloud.google.com → select/create a project.
2. **APIs & Services → OAuth consent screen** (newer UI: *Google Auth
   Platform → Branding / Audience*) → External → app name, support email,
   authorized domain `supabase.co` (and your own domain) → save. Publish the app
   (or add test users) so non-test accounts can sign in.
3. **APIs & Services → Credentials → + Create credentials → OAuth client ID**
   → Application type **Web application** → Authorized redirect URIs:
   `https://<ref>.supabase.co/auth/v1/callback` → **Create**.
4. Copy **Client ID** and **Client secret**.
5. Supabase → **Authentication → Sign In / Providers → Google** → enable →
   paste both → **Save**.
6. Set `AUTH_GOOGLE_ENABLED=true` in the build env.

**Apple** (required if you offer Google sign-in on iOS: App Review Guideline
4.8 requires an equivalent privacy-preserving option such as Sign in with Apple)

1. developer.apple.com → **Certificates, Identifiers & Profiles → Identifiers**
   → your App ID (`com.unjadeddigital.legend` / `com.vendorfinder.app`) →
   enable **Sign In with Apple** → Save.
2. **Identifiers → + → Services IDs** → e.g. `com.unjadeddigital.legend.auth`
   → enable Sign In with Apple → **Configure** → Primary App ID = your app →
   Domains: `<ref>.supabase.co` → Return URLs:
   `https://<ref>.supabase.co/auth/v1/callback` → Save.
3. **Keys → +** → name it, enable **Sign In with Apple** → Configure → primary
   App ID → **Register** → **Download the `.p8`** (one-time download) → note
   the **Key ID** and your **Team ID**.
4. Supabase → **Authentication → Sign In / Providers → Apple** → enable →
   Client IDs: `<services id>,<bundle id>` → Secret key: the client-secret
   JWT generated from the `.p8` (Supabase's Apple provider page links a
   generator) → **Save**.
5. ⚠️ Apple client secrets **expire after at most 6 months**. Put a calendar
   reminder to regenerate it.
6. Set `AUTH_APPLE_ENABLED=true` in the build env.

</details>

<details>
<summary><strong>1.12 Verify the connection</strong></summary>

<br>

**VendorFinder: headless CRUD smoke test** (`scripts/supabase-smoke.mjs`).
It needs **Node 22+** (supabase-js needs native `WebSocket`), even though
VendorFinder's Expo CLI needs Node 20:

```powershell
cd C:\repo\VIBES\VendorFinder
nvm use 22.17.0
$env:SUPABASE_SERVICE_ROLE_KEY = "<service_role key>"   # one run only, never in .env
npm run smoke:supabase
Remove-Item Env:SUPABASE_SERVICE_ROLE_KEY
nvm use 20.19.4
```

Expect `✅ ALL CRUD SMOKE TESTS PASSED`.

**Legend**:

```bash
cd LegendNetworkingApp
npm run typecheck && npm run check:imports && npm test
```

Then run the app against Supabase, sign up with a real address, confirm with
the emailed code, and check **Authentication → Users** (user is confirmed),
**Table Editor → profiles** (row created), and **usage_events** (an app-open
row).

**Useful SQL (SQL Editor):**

```sql
-- newest sign-ups and whether they confirmed
select email, created_at, email_confirmed_at from auth.users order by created_at desc limit 20;

-- make someone an admin (VendorFinder)
update public.profiles set role = 'admin' where email = 'you@example.com';
```

</details>

<details>
<summary><strong>1.13 Create a store-reviewer account (both stores need one)</strong></summary>

<br>

Both apps are login-gated with email confirmation ON, so Apple and Google
reviewers can't get in unless you give them a working account.

1. Supabase → **Authentication → Users → Add user → Create new user**.
2. Email: e.g. `appreview@unjaded.net` (an inbox you control). Password:
   strong, unique.
3. Tick **Auto Confirm User** → **Create user**.
4. Sign in once on a device to confirm it works and the profile row exists.
5. Put these credentials in App Store Connect (**App Review Information →
   Sign-in required**) and Play Console (**App content → App access**).

</details>

<details>
<summary><strong>1.14 Supabase troubleshooting</strong></summary>

<br>

| Symptom | Cause / fix |
| --- | --- |
| Sign-up: "Too many attempts. Please wait a moment and try again." | Supabase `over_email_send_rate_limit` (429). The built-in SMTP allows ~2 emails/hour. **Fix: Part 2 (Resend).** |
| Confirmation link opens `localhost:3000` / a dead page | Redirect not allow-listed, so Supabase used the Site URL. Fix 1.7. |
| Legend code screen rejects every code | Templates not pushed (emails contain only a link), or OTP length mismatch. See 1.6 and 1.8. |
| `Email not confirmed` on sign-in | Expected until the user confirms. For tests use Auto Confirm (1.13). |
| App shows demo data / `admin`/`admin123` works | `APP_BACKEND` isn't `supabase` in the build, or Metro cached old env: `npx expo start -c`. |
| Cloud build crashes at login: supabaseUrl empty | `.env` isn't uploaded to EAS. See Part 3.4. |
| `profile row missing` | `handle_new_user` trigger missing. Re-run migrations. |
| `'auth' has invalid keys: enable_confirmations` | In `config.toml` it belongs under `[auth.email]`. |
| `failed to parse environment file: .env` | `.env` has a BOM. Re-save as plain UTF-8. |
| Project suddenly unreachable | Free-tier project paused after inactivity. Dashboard → **Restore project**. |
| `native WebSocket not found` | Running a supabase-js script on Node 20. Use Node 22. |

</details>

</details>

---

<a id="part-2"></a>

<details>
<summary><strong>Part 2: Resend (transactional email through Supabase Auth)</strong></summary>

<br>

**Why this is needed:** Supabase's built-in email sender is for demos. It is
limited to roughly **2 emails per hour** for the whole project, may only send
to team members' addresses, and custom templates don't apply without custom
SMTP. With "Confirm email" ON, every sign-up sends an email, so real sign-ups
fail once the limit is hit. VendorFinder decided on 2026-08-03 to move to a real
provider (`VendorFinder/NEXT_STEPS.md`). Legend needs it for its code-based
templates.

**How it connects:** Resend is **only** Supabase's SMTP relay. The apps never
call Resend directly and no app code changes. Supabase Auth → `smtp.resend.com`
→ recipient.

**One Resend account and one verified domain can serve both apps.** Use a
separate API key per Supabase project so you can revoke one without breaking
the other.

<details>
<summary><strong>2.1 Create the account and choose a sending domain</strong></summary>

<br>

1. Sign up at https://resend.com (use the shared business Google account or
   email so it isn't tied to one person).
2. Decide the **From** address. You must own the domain. Examples:
   - Legend: `Legend <no-reply@unjaded.net>` (Legend's privacy policy is
     hosted on `unjaded.net`)
   - VendorFinder: `Vendor Finder <no-reply@<vendorfinder-domain>>`
3. Using a **subdomain** such as `mail.unjaded.net` keeps transactional mail
   reputation separate from normal inbox mail on the root domain. Resend
   supports either. The steps below assume the root `unjaded.net`.

> You can't send to arbitrary recipients from Resend's shared test sender
> (`onboarding@resend.dev`). A verified domain is required for real users.

</details>

<details>
<summary><strong>2.2 Add and verify the domain (DNS records)</strong></summary>

<br>

1. Resend dashboard → **Domains** → **+ Add Domain**.
2. Enter `unjaded.net` (or your subdomain) → pick a **Region** (e.g.
   `us-east-1`, near your Supabase region) → **Add**.
3. Resend shows the DNS records to create. They look like this. **Copy the exact
   values from your Resend page**, since the DKIM key and region host are unique:

   | Type | Name / Host | Value | Priority | Purpose |
   | --- | --- | --- | --- | --- |
   | TXT | `resend._domainkey` | `p=MIGfMA0GCSqGSIb3...` (long DKIM key) | | DKIM signature |
   | MX | `send` | `feedback-smtp.<region>.amazonses.com` | 10 | Bounce/complaint return path |
   | TXT | `send` | `v=spf1 include:amazonses.com ~all` | | SPF for the return path |
   | TXT *(recommended)* | `_dmarc` | `v=DMARC1; p=none; rua=mailto:dmarc@unjaded.net` | | DMARC policy (start with `p=none`) |

4. Add them at your DNS host:
   - **Cloudflare**: DNS → Records → **Add record**. For each record set
     **Proxy status = DNS only** (grey cloud). Name = `resend._domainkey`,
     `send`, `_dmarc` (Cloudflare appends the domain).
   - **GoDaddy / Namecheap / Squarespace**: the "Host" field takes the part
     *before* the domain (e.g. `send`, not `send.unjaded.net`). If the provider
     auto-appends the domain and you also type it, you get
     `send.unjaded.net.unjaded.net`, the most common verification failure.
   - If a DMARC or SPF record **already exists** for the root domain, don't
     add a second one. The records above are on subdomains, so they normally
     don't conflict.
5. Back in Resend → the domain → **Verify DNS Records**. Propagation is usually
   minutes, occasionally up to 48 h. Status goes **Pending → Verified**.
6. Check from your machine:

   ```bash
   nslookup -type=TXT resend._domainkey.unjaded.net
   nslookup -type=MX send.unjaded.net
   nslookup -type=TXT send.unjaded.net
   ```

</details>

<details>
<summary><strong>2.3 Create API keys</strong></summary>

<br>

1. Resend → **API Keys** → **+ Create API Key**.
2. **Name**: `supabase-legend` (and later `supabase-vendorfinder`).
3. **Permission**: **Sending access** (not Full access).
4. **Domain**: restrict to the verified domain.
5. **Add**, then **copy the key now** (`re_...`). It's shown once. Store it in
   your password manager. It's a real secret: don't commit it and don't put it
   in the app `.env`.

</details>

<details>
<summary><strong>2.4 Test Resend on its own before wiring Supabase</strong></summary>

<br>

Test with the API first, so that if it fails you know the problem is Resend/DNS
and not Supabase.

```bash
curl -X POST https://api.resend.com/emails \
  -H "Authorization: Bearer re_XXXXXXXX" \
  -H "Content-Type: application/json" \
  -d '{"from":"Legend <no-reply@unjaded.net>","to":["you@yourinbox.com"],"subject":"Resend test","html":"<p>It works.</p>"}'
```

PowerShell equivalent:

```powershell
$headers = @{ Authorization = "Bearer re_XXXXXXXX" }
$body = @{ from = "Legend <no-reply@unjaded.net>"; to = @("you@yourinbox.com"); subject = "Resend test"; html = "<p>It works.</p>" } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri https://api.resend.com/emails -Headers $headers -ContentType "application/json" -Body $body
```

A success returns `{"id":"..."}`, and the email shows up in **Resend → Emails**
with status *Delivered*. Check that it landed in the inbox, not spam.

</details>

<details>
<summary><strong>2.5 SMTP settings reference</strong></summary>

<br>

| Field | Value |
| --- | --- |
| Host | `smtp.resend.com` |
| Port | `465` (implicit TLS, recommended) or `587` (STARTTLS) |
| Username | `resend` (literally the word "resend") |
| Password | the API key `re_...` |
| Sender email | `no-reply@unjaded.net` (must be on the verified domain) |
| Sender name | `Legend` / `Vendor Finder` |

</details>

<details>
<summary><strong>2.6 Connect Resend to Supabase (pick ONE option per project)</strong></summary>

<br>

**Option A: Supabase dashboard (simplest)**

1. Supabase project → **Authentication → Emails → SMTP Settings** (older UI:
   *Project Settings → Authentication → SMTP Settings*).
2. Toggle **Enable Custom SMTP** ON.
3. **Sender email**: `no-reply@unjaded.net`. **Sender name**: `Legend`.
4. **Host** `smtp.resend.com`, **Port** `465`, **Username** `resend`,
   **Password** `re_...`.
5. **Minimum interval between emails**: leave the default (e.g. 60 s per
   user). This is per recipient, not global.
6. **Save changes**.

**Option B: Resend's Supabase integration**

1. Resend → **Settings → Integrations** → **Supabase** → **Connect**.
2. Authorize Resend on your Supabase organization.
3. Choose the Supabase **project**, the verified **domain**, and the sender
   name/address → **Configure SMTP**.
4. Resend creates an API key and fills in Supabase's SMTP settings for you.
   Confirm under Supabase **Authentication → Emails → SMTP Settings**.

**Option C: source-controlled in `config.toml` (recommended for Legend)**

Legend applies auth config with `supabase config push`, which sends the whole
`[auth]` block. Putting SMTP in the same file means a push can't undo it. Add to
`LegendNetworkingApp/supabase/config.toml`:

```toml
[auth.email.smtp]
enabled = true
host = "smtp.resend.com"
port = 465
user = "resend"
pass = "env(RESEND_API_KEY)"   # read from the shell at push time, never committed
admin_email = "no-reply@unjaded.net"
sender_name = "Legend"

[auth.rate_limit]
# emails per hour across the project, once custom SMTP is on
email_sent = 100
```

Then push with the key in the environment for that one command:

```powershell
cd C:\repo\VIBES\LegendNetworkingApp
$env:RESEND_API_KEY = "re_..."
npx supabase config push
Remove-Item Env:RESEND_API_KEY
```

</details>

<details>
<summary><strong>2.7 Raise the auth email rate limit</strong></summary>

<br>

With custom SMTP on, Supabase lets you raise the email limit:

1. **Authentication → Rate Limits**.
2. **Rate limit for sending emails**: raise from the default (e.g. 30/hour) to
   something like **100/hour** for launch. Keep it well under your Resend plan's
   daily cap.
3. **Save**.

(Option C sets the same value with `[auth.rate_limit] email_sent`.)

</details>

<details>
<summary><strong>2.8 Push Legend's code templates (now that SMTP is live)</strong></summary>

<br>

```bash
cd LegendNetworkingApp
npx supabase config push
```

Then confirm in **Authentication → Emails → Templates** that *Confirm signup*
and *Reset password* both start with the `{{ .Token }}` code block. This
completes the open item in commit `9e3f136a`.

</details>

<details>
<summary><strong>2.9 End-to-end test</strong></summary>

<br>

- [ ] Sign up in the app with a fresh real address (Gmail and Outlook are
      good for testing spam placement).
- [ ] Email arrives within ~1 min, **From** shows your sender name/domain,
      not "Supabase Auth".
- [ ] Legend: the email leads with an 8-digit code; entering it on the verify
      screen unlocks the app.
- [ ] VendorFinder: the link opens the app (`vendorfinder://verify-email`) and
      the gate clears.
- [ ] "Forgot password" sends a reset email the same way.
- [ ] Resend → **Emails** shows each message as *Delivered*.
- [ ] In Gmail, **⋮ → Show original** shows `SPF: PASS`, `DKIM: PASS`
      (and `DMARC: PASS` if you added it).
- [ ] Sign up 5+ accounts in a row: no "Too many attempts" error.

</details>

<details>
<summary><strong>2.10 Monitoring & troubleshooting</strong></summary>

<br>

**Where to look:**

- **Resend → Emails / Logs**: every send, delivery, bounce, complaint.
- **Supabase → Logs → Auth** (Logs & Analytics): SMTP errors show up here
  (e.g. `535 Authentication failed`).

| Symptom | Cause / fix |
| --- | --- |
| Supabase: `Error sending confirmation email` | Wrong SMTP password (use the API key), username not `resend`, or port/TLS mismatch. Try 465, then 587. |
| Resend: `The <domain> domain is not verified` | Sender address isn't on the verified domain, or DNS hasn't propagated. |
| Emails go to spam | DKIM/SPF not passing; add DMARC; avoid link-only emails with no text (Legend's code-first template helps). |
| Still "Too many attempts" | Rate limit not raised (2.7), or SMTP not actually enabled. Re-check after any `config push`. |
| Emails stop after a `config push` | Push reverted dashboard-only SMTP. Use Option C. |
| Hitting Resend's daily cap | Upgrade the Resend plan; check for sign-up abuse (consider enabling CAPTCHA under **Authentication → Attack Protection**). |

</details>

</details>

---

<a id="part-3"></a>

<details>
<summary><strong>Part 3: Expo & EAS (builds, environment, credentials, push)</strong></summary>

<br>

<details>
<summary><strong>3.1 Expo account, organization & login</strong></summary>

<br>

1. https://expo.dev/signup → create the account.
2. *(Recommended)* Create an **organization** (expo.dev → your avatar →
   **Create organization**, e.g. `unjadeddigital`) so the projects, credentials
   and billing belong to the business, not a personal account. To build under
   it, add `owner: 'unjadeddigital'` to `app.config.js`. That changes where
   `eas init` creates the project, so decide **before** linking.
3. Log in from the CLI:

   ```bash
   eas login
   eas whoami
   ```

   For CI, create a token at **expo.dev → Account settings → Access tokens**
   and set `EXPO_TOKEN` instead of logging in.

</details>

<details>
<summary><strong>3.2 Link the app to an EAS project (projectId)</strong></summary>

<br>

```bash
cd VendorFinder      # or LegendNetworkingApp
eas init             # creates (or links) the expo.dev project and prints its ID
eas project:info
```

Both apps read the ID from `process.env.EAS_PROJECT_ID` in
`app.config.js → extra.eas.projectId`. Because `app.config.js` is dynamic,
`eas init` can't write it for you; it prints the ID and tells you to add it.

⚠️ **Gotcha: `.env` doesn't reach the cloud builder.** Legend solved this by
hardcoding a fallback:

```js
projectId: process.env.EAS_PROJECT_ID || '9a2a8a94-9199-468a-a479-98c5b1627a54',
```

**VendorFinder still has `|| ''`.** The builder then embeds an empty projectId,
and push-token registration breaks. `alertService.ts` calls
`getExpoPushTokenAsync()` with no explicit projectId, so it relies on this
value. Fix by hardcoding VendorFinder's ID as the fallback the same way once
`eas init` prints it.

</details>

<details>
<summary><strong>3.3 Build profiles (eas.json) explained</strong></summary>

<br>

Both apps use `"appVersionSource": "remote"`: EAS stores the iOS
`buildNumber` / Android `versionCode`, and `autoIncrement: true` bumps it on
every production build.

**Legend (`LegendNetworkingApp/eas.json`)**

| Profile | Distribution | Android output | Backend | Palette store | Use it for |
| --- | --- | --- | --- | --- | --- |
| `development` | internal | APK | local | on | Dev client with native modules |
| `preview` | internal | APK | Supabase (live) | on | Sideloadable test builds |
| `production` | store | **AAB** | Supabase (live) | **off** | Play Store + external/App Store iOS |
| `testflight` | store (extends production) | AAB | Supabase (live) | **on** | **Internal** TestFlight only |

All Legend profiles pin `APP_VERSION=0.2.0` and turn Google/Apple auth off.

**VendorFinder (`VendorFinder/eas.json`)**

| Profile | Distribution | Backend | Notes |
| --- | --- | --- | --- |
| `development` | internal | local | |
| `preview` | internal | supabase | No `android.buildType`, so add `"android": { "buildType": "apk" }` to get an installable APK |
| `production` | store | supabase | AAB on Android by default |

VendorFinder's profiles set **only** `APP_BACKEND`. Every other value
(`SUPABASE_URL`, `SUPABASE_ANON_KEY`, Stripe, bundle ID) must be supplied as
shown in 3.4, or the cloud build ships with empty strings.

</details>

<details>
<summary><strong>3.4 Environment variables for builds (the #1 cause of broken builds)</strong></summary>

<br>

`app.config.js` is evaluated **on the EAS builder**, where `.env` doesn't exist
(it's gitignored and not uploaded). Legend's 2026-08-11 builds shipped with an
empty Supabase URL for exactly this reason (see `TASKS.md`). There are two ways
to provide values:

**Method 1: inline `env` in `eas.json` (what Legend does).** Good for
**public** values only (URL, anon key, flags, version). They're committed to
git.

```jsonc
"production": {
  "autoIncrement": true,
  "env": {
    "APP_BACKEND": "supabase",
    "SUPABASE_URL": "https://<ref>.supabase.co",
    "SUPABASE_ANON_KEY": "<anon key>",
    "AUTH_GOOGLE_ENABLED": "false",
    "AUTH_APPLE_ENABLED": "false"
  }
}
```

**Method 2: EAS environment variables (dashboard or CLI).** Better for
anything you'd rather not commit, and for per-environment values.

```bash
eas env:create --name SUPABASE_URL      --value https://<ref>.supabase.co --environment production --environment preview --visibility plaintext
eas env:create --name SUPABASE_ANON_KEY --value <anon key>                --environment production --environment preview --visibility plaintext
eas env:create --name STRIPE_PUBLISHABLE_KEY --value pk_live_...          --environment production --visibility plaintext
eas env:list --environment production
eas env:pull --environment development    # writes .env.local for local dev
```

Dashboard: **expo.dev → project → Environment variables → + Add variables**.
Then tell each profile which environment to load:

```jsonc
"production": { "environment": "production", "autoIncrement": true, "env": { "APP_BACKEND": "supabase" } },
"preview":    { "environment": "preview",    "distribution": "internal", "env": { "APP_BACKEND": "supabase" } }
```

> `eas secret:create` (used in `VendorFinder/DEPLOYMENT.md`) is the older,
> deprecated command. Use `eas env:create`. Visibility: `plaintext` for
> public config, `sensitive`/`secret` for anything else. **Never** put the
> Supabase service-role key or any server secret into an app build, whatever
> the visibility setting. Anything in the app bundle can be extracted.

**Verify what a profile resolves to before spending a build:**

```powershell
cd C:\repo\VIBES\LegendNetworkingApp
$env:APP_BACKEND="supabase"; $env:SUPABASE_URL="https://krxszvviuqlzxxcvhyss.supabase.co"
npx expo config --type public | Select-String "backend|supabaseUrl|version|projectId"
```

(or `eas config --profile production --platform ios`, which prints the resolved
config for that profile.)

</details>

<details>
<summary><strong>3.5 Versioning</strong></summary>

<br>

- **Marketing version** (`1.0.0`, shown in stores) comes from `APP_VERSION` →
  `app.config.js → version`. Legend pins it in `eas.json` (currently `0.2.0`).
  **Bump it for each App Store release.** App Store Connect rejects a version
  lower than one already released, so check `eas build:list` for older builds
  before shipping (Legend TASKS note: make sure no stray `1.0.0` build exists).
- **Build number / versionCode** is managed remotely by EAS:

  ```bash
  eas build:version:get                       # current remote values
  eas build:version:set --platform android    # e.g. after a manual Play upload with a higher code
  ```

  Play rejects a duplicate `versionCode`. If you ever upload an AAB built
  elsewhere, sync EAS with `build:version:set`.

</details>

<details>
<summary><strong>3.6 Signing credentials (EAS-managed)</strong></summary>

<br>

Let EAS generate and store credentials. The first `eas build` for each platform
walks you through it.

**iOS** (first `eas build -p ios`):

1. "Do you want to log in to your Apple account?" → **Yes** → Apple ID +
   password + 2FA code.
2. Select your **Team**.
3. EAS registers the **bundle identifier** (if needed), creates a
   **Distribution Certificate** and an **App Store provisioning profile**, and
   enables capabilities it detects (Push Notifications for `expo-notifications`).
4. "Generate a new Apple Push Notifications service key?" → **Yes**. This
   is what lets Expo Push deliver to iOS.

**Android** (first `eas build -p android`):

1. "Generate a new Android Keystore?" → **Yes**. This becomes your **upload
   key**. Google Play App Signing holds the real app-signing key (Part 5.6).
2. **Back it up:**

   ```bash
   eas credentials -p android
   # → choose the build profile → Keystore: Manage everything needed to build your project
   # → Download existing keystore  (saves a .jks + prints passwords; store both in the password manager)
   ```

   If this upload key is ever lost, you can request an upload-key reset in Play
   Console. It's slow, so keep the backup.

**Inspect or manage everything later:**

```bash
eas credentials            # interactive menu for either platform
```

</details>

<details>
<summary><strong>3.7 Push notifications: APNs (iOS) and FCM V1 (Android)</strong></summary>

<br>

The chain: app → `getExpoPushTokenAsync({ projectId })` → token stored in
`push_tokens` → server (VendorFinder's `send-notification`) POSTs to the Expo
Push API → Expo forwards to **APNs** (iOS) or **FCM** (Android).

**iOS:** done if you said yes to the APNs key in 3.6. Check with
`eas credentials -p ios` → *Push Notifications: Manage your Apple Push
Notifications Key*.

**Android: required for push in store builds and not yet configured in
either app:**

1. https://console.firebase.google.com → **Add project** (Analytics optional).
2. **Project overview → Add app → Android** → package name
   (`com.unjadeddigital.legend` / `com.vendorfinder.app`) → **Register app** →
   **Download `google-services.json`**. Skip the Gradle/SDK steps; Expo handles
   them.
3. Put it in the app dir and reference it in `app.config.js`:

   ```js
   android: {
     package: BUNDLE_ID,
     googleServicesFile: process.env.GOOGLE_SERVICES_JSON ?? './google-services.json',
     // ...
   }
   ```

   Either commit `google-services.json` (it holds identifiers, not secrets, and
   EAS only sees committed files), or upload it as an EAS **file** variable:

   ```bash
   eas env:create --name GOOGLE_SERVICES_JSON --type file --value ./google-services.json --environment production --environment preview --visibility secret
   ```

4. Firebase → **Project settings (gear) → Service accounts → Generate new
   private key** → downloads a JSON. **This one IS a secret.**
5. Upload it to EAS:

   ```bash
   eas credentials -p android
   # → production → Google Service Account
   # → Manage your Google Service Account Key for Push Notifications (FCM V1)
   # → Set up a Google Service Account Key for Push Notifications (FCM V1) → Upload a new service account key
   ```

6. Rebuild. Test from https://expo.dev/notifications (paste a token from
   `push_tokens`).

> Expo Go on Android doesn't support remote push on recent SDKs. Test push on a
> development/preview build or a store build, on a **physical device**. Emulators
> and simulators don't get Expo push tokens.

</details>

<details>
<summary><strong>3.8 Pre-build checklist (run every time)</strong></summary>

<br>

```bash
cd LegendNetworkingApp               # or VendorFinder
node -v && cat .nvmrc                # must match
git status                           # clean; everything the build needs is committed
npm ci                               # only if deps changed; never while Metro is running
npx expo-doctor                      # dependency/config sanity
npx expo install --check             # SDK-compatible versions
```

Legend only:

```bash
npm run typecheck && npm run check:imports && npm test
# (npm run prebuild:check = typecheck + check:imports)
```

- [ ] Correct Node
- [ ] `git status` clean, on the branch you mean to ship (usually `main`)
- [ ] Version bumped if this is a new store release (3.5)
- [ ] `eas.json` profile env is correct (backend = supabase, auth flags, feature flags)
- [ ] Real icon/splash assets (`assets/icon.png` 1024×1024, **no transparency**)

</details>

<details>
<summary><strong>3.9 Running builds (cloud, internal testers, local Mac)</strong></summary>

<br>

**Cloud builds:**

```bash
eas build --platform ios     --profile production
eas build --platform android --profile production
eas build --platform all     --profile production
eas build:list --limit 5
```

Watch progress at the URL printed (expo.dev → project → Builds). When it
finishes, the build page has **Download**, **Install** (QR) and logs.

**Internal-distribution builds (preview) for testers without the stores:**

- **Android**: the `preview` profile gives an APK. Share the build page link
  or QR, and testers install it directly (allow "install unknown apps").
- **iOS ad hoc**: every device must be registered first:

  ```bash
  eas device:create        # prints a URL/QR; tester opens it on the iPhone and installs the profile
  eas device:list
  eas build -p ios --profile preview   # the profile includes the registered devices
  ```

  Add a device later, then rebuild, or run `eas device:create` and
  `eas build:resign`. TestFlight is usually easier for iOS testers.

**Local iOS build on the Mac mini (Legend):** see
`LegendNetworkingApp/Documentation.md` §5 (Homebrew Node, CocoaPods,
`LANG=en_US.UTF-8`, full Xcode + `xcode-select`). Then on the Mac:

```bash
eas build --platform ios --profile production --local
# produces build-*.ipa in the project dir
eas submit --platform ios --path ./build-XXXX.ipa
```

</details>

<details>
<summary><strong>3.10 EAS troubleshooting</strong></summary>

<br>

| Symptom | Cause / fix |
| --- | --- |
| Build succeeds, app shows empty backend / login crash | Env not provided to the builder (3.4). |
| `Cannot find module './Foo'` only on EAS | Case mismatch or untracked file. Run Legend's `npm run check:imports`, `git add`, commit. |
| `npm ci` fails on builder: engine mismatch | Builder Node differs from `engines`. Set `"node": "22.17.0"` (Legend) / `"20.19.4"` (VendorFinder) under the profile in `eas.json`. |
| Push token error: `No projectId found` | projectId empty in build (3.2). |
| Android push token error: `Default FirebaseApp is not initialized` | FCM not set up (3.7). |
| iOS: `Missing Compliance` on every TestFlight build | Add `ios.config.usesNonExemptEncryption: false` (Legend has it; VendorFinder doesn't). |
| `ERR_UNKNOWN_FILE_EXTENSION` from Expo CLI (VendorFinder) | Running SDK 52 on Node 22. Switch to Node 20. |

</details>

</details>

---

<a id="part-4"></a>

<details>
<summary><strong>Part 4: iOS: TestFlight and the App Store</strong></summary>

<br>

**Path:** Apple Developer enrollment → App Store Connect app record → EAS build
→ EAS submit → TestFlight internal → (TestFlight external) → App Store review →
release.

Legend's strategy (TASKS.md, 2026-07-30): ship **internal TestFlight first**.
Internal testing needs no Beta App Review, so none of the external blockers gate
getting it onto your own devices.

<details>
<summary><strong>4.1 Enroll in the Apple Developer Program</strong></summary>

<br>

1. https://developer.apple.com/programs/enroll → **Start your enrollment**.
2. Sign in with the Apple ID that will own the apps (2FA required).
3. Choose **Individual** or **Organization**. Organization shows the company
   name as the seller and needs a **D-U-N-S number** (free, can take days),
   a legal entity, and a website.
4. Pay the **$99/year** fee. Activation takes from minutes to about 48 h.
5. Once active, note your **Team ID**: developer.apple.com → **Account →
   Membership details**.
6. Sign the latest agreements: App Store Connect → **Business** (older UI:
   *Agreements, Tax, and Banking*). The Free Apps agreement is required for any
   upload. The Paid Apps agreement plus tax and banking forms are required before
   any IAP/paid features.

</details>

<details>
<summary><strong>4.2 Register the bundle ID (optional, EAS can do it)</strong></summary>

<br>

EAS registers the App ID automatically on first build. To do it by hand (e.g.
to enable capabilities first):

1. developer.apple.com → **Certificates, Identifiers & Profiles → Identifiers
   → +**.
2. **App IDs → App → Continue**.
3. Description: `Legend`. Bundle ID: **Explicit**, `com.unjadeddigital.legend`
   (VendorFinder: `com.vendorfinder.app`).
4. Capabilities: **Push Notifications** (plus **Sign In with Apple** if you
   enable it). → **Continue → Register**.

</details>

<details>
<summary><strong>4.3 Create the app record in App Store Connect</strong></summary>

<br>

1. https://appstoreconnect.apple.com → **Apps** → blue **+** → **New App**.
2. Fill in:
   - **Platforms**: iOS.
   - **Name**: `Legend` (must be unique on the whole App Store. If taken, try
     e.g. "Legend: Relationship Network"). Up to 30 characters.
   - **Primary Language**: English (U.S.).
   - **Bundle ID**: pick `com.unjadeddigital.legend` from the dropdown (it
     appears once registered in 4.2 or after the first EAS build).
   - **SKU**: any internal ID, e.g. `LEGEND-001`.
   - **User Access**: Full Access.
3. **Create**.
4. Open **App Information** (left sidebar, under *General*) and copy the
   **Apple ID** (a ~10-digit number). That's your `ascAppId`.

</details>

<details>
<summary><strong>4.4 Create an App Store Connect API key (non-interactive submits)</strong></summary>

<br>

Without this, `eas submit` asks for your Apple ID password + 2FA each time. With
it, submits are one command and CI-safe.

1. App Store Connect → **Users and Access** → **Integrations** tab → **App
   Store Connect API** → **Team Keys**. (The first time, the Account Holder must
   click **Request Access**.)
2. **Generate API Key** (or **+**) → Name: `EAS Submit` → Access: **App
   Manager** → **Generate**.
3. **Download API Key**: a `AuthKey_XXXXXXXXXX.p8` file, **downloadable only
   once**. Store it in the password manager / a secure folder **outside git**.
4. Note the **Key ID** (in the row) and the **Issuer ID** (top of the page).
5. Either hand it to EAS (stored server-side, nothing in the repo):

   ```bash
   eas credentials -p ios
   # → production → App Store Connect: Manage your API Key → Add a new ASC API Key
   # → path to .p8, Key ID, Issuer ID
   ```

   or reference it in `eas.json` (next step).

</details>

<details>
<summary><strong>4.5 Configure <code>eas.json</code> submit</strong></summary>

<br>

Both apps currently have `"submit": { "production": { "ios": {} } }` (Legend)
or `{ "production": {} }` (VendorFinder), which means EAS prompts
interactively. To make it non-interactive:

```jsonc
"submit": {
  "production": {
    "ios": {
      "ascAppId": "1234567890",          // App Information → Apple ID (4.3)
      "appleTeamId": "ABCDE12345",       // Membership details (4.1)
      // only if you did NOT store the key via `eas credentials`:
      "ascApiKeyPath": "../secrets/AuthKey_XXXXXXXXXX.p8",
      "ascApiKeyIssuerId": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
      "ascApiKeyId": "XXXXXXXXXX"
    },
    "android": { "track": "internal" }
  }
}
```

`ascAppId` and `appleTeamId` aren't secrets, so committing them is fine. The
`.p8` is a secret: keep the path pointing outside the repo.

</details>

<details>
<summary><strong>4.6 Build and upload to TestFlight</strong></summary>

<br>

**Legend (internal TestFlight, palette store visible):**

```bash
cd LegendNetworkingApp
eas build --platform ios --profile testflight
eas submit --platform ios --profile production --latest
```

(`testflight` is a *build* profile. There's no `testflight` *submit*
profile, so pass `--profile production` to submit, which uses
`submit.production`.)

**Legend (build for external testing / App Store, palette store hidden):**

```bash
eas build --platform ios --profile production --auto-submit
```

`--auto-submit` runs `eas submit` automatically when the build finishes.

**VendorFinder:**

```bash
cd VendorFinder
eas build --platform ios --profile production --auto-submit
```

**Shortcut for a first TestFlight upload:** `npx testflight` runs an
interactive flow that sets up credentials, builds, and submits in one go.

**Manual alternative:** download the `.ipa` from the build page and upload it
with Apple's **Transporter** app (Mac App Store).

</details>

<details>
<summary><strong>4.7 Processing, export compliance & build status</strong></summary>

<br>

1. After submit, App Store Connect → your app → **TestFlight** tab. The build
   shows **Processing** (typically 5–30 min). Apple emails you when it's done.
2. **Export compliance**:
   - Legend sets `usesNonExemptEncryption: false`, so the build goes straight to
     *Ready to Submit / Ready to Test*.
   - VendorFinder doesn't, so the build shows **Missing Compliance** → click
     **Manage** → "What type of encryption algorithms does your app
     implement?" → **None of the algorithms mentioned above** (standard HTTPS
     only) → **Save**. To stop this prompt on every build, add to
     `VendorFinder/app.config.js`:

     ```js
     ios: { supportsTablet: true, bundleIdentifier: BUNDLE_ID, config: { usesNonExemptEncryption: false } },
     ```

3. If processing fails, Apple emails the reason (e.g. missing purpose string,
   invalid icon with alpha, Xcode/SDK too old).

</details>

<details>
<summary><strong>4.8 Internal testing (up to 100 team members, no review)</strong></summary>

<br>

1. Testers must be **App Store Connect users**: **Users and Access → +** →
   name, email, role (e.g. *Developer* or *Marketing*). Tick access to the
   app → **Invite**. They accept the email invitation.
2. **TestFlight** tab → sidebar **Internal Testing → +** → group name (e.g.
   `Team`) → optionally tick **Enable automatic distribution** (new builds go
   to the group automatically) → **Create**.
3. In the group → **Testers → +** → select users → **Add**.
4. **Builds → +** (if not automatic) → select the build → **Add**. Fill in
   **What to Test**.
5. Testers install **TestFlight** from the App Store, accept the email/invite,
   and tap **Install**.

Internal builds expire after **90 days**.

</details>

<details>
<summary><strong>4.9 External testing (up to 10,000, needs Beta App Review)</strong></summary>

<br>

**Before you start (Legend):** everything in TASKS.md "🔴 Hard blockers" must
be done, and use a build from the **`production`** profile (palette store off).

1. **TestFlight → Test Information** (sidebar, under *General Information*):
   - Beta App Description, Feedback Email, Marketing URL (optional).
   - **Privacy Policy URL**: Legend: `https://unjaded.net/legend/privacy_policy.html`.
   - **Beta App Review Information**: contact name/phone/email, **Sign-in
     required** ✓ with the reviewer account from 1.13, and notes (e.g. "Email
     is pre-confirmed; Sync is optional").
   - **Save**.
2. Sidebar **External Testing → +** → group name → **Create**.
3. Group → **Builds → +** → select the build → **What to Test** → **Submit
   for Review**. First review usually takes about a day; later builds of the same
   version are often auto-approved.
4. Once approved: add testers by email (**Testers → +**), or enable a **Public
   Link** (with an optional tester cap) and share it.

</details>

<details>
<summary><strong>4.10 App Store listing (version page)</strong></summary>

<br>

App Store Connect → app → **App Store** tab → **iOS App** version (e.g.
`1.0 Prepare for Submission`).

**Screenshots** (PNG/JPG, no alpha, 1–10 per size):

| Device slot | Size (portrait) | Required? |
| --- | --- | --- |
| iPhone 6.9" | 1320 × 2868 (or 1290 × 2796) | **Yes** (Apple scales it for smaller iPhones) |
| iPad 13" | 2064 × 2752 (or 2048 × 2732) | **Yes, because both apps set `supportsTablet: true`** |

> If you don't want to support iPad, set `ios.supportsTablet: false` before the
> first App Store release. Otherwise you need iPad screenshots and the app must
> work on iPad. Capture from the iOS Simulator (`Cmd+S` saves at native
> resolution) or a device.

**Text fields:**

| Field | Limit | Notes |
| --- | --- | --- |
| Promotional Text | 170 | Can be changed without a new build |
| Description | 4000 | |
| Keywords | 100 chars, comma-separated | No spaces after commas; don't repeat the app name |
| Support URL | required | e.g. `https://unjaded.net/legend/` |
| Marketing URL | optional | |
| Version / Copyright | | e.g. `2026 Unjaded Digital` |

**Build:** in the **Build** section click **+ / Add Build** and pick the
processed build (from the `production` profile).

**App Review Information:** sign-in required ✓ + reviewer credentials (1.13),
contact info, **Notes** explaining non-obvious flows (Legend: contacts import
is one-way and on-device; Sync is optional and end-to-end encrypted; location is
one-shot to prefill "where we met").

**Version Release:** Manual / Automatic after approval / Scheduled.
Optionally enable **Phased Release** (7-day gradual rollout for automatic
updates).

</details>

<details>
<summary><strong>4.11 App Information, privacy, age rating, pricing</strong></summary>

<br>

**App Information** (sidebar):

- Subtitle (30 chars), **Category** (Legend: Productivity or Business;
  VendorFinder: Food & Drink or Lifestyle), secondary category.
- **Content Rights**: does it show third-party content? (VendorFinder: vendor-
  supplied listings, so answer accordingly.)
- **Age Rating → Edit**: questionnaire; both apps have no objectionable
  content. User-generated content (VendorFinder broadcasts) and unrestricted web
  access are questions to answer carefully.

**App Privacy** (sidebar):

1. **Privacy Policy URL** → Legend `https://unjaded.net/legend/privacy_policy.html`.
2. **Get Started** on data collection → declare each type. For Legend, reuse the
   code-verified inventory in `LegendNetworkingApp/PLAY_CONSOLE.md` §3:
   email + name + photo (avatar) linked to the user for App Functionality;
   product interaction (app-open events) for Analytics; device ID (push token);
   **Contacts** only when Sync is on (transmitted end-to-end encrypted, still
   declared). No tracking, no third-party sharing.
3. VendorFinder: build the same inventory from its tables (profiles, vendors
   incl. location, favorites, notifications, push_tokens, Stripe purchase
   history) before submitting.
4. **Publish**.

**Pricing and Availability:** Price **Free** → select countries/regions →
Save.

**Account deletion:** both apps have in-app **Settings → Delete account**
(`delete_own_account()` RPC), which Guideline 5.1.1(v) requires for any app
with sign-up.

</details>

<details>
<summary><strong>4.12 Submit for App Review & release</strong></summary>

<br>

1. On the version page, click **Add for Review** (top right). Fix anything it
   flags as missing.
2. **Submit to App Review** (from the *Draft Submissions* panel).
3. Status: *Waiting for Review → In Review → Pending Developer Release /
   Ready for Distribution* (typically 24–48 h). Rejections show in **App Review**
   with a message thread. Reply there or fix and resubmit.
4. If you chose manual release: **Release This Version**.

**Next releases:**

```bash
# bump APP_VERSION (eas.json env / .env), commit
eas build -p ios --profile production --auto-submit
```

then App Store tab → **+ Version or Platform → iOS** → new version number →
attach the build → What's New → Add for Review → Submit.

</details>

<details>
<summary><strong>4.13 Known rejection risks, per app</strong></summary>

<br>

**Legend**

- ✅ Photo, contacts and location purpose strings; account deletion; export compliance.
- ✅ Palette store hidden in `production` (Guideline 3.1.1). Real StoreKit IAP
  (App Store Connect → **Monetization → In-App Purchases** → non-consumables
  + `expo-iap`/`react-native-iap`) is needed before showing prices.
- ⚠️ Reviewer account required (login-gated).
- ⚠️ Privacy policy + App Privacy questionnaire must be entered (4.11).

**VendorFinder**

- 🔴 **Stripe subscriptions inside the iOS app** break Guideline 3.1.1 (digital
  subscriptions need Apple IAP). Options (`VendorFinder/DEPLOYMENT.md` §C):
  ship Web/PWA first, or add an `AppleIapProvider` behind the pluggable
  `PaymentProvider`, or hide the upgrade UI on iOS (`FEATURE_PAYMENTS=false` in
  the iOS build env).
- 🔴 **Expo SDK 52 is old.** Apple periodically raises the minimum
  Xcode/iOS SDK for uploads, and older EAS images may no longer be accepted.
  Upgrade to the SDK Legend uses (54+; see Legend `Documentation.md` §4 for the
  path that worked) before a real store release.
- ⚠️ Google/Apple sign-in buttons default on. Configure them (1.11) or set
  `AUTH_*_ENABLED=false`, and remember Guideline 4.8.
- ⚠️ `usesNonExemptEncryption` missing (4.7).
- ⚠️ Placeholder icon/splash assets (`DEPLOYMENT.md` §B6).

</details>

</details>

---

<a id="part-5"></a>

<details>
<summary><strong>Part 5: Android: Google Play</strong></summary>

<br>

**Path:** developer account → create app → complete "App content" → store
listing → build AAB → **first upload by hand** to Internal testing →
service account for automated `eas submit` → closed testing (12 testers × 14
days for new personal accounts) → production.

Legend's working checklist with **code-verified Data Safety answers** is
`LegendNetworkingApp/PLAY_CONSOLE.md`. This part covers the full click path
around it.

<details>
<summary><strong>5.1 Create the Play developer account</strong></summary>

<br>

1. https://play.google.com/console/signup, signed in with the Google account
   that should own the apps.
2. Choose **Yourself** (personal) or **An organization** (needs a D-U-N-S
   number; shows the business as developer; **exempt** from the 12-tester rule).
3. Fill in developer name (public), contact details, and experience questions.
4. Pay the **$25** one-time fee.
5. Complete **identity verification** (government ID; organizations also
   verify the business) and **Android device verification** through the Play
   Console mobile app when prompted. This can take a few days.

</details>

<details>
<summary><strong>5.2 Create the app</strong></summary>

<br>

1. Play Console → **Home → Create app**.
2. **App name**: `Legend` (30 chars max). **Default language**: English
   (United States). **App or game**: App. **Free or paid**: Free (⚠️ a free
   app can never be switched to paid).
3. Tick the **Developer Program Policies** and **US export laws** declarations →
   **Create app**.
4. The package name isn't typed here. It's locked in by the **first AAB you
   upload** (`com.unjadeddigital.legend` / `com.vendorfinder.app`) and can
   never change.

</details>

<details>
<summary><strong>5.3 App content (Policy declarations)</strong></summary>

<br>

Play Console → app → **Dashboard → Set up your app** (or **Policy and
programs → App content**). Complete every item:

| Declaration | Legend answer | VendorFinder notes |
| --- | --- | --- |
| **Privacy policy** | `https://unjaded.net/legend/privacy_policy.html` | Needs a hosted policy URL |
| **App access** | *All or some functionality is restricted* → **Add instructions** → name "Reviewer login", username/password from 1.13, note "email pre-confirmed" | Same (login-gated) |
| **Ads** | No, the app doesn't contain ads | No |
| **Content rating** | Start questionnaire → email → category *All other app types* (or Utility/Productivity) → answer No to violence/sexuality/etc. → user interaction: Legend has no user-to-user chat → Save → **Submit** | VendorFinder: vendors broadcast to followers, so answer "Users can interact" accurately |
| **Target audience and content** | 18+ (no child-directed content) | 18+ or 13+; avoid under-13 unless you comply with Families policy |
| **News app** | No | No |
| **Data safety** | Follow `PLAY_CONSOLE.md` §3 exactly (email, name, photos, app interactions, device IDs; **Contacts** declared because Sync can transmit them; encrypted in transit = Yes; deletion = Yes; shared with third parties = No) | Build from the schema: email, name, **approximate/precise location** (vendor location), app interactions, device IDs, purchase history (Stripe) |
| **Government apps / Financial features / Health** | No / None / No | No / None / No |
| **Advertising ID** | No (the app doesn't use the ad ID) | No |

> Permissions Play will list for Legend: `READ_CONTACTS`, coarse/fine location,
> storage, `INTERNET`. `WRITE_CONTACTS`, `CAMERA` and `RECORD_AUDIO` are
> deliberately blocked in `app.config.js`. The Data Safety answers must match
> what the manifest declares.

</details>

<details>
<summary><strong>5.4 Store settings & main store listing</strong></summary>

<br>

**Grow users → Store presence → Store settings:** App category (Legend:
Productivity; VendorFinder: Food & Drink) → tags → **Store listing contact
details** (email required: Legend `marlon.unjaded@gmail.com`, website
optional) → Save.

**Grow users → Store presence → Main store listing:**

| Field | Limit / spec | Legend asset |
| --- | --- | --- |
| App name | 30 chars | Legend |
| Short description | 80 chars | |
| Full description | 4000 chars | |
| App icon | 512 × 512 PNG (32-bit), ≤ 1 MB | `LegendNetworkingApp/store/icon-512.png` ✅ |
| Feature graphic | 1024 × 500 JPG/24-bit PNG | `LegendNetworkingApp/store/feature-graphic.png` ✅ |
| Phone screenshots | 2–8, 16:9 or 9:16, ≥ 1080 px on the long side recommended | **Still needed**: capture from emulator/device |
| Tablet screenshots | optional (needed to be featured on tablets) | |

Save. Capture screenshots from the emulator (see `android-testing\android.ps1`
at the repo root): emulator side panel → camera icon, or
`adb exec-out screencap -p > shot.png`.

</details>

<details>
<summary><strong>5.5 Build the Android App Bundle (AAB)</strong></summary>

<br>

```bash
cd LegendNetworkingApp     # or VendorFinder
eas build --platform android --profile production
```

Legend's `production` profile sets `buildType: app-bundle` → `.aab`, and
`versionCode` auto-increments remotely. When it's done, open the build page
(link in the terminal, or expo.dev → Builds) → **Download** to get the `.aab`.

> **Target API level:** Play requires new apps and updates to target a recent
> Android API level (the bar moves up every August). Expo SDK 54 (Legend) meets
> the current requirement. VendorFinder's SDK 52 targets an older API and will
> likely be **blocked at upload**. Upgrade the SDK (or set `targetSdkVersion`
> via `expo-build-properties`) before shipping it on Play. Play Console shows the
> exact current requirement on the upload error.

</details>

<details>
<summary><strong>5.6 First upload by hand → Internal testing (and Play App Signing)</strong></summary>

<br>

The Play API (and therefore `eas submit`) can't create the first release of a
new app, so the first AAB goes up through the browser.

1. **Test and release → Testing → Internal testing**.
2. **Testers** tab → **Create email list** → name `Core team` → add Gmail
   addresses (comma-separated) → **Save changes** → tick the list → **Save**.
   Copy the **"Join on the web"** opt-in link for testers.
3. **Releases** tab → **Create new release**.
4. **App integrity / Play App Signing**: accept **"Use Google-generated key"**
   (default). Google holds the real app-signing key. The EAS keystore from 3.6
   is your **upload key**.
5. **App bundles → Upload** → the `.aab` from 5.5. Play reads the package name
   and versionCode.
6. **Release name**: auto (versionCode + version). **Release notes**:
   `<en-US>First internal build</en-US>`.
7. **Next** → review warnings (warnings are OK, errors block) → **Save and
   publish** / **Start rollout to Internal testing**.
8. Testers open the opt-in link → **Become a tester** → install from the Play
   Store link. Internal releases are available within minutes and skip full
   review.

> **Google Sign-In later?** Once Play App Signing is on, the SHA-1 Google uses
> is the **app signing key** fingerprint under **Test and release → App
> integrity → App signing**. Register that one (not the upload key) in any Google
> OAuth/Firebase config that asks for SHA-1.

</details>

<details>
<summary><strong>5.7 Service account for automated <code>eas submit</code></strong></summary>

<br>

**A. Google Cloud: create the key**

1. https://console.cloud.google.com → project picker → **New project** (e.g.
   `unjaded-play-publishing`) or reuse one.
2. **APIs & Services → Library** → search **Google Play Android Developer
   API** → **Enable**.
3. **IAM & Admin → Service Accounts → + Create service account** → name
   `eas-submit` → **Create and continue** → skip roles → **Done**.
4. Click the new account → **Keys** tab → **Add key → Create new key → JSON
   → Create**. A `.json` downloads. **This is a secret.** Store it outside git
   (e.g. `C:\repo\VIBES\secrets\legend-play-service-account.json`).
5. Copy the service account's **email** (`eas-submit@<project>.iam.gserviceaccount.com`).

**B. Play Console: grant it access**

1. Play Console (account level, not app) → **Users and permissions → Invite
   new users**.
2. Email address = the service account email.
3. **App permissions → Add app** → select Legend (and VendorFinder) → grant:
   - Release apps to testing tracks
   - Release to production, exclude devices, and use Play App Signing
   - Manage testing tracks and edit tester lists
   - (View app information is included)
4. **Invite user → Send invite**. There's no email to accept; service accounts
   are active immediately (occasionally takes up to a day).

**C. Give it to EAS (pick one)**

- Store it in EAS (nothing in the repo):

  ```bash
  eas credentials -p android
  # → production → Google Service Account
  # → Manage your Google Service Account Key for Play Store Submissions → Upload a new service account key
  ```

- Or point `eas.json` at the file (path relative to the app dir, **outside**
  the repo tree or gitignored):

  ```jsonc
  "submit": {
    "production": {
      "android": {
        "serviceAccountKeyPath": "../secrets/legend-play-service-account.json",
        "track": "internal",
        "releaseStatus": "completed"      // or "draft" to review in the console before rollout
      }
    }
  }
  ```

**D. From now on:**

```bash
eas submit --platform android --profile production --latest
# or build + submit in one step:
eas build  --platform android --profile production --auto-submit
```

</details>

<details>
<summary><strong>5.8 Closed testing → apply for production (new personal accounts)</strong></summary>

<br>

Personal developer accounts created after **13 Nov 2023** must run a **closed
test with at least 12 opted-in testers for 14 consecutive days** before
Production unlocks. Internal testing doesn't count.

1. **Testing → Closed testing → Create track** (or use the default *Alpha*).
2. **Testers** → email list or Google Group with 12+ people → **Save**. Share
   the opt-in link. Testers must **opt in and keep the app installed**.
3. **Releases → Create new release** → promote the existing internal AAB
   (**Add from library**) or submit with `"track": "alpha"` → roll out. Closed
   tracks **do** go through review (usually hours to a few days).
4. After 14 days with 12+ testers: **Dashboard → Apply for production** →
   answer the questionnaire about the test (how you recruited testers, feedback,
   changes made) → submit. Google replies in about 7 days.

Organization accounts skip this and can publish to production directly.

</details>

<details>
<summary><strong>5.9 Production release & updates</strong></summary>

<br>

1. **Test and release → Production → Countries/regions** → **Add
   countries/regions** → select → **Save**.
2. **Releases → Create new release** → **Add from library** (promote a tested
   AAB), or upload a new one → release notes → **Next**.
3. **Staged rollout**: enter a percentage (e.g. 20%) to limit exposure →
   **Save → Send for review** (**Publishing overview** shows the queue).
4. First production review can take several days. With **Managed publishing**
   (Publishing overview) ON, approved changes wait for you to click
   **Publish**.
5. Increase rollout to 100% from the Production page when metrics look healthy.

**Every later update:**

```bash
# bump APP_VERSION if user-visible; versionCode auto-increments
eas build -p android --profile production --auto-submit       # lands on the track in eas.json (internal)
```

Then in Play Console **promote** internal → closed → production (Releases →
*Promote release*), or change `"track": "production"` + `"rollout": 0.2` in
`eas.json` for direct staged releases.

</details>

<details>
<summary><strong>5.10 Play troubleshooting</strong></summary>

<br>

| Symptom | Cause / fix |
| --- | --- |
| `eas submit`: *"The caller does not have permission"* | Service account not invited, missing release permissions, or API not enabled (5.7). |
| `eas submit`: *"Package not found"* | First AAB wasn't uploaded manually yet (5.6). |
| *"Version code X has already been used"* | Remote versionCode behind Play. Run `eas build:version:set -p android` to a higher number and rebuild. |
| *"Your app currently targets API level N…"* | Target SDK too old. Upgrade the Expo SDK (VendorFinder). |
| *"You uploaded an APK or Android App Bundle that was signed with the wrong key"* | Built with a different keystore than the registered upload key. Use the EAS keystore, or request an upload key reset under **App integrity**. |
| Data Safety rejection | Declared data doesn't match manifest permissions or SDK behavior. Re-derive from code (PLAY_CONSOLE.md §3 method). |
| Payments policy warning (VendorFinder) | In-app digital subscriptions must use Google Play Billing. Same decision as Apple 3.1.1 (4.13). |

</details>

</details>

---

<a id="part-6"></a>

<details>
<summary><strong>Part 6: Release runbook cheat sheet</strong></summary>

<br>

<details>
<summary><strong>Legend: ship a new build to both stores</strong></summary>

<br>

```powershell
cd C:\repo\VIBES\LegendNetworkingApp
nvm use 22.17.0; node -v; Get-Content .nvmrc
git checkout main; git pull; git status
npm run typecheck; if ($?) { npm run check:imports }; if ($?) { npm test }
```

```bash
# (optional) bump APP_VERSION in every eas.json profile + .env, commit
eas build --platform ios     --profile testflight          # internal TestFlight
eas submit --platform ios    --profile production --latest
eas build --platform android --profile production --auto-submit   # → Play internal track
eas build:list --limit 4
```

Then: TestFlight → confirm processing → testers get it. Play → Internal
testing → confirm the release is live.

</details>

<details>
<summary><strong>VendorFinder: first-time go-live order</strong></summary>

<br>

1. [ ] Resend + custom SMTP (Part 2) so sign-ups stop failing
2. [ ] Decide payments on native (web-only / IAP / hide), see 4.13
3. [ ] Upgrade Expo SDK 52 → current (Legend `Documentation.md` §4 path)
4. [ ] `eas init`, hardcode projectId fallback (3.2)
5. [ ] Build env via `eas env:create` or `eas.json env` (3.4)
6. [ ] `usesNonExemptEncryption: false`; `preview` → `buildType: apk`
7. [ ] Real icon/splash assets
8. [ ] Configure or disable OAuth buttons (1.11)
9. [ ] FCM for Android push (3.7)
10. [ ] Deploy Edge Functions + secrets (1.10)
11. [ ] App Store Connect record + TestFlight (Part 4)
12. [ ] Play app + first manual AAB upload (Part 5)

</details>

<details>
<summary><strong>Command index</strong></summary>

<br>

| Task | Command |
| --- | --- |
| Who am I on Expo | `eas whoami` |
| Link EAS project | `eas init` |
| Set build env var | `eas env:create --name X --value Y --environment production` |
| Build | `eas build -p ios\|android\|all --profile <profile>` |
| Build + submit | `eas build ... --auto-submit` |
| Submit latest build | `eas submit -p ios\|android --profile production --latest` |
| List builds | `eas build:list --limit 10` |
| Version numbers | `eas build:version:get` / `eas build:version:set` |
| Credentials menu | `eas credentials -p ios\|android` |
| Register iOS test device | `eas device:create` |
| Supabase login/link | `npx supabase login` / `npx supabase link --project-ref <ref>` |
| Apply migrations | `npx supabase db push` |
| Migration status | `npx supabase migration list` |
| Push auth config/templates | `npx supabase config push` |
| Deploy function | `npx supabase functions deploy <name>` |
| Function secrets | `npx supabase secrets set KEY=value` / `secrets list` |

</details>

</details>

---

<a id="part-7"></a>

<details>
<summary><strong>Part 7: Reference: IDs, URLs, files</strong></summary>

<br>

**Identifiers** (none of these are secrets):

| | Vendor Finder | Legend |
| --- | --- | --- |
| Bundle ID / package | `com.vendorfinder.app` | `com.unjadeddigital.legend` |
| Scheme | `vendorfinder` | `legend` |
| Supabase ref | `dpavkiyozlamuqhdemmr` | `krxszvviuqlzxxcvhyss` |
| Supabase URL | `https://dpavkiyozlamuqhdemmr.supabase.co` | `https://krxszvviuqlzxxcvhyss.supabase.co` |
| Supabase dashboard | https://supabase.com/dashboard/project/dpavkiyozlamuqhdemmr | https://supabase.com/dashboard/project/krxszvviuqlzxxcvhyss |
| Auth callback (OAuth) | `https://dpavkiyozlamuqhdemmr.supabase.co/auth/v1/callback` | `https://krxszvviuqlzxxcvhyss.supabase.co/auth/v1/callback` |
| Stripe webhook | `https://dpavkiyozlamuqhdemmr.supabase.co/functions/v1/stripe-webhook` | n/a |
| EAS project ID | *(run `eas init`)* | `9a2a8a94-9199-468a-a479-98c5b1627a54` |
| Privacy policy | *(needed)* | https://unjaded.net/legend/privacy_policy.html |
| Support email | | marlon.unjaded@gmail.com |
| App Store Connect Apple ID (`ascAppId`) | *(after 4.3)* | *(after 4.3)* |
| Apple Team ID | *(Membership details)* | *(Membership details)* |

**Where each secret lives (never in git):**

| Secret | Stored in |
| --- | --- |
| Supabase DB password, service-role/secret key | Password manager; service key auto-injected into Edge Functions |
| Supabase access token (`sbp_`) | CLI login cache / `SUPABASE_ACCESS_TOKEN` in CI |
| Resend API key (`re_`) | Supabase SMTP settings (or shell env for `config push`); password manager |
| Stripe secret + webhook secret | `supabase secrets` |
| Apple ASC API key (`.p8`), APNs key, dist cert | EAS credentials (+ backup in password manager) |
| Android upload keystore | EAS credentials (+ downloaded backup) |
| Google Play service-account JSON | EAS credentials or a file outside the repo |
| Firebase FCM service-account JSON | EAS credentials |

**Related docs in this repo:**

| File | What it covers |
| --- | --- |
| `VendorFinder/SUPABASE_SETUP.md` | VendorFinder DB, auth, Stripe, push quotas in detail |
| `VendorFinder/DEPLOYMENT.md` | Web/PWA export + original TestFlight notes |
| `VendorFinder/NEXT_STEPS.md` | SMTP decision, open follow-ups |
| `LegendNetworkingApp/PLAY_CONSOLE.md` | Play checklist + code-verified Data Safety answers |
| `LegendNetworkingApp/TASKS.md` | Build/release prep log, App Store review readiness |
| `LegendNetworkingApp/Documentation.md` | SDK upgrade notes, Mac mini local builds, store-asset facts |
| `LegendNetworkingApp/supabase/config.toml` | Source-controlled auth config + templates |
| `UnjadedDigital/supabase/README.md` | Template-level Supabase checklist |
| Root `CLAUDE.md` | Node/npm golden rules |

</details>
