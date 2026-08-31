# Legend — Build Plan (TASKS.md)

> **Purpose of this file:** the single source of truth for building Legend in
> modular phases. Every phase is self-contained and ends in a working app, so
> any session (human or AI) can stop after a phase and the next session can
> resume by reading this file. **Keep the checkboxes updated as work lands.**
>
> **How to resume:** read this file top-to-bottom, then `ARCHITECTURE.md`
> (template design), then run `npm run typecheck` to confirm the tree is
> healthy. Find the first unchecked box and continue. Conventions live in
> [Ground rules](#ground-rules).

## What Legend is

A **user-first human-networking app** — not a social network. There is no feed,
no followers, no algorithmic timeline. The user owns their contact data
outright (full import/export) and the app's job is to tell them, honestly, how
strong and how fresh each relationship is, and to help them act on it.

Built by forking the **UnjadedDigital** Expo + Supabase template (auth,
theming, pluggable backend, feature-flag module system all come free).

### Pillars

1. **Contacts, but better** — alphabetized fast-scroll list that beats the
   iPhone Contacts app; every contact carries *where you met* and a *premise*.
2. **Premise** — the structured "why you know each other": an event, topic,
   expertise, hobby, or interest, plus free-form tags.
3. **Grade** — a computed freshness+strength score with video-game rarity
   colors (Common → Legendary). Interactions raise it; time erodes it.
4. **Circles of Influence** — pick a premise, surface the contacts who match
   it, then reach the whole circle: individual bulk texts, bulk email, or a
   working call list.
5. **User ownership** — one-tap CSV export of everything; CSV and phone-book
   import.

---

## Core specs (decided up front so every phase agrees)

### Domain model

```
Contact      id, ownerId, firstName, lastName, nickname?, company?, title?,
             phones[{label,number}], emails[{label,address}], avatarUrl?,
             whereMet? { placeName, city?, note? }, premises[Premise],
             notes?, favorite, source ('manual'|'device'|'csv'),
             createdAt, updatedAt
Premise      id, kind ('event'|'topic'|'expertise'|'hobby'|'interest'|'place'),
             label, tags[string]           // e.g. kind=event label="NAACP Gala 2026" tags=["civic","fundraiser"]
Interaction  id, contactId, kind ('call'|'text'|'email'|'visit'|'premise'|'note'),
             occurredAt, note?, premiseId?  // 'premise' = engaged their premise
                                            // (attended their event, shared space, etc.)
Circle       id, name, premiseQuery { kinds[], tags[], text? }, pinnedContactIds[],
             excludedContactIds[], createdAt
```

### Grading engine (pure math — `src/features/contacts/grading.ts`)

- Every interaction contributes `weight × 0.5^(ageInDays / 45)` points
  (45-day half-life ⇒ untouched contacts decay naturally; no cron needed —
  score is computed at read time from the interaction log).
- Weights: `visit 15, call 10, premise 8, text 5, email 4, note 2`.
- `score = min(100, round(sum of decayed contributions))`.
- Also expose `freshness` = days since last interaction (∞ if never).

**Rarity tiers** (video-game item colors):

| Tier      | Score  | Color            |
| --------- | ------ | ---------------- |
| Common    | 0–19   | gray `#9AA2B1`   |
| Uncommon  | 20–39  | green `#2FBF71`  |
| Rare      | 40–59  | blue `#4C8BF5`   |
| Epic      | 60–79  | purple `#A855F7` |
| Legendary | 80–100 | gold `#F5A623`   |

### CSV schema (import AND export use the same columns)

```
first_name,last_name,nickname,company,title,phones,emails,where_met_place,
where_met_city,where_met_note,premises,notes,favorite
```
- `phones` / `emails`: `label:value` pairs joined by `;` (e.g. `mobile:+15551234567;work:+15559876543`)
- `premises`: `kind:label:tag|tag` entries joined by `;`
- Interactions export as a **second file** `interactions.csv`
  (`contact_first,contact_last,kind,occurred_at,note`).

### Circle matching

Score each contact against a circle's `premiseQuery`: +3 per matching tag,
+2 per matching kind, +2 text match on premise label, +5 if pinned,
excluded ⇒ out. Sort by match score then grade. Threshold > 0 to appear;
user can pin/exclude to override.

### Bulk outreach (platform truths, so we don't fight the OS)

- **Bulk individual texts:** `expo-sms` only opens ONE compose at a time, so
  the UI is a stepper: "Send 1 of 30 → next" pre-filled per contact. Each send
  logs a `text` interaction. (No mass-SMS API on iOS/Android by design.)
- **Bulk email:** single `mailto:` with all recipients in **BCC** (privacy) or
  the same stepper for individual emails. Logs `email` interactions.
- **Call list:** ordered queue (sorted stalest-first), tap-to-call `tel:`,
  mark done/skip, auto-logs `call` interactions.

### New feature flags

`contacts` (core to Legend — always on), `circles`, `outreach` — registered in
`src/config/features.ts` + `app.config.js`, same pattern as existing flags.
`payments` defaults **off** in `.env.example` for this app.

### New dependencies

`expo-contacts` (device import), `expo-sms` (text stepper),
`expo-file-system` + `expo-sharing` (CSV export), `expo-document-picker`
(CSV import). CSV parsing/serialization is hand-rolled in `src/lib/csv.ts`
(small, no dep).

---

## Phases

### Phase 0 — Fork & rebrand ✅

- [x] Copy `UnjadedDigital` → `LegendNetworkingApp` (minus `node_modules`, `.expo`)
- [x] Rename app: `package.json` name, `.env.example` (`APP_NAME=Legend`,
      `APP_SLUG=legend`, scheme, bundle id), README rewrite
- [x] Keep `UnjadedDigital` namespace in `src/index.ts` re-exported as `Legend`
- [x] `npm install` new deps; `npm run typecheck` passes

### Phase 1 — Domain model & backend ✅

- [x] `src/features/contacts/types.ts` — Contact, Premise, Interaction, Circle,
      input/patch types (single home for domain types)
- [x] Extend `src/backend/types.ts` with `ContactsApi`
      (contacts CRUD + list, interactions log/list, circles CRUD) and add
      `contacts` to the `Backend` interface
- [x] `src/backend/local/localContacts.ts` — AsyncStorage implementation,
      seeded with ~12 demo contacts + interactions spread over time so every
      rarity tier is visible on first run
- [x] `src/backend/supabase/supabaseContacts.ts` — real implementation
- [x] `supabase/migrations/0002_contacts.sql` — tables `contacts`,
      `interactions`, `circles` with owner-scoped RLS (mirror 0001 style)
- [x] Register in both backend objects; typecheck passes

### Phase 2 — Grading engine ✅

- [x] `src/features/contacts/grading.ts` — pure functions:
      `computeGrade(interactions, now) -> { score, tier, freshnessDays }`,
      `TIER_COLORS`, `tierForScore`, interaction weights table
- [x] Deterministic + unit-testable (no Date.now inside; `now` is a param)
- [x] `GradeBadge` component (`src/features/contacts/components/GradeBadge.tsx`)
      — rarity pill + optional freshness caption, theme-aware

### Phase 3 — Contacts module UI ✅

- [x] `src/features/contacts/contactsService.ts` + `ContactsContext.tsx`
      (loads contacts + interactions once, exposes graded/sorted/searchable
      state, refresh, CRUD passthroughs)
- [x] Tab bar rework: **Contacts** becomes the first/home tab
      (`app/(app)/(tabs)/index.tsx`), add **Circles** tab, keep Profile/Settings
- [x] Contact list: SectionList alphabetized by last name, sticky letter
      headers, A–Z fast-scroll rail, search (name/company/premise/tag),
      grade dot on every row — "better than the iPhone app" bar
- [x] Contact detail `app/(app)/contact/[id].tsx`: grade hero, where-met,
      premises, quick actions (call/text/email → auto-log interaction),
      interaction history, "log interaction" sheet
- [x] Add/edit contact `app/(app)/contact/edit.tsx` (new + existing), incl.
      premise editor (kind picker + label + tags) and where-met fields
- [x] Feature manifest `src/features/contacts/index.ts`; register in
      `src/index.ts` modules

### Phase 4 — Import / export ✅

- [x] `src/lib/csv.ts` — RFC-4180-ish parse/serialize (quotes, commas,
      newlines in fields)
- [x] `src/features/contacts/importExport.ts` — contact⇄CSV row mapping per
      the schema above
- [x] Device import: `expo-contacts` permission flow, map name/phones/emails,
      dedupe by normalized phone/email against existing, preview count →
      confirm screen `app/(app)/contacts-import.tsx`
- [x] CSV import via `expo-document-picker` (same dedupe + preview)
- [x] CSV export (contacts.csv + interactions.csv) via expo-file-system +
      expo-sharing share sheet (web: direct download)
- [x] Entry points on the Contacts tab header (Add / Phone / CSV in / CSV out)

### Phase 5 — Circles of Influence ✅

- [x] `src/features/circles/circlesService.ts` — matching per spec, CRUD
- [x] Circles tab `app/(app)/(tabs)/circles.tsx`: list of circles with member
      counts + create button
- [x] Circle builder `app/(app)/circle/edit.tsx`: name, premise query (kinds,
      tags, text), live preview of matching contacts while editing
- [x] Circle detail `app/(app)/circle/[id].tsx`: matched members with grades
      and match reasons, pin/exclude controls, launch outreach actions
- [x] Feature manifest + flag `circles`

### Phase 6 — Bulk outreach ✅

- [x] `src/features/outreach/outreachService.ts` — target resolution (circle →
      contacts with phone/email), interaction auto-logging
- [x] Text blast stepper `app/(app)/outreach/text.tsx`: compose once, send
      1-by-1 via expo-sms with progress ("12 of 30"), skip, auto-log
- [x] Email blast `app/(app)/outreach/email.tsx`: BCC-all mailto or individual
      stepper, auto-log
- [x] Call list `app/(app)/outreach/calls.tsx`: stalest-first queue,
      tap-to-call, done/skip, auto-log
- [x] Feature manifest + flag `outreach`

### Phase 7 — Polish & hardening (NEXT)

- [x] Wire Supabase backend end-to-end (2026-08-04): live project
      **LegendNetworkingApp** (ref `krxszvviuqlzxxcvhyss`, ca-central-1),
      CLI linked, migrations 0001–0004 pushed and verified via
      `supabase migration list`. `.env` set to `APP_BACKEND=supabase` with
      the project URL. **Remaining manual step:** paste the anon key into
      `.env` (`SUPABASE_ANON_KEY=`, from Dashboard → Project Settings → API
      Keys), then smoke-test sign-up + contact CRUD in the app.
- [ ] Import/export entry points in Settings too (currently only on the
      Contacts tab header)
- [ ] "Fading contacts" nudge: settings toggle + local notification when a
      contact is about to drop a tier (uses existing notifications module)
- [ ] Grade weights/half-life user-tunable in Settings (persisted)
- [ ] Empty states, error toasts, loading polish across new screens
- [ ] Update `documentation.md` + README screenshots; delete dead template
      copy that no longer applies
- [ ] Real device pass: contacts permission UX on iOS + Android, SMS stepper
      behavior, share-sheet export

### Phase 8 — Local-first storage & sync

> Design: [`SYNC_DESIGN.md`](./SYNC_DESIGN.md). Goal: a local SQLite database
> is always the source of truth (works fully offline), with sync as an
> optional, encrypted, swappable overlay — Obsidian's vault model, not a
> single either/or backend choice. Each step below keeps the app fully
> functional on its own; sync itself doesn't exist until 8.3, so "sync
> disabled" is true by construction through 8.1–8.2.

- [x] **8.1 SQLite storage layer** (this increment, no network code at all)
  - [x] `SqlDriver` interface (`src/backend/local/sql/types.ts`) — storage
        logic depends on this, never on `expo-sqlite` directly
  - [x] `expoSqlDriver.ts` (on-device) — real driver for the app
  - [x] `test/support/nodeSqlDriver.ts` (better-sqlite3, test-only) — lets
        the actual SQL run against a real engine in plain Node, no emulator
  - [x] `src/lib/hlc.ts` — Hybrid Logical Clock, pure algorithm functions
        unit-tested directly + a thin persisted stateful wrapper
  - [x] Schema (`schema.ts`): `contacts`, `contact_phones`, `contact_emails`,
        `premises`, `interactions`, `circles`, `circle_pins`,
        `circle_excludes`, `meta` — every syncable row carries
        `updated_at` (HLC) + `deleted_at` (tombstone)
  - [x] `sqliteContacts.ts` — full `ContactsApi` implementation; premises
        and circle pins/excludes get real per-item merge (stable ids
        already exist); phones/emails are whole-array replace for now
        (no stable id in `PhoneEntry`/`EmailEntry` yet — see below)
  - [x] Demo seed ported to call the real `ContactsApi` (`seed.ts`), gated
        on a persisted `meta` flag so deleting everything doesn't reseed
  - [x] `localContacts.ts` rewired to the SQLite implementation
  - [x] Unit tests (`vitest`) against the real SQL: HLC ordering, contact
        CRUD + child-table merge + tombstone-hides-from-list, interaction
        log, circle pin/exclude diffing — 28 tests, run with `npm test`
        (needs Node 22+ for the built-in `node:sqlite` test driver — which is
        now the project-wide floor, see Ground rules)
  - [x] Verified: `npm run typecheck` clean, `npx expo export --platform web`
        bundles without error (expo-sqlite resolves fine for web)
  - [ ] Not yet verified: actually opening the app (device or browser) and
        seeing the seeded network render — no emulator and no connected
        browser were available in this environment. See
        [`TESTING.md`](./TESTING.md) for the manual walkthrough that closes
        this gap.
- [ ] **8.2 Oplog groundwork**
  - [ ] Add stable `id` to `PhoneEntry`/`EmailEntry` so phones/emails get
        real per-item merge like premises already do
  - [x] ~~`changes` table + append-on-write~~ — superseded (2026-08-05): the
        tables themselves are the oplog. Every row's `updated_at` HLC is now
        bumped on every change INCLUDING tombstones, and `interactions`
        gained `updated_at` (guarded ALTER + backfill in `schema.ts`), so
        "changed since X" is a plain indexed query. See SYNC_DESIGN.md §2.
- [x] **8.3 Sync engine — BUILT 2026-08-05** (`src/features/sync/`):
      `syncEngine.ts` pull-then-push cycles against the encrypted
      `sync_changes` relay — pull pages by server-id cursor, decrypts,
      HLC-guarded upsert in one transaction (`snapshots.ts`), feeds seen
      stamps into the local clock (`observeHlc`); push encrypts row
      snapshots in chunks (XChaCha20-Poly1305, `vaultCrypto.ts`) under a
      SecureStore-held 32-byte vault key (`vaultKey.ts`, user-transferred
      base64 recovery key links devices; `key_id` fingerprint gives clear
      wrong-key errors and the pull cursor never skips undecryptable rows).
      Triggers: start, foreground, 4s debounce after every mutation
      (`syncScheduler.ts` ← ContactsContext), Realtime INSERTs, manual
      "Sync now" (Settings → Legend Sync, with status, last-synced,
      recovery-key reveal/copy/import UI). `SyncProvider` gates on feature
      flag + Supabase build + per-device toggle + live entitlement check and
      refreshes ContactsContext when remote changes apply. Tests:
      `test/sync.test.ts` (HLC receive rule, base64, merge SQL — 10 cases).
      **Note:** 8.4's "encrypt payloads" landed here too, ahead of schedule;
      what remains of 8.4 is at-rest SQLite encryption. Multi-device E2E on
      real hardware still needs a manual pass (TESTING.md-style walkthrough).
  - [x] **Server groundwork (2026-08-04):** `supabase/migrations/0004` —
        `sync_changes` oplog table (owner_id, device_id, tbl, row_id, hlc,
        jsonb patch; identity id = pull cursor) with RLS requiring an ACTIVE
        sync subscription (paywall enforced in the database), added to the
        Realtime publication. Client engine (push/pull/merge) still to build.
  - [x] **Sync-as-paid-upgrade (2026-08-04):** `subscriptions` table
        (monthly $2.99 / yearly $19.99 — save 44%; RLS lets clients write
        only `source='beta'` rows, so paid rows can only come from future
        server-side receipt validation). New `sync` feature flag +
        `src/features/sync/subscriptionService.ts` + Settings → Legend Sync
        screen: plan cards, free-in-beta unlock (honest copy), per-device
        opt-in toggle (`AppSettings.syncEnabled`, default OFF), cancel.
        Real StoreKit auto-renewing subscription required before charging
        (same App Store constraint as palette IAP).
- [ ] **8.4 End-to-end encryption** — encrypt `patch` payloads client-side
      before they reach the relay (zero-knowledge server); encrypt the
      on-device SQLite file at rest
- [ ] **8.5 Full-vault export/import** — raw SQLite file, optionally
      passphrase-encrypted, hand-off without a server round-trip
- [ ] **8.6 Desktop client (Electron)** — wraps the existing Expo web
      build; adds a `betterSqlite3Driver.ts` implementing the same
      `SqlDriver` interface for real on-device SQLite; mobile-only modules
      (`expo-contacts`, `expo-sms`) simply aren't wired up there

### Backlog (post-MVP ideas, not scheduled)

- [ ] Reminders/recurring cadence per contact ("touch every 30 days")
- [ ] Contact merge tool for import dupes
- [ ] vCard (.vcf) import/export alongside CSV
- [ ] Premise autocomplete from existing tags
- [ ] Grade history sparkline on contact detail
- [ ] Group visit logging ("I saw these 5 people at X event" → one action logs
      a `premise` interaction for all)

---

## Ground rules

- **Screens never touch the backend directly** — always
  `backend.contacts.*` via a service/context (see `ARCHITECTURE.md`).
- Both backends (`local`, `supabase`) must stay contract-identical; develop
  against `local`, verify against `supabase` in Phase 7. **Zero-knowledge
  boundary (2026-08-05):** contacts/relationships live ONLY in the on-device
  SQLite vault — both backend modes share the same local `ContactsApi`, and
  `APP_BACKEND` only chooses where accounts/metrics live. Nothing readable
  about a user's network may ever be written server-side (sync relays
  ciphertext only). See SYNC_DESIGN.md "zero-knowledge server boundary".
