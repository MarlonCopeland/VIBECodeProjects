# Legend Assist — Spec

> Status: **proposed** (2026-10-26). Companion to [`TASKS.md`](./TASKS.md)
> Phase 11 and [`SYNC_DESIGN.md`](./SYNC_DESIGN.md). Nothing here is built yet.

Legend Assist helps the user do three jobs they currently do by hand:

1. **Flesh out contacts.** Find what's missing or messy on a contact and
   offer fixes the user can accept with one tap.
2. **Review today's connections.** An end-of-day debrief of who you met,
   grouped by encounter, with follow-ups queued.
3. **Suggest premises.** Attach an existing premise to a contact, or propose
   a new one, using the contact's details and the people met alongside them.

It comes in two tiers that share one pipeline:

| | **Assist** (standard) | **Assist+** (AI) |
| --- | --- | --- |
| Where it runs | Entirely on-device | On-device pipeline, plus an LLM call through Legend's proxy |
| Needs network / account | No | Yes (Supabase account + entitlement) |
| Engine | Rules, fuzzy matching, lightweight NLP | The Assist engine produces candidates, then the LLM reranks, explains, extracts, and drafts |
| Memory | Accept/reject feedback counts | Markdown memory notes (profile, per-person, journal), stored encrypted in the vault |
| Price | Included | Monthly subscription (see [Pricing](#pricing--cost-model)) |
| Offline / over quota | Works fully | **Falls back to Assist** without failing |

Assist+ is an **upgrade layered on Assist, not a separate system**. The AI
tier never replaces the deterministic engine. It takes the engine's
candidates as input. That keeps token costs down, keeps the app useful
offline, and means a model outage only makes suggestions less clever. It
never makes them disappear.

---

## Hard constraint — the zero-knowledge boundary still holds

Per [TASKS.md Ground rules](./TASKS.md#ground-rules) and SYNC_DESIGN.md, *nothing
readable about a user's network may be written server-side*. That decides
where the alias map lives in Assist+:

> **The alias ↔ real-identity map lives only on the device.** It is never
> stored in Supabase, in an Edge Function, or anywhere the operator can reach.

Why the server can't be the aliasing layer, even with encryption or salting:

- If the server holds the map (even encrypted under a key the server also
  holds), the server can de-alias every request it relays. That is exactly
  the plaintext contact graph migration 0005 deleted, rebuilt by another route.
- Encrypting the *payload* to the LLM doesn't help, because the LLM must read
  plaintext to do anything useful. What protects the user is **replacing
  identifiers before the text leaves the phone**, not encrypting the text.
- Salting belongs on the device: aliases are derived from a key under the
  vault key (below), so the server never needs, and never gets, the salt.

The server *does* see the pseudonymized prompt (it relays it). It therefore
sees exactly what the LLM provider sees, and no more. This is the same trust
level as the provider, and it is spelled out in the privacy policy.

---

## Part 1 — Assist (standard, on-device)

All Assist logic is **pure TypeScript** under `src/features/assist/`, with the
same discipline as `grading.ts`: pure functions, `now` passed as a parameter,
no I/O inside the engine, and unit tests against the real SQLite driver.

### 1.1 Libraries (all pure JS, RN- and Electron-safe)

| Library | Use | Notes |
| --- | --- | --- |
| `libphonenumber-js` (min metadata) | Normalize/format/validate phones, infer country | ~80 KB |
| `fuse.js` | Fuzzy match premise labels, duplicate names | No deps |
| `compromise` | Lightweight NLP: extract people, orgs, places, topics, titles from notes | ~250 KB; English only |
| `chrono-node` | Parse "follow up next Tuesday" / "met at the Thursday mixer" in notes | Optional, 11.3 |
| Bundled JSON dictionaries | Free-mail domains, title keywords, expertise and hobby lexicons, premise-kind cues | Ship in `src/features/assist/data/` |

> **"JEV"**: I couldn't identify a library by this name. The table above is
> my best guess at the intent ("local smarts, no AI"). If JEV is a specific
> tool you have in mind, it slots in as another candidate generator (§1.5),
> because the engine is built around pluggable generators.

### 1.2 Flesh out: contact completeness + fixes

**Completeness score** (0–100, computed, never stored, like grades). Fields
are weighted by how much they help the user act on the contact:

| Field | Weight | Field | Weight |
| --- | --- | --- | --- |
| ≥1 phone or email | 25 | ≥1 premise | 20 |
| where met | 15 | company | 10 |
| title | 10 | notes (≥ 20 chars) | 10 |
| avatar | 5 | last name | 5 |

A "Needs detail" filter in the contacts list sorts by lowest completeness ×
highest grade. Strong relationships with thin records come first.

**Fix generators** (each returns `Suggestion[]`; nothing is applied without
the user's tap):

| Generator | Example |
| --- | --- |
| `phoneNormalize` | `5551234567` → `+1 555-123-4567`, label guessed `mobile` |
| `nameCase` / `nameSplit` | `JOHN SMITH` → `John` / `Smith`; `"Bob" Robert Lee` → nickname `Bob` |
| `companyFromEmail` | `dana@acmerobotics.com` → company "Acme Robotics" (skipped for free-mail domains) |
| `titleFromNotes` | notes "VP of partnerships at…" → title "VP of Partnerships" (`compromise` + title lexicon) |
| `whereMetFromSiblings` | Contact created at 7:42pm with no where-met, while 3 others created 7:10–8:05pm share "The Armory" → suggest it |
| `duplicateDetect` | Same normalized phone/email, or name similarity > 0.9 plus a shared company → "Possible duplicate" (feeds the backlog **contact merge tool**) |
| `followUpFromNotes` | "send him the deck Friday" → proposes a reminder (`chrono-node` → local notification) |

### 1.3 Daily review ("Today")

A new **Today** card on the Contacts tab (and a full screen at
`app/(app)/assist/review.tsx`) appears when today has new or edited contacts
or logged interactions. It's dismissable, and a local notification can nudge
at a user-chosen time (default 8pm, off by default).

**Encounter clustering** is the core of the review. Contacts created on the
same day are grouped into *encounters*:

```
same encounter if:
  created within 90 min of the previous contact in the cluster
  AND (same whereMet.placeName  OR  location within 300 m  OR  either has no location)
```

Each encounter shows:

- Its contacts, each with a completeness ring and the top 1–2 fix suggestions.
- A **suggested shared premise** (§1.4). Accepting it adds the premise to every
  contact in the encounter **and logs one `premise` interaction for each**.
  This delivers the backlog's *Group visit logging* item.
- A **follow-up** toggle per contact (creates a local reminder, default "in 2 days").
- The grade preview: "Logging this moves Dana from Common → Uncommon."

Finishing the review writes a `daily_reviews` row (§3). Momentum (Phase 9) can
count completed reviews toward the streak.

### 1.4 Premise suggestions

Triggered (a) in the premise picker on contact edit, (b) per encounter in the
daily review, and (c) as a background "Premise health" pass in Settings.

**Candidate generation.** Each source yields weighted tokens:

| Source | Signal |
| --- | --- |
| Notes | `compromise` nouns/orgs/topics, lexicon hits (expertise, hobby) |
| Company / title | org name, industry keywords from the title lexicon |
| Where met | place name (→ `place` kind), plus "event" cues (gala, summit, mixer, meetup, conference) |
| Encounter siblings | premises already on contacts in the same encounter (co-occurrence) |
| Your history | premises you most often attach to contacts with similar tokens (from feedback, §1.5) |

**Scoring against existing premises:**

```
score(p) = 0.45 · fuzzy(label/tags, tokens)          // fuse.js, 0..1
         + 0.30 · cooccurrence(p, encounter siblings)
         + 0.15 · jaccard(p.tags, tokens)
         + 0.10 · acceptRate(p)                       // from assist_feedback
```

Show the top 3 with score ≥ 0.35, each with a one-line *why*: "3 people you
met tonight have this."

**New-premise proposals** appear when no existing premise scores ≥ 0.35 but a
strong token cluster exists. Kind is guessed from cues: `event` (dated,
multi-person, event words), `place` (place name, no event words),
`expertise` (title or skill lexicon), `hobby` / `interest` (hobby lexicon),
`topic` (otherwise). The user can edit the label, kind, and tags before saving.

**Premise health** finds near-duplicate premises ("NAACP Gala" /
"NAACP Gala 2026" / "naacp gala") and proposes merges. It also finds orphans
(premises with no contacts).

### 1.5 Learning without AI

Every suggestion the user accepts, rejects, or edits is written to
`assist_feedback`. Generators read aggregate counts (accept rate per premise,
per generator, per lexicon term) to re-weight. This is plain counting with
add-one smoothing, no model. Feedback syncs (encrypted, like everything
else), so a second device inherits what the first learned.

### 1.6 Generator contract

```ts
// src/features/assist/types.ts
export type SuggestionKind =
  | 'field_fix'        // set/normalize a contact field
  | 'duplicate'        // possible duplicate pair
  | 'premise_attach'   // attach existing premise
  | 'premise_create'   // propose new premise
  | 'premise_merge'    // merge near-duplicate premises
  | 'follow_up';       // reminder

export interface Suggestion {
  id: string;                    // deterministic hash of (kind, targets, payload) — dedupes reruns
  kind: SuggestionKind;
  contactIds: string[];
  payload: unknown;              // kind-specific, typed per kind in the real code
  score: number;                 // 0..1
  reason: string;                // human-readable "why"
  source: 'assist' | 'assist_ai';
}

export interface AssistContext {
  now: Date;
  contacts: Contact[];
  interactions: Interaction[];
  premises: Premise[];
  feedback: FeedbackStats;
}

export type Generator = (ctx: AssistContext, targetIds: string[]) => Suggestion[];
```

Suggestions are **derived and ephemeral**. They are recomputed on demand,
never synced, and cached in memory only. Only the user's *decisions* persist.

---

## Part 2 — Assist+ (AI, subscription)

### 2.1 What the AI adds

| Job | Assist does | Assist+ adds |
| --- | --- | --- |
| Flesh out | Regex/NLP field extraction | **Freeform debrief**: type or dictate "Met Dana from Acme, she runs partnerships, into climbing, wants an intro to someone in fintech" and get structured field updates, premises, and follow-ups across *multiple* contacts at once |
| Daily review | Clusters + rule suggestions | A short narrative summary, prioritized follow-ups with reasons, **introduction ideas** ("[P2] wants fintech; [P5] works in lending"), and draft follow-up messages handed to the existing outreach templates |
| Premises | Lexical/fuzzy match | **Semantic** match ("small-business lending" ≈ "fintech"), taxonomy cleanup, better labels and tags for new premises |
| Memory | Counts | Markdown memory notes that carry context across days (§2.5) |

Explicitly **out of scope**: web lookup and enrichment of real people
(LinkedIn, search). That would require sending real names, which breaks the
whole privacy model. If ever added, it must be a separate, per-contact, opt-in
action with no aliasing, so the user can see it is different.

### 2.2 Request pipeline

```
 DEVICE                                                  SERVER                 PROVIDER
 ──────                                                  ──────                 ────────
 1. Select context      Assist engine picks only the
    (minimization)      contacts/premises relevant to
                        this task (≤ 25 contacts)
 2. Pseudonymize        names/contact info → aliases,
                        notes scrubbed (§2.3)
 3. Egress guard        scan outbound text for ANY known
                        vault identifier → block if hit
 4. Preview (opt.)      "What will be sent" sheet
 5. POST ───────────────────────────────────────────▶  assist-proxy (Edge Fn)
                                                       • verify JWT
                                                       • has_active_assist()
                                                       • quota check
                                                       • route to provider ───▶ Claude / Gemini / …
                                                       • meter tokens       ◀─── JSON (tool output)
 6. ◀─────────────────────────────────────────────────  return body verbatim
 7. Validate            JSON schema; reject unknown aliases
 8. Rehydrate           aliases → real contacts, locally
 9. Present             as ordinary Suggestion[] (source: 'assist_ai')
                        → same accept/reject UI as Assist
```

The LLM never writes to the vault. It returns **suggestions in a fixed
schema** (provider tool-use / structured output), and they go through the
same accept/reject UI as Assist. If the AI suggests something wrong, the user
taps reject and nothing changes.

### 2.3 Pseudonymization (on-device)

**Alias key.** `aliasKey = HKDF-SHA256(vaultKey, info = "legend-assist-alias-v1")`.
It is derived on-device from the existing vault key (`vaultKey.ts`) and never
leaves the device.

**Per-request aliases (default).** Each request draws a fresh random
`requestSalt` (16 bytes, device-generated). Then:

```
alias(contactId) = "P" + base32(HMAC-SHA256(aliasKey, requestSalt ‖ contactId))[0..4]
```

So the same person is `[P7QK3]` in one request and `[PM2ZA]` in the next. The
provider and the proxy can't link a person across requests, which also
defeats building a profile of an alias over time. The device keeps the
`alias → contactId` table **in memory for that request only**. There's
nothing to store, and therefore nothing to leak from the server.

**What gets replaced** (three user-selectable levels, default *Balanced*):

| Data | Strict | **Balanced** | Open |
| --- | --- | --- | --- |
| Contact first/last/nick names | alias | alias | alias |
| Phones, emails, avatar, exact addresses | **never sent** | **never sent** | **never sent** |
| Names of *other* people mentioned in notes | alias | alias | alias |
| Company | `[ORG n]` | sent | sent |
| Title | generalized ("VP" → "executive") | sent | sent |
| Where met / place | city only | place name | place name |
| Premise labels | sent | sent | sent |
| Notes | scrubbed + generalized | scrubbed | scrubbed |

Contact names are aliased at **every** level; there is no "send real names"
mode.

**Notes scrubber.** Notes are the leakiest field, so they get a layered scrub:
1. **Known-entity pass.** Build an Aho-Corasick automaton of every name,
   nickname, email, and phone in the vault. Any hit becomes its alias, or
   `[PERSON]` if the match isn't in the request context.
2. **Pattern pass.** Regexes for email, phone (via `libphonenumber-js`
   `findNumbers`), URL, street address, long digit runs (SSN-like or account
   numbers), and handles (`@name`). Each becomes a typed token
   (`[EMAIL]`, `[PHONE]`, …).
3. **NER pass.** `compromise` `#Person` matches not already handled become
   `[NEW n]`. In a freeform debrief these are the *new people* the user just
   met. The device creates draft contacts for them and maps `[NEW n]` back on
   return.

**Egress guard** (the last line of defense). Before the network call, the
serialized request is scanned again with the known-entity automaton. Any
match means the scrubber missed something: **the request is blocked**, the
event is counted locally, and the user sees "Couldn't safely send this, so
here's what Assist found locally" with standard suggestions. This is a fail-closed design.

**Residual risk** (stated plainly, in-app and in the policy). Quasi-identifiers
can still re-identify someone: "the only female pastor in a town of 800"
identifies a person with no name attached. Strict mode generalizes titles and
places to reduce this. The *preview* sheet lets the user tap any phrase to
redact it before sending. Only the user knows which details are identifying.

### 2.4 `assist-proxy` Edge Function

`supabase/functions/assist-proxy/` (Deno).

- **Holds provider API keys** as Supabase secrets. Keys never ship in the app.
- **Auth + entitlement.** Verifies the JWT, calls `has_active_assist()`, and
  returns 402 when there's no subscription.
- **Quota.** A monthly token budget per user (`assist_usage`). When it's
  exceeded, the proxy returns 429 and the client silently falls back to Assist.
- **Provider routing.** A small adapter interface `{ complete(req): Res }` with
  `anthropic`, `gemini`, and `openai` implementations. The default is a
  mid-tier Claude model. A cheap/fast model handles classification-style tasks
  (premise rerank); a stronger one handles the freeform debrief and the
  narrative review. The model choice is server config, so it can change without
  an app release.
- **Stateless, no body logging.** The function never persists or logs request
  or response bodies. It writes only metering rows: `user_id`, `task`,
  `model`, `input_tokens`, `output_tokens`, `at`.
- **Provider terms.** Use API tiers whose terms exclude training on customer
  data, and request zero/limited retention where the provider offers it.
  *Verify each provider's current terms before launch*; don't promise more
  in the privacy policy than the contract gives.
- **Prompt-injection hygiene.** Contact notes are user-authored but still
  untrusted input to the model. The system prompt fences them as data. Output
  is schema-validated on the device, and aliases the device didn't issue are
  dropped.

**Bring-your-own-key (option, decide later).** A user pastes their own
Anthropic/Gemini key, which is stored in SecureStore, and the device calls the
provider directly. The same pseudonymization applies. No proxy, no metering, so
it could be a cheaper tier or a free power-user setting.

### 2.5 Memory: markdown in the vault

Assist+ keeps a small set of markdown notes so the model has context beyond
one request:

| Path | Content | Updated |
| --- | --- | --- |
| `assist/profile.md` | User's networking goals, industries, what intros they want (user-editable) | User, and model-proposed edits on accept |
| `assist/people/<contactId>.md` | Rolling ≤ 300-word summary of a contact's context, past intros, open loops | After a debrief/review that touched them |
| `assist/premises.md` | Taxonomy notes: synonyms, merges the user approved, naming conventions | After premise-health runs |
| `assist/journal/YYYY-MM-DD.md` | The day's review digest | When a daily review completes |

**Storage.** Memory notes are rows in a new syncable SQLite table, `assist_memory`
(§3). They are **not** server-side files. They ride the existing encrypted
oplog and vault snapshots, so "extra hosting" means more *ciphertext*, never
readable notes. People are referenced inside memory notes as `{{c:<contactId>}}`
tokens, never names. At request time the pseudonymizer swaps each token for
that request's alias, so memory works with per-request aliases.

**Size discipline.** The device sends only the profile, the memory notes of
contacts in the request context, and the last 3 journal entries. Each memory
note has a hard character cap. Summaries are rewritten, not appended.

**User control.** Settings → Assist → Memory shows every memory note as
readable, editable markdown, with "Forget this person" and "Forget everything".
Deleting a contact tombstones its memory note in the same transaction.

### 2.6 Entitlement & offline

- `subscriptions.product = 'assist'` (same table and RLS pattern as Sync).
  `has_active_assist()` is a SQL function mirroring `has_active_sync()`.
- Assist+ requires a Supabase account (the proxy needs auth). It does **not**
  require Sync; without Sync, memory notes simply live on one device. The
  paywall copy should recommend the bundle.
- Billing: StoreKit / Play Billing subscription, receipt-validated server-side
  as planned for Sync. The client may only write `source='beta'` rows during beta.

---

## Part 3 — Data model

New SQLite tables (in `src/backend/local/sql/schema.ts`). Each syncable table
gets the standard `id` / `updated_at` (HLC) / `deleted_at` columns, so the sync
engine handles them with no new code paths:

```sql
-- User decisions on suggestions. Syncs (learning follows the user).
CREATE TABLE assist_feedback (
  id            TEXT PRIMARY KEY,
  suggestion_id TEXT NOT NULL,     -- deterministic Suggestion.id
  kind          TEXT NOT NULL,
  generator     TEXT NOT NULL,     -- e.g. 'premise_cooccurrence', 'llm:review'
  premise_id    TEXT,
  decision      TEXT NOT NULL,     -- 'accepted' | 'rejected' | 'edited'
  decided_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  deleted_at    TEXT
);

-- Completed daily reviews. Syncs. Append-only, like interactions.
CREATE TABLE daily_reviews (
  id            TEXT PRIMARY KEY,
  review_date   TEXT NOT NULL,     -- YYYY-MM-DD, local
  contact_count INTEGER NOT NULL,
  completed_at  TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  deleted_at    TEXT
);

-- Assist+ memory notes. Syncs (encrypted, like everything else).
CREATE TABLE assist_memory (
  id            TEXT PRIMARY KEY,
  path          TEXT NOT NULL UNIQUE,   -- 'assist/people/<contactId>.md'
  contact_id    TEXT,                   -- for cascade on contact delete
  body          TEXT NOT NULL,          -- markdown with {{c:id}} tokens
  updated_at    TEXT NOT NULL,
  deleted_at    TEXT
);
```

New Supabase migration `0006_assist.sql` (**no contact data**):

```sql
-- allow product = 'assist' in subscriptions (extend check constraint)
-- has_active_assist() SECURITY DEFINER, mirrors has_active_sync()
create table public.assist_usage (
  id            bigint generated always as identity primary key,
  user_id       uuid not null references auth.users on delete cascade,
  task          text not null,      -- 'debrief' | 'review' | 'premise_rerank' | …
  model         text not null,
  input_tokens  int  not null,
  output_tokens int  not null,
  at            timestamptz not null default now()
);
-- RLS: users can select their own rows (to show "usage this month");
-- only the service role (the Edge Function) inserts.
```

Feature flags: `FEATURE_ASSIST` (default on) and `FEATURE_ASSIST_AI`
(default off until launch), added to `src/config/features.ts`, `app.config.js`,
and `.env.example` per ARCHITECTURE.md.

---

## Part 4 — UI surfaces

| Where | What |
| --- | --- |
| Contacts tab header | **Today** card (count of today's new contacts, "Review" CTA) |
| `app/(app)/assist/review.tsx` | Daily review: encounters → contacts → suggestions → follow-ups → Done |
| Contact detail | Completeness ring + "Fill gaps (3)" chip → suggestion sheet |
| Contact edit → premise picker | "Suggested" row above the search results |
| Contacts list filter | "Needs detail" |
| `app/(app)/assist/debrief.tsx` (Assist+) | Freeform text box (keyboard dictation works) → preview → structured suggestions |
| Settings → Assist | Tier, privacy level (Strict/Balanced/Open), "Preview before sending" toggle, review reminder time, Memory viewer, usage this month |
| Subscription screen | Assist+ card alongside Sync, plus a bundle option |

All screens use the themed primitives from `src/components`, and accept/reject
uses one shared `SuggestionCard` component for both tiers.

---

## Pricing & cost model

LLM tokens dominate the cost. Storage for memory notes is a few KB of
ciphertext per user, which is negligible. A rough estimate for an active user,
at mid-tier model rates of about $3 / M input and $15 / M output tokens (*verify
current pricing at launch*):

| Task | Freq / month | ~Tokens in / out | ~Cost |
| --- | --- | --- | --- |
| Daily review | 20 | 6k / 1.2k | $0.72 |
| Debrief | 15 | 4k / 1.5k | $0.52 |
| Premise rerank (small model) | 60 | 1.5k / 0.2k | ~$0.05 |
| **Total** | | | **~$1.30** |

Suggested pricing: **Assist+ $5.99/mo** (yearly $49.99), or **Sync + Assist+
bundle $7.99/mo**. A monthly token cap of about 3× the typical user's usage
protects margin, and hitting the cap falls back to Assist rather than failing.
After the store's cut (15–30%), the margin is still healthy.

---

## Part 5 — Phases (proposed TASKS.md Phase 11)

- [ ] **11.1 Assist engine core.** `src/features/assist/` types, completeness,
      field-fix generators, duplicate detection. Pure, unit-tested.
- [ ] **11.2 Daily review.** Encounter clustering, the Today card, review screen,
      group premise logging, `daily_reviews` table, follow-up reminders.
- [ ] **11.3 Premise suggester.** Candidate generation and scoring, new-premise
      proposals, premise health (merge/orphans), `assist_feedback` table and
      re-weighting.
- [ ] **11.4 Pseudonymizer + egress guard.** Alias key derivation, per-request
      aliases, the three-pass scrubber, the guard, and rehydration. **The most
      heavily tested module in the app** (see Testing). Lands before any network code.
- [ ] **11.5 `assist-proxy` + migration 0006.** Edge Function, provider
      adapters, entitlement, quota, metering. No body logging, verified by review.
- [ ] **11.6 Memory.** `assist_memory` table, memory-note update flows, Memory
      viewer and editor, cascade on contact delete.
- [ ] **11.7 Assist+ features.** Debrief screen, AI review summary and intros,
      semantic premise rerank, drafts handed to outreach.
- [ ] **11.8 Disclosure & store readiness.** Privacy policy section on AI
      processing; an explicit in-app consent screen before the first Assist+
      request, naming the provider. (Apple's App Review Guidelines require
      disclosure and permission before sharing personal data with third-party
      AI. *Verify the current wording.*) Update the App Store privacy label and
      the Play Data Safety form.
- [ ] **11.9 Ship gate.** `npm run typecheck && npm run check:imports && npm test`
      on Node 22.

## Testing

- **Engine (11.1–11.3).** Fixture vaults in `test/assist/`, seeded through
  `nodeSqlDriver`. Golden tests per generator, and clustering edge cases
  (midnight rollover, no location, a 90-minute boundary).
- **Pseudonymizer (11.4):**
  - Round-trip property test: `rehydrate(pseudonymize(x)) ≡ x` for
    generated vaults.
  - Leak test: for generated vaults, *no* name, email, or phone from the vault
    ever appears in the serialized request (the egress guard must never have
    to fire in tests, because the scrubber should catch everything first).
  - Adversarial notes corpus: names in possessives ("Dana's"), all-caps,
    nicknames, names that are also common words ("Will", "Grace", "Hunter"),
    non-Latin names, emails with plus-tags, international phones.
  - Unlinkability test: the same contact gets different aliases across two
    requests.
- **Proxy (11.5).** Deno tests with a mock provider: 402 without entitlement,
  429 over quota, metering row written, request body never persisted.

## Open questions

1. **"JEV"**: which library or tool did you mean? (§1.1)
2. Should **Assist** (standard) be free for everyone, or part of an existing
   paid tier?
3. Is **BYO API key** wanted (cheaper tier, or a free power-user option)?
4. Is the default privacy level **Balanced**, or should launch default to
   **Strict**?
5. Which provider is the launch default? The adapter makes this a config
   switch; the recommendation is Claude for the debrief and review, with a small
   model for reranking.
