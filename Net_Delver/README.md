# Net Delver

Net Delver is a playable Godot 4.6 multiplayer action-game vertical slice. A party of up to three Delvers drops into a procedurally assembled internet backbone, loots what it can carry, and fights out to an extraction. Credits, salvage, and anything left in your pack only count once you get out.

## Play

Run the project from PowerShell:

```powershell
godot --path "C:\repo\VIBES\Net_Delver"
```

If Godot is not on `PATH`, replace `godot` with the full path to your Godot 4.6 executable.

### Solo

1. Select **Host Party**.
2. Select **Deploy Squad**.
3. Purge every Maverick in the sector, then the guardian that wakes.

### Two Steam Decks (or any two machines) on the same network

1. On the first machine, enter a callsign and select **Host Party**.
2. On the second, the host appears under **SESSIONS ON THIS NETWORK** within a second or two. Select it. No IP address to read off one screen and type into another.
3. The host selects **Deploy Squad** when the roster is ready.

Discovery is a UDP beacon on port `7778`: the host broadcasts once a second while sitting in its lobby, and anyone in a lobby listens. It needs no router configuration and no internet, only that both machines are on the same Wi-Fi or switch. If discovery is blocked, the **HOST ADDRESS** field still works — enter the host's private IPv4 address.

Gameplay itself is ENet on UDP port `7777`. SteamOS ships with no firewall enabled, so nothing needs opening on a Deck; on Windows, allow Godot through the private-network firewall prompt.

Two instances on one machine also work: only the client binds the discovery port, and it keeps retrying, so whichever instance starts hosting frees the port for the other to browse on.

## Controls

Every binding below is the default. All of them except the analogue sticks can be remapped in **Settings → Controls**, for keyboard/mouse and controller independently.

| Action | Keyboard and mouse | Controller |
| --- | --- | --- |
| Move | WASD | Left stick |
| Look | Mouse | Right stick |
| Fire (tap) | Left mouse | Right trigger |
| Charge shot | Hold fire, release | Hold right trigger, release |
| Aim down sight | Right mouse (hold) | Left trigger (hold) |
| Swap shoulder | V | **R3** (right stick click) |
| Jump | Space | A / Cross |
| Sprint | Shift (hold) | **L3** (left stick click) |
| Dodge roll (grounded) | Ctrl | B / Circle |
| Air dash (airborne) | Ctrl | B / Circle |
| Interact / loot | E | X / Square |
| Use repair kit | H | D-pad up |
| Use overclock cell | F | D-pad left |
| Throw frag charge | G | LB / L1 |
| Loadout & status | Tab | View / Share |
| Pause menu | Escape | Menu / Options |

### Camera

The camera is a close over-the-shoulder rig. The Delver sits off to one side of frame so the crosshair always has a clear line, and the spring arm still collides with geometry so hugging cover pops the view in instead of clipping through walls.

Holding aim pulls the camera in, narrows the field of view to roughly 62% of the hip-fire value, slows the look speed, halves movement speed, and tightens the shot pattern. Pressing **R3** mirrors the rig to the other shoulder mid-fight, which is how you peek right-hand cover without exposing yourself. A dodge roll cancels aim instantly.

Field of view, mouse and stick sensitivity, a separate aim sensitivity multiplier, inverted look, hold-vs-toggle aim, and the default shoulder are all in **Settings → Gameplay**.

### Sprinting

Hold sprint to move 55% faster, at the cost of stamina drain and no regeneration
while it runs. It is forward-only, grounded-only, and mutually exclusive with
aiming — raising the sight or firing drops you out of it. That is what keeps it
from being a free movement upgrade: sprinting is how you cross ground, not how
you fight.

A sprint also commits the Delver to its run direction, overriding the aim
stance, so the character turns to face where it is going.

### Charging

Tapping fire sends a normal pellet. Holding past a short delay begins charging: the buster and reticle brighten through two tiers, and releasing spends the charge on a heavier shot (roughly 2.3x damage at tier 1, 4.2x and piercing at tier 2). The Rapid Buster trades charging for full-auto fire.