- Grading is **computed, never stored** — the interaction log is the truth.
- Themed primitives from `src/components` only; colors via `useTheme()`,
  rarity colors only via `TIER_COLORS`.
- New routes live under `app/(app)/…` and inherit the auth gate for free.
- After each phase: `npm run typecheck` must pass; update this file's boxes.
- **Node 22+ required** (`nvm use` reads `.nvmrc` = 22). Verified 2026-08-12:
  Expo SDK 54 runs fine on 22 and 24, and `node:sqlite` (needed by
  `sqliteContacts.test.ts`) only exists on 22+, so Node 20 silently skips a
  whole test file. The old "Node 18–20 only" rule was an SDK 52 constraint and
  no longer applies. `engine-strict=true` in `.npmrc` enforces the floor.


## Added By Marlon (UX round 1) — implemented 2026-07-30

- [x] **ME tab** — Profile tab renamed "Me" (`person-circle` icon). Your card is
      a regular contact designated as "me" (`AppSettingsContext.meContactId`):
      create one or pick an existing contact on the Me tab. Shows a QR code
      (vCard 3.0 via `react-native-qrcode-svg` — any phone camera adds it
      straight to its contacts), editable through the normal contact editor,
      "ME" badge on its row in the list, and a Settings toggle (default ON)
      that keeps it out of text/email/call blasts.
