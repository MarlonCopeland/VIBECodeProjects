# Google Play Console setup — Legend

Working checklist for getting Legend onto Play's **Internal testing** track.
Everything here is derived from the code as of 2026-08-14, not from memory —
the Data Safety answers in particular, since a wrong one there is grounds for
removal later.

App identity:

| Field | Value |
| --- | --- |
| Package name | `com.unjadeddigital.legend` |
| App name | Legend |
| Version | 0.2.0 (versionCode managed remotely by EAS) |
| Privacy policy | https://unjaded.net/legend/privacy_policy.html (verified live) |
| Category | Productivity (Business is also defensible) |
| Support email | marlon.unjaded@gmail.com |

## 1. Prerequisites you must do yourself

- A **Google Play Console developer account** ($25 one-time). Accepting the
  developer agreement and paying is yours to do — I can't accept terms or
  enter payment details.
- Create the app in the console: package `com.unjadeddigital.legend`, default
  language, "App" (not game), "Free".

## 2. Assets

Generated and ready in `store/`:

- `store/icon-512.png` — 512x512 store icon
- `store/feature-graphic.png` — 1024x500 feature graphic

**Still needed: 2-8 phone screenshots.** Play requires a minimum of two, and
they must be real captures (16:9 or 9:16, min 1080px on the long edge). Grab
them from an emulator or device — the Contacts list with grades, a contact
detail with the grade hero, a Circle, and Settings all show well.

## 3. Data Safety form — code-verified answers

Every server touchpoint in the app:

| What leaves the device | Where it goes | When |
| --- | --- | --- |
| Email + password | `auth.users` | Sign-up / sign-in |
| Display name, avatar URL | `profiles` | Profile edit |
| Profile photo | `avatars` storage bucket (**public bucket**) | Avatar upload |
| Push token | `push_tokens` | Only if notifications enabled |
| Platform + app version + timestamp | `usage_events` via `record_app_open` | App open |
| Subscription plan/status | `subscriptions` | Legend Sync purchase |
| **Encrypted** change payloads | `sync_changes` | Only when Sync is ON |

Declare **collected**:

- **Personal info -> Name** (display name). Optional. Purpose: App functionality,
  Account management.
- **Personal info -> Email address**. Required. Purpose: App functionality,
  Account management.
- **Photos and videos -> Photos** (avatar). Optional. Purpose: App functionality.
  Note: the `avatars` bucket is **public** — anyone with the URL can view an
  avatar. Consider making it private before external release.
- **App activity -> App interactions** (app-open events). Required. Purpose:
  Analytics.
- **Device or other IDs** (push token). Optional. Purpose: App functionality.

**Contacts — the important nuance.** With Sync OFF (the default) the contact
graph never leaves the device, so nothing to declare. With Sync ON, contact
changes ARE transmitted — as ciphertext the server cannot read. Google counts
transmitted-off-device as collected regardless of encryption, so declare
**Contacts -> Contacts**, Optional, Purpose: App functionality, and note the
end-to-end encryption in the security section. Do not claim contacts are never
collected.

Answers to the standard questions:

- Is data encrypted in transit? **Yes** (HTTPS everywhere; sync payloads are
  additionally end-to-end encrypted).
- Can users request data deletion? **Yes** — in-app: Settings -> Delete account
  (`delete_own_account` RPC). Provide the same URL as the privacy policy for
  the deletion-request field.
- Is any data shared with third parties? **No.**

## 4. Permissions Play will show

From the introspected manifest: `READ_CONTACTS`, `ACCESS_COARSE_LOCATION`,
`ACCESS_FINE_LOCATION`, `READ_EXTERNAL_STORAGE`, `WRITE_EXTERNAL_STORAGE`,
`INTERNET`. No SMS or call-log permissions. `WRITE_CONTACTS`, `CAMERA`, and
`RECORD_AUDIO` are explicitly blocked in `app.config.js` because the app does
not use them.

Location is when-in-use only, one shot, on the add-contact screen, to prefill
where you met.

## 5. App access (required — Legend is login-gated)

Reviewers cannot get past the login screen. Under **App access -> All or some
functionality is restricted**, give them a working account. Note the TestFlight
/ production build runs on live Supabase with email confirmation ON, so create
the reviewer account yourself and hand over the credentials rather than
expecting them to sign up.

## 6. Upload and release

The current AAB (`versionCode 2`) predates the password-reset fix. Build fresh
from `main`:

    npx eas-cli build --profile production --platform android

Play requires the **first** AAB to be uploaded through the console by hand.
Create an **Internal testing** release, upload the `.aab` from the build page,
add testers by email, and roll out. Internal testing is available immediately —
it skips the 12-testers-for-14-days requirement that gates production for new
personal developer accounts.

## 7. Automating submissions afterwards

Once the app exists in the console:

1. Google Cloud -> the project linked to Play -> create a **service account**,
   grant it Play Developer API access, download the JSON key.
2. In Play Console -> Users and permissions, invite that service account and
   grant release permissions.
3. Save the key outside git (it is a real secret) and add to `eas.json` under
   `submit.production.android`:

       "serviceAccountKeyPath": "../legend-play-service-account.json"

4. From then on: `npx eas-cli submit --profile production --platform android`

## Open items

- [ ] Play developer account + app created
- [ ] Phone screenshots captured
- [ ] Data Safety form completed per section 3
- [ ] Content rating questionnaire
- [ ] Target audience (18+ recommended; the app has no child-directed content)
- [ ] Reviewer test account created and entered under App access
- [ ] Fresh AAB built from main and uploaded
- [ ] Service account JSON for automated submits
- [ ] Consider making the `avatars` bucket private before external release
