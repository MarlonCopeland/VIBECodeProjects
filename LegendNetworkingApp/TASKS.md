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

- [ ] Wire Supabase backend end-to-end (apply 0002 migration to a real
      project, smoke-test CRUD parity with local)
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
        (needs Node 22+ for the built-in `node:sqlite` test driver; the app
        itself still targets Node 18–20, per Expo's own constraint — these
        are decoupled, tests never invoke the Expo CLI)
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
      - [ ] `changes` table + append-on-write, still no network
- [ ] **8.3 Sync engine** — push/pull `changes` against a Supabase
      `changes` table; Realtime for live push between online devices
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
  against `local`, verify against `supabase` in Phase 7.
- Grading is **computed, never stored** — the interaction log is the truth.
- Themed primitives from `src/components` only; colors via `useTheme()`,
  rarity colors only via `TIER_COLORS`.
- New routes live under `app/(app)/…` and inherit the auth gate for free.
- After each phase: `npm run typecheck` must pass; update this file's boxes.
- Node 18–20 only (`nvm use`) — Node 22+ breaks Expo SDK 52's config loader.