- [x] **GPS where-met** — new contacts prefill Place/City from
      `expo-location` reverse geocoding (best-effort, silent on deny/failure,
      never clobbers typed text; config plugin + permission copy added).
- [x] **Consolidated + menu** — one + button on Contacts opens a themed
      bottom sheet (`OptionSheet`): New contact / Import from phone / Import
      CSV. CSV export moved to Settings → "Your data". Contact delete warns
      that Legend never touches other sources (phone book, feeds) so the
      contact may return on next import unless removed there too.
- [x] **Multi-number choosers** — contact-detail Call/Text/Email open a
      chooser sheet when the contact has more than one number/email.
- [x] **Sort/filter** — funnel icon right of the search bar: sort by Name /
      Grade / Stalest / Newest, filter by rarity tier (multi) + favorites.
      A–Z rail only shows for the alphabetical sort.
- [x] **Circle-create toast error fixed** — was expo-splash-screen's
      `hideAsync()` re-firing on every navigation (segments were a dep of the
      auth-gate effect). Now hides exactly once. (`testing_images` screenshot)
- [x] **Back button** — chevron-only (`headerBackButtonDisplayMode:
      'minimal'`); no more "(tabs)" label.
- [x] **Logo** — generated brand set in `assets/`: concentric
      circles-of-influence mark in the five rarity colors (gray → gold core)
      on Legend navy. icon (1024 opaque), adaptive-icon, splash + wordmark,
      favicon, white notification icon.
