class_name WeaponDatabase
extends RefCounted

# ============================================================================
# WEAPON TUNING TABLE — the single source of truth for every buster.
# ============================================================================
#
# TO ADD A WEAPON:
#   1. Add an id constant below.
#   2. Add it to ORDER (append to the END — see the warning on ORDER).
#   3. Add its entry to WEAPONS.
#   4. Optionally add a recipe in CraftingDatabase so it can be built.
#   That is the whole job. The item, the stash tile, the shot colour, the
#   muzzle flash, the impact sparks, the world cache and the HUD all read from
#   here; none of them need touching.
#
# TO RETUNE A WEAPON: change its numbers below. Nothing else reads them.
#
# FIELD REFERENCE
#   name/short/description  Shown in the HUD, stash, and crafting bench.
#   color                   Drives the shot, the muzzle flash, the impact
#                           sparks, the buster mesh, and the charge light.
#   damage                  Per shot, before the charge multiplier.
#   cooldown                Seconds between shots. The host enforces it too.
#   stamina                 Cost per shot, before the charge multiplier.
#   weight                  Counted against LOAD_CAPACITY for the heavy-frame
#                           movement penalty.
#   range                   Advisory: shown in menus. Travel is bounded by the
#                           projectile's own lifetime.
#   spread                  Pellets per shot. 1 is a single slug.
#   speed                   Projectile metres per second.
#   auto                    Held trigger keeps firing; disables charging.
#   chargeable              Hold to build a Mega Man style charged shot.
#   cache                   May appear as a world weapon cache in a vault.

const STANDARD := "buster_standard"
const RAPID := "buster_rapid"
const SCATTER := "buster_scatter"
const SIEGE := "buster_siege"

## Display and wire order. The position in this array IS the integer weapon id
## sent over the network and stored in save files, so APPEND new weapons to the
## end — inserting in the middle renumbers every weapon already in a stash.
const ORDER: Array[String] = [STANDARD, RAPID, SCATTER, SIEGE]

const WEAPONS := {
	STANDARD: {
		"name": "STANDARD BUSTER",
		"short": "STD",
		"description": "Flexible arm cannon. Chargeable. Every Delver's first weapon.",
		"color": "58d6ff",
		"damage": 24.0, "cooldown": 0.32, "stamina": 8.0, "weight": 8.0,
		"range": 45.0, "spread": 1, "speed": 46.0,
		"auto": false, "chargeable": true, "cache": false,
	},
	RAPID: {
		"name": "RAPID BUSTER",
		"short": "RAPID",
		"description": "Full-auto pressure at close and mid range.",
		"color": "6cff7d",
		"damage": 11.0, "cooldown": 0.11, "stamina": 3.0, "weight": 12.0,
		"range": 35.0, "spread": 1, "speed": 54.0,
		"auto": true, "chargeable": false, "cache": true,
	},
	SCATTER: {
		"name": "SCATTER BUSTER",
		"short": "SCTR",
		"description": "Five-pellet crowd sweeper. Short range, big spread.",
		"color": "ffba52",
		"damage": 9.0, "cooldown": 0.65, "stamina": 16.0, "weight": 18.0,
		"range": 22.0, "spread": 5, "speed": 38.0,
		"auto": false, "chargeable": true, "cache": true,
	},
	SIEGE: {
		"name": "SIEGE BUSTER",
		"short": "SIEGE",
		"description": "Long-range burst cannon on a heavy frame.",
		"color": "ef5d69",
		"damage": 58.0, "cooldown": 1.15, "stamina": 26.0, "weight": 29.0,
		"range": 60.0, "spread": 1, "speed": 34.0,
		"auto": false, "chargeable": true, "cache": true,
	},
}

# --- Charge tuning ----------------------------------------------------------
# A tap fires instantly; the charge only starts building after CHARGE_DELAY so
# rapid tapping never accidentally banks a charge.
const CHARGE_DELAY := 0.26
const CHARGE_TIME := 1.05
## Charge fraction at which the shot reaches tier 1. Tier 2 is a full bar.
const CHARGE_MID := 0.45
## Damage and stamina multipliers, indexed by charge tier (0, 1, 2).
const CHARGE_DAMAGE: Array[float] = [1.0, 2.3, 4.2]
const CHARGE_STAMINA: Array[float] = [1.0, 1.8, 2.6]
## Cooldown multiplier for any charged shot, and extra pellets a fully charged
## multi-pellet weapon throws.
const CHARGE_COOLDOWN_SCALE := 0.6
const CHARGE_BONUS_PELLETS := 4
## Targets a fully charged shot punches through before it stops.
const CHARGE_PIERCE := 3

# --- Equip load -------------------------------------------------------------
## Weight budget. At HEAVY_LOAD_RATIO of it or above, the Delver moves slower
## and commits to the longer dodge.
const LOAD_CAPACITY := 40.0
const HEAVY_LOAD_RATIO := 0.7

# ---------------------------------------------------------------- accessors

static func ids() -> Array[String]:
	return ORDER

static func has_weapon(weapon_id: String) -> bool:
	return WEAPONS.has(weapon_id)

## Wire/save id for a weapon, or -1 when it is not a weapon at all.
static func index_of(weapon_id: String) -> int:
	return ORDER.find(weapon_id)

static func id_at(index: int) -> String:
	return ORDER[clampi(index, 0, ORDER.size() - 1)]

static func count() -> int:
	return ORDER.size()

## The full tuning block for a weapon index. Callers read it with dot access
## (`weapon.damage`), which is why the raw entry is handed back rather than a
## filtered copy.
static func stats(index: int) -> Dictionary:
	return WEAPONS[id_at(index)]

static func stats_for(weapon_id: String) -> Dictionary:
	return WEAPONS.get(weapon_id, WEAPONS[STANDARD])

static func display_name(index: int) -> String:
	return str(stats(index).get("name", "BUSTER"))

static func color(index: int) -> Color:
	return Color(str(stats(index).get("color", "58d6ff")))

## Weapon indices the generator may place as world caches, in a stable order so
## every peer rolls the same cache from the same seed.
static func cache_indices() -> Array[int]:
	var indices: Array[int] = []
	for index in ORDER.size():
		if bool(stats(index).get("cache", false)):
			indices.append(index)
	return indices

## The stash/inventory face of a weapon, assembled from the same entry so a
## weapon never has to be described twice. ItemDatabase falls through to this.
static func item_entry(weapon_id: String) -> Dictionary:
	if not WEAPONS.has(weapon_id):
		return {}
	var weapon: Dictionary = WEAPONS[weapon_id]
	return {
		"name": weapon["name"],
		"short": weapon["short"],
		"kind": "weapon",
		"slot": "buster",
		"weapon_index": index_of(weapon_id),
		"description": weapon["description"],
		"color": weapon["color"],
		"max_stack": 1,
	}
