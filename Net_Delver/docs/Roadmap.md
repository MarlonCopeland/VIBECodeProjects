# Net Delver — Road to Steam

The task list for turning the current vertical slice into a shippable Steam
title with a Mega Man Legends art direction, character customization, and the
chest → parts → robot → invasion economy.

Nothing here is done unless it says so. **Phase 0 is what exists today**;
everything after it is planned work. Each task is written so it can be picked up
cold, and the *Why* line exists so a task can be cut on purpose rather than by
accident.

**Legend:** `[x]` shipped · `[ ]` not started · `[~]` partially built
**Size:** S = under a day · M = a few days · L = a week or more · XL = multi-week

---

## Phase 0 — What already exists

- [x] ENet host/join party for three, host-authoritative combat
- [x] LAN session discovery over UDP broadcast (no IP typing)
- [x] Over-the-shoulder camera, ADS zoom, R3 shoulder swap
- [x] Four busters, two-tier charge shot, dodge/air-dash, stamina
- [x] Seeded procedural sectors from tweakable section types
- [x] Traps (laser, crusher), obstacles, chests, weapon caches, credit shards
- [x] Consumables, host-owned inventories, grenades
- [x] Persistent profile: credits, salvage parts, stash, deploy loadout, settings, rebinds
- [x] Sentinel Prime boss with phase-gated weak points
- [x] Pause / loadout / settings menus, full input rebinding
- [x] Headless smoke test covering all of the above

Known gaps that the rest of this document closes: placeholder primitive art, no
character customization, parts have no sink, no Steam integration, no
persistence beyond the local machine.

---

## Phase 1 — Steam Deck readiness (M)

The Deck is the target device, so this comes before content. Everything here is
verifiable on hardware today.

- [ ] **Linux export preset + one-click build script** (S)
  Add `export_presets.cfg` for `Linux/X11 x86_64` and `Windows Desktop`, plus a
  `tools/build.ps1` that exports both. *Why:* the Deck runs the Linux build
  natively; shipping the Windows build under Proton is a fallback, not a plan.
- [ ] **Controller-only navigation audit** (M)
  Every screen must be completable with a gamepad alone: focus neighbours set
  explicitly, a focused control on every screen open, B/Circle as universal
  back. *Why:* the Deck has no mouse. The menus already take focus, but the
  order is whatever the container decided.
- [ ] **On-screen keyboard for the callsign field** (S)
  Steam's OSK only auto-opens for Steam Input text fields; call
  `DisplayServer.virtual_keyboard_show()` on `LineEdit` focus. *Why:* right now
  a Deck player cannot rename themselves.
- [ ] **1280×800 layout pass** (S)
  The Deck is 1280×800, not 720p. Re-check every menu at that size and at 16:10
  safe margins.
- [ ] **Steam Input action set + glyphs** (M)
  Ship an `.vdf` action manifest and swap the hard-coded "A / CROSS" strings for
  Steam Input glyph lookups. *Why:* the controls screen currently guesses at
  Xbox naming; a Deck shows its own buttons.
- [ ] **Performance budget at 800p/40fps** (M)
  Profile a 13-room sector. The `_box()`-per-prop approach creates hundreds of
  StaticBody3D nodes — merge static geometry per cell into a single
  `ArrayMesh` + `ConcavePolygonShape3D`. *Why:* this is the most likely reason
  the Deck drops frames, and it is a contained fix.
- [ ] **Battery/thermal check** (S)
  30-minute run, log frame time and TDP. Target 40fps cap at ~12W.
- [ ] **Deck Verified checklist dry run** (S)
  Default controller config, readable text at 100%, no external launcher, no
  compatibility warnings.

## Phase 2 — Mega Man Legends art direction (L)

The target is the PS1 *Legends* look: flat unlit-ish colour, hard shadow
terminator, low-poly chunky proportions, saturated primaries against grey-blue
industrial grime. The current fake-PBR metallic look is the opposite of this and
has to go.

**Correction to an earlier draft of this document:** it claimed Legends had
"black outlines". It did not — the PS1 games were flat-shaded low-poly with
saturated colour and no outline pass. Outlines are a modern homage convention
(Jet Set Radio, Wind Waker). Worth shipping as a toggle, but it should be
labelled a stylistic addition rather than authenticity.