- [x] **Recent contacts view** — All | Recent segment on the Contacts tab;
      Recent sorts by last touch (never-contacted last) with per-row quick
      call/text/email buttons (first number/email; detail screen has the full
      chooser). Settings → Contacts picks which view the tab opens on.
- [x] **Configurable grading + templates + palettes** (2026-07-30) — Settings
      now drives the whole grading engine. `grading.ts` is config-driven
      (`GradingConfig` threaded via `AppSettingsContext.gradingConfig` →
      `ContactsContext`, re-grades live). New Settings screens:
      - **Grading & scoring** (`app/(app)/settings/grading.tsx`) — per-
        interaction weights, decay half-life, per-tier score thresholds,
        disable-decay toggle, reset-to-defaults.
      - **Rarity colors** (`app/(app)/settings/rarity.tsx`) — palette picker.
        Free: Classic, Colorblind-friendly, Monochrome. **Premium ($1.99):**
        Neon, Sunset, Prismatic (animated rainbow shimmer on the hero badge).
        Entitlements in `AppSettings.unlockedPalettes`.
      - **Message templates** (`app/(app)/settings/templates.tsx`) — managed
        named list (text = body; email = subject+body); picked in the text/
        email blast composers via `TemplateButton`.
      Reusable `Stepper` + `OptionSheet` primitives. Tests:
      `grading.test.ts` +5 config cases (31 total pass).
  - [ ] **Premium palette IAP — deferred, needs App Store products.** Unlocks
        are FREE DURING BETA (`paletteStore.purchasePalette` is a no-charge
        stub; UI says so). Real charging requires StoreKit In-App Purchase +
        App Store Connect non-consumable products (iOS forbids Stripe for
        digital goods) + receipt validation. Wire when the store is set up.

