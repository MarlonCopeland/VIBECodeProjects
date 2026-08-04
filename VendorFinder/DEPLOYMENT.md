# Deployment — Apple TestFlight & Web/PWA

Two distribution paths are supported from one codebase:

- **Web / PWA** (recommended first step — Stripe billing is allowed here).
- **iOS TestFlight** via EAS Build.

Complete [`SUPABASE_SETUP.md`](SUPABASE_SETUP.md) first so the app has a real
backend.

---

## A. Web / PWA

The app already ships a PWA manifest (`app.config.js → web`).

```bash
# Build static site
npx expo export --platform web --output-dir dist

# Preview locally
npx serve dist
```

Host `dist/` anywhere static (Vercel, Netlify, Cloudflare Pages, S3). Then:

1. Set `WEB_BASE_URL` in your build env to the deployed URL (used for Stripe
   Checkout success/cancel returns).
2. Add that URL to Supabase **Authentication → URL Configuration → Redirect URLs**.
3. Re-export and redeploy.

Users can "Add to Home Screen" to install the PWA. Stripe subscriptions work
fully on web (no Apple IAP restriction).

---

## B. iOS TestFlight (EAS Build)

### B1. One-time setup
```bash
npm install -g eas-cli
eas login
eas init                       # creates/links an EAS project, fills EAS_PROJECT_ID
```
Put the printed project id in your env as `EAS_PROJECT_ID` (app.config.js reads it).

You need an **Apple Developer account** ($99/yr). EAS can manage signing
credentials for you.

### B2. Configure secrets for the build
TestFlight builds use `APP_BACKEND=supabase`. Provide the public values as EAS
environment variables/secrets (never commit them):

```bash
eas secret:create --scope project --name SUPABASE_URL --value https://xxxx.supabase.co
eas secret:create --scope project --name SUPABASE_ANON_KEY --value <anon key>
eas secret:create --scope project --name STRIPE_PUBLISHABLE_KEY --value pk_live_...
eas secret:create --scope project --name STRIPE_PRICE_TIER1 --value price_...
eas secret:create --scope project --name STRIPE_PRICE_TIER2 --value price_...
eas secret:create --scope project --name STRIPE_PRICE_TIER3 --value price_...
eas secret:create --scope project --name WEB_BASE_URL --value https://your-domain
```
(`eas.json` already sets `APP_BACKEND=supabase` for the `production` profile.)

### B3. Build
```bash
eas build --platform ios --profile production
```
EAS will prompt to create signing credentials and an APNs key (say yes — this
enables push). When done you get an `.ipa` hosted by EAS.

### B4. Submit to TestFlight
Fill in `eas.json → submit.production.ios` with your `appleId`,
`ascAppId` (App Store Connect app id), and `appleTeamId`, then:
```bash
eas submit --platform ios --profile production --latest
```
Or upload the `.ipa` manually via **Transporter**.

### B5. In App Store Connect
1. Create the app record (bundle id `com.vendorfinder.app`).
2. After the build finishes processing, add it to a **TestFlight** group.
3. Fill in **Test Information** (what to test, contact email).
4. Invite testers by email or via a public link.

### B6. Replace placeholder assets before submitting
`assets/icon.png`, `adaptive-icon.png`, `splash.png`, `favicon.png` are
placeholder solid-color images. Replace with real artwork:
- icon: 1024×1024 PNG, no transparency.
- splash: any large PNG (e.g. 1284×2778).

---

## C. Apple review gotcha (important)

The current build uses **Stripe** for subscriptions. Apple's guideline 3.1.1
requires **In-App Purchase** for digital subscriptions consumed in the iOS app.
Options:

1. **Web/PWA first** (no review needed) — recommended while validating.
2. **Add Apple IAP** before public iOS release. The payment layer is pluggable:
   add an `AppleIapProvider` implementing `PaymentProvider` in
   `src/features/payments/`, select it for `ios` in `src/features/payments/index.ts`,
   and keep Stripe for web. No UI/business-logic changes required.

TestFlight (internal testing) is more lenient than full App Store review, so you
can test the end-to-end build there first.

---

## D. Bundle/version bumps

- iOS build number auto-increments (`eas.json → production.autoIncrement`).
- App version is in `app.config.js → version`.
