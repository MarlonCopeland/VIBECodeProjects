# Local-First Storage & Sync — Design

> Companion to [`TASKS.md`](./TASKS.md) Phase 8. This is the design that
> phase implements, in order, with the local-only storage layer landing
> first and fully tested *before* any network/sync code is written.

## Why the current setup doesn't fit

Legend's `Backend` contract already has two implementations — `local`
(demo, in-memory/AsyncStorage) and `supabase` (real network backend) —
chosen once via `APP_BACKEND` and never both. That's an either/or, not what
we actually want: **a device that works fully offline, whose local data is
always authoritative, that can optionally reconcile with a server and other
devices when connectivity allows.**

## The model: Obsidian's vault, translated

Obsidian's trick isn't clever sync — it's that the vault is just files on
disk, so the app never *requires* a server to function. Sync (their paid
service, or Syncthing/iCloud/git as DIY alternatives) is a background
process that reconciles changes; it's swappable and optional because the
local files are already complete and correct on their own. Three properties
fall out of that, and are the goals for Legend:

1. **Local-first, not local-only.** Every read/write hits local storage
   immediately; network is never on the critical path.
2. **Sync is a transport, not an architecture.** Swapping the sync
   mechanism shouldn't change the app above the storage layer.
3. **Privacy is structural, not a policy.** A sync relay should only ever
   see encrypted blobs, never plaintext contact data.

Legend's "vault" is a local SQLite database, always present, always what
the app reads from. Sync is a background reconciler layered on top.

## The four layers

### 1. Storage — SQLite, not an AsyncStorage blob

The old `localContacts.ts` kept one JSON blob and rewrote the whole thing on
every mutation — fine for a demo, not viable for sync (no per-row
versioning, no partial writes, no diffing). Real tables instead, mirroring
`supabase/migrations/0002_contacts.sql`, with three extra columns on every
syncable table:

```
id            uuid   -- client-generated, stable across devices
updated_at    text   -- Hybrid Logical Clock stamp (see below)
deleted_at    text?  -- tombstone instead of DELETE, so deletes can sync
```

`phones`, `emails`, and `premises` are normalized into their own tables
(each row with its own id + `updated_at`) rather than JSON arrays on the
contact row — otherwise two devices each adding a different phone number
offline would have one array-replace clobber the other's addition.

**Where this lands today:** `phones`/`emails` don't yet have a stable
per-item id in the domain model (`PhoneEntry`/`EmailEntry`), so those two
are still whole-array replace under the hood (delete-and-reinsert on every
edit) even though they live in normalized tables. `premises` already carry
an `id`, so they get real upsert-by-id merge. Circle pins/excludes are
keyed by `contact_id`, which is already stable, so they get real per-item
merge too. Giving phone/email entries their own ids is a small, contained
follow-up (Phase 8.2) — noted here rather than silently glossed over.

### 2. Change tracking — the tables ARE the oplog (built 2026-08-05)

The original sketch had a separate local `changes` table appended on every
write. The built engine (`src/features/sync/`) does something simpler that
falls out of the schema: every syncable row already carries an HLC
`updated_at` (bumped on EVERY change, tombstones included) and a
`deleted_at` tombstone — so "changes since X" is just `WHERE updated_at >
X`, and a change record is a row snapshot. No second write path, no oplog
table to keep consistent. Ordering across devices without a central clock
uses a **Hybrid Logical Clock** — wall-clock milliseconds plus a per-device
logical counter plus a device id for tie-breaking — so merges stay correct
even when two phones' clocks are a few seconds apart; pulling also feeds
observed stamps back into the local clock (`observeHlc`, the HLC receive
rule) so local writes always order after everything already seen.

`Interaction` is already a pure append-only log — grades are computed from
it, never stored, and nothing ever mutates an existing interaction. That
entity needs no conflict resolution at all: two devices' interaction lists
just union by id. That's the easy 80% of the sync problem, and it's already
built correctly. Only `contacts` and `circles` are mutable records that
need real merge logic.

### 3. Sync engine — push/pull through Supabase (built 2026-08-05)