- [x] **CSV field-mapping step** (2026-07-30) — CSV import now shows a
      "Match CSV Columns" screen between file-pick and preview: auto-guessed
      mappings (Legend's export maps 1:1; Google/Outlook-style headers matched
      by alias, ALL phone/email columns collected as multi-mappings), sample
      values per column, remap/skip per field, then the unchanged
      dedupe/preview/confirm. Engine is pure + Node-tested:
      `src/features/contacts/csvMapping.ts` + `test/importExport.test.ts`
      (11 tests). Try it with `test-google-format.csv`.
  - [ ] **Phone widget / call-log accuracy — deferred, needs a dev build.**
        A home-screen widget requires a native WidgetKit/Glance extension
        (impossible in Expo Go; needs `expo-apple-targets` or similar +
        EAS build). iOS provides NO API for reading the call/SMS log at all;
        Android gates `READ_CALL_LOG` behind special Play review. So "recent"
        is Legend-logged interactions, which is also the honest definition.
        Revisit alongside the TestFlight/dev-build track.

## Added By Marlon (UX round 2) — implemented 2026-08-03

- [x] **Support section in Settings** — "Report a bug" and "Share a
      suggestion" rows open a prefilled `mailto:marlon.unjaded@gmail.com`
      (subject carries the app version; body template includes platform +
      version). Falls back to a toast with the address if no mail app.
