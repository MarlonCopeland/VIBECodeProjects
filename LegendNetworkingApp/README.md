# Legend

A **user-first human-networking app** — not a social network. Legend gives you
outright ownership of your contacts and tells you, honestly, how strong and
how fresh every relationship is.

Built by forking the [UnjadedDigital](../UnjadedDigital) Expo + Supabase
template (auth, theming, pluggable backend, and the feature-flag module system
all come from it — see its README/ARCHITECTURE for template internals).

> **Build plan:** [`TASKS.md`](./TASKS.md) is the source of truth for what's
> done and what's next. Update it as work lands.

## What it does

- **Contacts, but better** — alphabetized list with sticky letter headers, an
  A–Z fast-scroll rail, and search across name, company, premise, and tags.
  Every contact carries **where you met** and a **premise** (the event, topic,
  expertise, hobby, or interest you know them through).
- **Grades with rarity colors** — every contact has a computed 0–100 score
  shown as a video-game rarity tier:
  Common (gray) → Uncommon (green) → Rare (blue) → Epic (purple) →
  **Legendary (gold)**. Calls, texts, emails, visits, and premise engagement
  raise it; time erodes it (45-day half-life). Grades are always computed from
  the interaction log — never stored, never gameable by editing a number.
- **Circles of Influence** — save a premise query (kinds + tags + free text)
  and Legend surfaces every matching contact, with pin/exclude overrides.
  Then act on the whole circle:
  - **Text blast** — individual texts, one composer at a time (no group thread).
  - **Email blast** — one BCC email, or personalized one-by-one.
  - **Call list** — a stalest-first phone queue with tap-to-call.
  Every send/call is logged automatically and feeds the grade.
- **You own the data** — import from the phone book or CSV (with duplicate
  detection and a preview/confirm step), export everything to
  `contacts.csv` + `interactions.csv` any time.

## Quick start

> **Node 18–20 only** (`nvm use`) — Node 22+ breaks Expo SDK 52's config loader.

```bash
nvm use
npm install
cp .env.example .env      # defaults to the local demo backend
npm run start             # press w / i / a for web / iOS / Android
```

The default `.env` uses `APP_BACKEND=local` with a seeded demo account and a
demo network spanning every rarity tier:

```
email:    demo@unjadeddigital.com
password: Password1
```

For a real backend, set `APP_BACKEND=supabase` + `SUPABASE_URL` /
`SUPABASE_ANON_KEY` and apply `supabase/migrations/0001_init.sql` and
`0002_contacts.sql` — see [`supabase/README.md`](./supabase/README.md).

## Project structure (Legend-specific)

```
src/features/contacts/     Domain types, grading engine, ContactsContext,
                           CSV/device import-export, GradeBadge
src/features/circles/      Premise-query matching
src/features/outreach/     SMS / email / call helpers (platform-realistic)
src/backend/local/localContacts.ts        ContactsApi (demo, AsyncStorage)
src/backend/supabase/supabaseContacts.ts  ContactsApi (real)
supabase/migrations/0002_contacts.sql     contacts/interactions/circles + RLS
app/(app)/(tabs)/index.tsx                Contacts tab (home)
app/(app)/(tabs)/circles.tsx, circle/…, contact/…, outreach/…, contacts-import.tsx
```

Everything else (auth, profile, settings, theming, backend switching) is
inherited from the template — feature flags in `.env` turn modules on/off.

## Scripts

| Command             | What it does              |
| ------------------- | ------------------------- |
| `npm run start`     | Start the Expo dev server |
| `npm run typecheck` | `tsc --noEmit`            |
