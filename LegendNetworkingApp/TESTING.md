# Testing Phase 8.1 (SQLite storage) by hand

This is the manual verification `TASKS.md` Phase 8.1 still needs — no
emulator or connected browser was available in the environment that built
it, so the automated tests (`npm test`, 28 passing) prove the SQL and merge
logic are correct, but nobody has actually watched the app render seeded
contacts on a real device yet. That's what this walks through.

Each scenario has a **do this** / **expect this**. If what you see doesn't
match, stop and report it rather than continuing — later scenarios build on
earlier ones.

## 0. Setup

```bash
nvm use 20
cd path/to/LegendNetworkingApp
npm install                 # if you haven't already
cp .env.example .env         # if you don't already have a .env
```

`.env`'s default `APP_BACKEND=local` is what you want — that's the SQLite
implementation this is testing (not Supabase).

### Run the automated suite first (fast, no app needed)

```bash
nvm use 22
npm test                     # expect: 3 test files, 28 passed
nvm use 20
npm run typecheck            # expect: no output, exit 0
```

The `test` script needs Node 22 for the built-in `node:sqlite` module the
tests use as a stand-in for expo-sqlite (see `SYNC_DESIGN.md`); the app
itself stays on Node 20 per Expo's own constraint. If either fails, the
manual steps below aren't worth doing yet — fix that first.

## 1. Launch and sign in

```bash
nvm use 20
npm run web       # fastest to test with; or `npm start` and press i/a for
                   # a physical device via Expo Go (scan the QR code)
```

Sign in with the seeded demo account:

```
email:    demo@unjadeddigital.com
password: Password1
```

**Expect:** the Contacts tab loads with **12 seeded contacts**, alphabetized,
each with a colored grade dot. If the list is empty or the app errors here,
stop — that's the core SQLite wiring not working and nothing past this
point will either.

**Check the rarity spread:** open a few contacts and confirm you see a
range of tiers, not all the same color — Andre Whitfield should be
Legendary/Epic (gold/purple), Jamal Pierce or Yvette Sandoval should be
Common (gray). This confirms the grading engine is reading real interaction
history out of SQLite, not stub data.

## 2. Persistence across a restart — the important one

This is the actual point of the SQLite migration: data must survive an app
restart, not just live in memory for the session.

1. Note how many contacts you have (should be 12 fresh, or 12 + whatever
   you've since added).
2. **Reload the app** — on web, hit F5; on a device, shake for the dev menu
   and tap Reload (or fully close and reopen it).
3. **Expect:** the same contact count and the same data — nothing reset,
   nothing re-seeded, no duplicate second copy of the demo network.

If the count doubled, the seed's "only once" guard (the persisted `meta`
table flag) isn't working. If everything vanished, writes aren't actually
landing on disk.

## 3. Create a contact

1. Tap the **person-add icon** in the Contacts header.
2. Fill in a name, one phone, one email, a "where we met" place, and one
   premise (pick a kind, type a label, add a tag or two).
3. Save.
4. **Expect:** back on the list, the new contact appears in the correct
   alphabetical position with a gray (Common) grade dot — no interactions
   logged yet, so score should be 0.
5. Open it — confirm the phone, email, where-met, and premise all show up
   exactly as entered.

## 4. Edit a simple field without touching the rest

1. Open the contact you just made → Edit.
2. Change only the **Title** field. Don't touch phones/emails/premises.
3. Save.
4. **Expect:** title updated, and the phone/email/premise you entered in
   step 3 are still there, unchanged.

This exercises the "only rewrite the child tables that were actually
patched" logic — a regression here would show up as phones/premises
silently disappearing on unrelated edits.

## 5. Replace a phone number