- [x] **Animated splash reveal** — new `src/components/AnimatedSplash.tsx`
      renders an exact copy of the native splash (same image + `#0B0D12`
      background) as an overlay, hides the native splash behind it exactly
      once, then zoom-fades out (350 ms hold → 500–600 ms scale+fade) to
      reveal the app. Replaces the old hard cut in `app/_layout.tsx`.
- [x] **First-run tutorial** — `app/(app)/tutorial.tsx`: four swipeable
      slides (Welcome/ownership, Grades & rarity — pills use the ACTIVE
      palette, Circles of Influence, Outreach) with paging dots, Skip, and
      Next/Get started. Auto-opens once after settings load (gated on new
      persisted `AppSettings.hasSeenTutorial`; trigger in
      `app/(app)/_layout.tsx`), re-viewable via Settings → Support →
      "View the tutorial".
- [x] **Web bundling fix** — `npx expo export --platform web` was failing:
      expo-sqlite's web worker imports `wa-sqlite.wasm` but `.wasm` wasn't in
      Metro's asset extensions. `metro.config.js` now pushes `wasm` onto
      `resolver.assetExts` (per expo-sqlite web docs). Export verified clean.

## Backend & metrics round — implemented 2026-08-04

- [x] **Supabase connected** — see Phase 7 first checkbox (project ref
      `krxszvviuqlzxxcvhyss`; anon key paste is the one manual step left).
      `supabase/config.toml` fixed for CLI 2.x (`enable_confirmations`
      belongs under `[auth.email]`).
- [x] **Account & usage metrics** — `supabase/migrations/0003`:
      sign-up date + last login already native in `auth.users`
      (`created_at` / `last_sign_in_at`); added `profiles.last_seen_at` +
      `profiles.app_opens` rollups, append-only `usage_events` table
      (owner-scoped RLS), and a `record_app_open(platform, version)`
      SECURITY DEFINER RPC. Client: `src/features/metrics/usage.ts` pings it
      once per launch after sign-in (best-effort, silent no-op on the local
      backend). Dashboard queries for DAU/opens are in the migration header.