## Sectors

Every run generates a new sector from a seed. The host rolls the seed and ships it with the deploy order; each peer then builds the identical level locally, so no level geometry is ever replicated.

Sectors are a grid of 30m cells grown outward from the landing by a frontier walk. Doorways are derived from adjacency *after* placement, which means incidental neighbours become loops and the result reads as a network rather than a branching tree. The guardian always wakes in the deepest node, so clearing a sector ends with the walk back out through everything you opened.

| Section | Contents |
| --- | --- |
| Uplink Landing | Spawn pads and terminals. No hostiles. |
| Conduit Run | Narrow rack-lined corridor, laser hazards, light patrols. |
| Processing Floor | Open arena, heaviest Maverick presence, cover blocks. |
| Routing Hub | Four-way junction, scattered contacts. |
| Coolant Gallery | Trap-dense: laser grids and crusher pistons. Good loot. |
| Arms Vault | Guaranteed weapon cache and salvage chest. |
| Backbone Core | Sentinel Prime. |

Section behaviour is data. [`SectionLibrary.gd`](scripts/system/SectionLibrary.gd) holds one entry per type with its own enemy count and formation, loot count and weighting, chest chance, trap count and kinds, obstacle density, and lighting — tuning a section means editing that one table. Spawn formations (`ring`, `lane`, `flanks`, `scatter`) place points inside a cell without hand-authored markers, and `SectionLibrary.DIFFICULTY` scales enemy, trap, and loot counts across a whole run.

Hazards run on a shared dungeon clock rather than each machine's uptime, so the beam you dodge is the beam the host says is off. The host broadcasts its clock every two seconds; a trap's whole animation is a pure function of that one float, which is why hazards need no replication of their own.

## Items, salvage and the stash

Each Delver deploys with a loadout drawn from their stash, or a free starter kit if they load nothing.

| Item | Effect |
| --- | --- |
| Repair Kit | Restores 45 chassis integrity. |
| Overclock Cell | 12 seconds of unlimited stamina — dashes, rolls, and charged shots cost nothing. |
| Frag Charge | Bouncing thrown explosive, 95 damage inside 6m with linear falloff. Landing one against an exposed boss vent hits far harder than scorching the chassis. |

Salvage caches (chests) are the only source of **parts**, the raw material of the robot-building loop. Parts are banked to the profile today; nothing consumes them yet, which is deliberate — see [the roadmap](docs/Roadmap.md).

The host owns every inventory. Clients ask to spend an item and receive the authoritative count back, so nothing can be conjured or double-spent.

### Extraction

Credit shards, kills, the guardian, and an extraction bonus pay into a **run wallet** that is not yet yours. Extraction is the only moment it becomes real:

- Credits and salvage parts move to the profile.
- Consumables still in your pack are deposited into the **stash**.
- Going down scatters half of your unbanked credits and parts.
- Forfeiting loses all of it, and everything you carried in.

**Stash & Loadout** in the lobby shows what you own and lets you set what to carry in. Loaded stock leaves the stash on deploy and only comes back if you extract with it. The free starter kit spends nothing, so a wiped-out player is never locked out.

### Menus

- **Loadout & Status** (Tab): current buster and its stat block, inventory with per-item use buttons, live status, run wallet vs banked balance, lifetime stats.
- **Pause** (Escape): resume, loadout, settings, forfeit delve, exit game. Forfeiting and exiting both confirm first and state exactly what you are about to lose.
- **Settings**: graphics, audio, per-action rebinding for keyboard/mouse and controller with automatic conflict resolution, and gameplay. Reachable from the lobby and from an in-run pause.
- **Stash & Loadout** (lobby): stored items, salvage total, and the deploy kit.

Menus release the mouse and lock player input. A solo run pauses the scene tree; a run with other players connected does not, because pausing would stall the ENet uplink and time the party out.

### Sentinel Prime