- [ ] **Toon shader + outline pass** (M)
  A `ShaderMaterial` with a 2–3 band ramp, rim term off, and an inverted-hull
  outline (or a depth/normal edge post-pass). *Why:* this single change does
  more for the aesthetic than any model swap.
- [ ] **Palette lock** (S)
  Define 24 named colours in one `Palette.gd`: skin ramp, armour primaries,
  accent emissives, environment greys. All existing hex literals move here.
  *Why:* the codebase currently has ~40 loose hex strings and they will drift.
- [ ] **Vertex-lit environment + baked-ish ambient** (M)
  Drop per-cell `OmniLight3D` count; bake cell tint into vertex colours and keep
  one or two dynamic lights for readability. *Why:* also a Deck performance win.
- [~] **Character base mesh — "Delver" rig** (L)
  **Bone contract done** — `scripts/player/DelverRig.gd` defines 20 bones at
  Legends proportions (1.75m over a 0.32m head) with a `Muzzle` bone, and builds
  a rigid blocky proxy from it. Slot list reconciled with Phase 3 below to five
  mesh slots: `head`, `hair_helmet`, `torso`, `arms`, `legs` — boots merged into
  legs, complexion handled as a tint channel rather than geometry.
  **Remaining:** the hand-authored Blender model. See `docs/CharacterArtGuide.md`.
- [~] **Animation set** (L)
  **Done:** idle, run fwd/back, strafe l/r, jump, fall, land, roll, roll_heavy,
  air dash — generated in code by `DelverAnimSet.gd`, blended by a state machine
  over a 2D locomotion blend space, driven by `DelverAnimator.gd`. Playback speed
  is matched to real m/s so the feet do not slide.
  **Remaining:** the additive upper-body aim layer, the fire and hit one-shots,
  turn-in-place, and the spine counter-twist (deferred — it needs the
  AnimationTree/animator process ordering proven first, or the tree overwrites
  it every tick).
- [ ] **Enemy + boss re-model** (M)
  Reaverbot-inspired silhouettes: single glowing eye, blocky limbs, exposed
  weak-point vents that read at distance.
- [ ] **UI re-skin** (M)
  Chunky beveled panels, dot-matrix numerals, the existing teal/amber terminal
  palette pushed toward Legends' cream-and-navy menus. Keep `UIKit.gd` as the
  single styling surface so this is one file.

## Phase 3 — Character customization (L)

Slots the player asked for: complexion, hair/helmet, body, arms, legs.

- [ ] **Modular part system** (M)
  `CustomizationDatabase.gd` in the shape of `ItemDatabase.gd`: part id → slot,
  mesh path, unlock condition, tint mask. A `PlayerAppearance` resource holds
  one part id per slot plus the colour choices.
- [ ] **Complexion + colour channels** (M)
  Three tintable masks per part (primary / secondary / trim) plus a skin ramp
  index. Applied via shader instance uniforms, not material duplication.
  *Why:* per-instance uniforms keep one material for the whole party.
- [ ] **Appearance persistence + replication** (S)
  Store in `SaveManager.profile.appearance`; advertise it in the lobby roster
  next to `kit`, exactly like the loadout, so every peer builds the same body
  with no runtime replication. *Why:* the roster path already exists and is
  proven — reuse it rather than inventing a second one.
- [ ] **Customization screen** (M)
  Slot list, part carousel, three colour wheels, rotating preview, randomize.
  Reachable from the lobby beside Stash & Loadout.
- [ ] **Unlockables wired to the economy** (S)
  Parts unlocked with credits and salvage; locked entries visible but greyed
  with their cost. *Why:* gives credits a sink before the robot bench lands.

## Phase 4 — Parts, robots, and invasions (XL)

The loop the player described: chests give parts → parts build robots → robots
deploy into other players' worlds → the damage they do pays the owner in credits
and parts → those buy player power-ups.

- [ ] **Part taxonomy** (M)
  Split today's single `parts` counter into typed salvage: `chassis`, `servo`,
  `optic`, `core`, `plating`, each with a tier. Chests roll by section type and
  depth. *Why:* one undifferentiated currency cannot express build variety. The
  counter exists now specifically so the migration has data to convert.
- [ ] **Robot bench** (L)
  Combine chassis + parts into a `RobotBlueprint`: stats derived from parts
  (health, damage, aggression, lifespan), a name, and a cost to deploy.