- [x] **Sync paywall + oplog groundwork** — see Phase 8.3 sub-items.

## Zero-knowledge redesign — implemented 2026-08-05

- [x] **Supabase no longer mirrors the contact graph.** Migration
      `0005_zero_knowledge.sql` drops the plaintext `contacts` /
      `interactions` / `circles` tables from 0002 (they were never reachable
      in production — the anon key was never configured). Postgres now holds
      only: accounts (`auth.users`/`profiles`/`push_tokens`), metrics
      (`usage_events` + rollups), entitlements (`subscriptions`), and two
      ciphertext-only stores.
- [x] **`sync_changes` reduced to an opaque envelope** — `tbl`/`row_id`/
      `patch` columns dropped (which row changed is itself relationship
      metadata); replaced by a single client-side-encrypted `payload` +
      `key_id`. Plaintext keeps only routing: owner, device, HLC, cursor id.
- [x] **`vaults` private storage bucket** for encrypted SQLite vault
      snapshots (256 MB cap, owner-folder RLS, requires active sync sub) —
      backup/new-device bootstrap without replaying the whole oplog.
      Alternatives (iCloud/CloudKit, S3/R2) evaluated in SYNC_DESIGN.md;
      swappable later since the artifact is just an encrypted file.
- [x] **Client:** `supabaseBackend.contacts` now IS the on-device SQLite
      vault (`localContacts`); `supabaseContacts.ts` deleted. Contacts never
      leave the device in plaintext regardless of backend mode.

## Tester-reported fixes

- [x] **Phone import dead-ends after a limited grant (2026-08-11).** Reported:
      pick "Select Contacts…" then share none, and every later import attempt
      shows 0 contacts with no way to recover. Cause: on iOS 18 a *limited*
      grant still reports `status: 'granted'`, so `fetchDeviceContacts` sailed
      past the permission check and returned an empty list — and iOS never
      re-prompts once access is decided, so re-entering the screen failed
      identically forever. Fix: `fetchDeviceContacts` now returns
      `{ inputs, access, sharedCount }` using `permission.accessPrivileges`;
      the import screen has a re-runnable load (`reloadKey`) and a dedicated
      empty state offering **Choose contacts to share**
      (`presentAccessPickerAsync`, iOS 18+), **Try again**, and **Open
      Settings**. The preview screen also gained "Choose more contacts" while
      access is limited, so a partial share can be widened without backing
      out. Nothing had been imported in this state, so retry is always clean.
  - [ ] Not yet verified on hardware: needs a real iOS 18 device: grant
        limited access with zero contacts, confirm the new empty state, then
        widen via the picker and confirm the list repopulates.
- [x] **Login screen said "UnjadedDigital" (2026-08-11)** — template copy on
      `app/(auth)/login.tsx`; the earlier "placeholder copy" pass only checked
      the Settings footer. Now reads "Sign in to your Legend account."

## Build & release prep — 2026-08-11

