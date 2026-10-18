# Legend Full Suite — purchase → emailed desktop download

Legend Desktop (`../../LegendDesktop`) is sold as **Legend Full Suite**: a
one-time (non-consumable) in-app purchase in the phone app. Buying it emails
the download links and unlocks the desktop app for that Legend account.

```
 phone (expo-iap)                Edge Functions (service role)            Apple / Google
 ────────────────                ─────────────────────────────            ──────────────
 Buy → store sheet  ──purchase──▶ verify-purchase ──re-check token──────▶ App Store Server API
   (bound to the Legend user id:   │  (client token only says WHICH        Play Developer API
    appAccountToken / obfuscated   │   purchase; the answer comes from
    AccountId)                     │   the store over TLS)
                                   ├─ upsert purchases (RLS: clients read, never write)
                                   ├─ download_grants token
                                   └─ Resend email: per-OS links ─────────▶ user's inbox
 finishTransaction ◀──── ok ───────┘
                                  desktop-download?t=…&os=…  (link in the email)
                                   └─ grant + purchase still active? → 302 to a
                                      5-minute signed URL in the private
                                      `desktop-releases` bucket (newest version)
 Settings → "Email me the link" ─▶ send-download-link (rate-limited, 5 min)
 Legend Desktop sign-in ─────────▶ has_full_suite() RPC (SuiteGate)
                                  store-notifications ◀── refunds/revokes (ASSN v2, Play RTDN)
                                   └─ purchase → refunded, grant revoked
```

| Function | Auth | Purpose |
| --- | --- | --- |
| `verify-purchase` | user JWT | Verify with the store, record, email the link on the first purchase |
| `send-download-link` | user JWT | Re-send the email (5-minute cooldown) |
| `desktop-download` | grant token in the URL | Redirect to the newest installer for that OS |
| `store-notifications` | store re-verification / `STORE_WEBHOOK_SECRET` | Refunds and revocations |

Schema: `migrations/0006_full_suite.sql` (`purchases`, `download_grants`,
`desktop_releases`, `has_full_suite()`, private `desktop-releases` bucket).
Nothing here touches contact data — the zero-knowledge boundary holds.

## One-time setup

### 1. Store products
- **App Store Connect** → Legend → In-App Purchases → **Non-Consumable**,
  product ID `com.unjadeddigital.legend.fullsuite`.
- **Play Console** → Legend → Monetize → **In-app products** (one-time),
  product ID `full_suite`.
- Different IDs? Set `FULL_SUITE_PRODUCT_ID_IOS` / `_ANDROID` in the app's
  `.env` / `eas.json` AND the `FULL_SUITE_PRODUCT_IDS` secret below.

### 2. Server credentials (Edge Function secrets)

```powershell
cd LegendNetworkingApp
npx supabase@2 secrets set `
  APPLE_IAP_KEY_ID=… APPLE_IAP_ISSUER_ID=… APPLE_BUNDLE_ID=com.unjadeddigital.legend `
  ANDROID_PACKAGE_NAME=com.unjadeddigital.legend `
  RESEND_API_KEY=re_… EMAIL_FROM="Legend <downloads@YOUR-VERIFIED-DOMAIN>" `
  STORE_WEBHOOK_SECRET=<any long random string>
# multi-line values from files:
npx supabase@2 secrets set APPLE_IAP_PRIVATE_KEY="$(Get-Content -Raw .\SubscriptionKey_XXXX.p8)"
npx supabase@2 secrets set GOOGLE_SERVICE_ACCOUNT_JSON="$(Get-Content -Raw .\play-service-account.json)"
```

- **Apple**: App Store Connect → Users and Access → Integrations →
  **In-App Purchase** → generate a key (`.p8`, key ID, issuer ID).
- **Google**: Google Cloud service account with the Android Publisher API
  enabled; invite it in Play Console → Users and permissions with *View
  financial data* and *Manage orders and subscriptions*.
- **Resend**: the same Resend account that sends Legend's auth email (set in
  the Supabase dashboard SMTP settings) — create an **API key** for the
  REST API, and use a `from` address on the domain verified there.

### 3. Store notifications (refunds)
- **Apple**: App Store Connect → App Information → App Store Server
  Notifications → **Version 2**, Production + Sandbox URL:
  `https://krxszvviuqlzxxcvhyss.supabase.co/functions/v1/store-notifications`
- **Google**: Play Console → Monetization setup → Real-time developer
  notifications → a Pub/Sub topic; add a **push** subscription to:
  `https://krxszvviuqlzxxcvhyss.supabase.co/functions/v1/store-notifications?key=<STORE_WEBHOOK_SECRET>`

### 4. Deploy

```powershell
npx supabase@2 db push            # applies 0006_full_suite.sql
npx supabase@2 functions deploy verify-purchase send-download-link desktop-download store-notifications
```

### 5. Publish installers
On each OS: `cd LegendDesktop; npm run dist`. Then, with the service-role
key in the environment: `npm run publish:release`. Download links always
serve the newest published version per OS — existing emails keep working.

### 6. Phone build
`expo-iap` is a native module: build with EAS (`eas build --profile
development` for testing). Expo Go shows "purchases aren't available in this
build". Test with an App Store **Sandbox** account / Play **license tester**.

## Testing without a store

`npm run seed:test-users` gives the `legend-suite` test account a
`platform = 'grant'` purchase, so the desktop app opens and "Email me the
download link" sends a real email (once Resend is configured) — no store
involved. To grant a real person manually, insert a `purchases` row with
`platform = 'grant'` via the SQL editor, then have them tap "Email me the
download link".

Typecheck / unit tests (no Deno install needed):

```powershell
cd supabase/functions
npx -y deno@2 check verify-purchase/index.ts send-download-link/index.ts desktop-download/index.ts store-notifications/index.ts
npx -y deno@2 test _shared/stores.test.ts
```
