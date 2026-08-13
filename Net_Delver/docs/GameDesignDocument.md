# Net Delver: Vertical Slice Design

> Forward-looking work — Steam release, Mega Man Legends art direction,
> character customization, and the robot/invasion economy — lives in
> [Roadmap.md](Roadmap.md). This document describes the slice as built.

## Pillars

1. **Readable machine combat:** bright buster fire and red Maverick cores stand out against a dark infrastructure sector.
2. **Committed loadout choices:** weapon cadence, stamina cost, range, spread, and weight create distinct playstyles.
3. **Party-first delving:** a host gathers up to two friends before deploying the synchronized squad.
4. **Network archaeology:** terminals, server racks, data conduits, caches, and corrupted machines define the world.
5. **Extraction pressure:** everything looted is volatile until the run ends. The decision to push deeper or leave is the core tension.

## Game Loop

1. Spec the Delver at the uplink terminal: equip gear into the HEAD / ARMS / BODY / LEGS / BUSTER slots, load consumables into the backpack, pick an armour colour, then host or join a party (the lobby renders every joined Delver's model).
2. Deploy into a freshly generated sector.
3. Purge Mavericks — melee frames, gunner variants, and wall turrets — dodge hazards, and loot caches, chests, and shards while pushing toward the core.
4. Collect the crafting components each machine archetype drops; drop items from the backpack for teammates when someone runs dry.
5. Walk the shutter-gate corridor into the guardian's arena, destroy it, and extract — banking credits, salvage, components, found weapons, and surviving consumables to the profile.
6. Craft weapons, gear, and supplies at the bench, respec the loadout, and redeploy.

## Sector Generation

Sectors are grown on a grid of 30m cells from a single seed. The host rolls the seed and sends it with the deploy order; every peer generates the level locally, so no geometry is replicated and divergence is impossible by construction.

- Growth is a frontier walk: a random occupied cell with a free neighbour is extended until the room target is met.
- Doorways are computed from adjacency *after* placement, so incidental neighbours become loops. The sector reads as a network, not a tree.
- The deepest cell becomes the core (guardian). At least one arms vault is guaranteed.
- Section type decides everything inside a cell: enemy count and formation, loot weighting, chest chance, trap count and kinds, obstacle density, and light colour. All of it is one table in `SectionLibrary.gd`.

Hazards derive their state from a host-broadcast dungeon clock rather than local uptime, so a trap needs no replication and a late peer is instantly in phase.

## Economy

| Source | Pays |
| --- | --- |
| Credit shard | 45 credits |
| Maverick | 65 credits (party-wide) |
| Guardian | 450 credits (party-wide) |
| Extraction | 250 credit bonus |
| Salvage cache | Items, 40–110 credits, 2–5 salvage parts |

Credits and parts sit in a volatile run wallet. Death scatters half. Forfeiting loses everything, including the kit carried in. Extraction is the only path to the persistent profile, where credits, parts, components, and surviving consumables are stored. Salvage parts are the crafting bench's second currency: every recipe costs components plus parts.

### Components

Each machine archetype drops the component its own weapon is built from, so what the party fights is what it learns to build:

| Source | Component | Crafts toward |
| --- | --- | --- |
| Melee Maverick | Servo Motor | Leg/arm gear |
| Rapid gunner | Rapid Actuator | Rapid Buster, Tempest Visor |
| Scatter gunner | Scatter Manifold | Scatter Buster, Recoil Bracers |
| Siege gunner | Siege Frame | Siege Buster, Siege Stabilizers |
| Wall turret | Cryo Module | Cryo Visor |
| Any wreck / chest | Scrap Alloy, Power Cell | Everything |
| Guardian | Dragon Core (guaranteed, per player) | Guardian Plate (unique) |

## Equipment

| Buster | Damage | Cadence | Stamina | Weight | Role |
| --- | ---: | ---: | ---: | ---: | --- |
| Standard | 24 | Medium | 8 | 8 | Flexible starting weapon |
| Rapid | 11 | Very fast | 3 | 12 | Sustained close/mid pressure |
| Scatter | 9 x 5 | Slow | 16 | 18 | Short-range crowd damage |
| Siege | 58 | Very slow | 26 | 29 | Long-range burst, heavy frame |

Load is measured against a capacity of 40. At 70% or more, movement and dodge recovery are slower. This delivers the requested Elden Ring-inspired equipment consequence without reproducing its complete stat system in the first slice.

### Gear slots and the backpack

The Delver is specced from the stash across five slots — HEAD, ARMS, BODY, LEGS, and BUSTER — plus a six-slot backpack (one slot per distinct item stack; the Cargo Harness adds three). Equipment modifies max integrity, max stamina, movement speed, jump height, and stamina recharge, or grants a buster synergy that only wakes while the matching weapon is held:

| Gear | Slot | Effect |
| --- | --- | --- |
| Cryo Visor | Head | Standard Buster shots slow targets 35% for 2.5s |
| Tempest Visor | Head | Rapid Buster fire rate +20% |
| Aegis Helm | Head | +25 integrity |
| Flux Gauntlets | Arms | Stamina recharge +45% |
| Recoil Bracers | Arms | Scatter Buster +2 pellets |
| Siege Stabilizers | Arms | Siege Buster stamina cost -30% |
| Plated Chassis | Body | +50 integrity, -5% speed |
| Capacitor Core | Body | +40 stamina |
| Cargo Harness | Body | +3 backpack slots |
| Guardian Plate | Body | Unique: +35 integrity, +20 stamina, +10% speed |
| Servo Actuators | Legs | +15% speed |
| Coil Springs | Legs | +30% jump height |
| Featherweight Frame | Legs | +20% recharge, +5% speed |

The declared loadout travels with the lobby roster, so every peer builds every Delver with the same stats, and the host prices fire-rate and on-hit mods without trusting the client. A buster found in the sector and carried through extraction banks into the stash as a real, equippable weapon. Items can be dropped from the backpack mid-run as world pickups any party member can claim — and when the pack is full the interact prompt says so, rather than letting the press do nothing.

### Stash capacity

The stash holds one *stack* per slot, starting at 16 and bought up in steps of 4 to a ceiling of 64. Each expansion costs 250 credits times the number already bought, so filling the stash out completely runs to 19,500 credits — a long-term sink for a currency that otherwise only funded consumables. A full stash turns extracted loot away at the door and the results screen names what was lost, so capacity is a decision rather than a silent tax.

## Networking

- Transport: Godot ENet over UDP port `7777`.
- Discovery: UDP broadcast beacon on port `7778`, emitted once a second by a host sitting in its lobby. Same-network party members join from a list rather than typing an address — the difference between playable and unplayable on a handheld with no keyboard.
- Party size: three total players, including host.
- Lobby authority: host. The roster also carries each player's declared loadout, so inventories can be seeded from it without an RPC racing the scene load.
- Gameplay authority: host for fire validation, enemy AI, damage, pickups, inventories, chest rolls, hazard damage, and results.
- Movement authority: owning peer, synchronized to the party.
- Level: generated from a shared seed on every peer, avoiding divergent collision geometry and any need to replicate the world.

Direct-IP/LAN ENet is deliberate for this prototype. A production friend system requires external identity, social graph, invites, presence, relay/NAT traversal, regional queues, and dedicated services. There is no host migration: leaving a run ends the session for the party.

## Visual And Audio Direction

The current models use deliberately chunky primitive geometry: capsule-armored Delvers, cylindrical arm busters, angular Mavericks, antennae, glowing cores, brutalist server racks, and terminal screens. Metallic materials, cyan/green infrastructure light, orange caches, red corruption, fog, and filmic tone mapping establish the visual language.

Audio is generated in `SynthAudio.gd` as short layered waveforms. This guarantees redistributable feedback without third-party licenses. Production audio can replace each cue behind the same API.

## Completion Criteria

- Lobby can host, join by discovered session or address, display three slots, leave, and deploy.
- Keyboard/mouse and controller can complete the full loop, and every binding is remappable.
- Standard Buster works immediately; three alternatives can be discovered and equipped.
- Sectors generate from a seed, are fully connected, and are identical on every peer.
- Mavericks pursue, attack, damage, and respawn players on defeat; hazards damage on a shared clock.
- Chests, shards, and consumables can be looted; consumables can be used; the stash persists between runs.
- Shots, deaths, and detonations provide sound and visible effects.
- HUD communicates health, stamina, load, weapon, items, run wallet, location, interaction, and objective.
- The guardian triggers results, banks the run, and offers a return-to-lobby path.
- Mavericks split into melee and gunner variants, idle until aggroed, and drop their archetype's component; wall turrets track, fire, and always drop a Cryo Module.
- The guardian reads as a dragon-frame machine, wakes in an arena enlarged by annexed cells, is entered through a shutter-gate corridor, and pays every player a Dragon Core.
- The crafting bench converts components and salvage parts into weapons, gear, and consumables; the stash screen equips them into the five gear slots and backpack.
- The lobby previews every joined Delver's model in their chosen armour colour.
- Godot 4.6 import, lobby startup, dungeon startup, and smoke test complete without script errors.