- [x] **Cloud builds were shipping broken — fixed.** `.env` is gitignored, so
      EAS Build never received it. A `production` build therefore resolved
      `backend: supabase` with `supabaseUrl: ""` and `anonKey: ""`, meaning
      `getSupabase()` would throw at the login screen — and
      `AUTH_GOOGLE/APPLE_ENABLED` fell back to their `true` defaults, putting
      non-functional social buttons in front of a reviewer. Every profile in
      `eas.json` now carries explicit `env` (Supabase URL + anon key, auth
      flags off, pinned `APP_VERSION`). Verified by resolving the config with
      the production profile's env: 0.2.0 / supabase / key present / auth off.
      (The anon key is public by design — it already ships inside every client
      bundle — so committing it to `eas.json` leaks nothing. Move it to
      `eas env:create` if you'd rather manage it server-side.)
- [x] **Version pinned to 0.2.0** across profiles and `.env` (was silently
      1.0.0 in cloud builds, 0.1.0 locally).
- [x] **Permission surface trimmed to what Legend actually uses.**
      `expo-image-picker` no longer requests CAMERA/microphone (the avatar
      flow only calls `launchImageLibraryAsync`); `expo-location` no longer
      declares the "Always"/background strings (we ask when-in-use, once, on
      add-contact); `expo-secure-store` no longer declares Face ID (never used
      with `requireAuthentication`); Android blocks WRITE_CONTACTS (import is
      one-way), CAMERA, and RECORD_AUDIO. Introspected result — iOS declares
      exactly Contacts, WhenInUse location, and Photo Library; Android
      declares READ_CONTACTS, location, storage, INTERNET. No SMS or call-log
      permissions anywhere.
- [x] **Android profiles**: `production` builds an AAB for Play,
      `preview`/`development` build APKs for sideloading. `submit.production`
      targets the Play `internal` track.
- [x] **TestFlight profile now runs on live Supabase** (was the local demo
      backend), so testers exercise real accounts, metrics, and Legend Sync.
- [ ] **Blocked on credentials — must be run by Marlon** (I can't log in or
      handle signing material): `eas login`, then the build/submit commands.
      See the release checklist in README/handover.
  - [ ] Confirm no prior 1.0.0 build exists (`eas build:list`) before shipping
        0.2.0 — App Store Connect won't accept a lower version after a higher
        one.
  - [ ] Apple: create the app record in App Store Connect for
        `com.unjadeddigital.legend`, complete the App Privacy questionnaire,
        and set the privacy-policy URL.
  - [ ] Google Play: create the app, upload the first AAB, complete Data
        Safety (contacts + location + email; note sync payloads are
        end-to-end encrypted), content rating, and App Access test credentials
        (the app is behind a login).

## App Store / TestFlight review readiness

> **Distribution decision (2026-07-30): ship via TestFlight INTERNAL testing
> first.** Internal testing (up to 100 App Store Connect team members) needs
> **no Beta App Review** — none of the blockers below gate getting Legend onto
> our own devices. They only bite for **external** testing (public link, ≤10k)
> or a full App Store release. Checklist kept here so external/release is a
> known quantity, not a surprise rejection.

### 🔴 Hard blockers (Apple rejects) — required before EXTERNAL / release

- [x] **Photo-library permission string.** DONE (2026-08-03): `expo-image-picker`
      added to `app.config.js` plugins with honest `photosPermission` copy, so
      `NSPhotoLibraryUsageDescription` is set on the next prebuild/EAS build.
- [x] **Premium-palette pricing without real IAP** (Guideline 3.1.1). DONE
      (2026-08-03): new `FEATURE_PALETTE_STORE` flag →
      `extra.paletteStoreEnabled` → `PALETTE_STORE_ENABLED` in `env.ts`.
      When off, Rarity Colors shows locked premium palettes as "Coming soon"
      (no price, no Unlock button). `eas.json` forces it **off** for
      `production` (external/release) and **on** for `testflight` (internal);
      dev/.env defaults on. Real StoreKit IAP still deferred (see above).
- [ ] **Privacy policy URL** (mandatory to submit; doubly so because we import
      Contacts). → DONE as content: hosted at
      `unjaded.net/legend/privacy_policy.html`, `PRIVACY.md` in repo, linked
      in-app (Settings). **Remaining is manual, not code:** enter the URL +
      complete the App Privacy "nutrition label" questionnaire in App Store
      Connect.

### 🟡 Should-fix (rejection risk / friction) — before external

- [x] **Social-login buttons are demo stubs on the local backend.** DONE
      (2026-08-03): `env.ts` now forces `GOOGLE_AUTH_ENABLED` /
      `APPLE_AUTH_ENABLED` to false whenever `BACKEND !== 'supabase'`, so
      local/testflight builds are email-only and reviewers can't hit the fake
      OAuth path. Supabase builds still honor the `AUTH_*_ENABLED` env flags.
- [x] **Export-compliance prompt.** DONE (2026-08-03):
      `ios.config.usesNonExemptEncryption: false` added to `app.config.js`.
- [x] **Placeholder copy.** DONE (verified 2026-08-03): footer already reads
      "Legend by Unjaded Digital Products · signed in as …".

### 🟢 Already compliant

- Account **deletion** in-app (Settings → Delete account) — required because
  signup exists (Guideline 5.1.1(v)). ✅
- **Contacts + location** permission strings present and honest; location is
  when-in-use, only on add-contact. ✅
- **Bulk SMS** uses the native composer with per-message user confirmation (the
  stepper) — not silent mass-send. ✅

### For the reviewer (when we go external)

- The TestFlight build runs on the **live Supabase backend** (changed
  2026-08-11), so sign-up needs a real email and email confirmation is ON.
  Provide App Store Connect / Play Console reviewers with a working test
  account — they cannot get past the login screen otherwise.