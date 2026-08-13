# Tuning Net Delver

Every gameplay number lives in a data table, not in the script that consumes
it. This page is the map. If you are changing a number and find yourself
opening a file that is not listed here, that is a bug — tell us.

Run the smoke test after any edit:

```bash
& "C:\Program Files\Godot\Godot_v4.6-stable_win64.exe\Godot_v4.6-stable_win64.exe" --headless --path C:\repo\VIBES\Net_Delver res://tests/SmokeTest.tscn
```

It cross-checks every table against every other one, so a mistyped item id
fails with a named assertion instead of quietly becoming a drop that never
lands. Success prints `NET_DELVER_SMOKE_TEST_OK`.

## The tables

| File | Owns |
| --- | --- |
| `scripts/system/WeaponDatabase.gd` | Busters: damage, cadence, stamina, weight, spread, projectile speed, colour, charge tiers, equip-load capacity |
| `scripts/system/ItemDatabase.gd` | Consumables, components, and all equipment with its stat blocks |
| `scripts/system/CraftingDatabase.gd` | Recipes: component and salvage-part costs |
| `scripts/system/EnemyDatabase.gd` | Every machine: health, speed, aggro, damage, cadence, projectile, spawn weight, and drop tables |
| `scripts/system/DelverDatabase.gd` | Base Delver stats: health, stamina, speed, jump, gravity, sprint, stamina costs, backpack size |
| `scripts/system/SectionLibrary.gd` | Sector layout: room types, enemy/loot/trap counts, turret mounts, lighting |
| `scripts/system/SaveManager.gd` | Stash capacity and expansion pricing, armour colours, starter kit |
| `scripts/system/Chest.gd` | Salvage cache contents (credits, parts, item counts) |
| `scripts/system/Trap.gd` | Hazard damage and re-hit interval |
| `scripts/player/ActionTable.gd` | Dodge timings: startup, i-frames, cancel window |

## Recipes

### Add a weapon

1. `WeaponDatabase.gd`: add an id constant, **append** it to `ORDER`, add its
   entry to `WEAPONS`.
2. `CraftingDatabase.gd`: add a recipe so it can be built.

Nothing else. The stash tile, the shot colour, the muzzle flash, the impact
sparks, the world cache, the HUD readout and the multiplayer sync all read from
that one entry.

> **Append, never insert.** A weapon's position in `ORDER` is the integer id
> sent over the network and written into save files. Inserting one in the
> middle renumbers every weapon already sitting in somebody's stash.

Set `"cache": true` to let it appear in arms vaults.

### Add a piece of equipment

1. `ItemDatabase.gd`: add an entry with `"kind": "equipment"`, the `slot` it
   fills (`head`, `arms`, `body`, `legs`), and a `stats` block.
2. Add its id to `EQUIPMENT_ORDER`.
3. `CraftingDatabase.gd`: add a recipe. The smoke test requires every listed
   piece of equipment to be craftable, so gear cannot become unreachable.

Stat keys: `health` and `stamina` are flat; `speed`, `jump` and `regen` are
fractional (`0.15` means +15%); `backpack` adds slots; `weapon_mod` grants a
synergy that only wakes while its weapon is held.

```gdscript
"cryo_visor": {
    "name": "CRYO VISOR", "short": "CRYO-V",
    "kind": "equipment", "slot": "head",
    "description": "Standard Buster synergy: shots slow targets.",
    "color": "9fe8ff", "max_stack": 1,
    "stats": {"weapon_mod": {"weapon": 0, "slow_factor": 0.65, "slow_time": 2.5}},
},
```

`weapon_mod` accepts `slow_factor` + `slow_time`, `fire_rate` (a cooldown
multiplier, so `0.8` is 20% faster), `pellets` (extra per shot), and
`stamina_cost` (a multiplier).

### Add a consumable or component

Add the entry to `ItemDatabase.ITEMS` and put its id in `ORDER` (consumables,
which also puts it on the HUD strip) or `COMPONENT_ORDER`. A consumable that
*does* something also needs an `action` and a branch in
`PlayerController.apply_item_effect` — that is the one case where behaviour
genuinely needs code.

### Add or retune an enemy

Everything is one entry in `EnemyDatabase.ARCHETYPES`: health, speed, aggro
range, damage, cadence, projectile, spawn weight, and drops.

```gdscript
"rapid": {
    "label": "RAPID GUNNER", "behavior": "gunner",
    "health": 64.0, "speed": 2.8, "aggro": 17.0,
    "accent": "6cff7d", "credits": 65, "spawn_weight": 0.2,
    "hold_range": Vector2(9.0, 13.0), "fire_cooldown": 1.7,
    "shot": {"speed": 30.0, "damage": 6.0, "count": 3, "spread": 0.05, "stagger": 0.14},
    "drops": [
        {"item": ItemDatabase.RAPID_ACTUATOR, "chance": 1.0, "count": 1},
        {"item": ItemDatabase.SCRAP_ALLOY, "chance": 0.2, "count": 1},
    ],
},
```

Add the id to `SPAWNABLE` and give it a `spawn_weight` above zero to let the
generator roll it. `behavior` picks which script drives it: `melee` closes and
swings, `gunner` holds its `hold_range` band and shoots, `turret` is
wall-mounted and cannot move, `boss` is the guardian. A new *variation* of an
existing behaviour needs nothing but this table; only a genuinely new
behaviour needs code.

### Change a drop rate

The `drops` list on the archetype. `chance` is 0–1 and `1.0` is guaranteed;
`count` is how many land. `every_player` hands one to each Delver instead of
dropping it on the floor, bypassing the backpack limit — that is how the
guardian's Dragon Core reaches everyone.

Every component a recipe needs must be dropped by *something*; the smoke test
enforces it, so deleting a drop that a recipe depends on fails loudly.

### Retune the Delver

`DelverDatabase.gd`. Base health, stamina, speed, jump velocity, gravity,
sprint speed and drain, stamina regeneration, roll and air-dash costs, and the
base backpack size. Equipment modifies these rather than replacing them, so a
change here moves every Delver in the game.

### Change stash economics

`SaveManager.gd`: `BASE_STASH_SLOTS`, `STASH_SLOT_STEP`, `MAX_STASH_SLOTS`, and
`STASH_EXPANSION_STEP_COST`. Each expansion costs the step cost times the
number already bought.