`syncEngine.ts`: each cycle PULLs relay rows after a server-id cursor
(skipping this device's own), decrypts, applies snapshots in one
transaction, then PUSHes local rows newer than an HLC cursor, encrypted in
chunks of 200. The first push (empty cursor) uploads everything; afterwards
each device only pushes rows whose latest write carries its own device id,
which is what stops pulled rows from echoing back forever. Triggers: app
start, foreground, a 4s-debounced hook after every local mutation
(`syncScheduler`), Supabase Realtime INSERT events from other devices, and
a manual "Sync now". Every payload is sealed with XChaCha20-Poly1305
(`vaultCrypto`) under a 32-byte vault key generated on-device and kept in
the Keychain (`vaultKey`); linking a second device means the USER transfers
the base64 recovery key (Settings → Legend Sync) — the server can't, by
design. A `key_id` fingerprint on each relay row turns "wrong key" into a
clear error instead of garbage, and the pull cursor never advances past a
row it can't decrypt.

### 4. Conflict resolution — field-level last-write-wins

With HLC timestamps, merging is mechanical: each field (or normalized child
row) carries its own `updated_at`; higher HLC wins per field on merge — not
a whole-record decision, so two devices editing different fields of the
same contact offline don't lose either edit. Deletes are tombstones with
their own HLC; a delete beats an older edit, a newer edit resurrects a row
deleted before it. This is deliberately not a full CRDT library
(Automerge/Yjs) — one person editing their own address book, mostly on one
device at a time, doesn't have the concurrent-structural-edit problem those
solve, and field-level LWW is a fraction of the complexity for the same
correctness in this domain.

## The zero-knowledge server boundary (decided 2026-08-05)

The original Supabase schema (migration 0002) mirrored the contact graph in
Postgres — plaintext `contacts` / `interactions` / `circles` tables the
operator could read. That contradicted everything above, and it's gone
(migration 0005 dropped the tables; `supabaseContacts.ts` deleted). The
server-side split is now:

| Concern                            | Where it lives                             | Operator can read? |
| ---------------------------------- | ------------------------------------------ | ------------------ |
| Accounts (sign-up, last login)     | `auth.users`, `profiles`, `push_tokens`    | yes — account data |
| Usage metrics / stability          | `usage_events`, profile rollups            | yes — telemetry    |
| Sync entitlement (paid upgrade)    | `subscriptions`                            | yes — billing      |
| Contact graph                      | **on-device SQLite vault ONLY**            | **no — never sent**|
| Sync oplog (opt-in, paid)          | `sync_changes` — encrypted `payload` only  | **no — ciphertext**|
| Vault snapshots (opt-in, paid)     | `vaults` storage bucket — encrypted blobs  | **no — ciphertext**|

Concretely, `sync_changes` no longer even has `tbl`/`row_id`/`patch`
columns — which table and row a change touches is itself relationship
metadata, so the whole change record is encrypted client-side into one
opaque `payload` (base64 nonce+AEAD ciphertext, key derived on-device,
never sent to the server). Plaintext keeps only what routing needs:
`owner_id`, `device_id`, `hlc`, and the server-assigned cursor `id`.
Both backend modes (`local`, `supabase`) now use the same on-device
`ContactsApi`; APP_BACKEND only chooses where *accounts* live.

**Where the vault blob itself can be held** (for backup/bootstrap, all as
ciphertext the relay can't open):

1. **Supabase Storage `vaults` bucket** (built, migration 0005) — private,
   owner-folder RLS, gated on the sync subscription. Chosen default: one
   platform, one bill, and zero-knowledge is preserved because encryption
   happens before upload — Supabase being able to *hold* the file is fine
   precisely because it can't *read* it.
2. **User-owned cloud (iCloud/CloudKit private DB, Google Drive)** — the
   Obsidian-purist option; the operator never even hosts ciphertext. Free
   quota rides on the user's account. Costs per-platform integration work,
   and iOS device backups already cover the single-device restore case.
3. **Any S3-compatible bucket (R2/S3/B2)** — same properties as (1) with
   more knobs; only worth it if egress pricing or Supabase limits bite.

(2) and (3) remain compatible later because the uploaded artifact is just
an encrypted file — the storage target is swappable transport, exactly like
the sync relay itself.

## Privacy and portability

- **At rest:** encrypt the SQLite file itself (SQLCipher, or a key held in
  `expo-secure-store`, which the template already uses for auth sessions).
- **In transit / at the relay:** encrypt each change's `patch` payload
  client-side before it's pushed to the `changes` table, so Supabase (or
  whatever Postgres is on the other end) only ever stores ciphertext —
  zero-knowledge, matching Obsidian Sync's model.
- **Bring-your-own-backend:** sync is "push/pull an oplog over Postgres +
  websocket" — point `SUPABASE_URL` at any Postgres with the same `changes`
  table and it works, no lock-in to one project.
- **Full-vault export:** the CSV export already built covers "give me my
  data in a portable format." A one-tap export of the raw SQLite file
  (optionally passphrase-encrypted for transport) is the stronger,
  Obsidian-vault-style version — two devices could hand off the entire vault
  over AirDrop/USB and never touch a server.

## Build vs. buy

PowerSync and ElectricSQL are purpose-built for exactly this pattern
(SQLite on-device, automatic bi-directional sync against Postgres/Supabase)
and would cut a lot of the sync-engine code below. The tradeoff is a
third-party dependency in the sync path, and you'd need to verify it
supports client-side E2E encryption before ciphertext leaves the device —
the custom oplog approach above gets that guarantee outright rather than
needing to check for it. Given how much of the hard design work is already
done (the `ContactsApi` abstraction, the append-only interaction log), the
custom path is a modest addition, not a rewrite.

## Desktop client (Electron)

A Windows/Mac client that the mobile app syncs with fits the same
architecture with one more storage backend, not a second app:

- Legend's business logic (`grading.ts`, `circlesService.ts`,
  `importExport.ts`, all screens) is plain TypeScript / RN-web-compatible
  already — Electron just puts a native window around the existing Expo web
  build.