Purging every Maverick does not end the run — it wakes the sector guardian in the core node. Its chassis is armoured and shrugs off most damage; the payload is in the glowing cooling vents. Two shoulder vents are open from the start, the chest core cracks open at 62% health, and the rear heat sink exposes itself at 28%, while its volleys get faster with every phase.

When testing multiple local processes, controller input is accepted only by the focused game window. Click a window or use `Alt+Tab` to transfer controller control; background clients automatically idle their local player.

## Roadmap

[`docs/Roadmap.md`](docs/Roadmap.md) is the task list for taking this to Steam: Deck verification and Linux export, the Mega Man Legends art direction, modular character customization (complexion, hair/helmet, body, arms, legs), and the chest → parts → robot → invasion economy. It marks what exists today against what is planned, and flags the one feature that needs a hosted service.

## Architecture

- `scripts/system/SaveManager.gd`: profile, currency, salvage, stash, deploy loadout, settings, and rebind persistence; audio bus and graphics application.
- `scripts/system/InputSettings.gd`: the single declaration of every input action, installed into the `InputMap` at startup and rebuilt on rebind or reset.
- `scripts/networking/LanDiscovery.gd`: UDP beacon broadcast and the session browser's listener.
- `scripts/networking/NetworkManager.gd`: ENet host/join lifecycle and the server-owned roster, which also carries each player's declared loadout.
- `scripts/system/GameManager.gd`: scene flow, seed handoff, forfeiting, and quitting.
- `scripts/system/SectionLibrary.gd`: the section tuning table and spawn-formation maths.
- `scripts/system/DungeonGenerator.gd`: pure, seeded layout and content generation. Touches no scene tree, which is what makes it both testable and identical on every peer.
- `scripts/system/Dungeon.gd`: builds the generated sector, spawns the party/enemies/loot/hazards, and owns authoritative combat, inventories, and currency.
- `scripts/system/Trap.gd`, `Chest.gd`, `ItemPickup.gd`, `WeaponPickup.gd`: world content.
- `scripts/system/ItemDatabase.gd`: consumable and currency definitions shared by the world, HUD, and inventory.
- `scripts/player/DelverRig.gd`: **the bone contract** — 20 bones at Mega Man Legends proportions, the customization slot map, and the rigid proxy geometry. Every animation and future slot mesh is authored against this file. See [`docs/CharacterArtGuide.md`](docs/CharacterArtGuide.md).
- `scripts/player/DelverAnimSet.gd` / `DelverAnimGraph.gd` / `DelverAnimator.gd`: code-generated clips, the AnimationTree graph, and the runtime node that drives it. The animator is a separate node because the controller runs no logic for remote peers.
- `scripts/player/ActionTable.gd`: committed-action windows (total, i-frames, cancel) as data, asserted against clip lengths by the smoke test.
- `scripts/player/InputBuffer.gd`: short-lived press memory, polled outside every committed-action gate.
- `scripts/player/PlayerController.gd`: movement, camera rig, aiming, stamina, items, and buster data.
- `scripts/player/PlayerHUD.gd`: runtime gameplay HUD and results interface.
- `scripts/ui/`: `UIKit.gd` (shared runtime styling), `GameMenus.gd` (screen stack and input locking), `PauseMenu.gd`, `CharacterMenu.gd`, `SettingsMenu.gd`, `StashMenu.gd`.
- `scripts/weapons/BusterShot.gd`, `Grenade.gd`: deterministic projectiles, server-resolved damage.
- `scripts/enemy/Maverick.gd`, `Boss.gd`: server-owned enemy behavior.
- `scripts/system/SynthAudio.gd`: self-contained generated audio cues.

Input actions are declared only in `InputSettings.gd`, never in `project.godot` — a duplicate there would reappear after every "reset bindings".

The host owns combat outcomes, enemy AI, pickups, inventories, chest rolls, currency awards, hazard damage, and completion. Player movement is owner-authoritative and synchronized using `MultiplayerSynchronizer`, which is suitable for this cooperative prototype but not intended as anti-cheat production networking.

All prototype meshes, materials, sound cues, and effects are created from Godot primitives or generated at runtime. This keeps the project self-contained and avoids third-party licensing requirements.