- [ ] **Robot AI as a hostile actor** (M)
  Reuse `Maverick.gd`'s server-owned chase/attack pattern with blueprint-driven
  stats. *Why:* the enemy already works and is host-authoritative; a deployed
  bot is the same thing wearing a different hat.
- [ ] **Asynchronous invasion model** (XL) — *architecture decision required*
  A deployed bot is a **blueprint plus a target sector seed**, not a live
  connection. When any player generates that seed, eligible bots are injected
  as extra spawns. Damage dealt is reported back and banked to the owner.
  *Why this shape:* it needs no matchmaking, no NAT traversal, no simultaneous
  presence, and it works with the existing seeded generator — the invaded
  sector is reproducible by definition. A live PvP invasion would need a relay
  service and is out of scope for this game's scale.
- [ ] **Bot exchange backend** (L)
  The one piece that cannot be local-only. Minimum viable: Steam Cloud +
  Steam leaderboards as a blob store for a small pool of blueprints, or a
  small hosted key/value service. Decide before building the bench.
  *Why flagged:* this is the only planned feature that requires running a
  service, and it should be a deliberate cost decision.
- [ ] **Deployment rewards + owner report** (M)
  Damage → credits and parts, shown as a "field report" on the lobby screen
  when the player next launches.
- [ ] **Player power-ups from parts** (M)
  Craft deployable buffs (shield drone, ammo cache, turret) from the same
  salvage, carried in via the existing deploy kit. *Why:* connects the new
  economy to the loadout system that already exists.

## Phase 5 — Content and progression (L)

- [ ] **More section types** (M)
  Vertical shafts, collapsed sectors, flooded coolant, server mazes. One new
  entry in `SectionLibrary.SECTIONS` each, plus a `_build_cell` branch.
- [ ] **Difficulty tiers per sector** (S)
  Expose `SectionLibrary.DIFFICULTY` as a run-level choice with matching
  reward multipliers.
- [ ] **Second and third boss** (L)
  Reuse the weak-point/phase framework from `Boss.gd`.
- [ ] **Run modifiers** (M)
  Seeded mutators (blackout, overclocked Mavericks, no consumables) for
  replayability and higher payouts.

## Phase 6 — Ship (M)

- [ ] **Steamworks integration** (M)
  GodotSteam or the Steamworks GDExtension: app id, overlay, rich presence,
  Steam Cloud for `net_delver_profile.cfg`, achievements.
- [ ] **Save migration + versioning** (S)
  `SAVE_VERSION` already exists; add an upgrade path before the first public
  build, because the parts taxonomy change in Phase 4 will break v1 saves.
- [ ] **Store page assets** (M)
  Capsule art, five screenshots, 30-second trailer, description.
- [ ] **Crash/error telemetry, opt-in** (S)
- [ ] **Localization pass** (M)
  Pull all UI strings into a translation table. `UIKit.gd` and the menu scripts
  are the only sources.
- [ ] **Accessibility** (M)
  Colourblind-safe accent palette, subtitle/caption for audio cues, camera
  shake toggle, aim assist option, remappable everything (already done).
- [ ] **Playtest at 3 players on real hardware** (M)
  Two Decks plus one desktop on the same LAN, full run, no host migration.

---

## Sequencing notes

Phase 1 before Phase 2: there is no point styling for a device you have not
confirmed runs the game.

Phase 3 before Phase 4: customization gives credits a sink, and the appearance
replication path is the same one robot blueprints will use — build it once on
the simpler problem.

The Phase 4 backend decision is the project's only true fork. If a hosted
service is off the table, the fallback is **local-only bots**: deploy them into
your own future runs as an escalating personal challenge. That keeps the whole
game offline-capable and cuts the riskiest dependency, at the cost of the social
hook.

## Risks

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Deck performance with per-prop static bodies | Frame drops on the target device | Mesh merging task in Phase 1; already scoped |
| Art replacement invalidates the runtime-built geometry | Large rework of `Dungeon.gd` | Keep `_build_cell` as the seam; swap primitives for scenes behind it |
| Parts taxonomy breaks saves | Player data loss | Save versioning before first public build |
| Invasion backend cost/complexity | Feature cut late | Decide the backend before the bench is built; local-only fallback documented |
| No host migration | Party dies with the host | Accept for LAN co-op; document in the store page |