- Electron bundles a real Node process, so the desktop client gets **actual
  SQLite** (`better-sqlite3`) rather than a browser workaround — a second
  implementation of the same `SqlDriver` interface the storage layer is
  built against below, alongside the on-device `expoSqlDriver.ts`.
- Mobile-only modules (`expo-contacts`, `expo-sms`) simply aren't wired up
  on desktop — phone-book import and text blasts don't make sense there
  anyway. Contacts, circles, CSV import/export, and email/call outreach
  (`mailto:`/`tel:` links) all work unchanged.
- Tauri is lighter-weight but has no bundled Node, so the SQLite/business
  logic would need a Rust bridge or sidecar — worth reconsidering only if
  Electron's resource footprint becomes a real complaint later.

## Why the storage layer is built the way it is (dependency inversion)

`sqliteContacts.ts` — the actual `ContactsApi` implementation — depends only
on a small `SqlDriver` interface (`execAsync`/`runAsync`/`getAllAsync`/
`getFirstAsync`/`withTransactionAsync`) and an injected clock
(`nextHlc(): Promise<string>`) and id generator, never on `expo-sqlite`
directly. That means:

- **On-device (phone):** `expoSqlDriver.ts` wraps `expo-sqlite`.
- **On-device (future Electron desktop):** a `betterSqlite3Driver.ts` would
  wrap `better-sqlite3` directly — the same interface, a real second
  implementation, not a test-only shim.
- **In tests:** `test/support/nodeSqlDriver.ts` wraps `better-sqlite3`
  in-memory, so the actual SQL in `sqliteContacts.ts` runs against a real
  SQLite engine in plain Node — no RN runtime, no emulator, no mocking —
  and still exercises the exact same code path that runs on-device.

The Hybrid Logical Clock (`src/lib/hlc.ts`) follows the same split: pure
algorithm functions (`serializeHlc`, `parseHlc`, `compareHlc`,
`advanceClock`) with zero imports, unit-tested directly, plus a thin
stateful wrapper (`nextHlc`) that persists device id + clock state via
`AsyncStorage` for the real app to call.

## Phase 8 status

See `TASKS.md` for the authoritative checklist. Summary: **8.1 (this
increment)** — SQLite storage, HLC, normalized child tables, tombstones,
the `SqlDriver` abstraction, and unit tests against a real SQLite engine —
is built with **no sync code at all**, i.e. sync is "disabled" in the
strongest possible sense: it doesn't exist yet. Everything after (oplog,
push/pull engine, Realtime, encryption, full-vault export, Electron client)
is future work, each step keeping the app fully functional on its own.