## Verification

Run the automated smoke test:

```powershell
godot --headless --path "C:\repo\VIBES\Net_Delver" "res://tests/SmokeTest.tscn"
```

Expected output:

```text
NET_DELVER_SMOKE_TEST_OK
```

It covers generator determinism (same seed, identical rooms/enemies/loot), full connectivity, core depth and vault guarantees, doorway/adjacency agreement, spawn margins, the LAN beacon wire format, stash deposit/withdraw/clamping and the starter-kit fallback, the input map and R3 binding, muzzle and aim convergence, charge tiers, projectiles, the aim and shoulder-swap camera blends, every in-run menu, consumables and cooldowns, grenade throwing and blast damage, trap arming and damage, chest loot, credit shards, kill payouts, the boss phase and weak-point rules, extraction banking into the stash, and settings/rebind persistence. It writes to a scratch profile and deletes it, so running it never touches your save.

Check that discovery works on this machine's network stack — it advertises and listens in one process and reports the address it resolved:

```powershell
godot --headless --path "C:\repo\VIBES\Net_Delver" "res://tests/DiscoveryCheck.tscn"
```

Expected output ends with `DISCOVERY_OK` and a real LAN address. An empty address means beacons are decoding but the session would be unjoinable.

Menu navigation by gamepad has its own check, because it fails by doing nothing:

```powershell
godot --path "C:\repo\VIBES\Net_Delver" "res://tests/PadMenuCheck.tscn"
```

Expected output is `NET_DELVER_PAD_MENU_OK`. It pushes real joypad events through the engine and asserts that focus moves and that a focused control actually fires. It also asserts every `ui_*` action still carries a gamepad binding — this build ships them for the direction actions but *not* for `ui_accept`/`ui_cancel`, so `InputSettings` tops them up, and without that a controller can highlight a menu entry but never choose it.

Mouse look needs a real window (capture is a no-op headless), so it has its own check. It pushes genuine motion events through the input pipeline, GUI picking included, and asserts the camera turns:

```powershell
godot --path "C:\repo\VIBES\Net_Delver" "res://tests/MouseLookCheck.tscn"
```

Expected output is `NET_DELVER_MOUSE_LOOK_OK`. It covers yaw and pitch direction, the pitch clamps, sensitivity scaling, inverted look, that the camera pivot tracks the pitch value, and that an open menu stops the camera dead and closing it restores control. Run this after touching the HUD: a Control left on the default `MOUSE_FILTER_STOP` swallows mouse motion before the player ever sees it, and nothing logs an error when it happens.

Three visual harnesses, for the things assertions cannot check. All need a renderer, so no `--headless`:

```powershell
godot --path "C:\repo\VIBES\Net_Delver" "res://tests/AnimationShot.tscn"
```

Renders the Delver side-on through idle, three points of the run cycle, a free-run turn, and an aimed strafe, printing the blend-space coordinate for each. The printed coordinates are the fastest way to check the hybrid: free-running sideways should read `(0, 1)` — the rig turned to face the run — while the same movement while aiming should read `(1, 0)`, a true strafe.

```powershell
godot --path "C:\repo\VIBES\Net_Delver" "res://tests/SectorShot.tscn"
```

Prints the generated layout as an ASCII map and writes a top-down sector render plus an eye-level shot to `user://`. Pass a different seed with `-- --seed=12345`.

```powershell
godot --path "C:\repo\VIBES\Net_Delver" "res://tests/CameraShot.tscn"
```

Renders the hip-fire, aimed, and left-shoulder camera framings for re-tuning the rig.

The project was imported and smoke-tested with Godot `4.6.stable`.

## Known Scope

This is a functional vertical slice, not a production service. Sessions are direct IP/LAN ENet rather than an account, presence, relay, and dedicated-server backend, and there is no host migration, so leaving a run ends the session for the party. Art is placeholder primitives. Salvage parts bank but cannot yet be spent. See [the roadmap](docs/Roadmap.md) for the plan on each of these.