1. Same contact → Edit → change the phone number field to a different
   number (don't add a second one, just overwrite it).
2. Save.
3. **Expect:** the contact detail screen shows only the new number — the
   old one is gone.

This is expected, documented behavior, not a bug: phone/email entries don't
carry a stable id yet (`SYNC_DESIGN.md` / `TASKS.md` Phase 8.2), so an edit
replaces the whole set rather than merging item-by-item. If you instead add
a *second* phone row in the edit screen and keep the first, both should be
present afterward — that's the normal multi-phone case, unaffected by this
limitation.

## 6. Premises: add, keep, and remove

1. Same contact (or a fresh one) → Edit → add a **second** premise (so you
   have two).
2. Save, confirm both appear on the detail screen.
3. Edit again: change the **label** of the first premise, leave the second
   untouched, and remove... actually just delete the second premise
   entirely via its "Remove premise" button.
4. Save.
5. **Expect:** one premise remains, with the *updated* label from step 3 —
   proving premises merge by their own id (update in place) rather than
   being wiped and recreated, unlike phones/emails above.

## 7. Delete a contact — and confirm it stays deleted

1. Open any non-demo contact you created → scroll down → **Delete
   contact**, confirm.
2. **Expect:** back on the list, it's gone.
3. **Reload the app** (like step 2).
4. **Expect:** still gone — it shouldn't reappear. This proves delete is a
   real tombstone written to disk, not just an in-memory list filter.

## 8. Log an interaction and watch the grade move

1. Open a Common-tier contact (gray dot, low/no score).
2. Use a quick action (Call/Text/Email — these open the OS composer *and*
   log the interaction) or the manual **Log an interaction** section at the
   bottom — pick "Visit" (worth the most, +15) and save.
3. **Expect:** the grade hero at the top updates immediately — score goes
   up, and if it crosses a tier boundary (20/40/60/80) the color and label
   change too (e.g. Common → Uncommon).
4. Back on the contacts list, the same contact's grade dot should reflect
   the new color.

## 9. Full-network deletion doesn't bring the seed back

This one's destructive to your test data — do it last, or in a throwaway
`.env`/backend if you want to keep the seeded network around afterward.

1. Delete every contact (seeded + any you added) one by one.
2. Reload the app.
3. **Expect:** an empty contacts list — the demo network does **not**
   regenerate. If it comes back, the "seed once, ever" guard is broken
   (falling back to "reseed whenever the list is empty," which would make
   it impossible for a real user to actually delete their whole network).

## 10. Circles

1. Go to the **Circles** tab → New circle.
2. Give it a name, pick a tag that appears on a couple of your contacts
   (e.g. one used in a premise), save.
3. **Expect:** the live preview while editing shows matching contacts;
   after saving, the circle appears on the Circles tab with the right
   member count.
4. Open the circle → tap the star icon to **pin** one member and the
   minus-circle icon to **exclude** another.
5. Reload the app → reopen the circle.
6. **Expect:** the pin/exclude choices persisted (pinned contact still
   starred, excluded one still absent from the list) — same persistence
   check as contacts, applied to circles.
7. Delete the circle from its edit screen → confirm it's gone from the
   Circles tab, and stays gone after a reload.

## 11. Quick CSV smoke test (touches the same storage, worth 2 minutes)

1. Contacts tab header → CSV-out icon → confirm it shares/downloads
   `contacts.csv` and `interactions.csv` without error.
2. Open `contacts.csv` in a text editor — confirm the contacts you created
   are in there with the right fields.
3. Contacts tab header → CSV-in icon → pick that same file back → confirm
   the preview screen reports everyone as "already in Legend" (0 new,
   duplicates detected) rather than re-importing copies.

## Known, expected gaps (don't file these as bugs)

- **Phone/email replace-not-merge** (step 5) — tracked as Phase 8.2.
- **No sync yet** — this is all local-only by design; there's no server
  round-trip to test at this stage (`SYNC_DESIGN.md` Phase 8.3+).
- **Web SQLite support is unconfirmed beyond "the bundle builds without
  error"** — if `npm run web` fails specifically when the Contacts tab
  tries to read/write (not at bundle time, but at runtime), that's exactly
  the gap this document exists to catch. Please report the browser console
  error if so.

## If something breaks: how to reset local data

- **Web:** open dev tools → Application tab → clear site data for
  `localhost` (SQLite-on-web typically lives in IndexedDB/OPFS, not
  `localStorage`, so a manual localStorage clear won't be enough).
- **Native (Expo Go or a dev build):** uninstall and reinstall the app —
  the SQLite file is part of the app's private storage and goes with it.

Report back with which step failed and what you saw (screenshot + any
console/error output) — that's enough to reproduce and fix without needing
you to debug it yourself.
