class_name ItemDatabase
extends RefCounted

# Every item in the game. Kept as plain data so the HUD, the inventory screen,
# the stash, the crafting bench, the world pickups, and the server-side
# inventory all read the same numbers instead of each hard-coding their own.
#
# Kinds:
#   consumable / grenade — usable during a run, stack in the backpack
#   currency             — credit shards, spent on pickup
#   weapon               — a buster; equips into the BUSTER slot
#   equipment            — gear for the HEAD / ARMS / BODY / LEGS slots
#   component            — crafting material dropped by enemies, chests, bosses

const REPAIR_KIT := "repair_kit"
const OVERCLOCK_CELL := "overclock_cell"
const FRAG_CHARGE := "frag_charge"
const CREDIT_SHARD := "credit_shard"

# Weapons. `weapon_index` maps into PlayerController.WEAPONS.
const BUSTER_STANDARD := "buster_standard"
const BUSTER_RAPID := "buster_rapid"
const BUSTER_SCATTER := "buster_scatter"
const BUSTER_SIEGE := "buster_siege"

# Components. Each enemy archetype drops the material for its own weapon, so
# what you fight is what you learn to build.
const SCRAP_ALLOY := "scrap_alloy"
const POWER_CELL := "power_cell"
const SERVO_MOTOR := "servo_motor"
const RAPID_ACTUATOR := "rapid_actuator"
const SCATTER_MANIFOLD := "scatter_manifold"
const SIEGE_FRAME := "siege_frame"
const CRYO_MODULE := "cryo_module"
const DRAGON_CORE := "dragon_core"

## Equipment slot ids, in the order the loadout screen draws them.
const SLOTS: Array[String] = ["head", "arms", "body", "legs", "buster"]

## Order used by the HUD strip and the consumable rows.
const ORDER: Array[String] = [REPAIR_KIT, OVERCLOCK_CELL, FRAG_CHARGE]

const WEAPON_ORDER: Array[String] = [BUSTER_STANDARD, BUSTER_RAPID, BUSTER_SCATTER, BUSTER_SIEGE]

const COMPONENT_ORDER: Array[String] = [
	SCRAP_ALLOY, POWER_CELL, SERVO_MOTOR, RAPID_ACTUATOR,
	SCATTER_MANIFOLD, SIEGE_FRAME, CRYO_MODULE, DRAGON_CORE,
]

const EQUIPMENT_ORDER: Array[String] = [
	"cryo_visor", "tempest_visor", "aegis_helm",
	"flux_gauntlets", "recoil_bracers", "siege_stabilizers",
	"plated_chassis", "capacitor_core", "cargo_harness", "guardian_plate",
	"servo_actuators", "coil_springs", "featherweight_frame",
]

const ITEMS := {
	REPAIR_KIT: {
		"name": "REPAIR KIT",
		"short": "REPAIR",
		"kind": "consumable",
		"description": "Nanite patch. Restores 45 chassis integrity.",
		"color": "6cff7d",
		"heal": 45.0,
		"max_stack": 5,
		"cooldown": 1.1,
		"action": "use_heal",
		"credits": 30,
	},
	OVERCLOCK_CELL: {
		"name": "OVERCLOCK CELL",
		"short": "O-CELL",
		"kind": "consumable",
		"description": "Unlimited stamina for 12s. Dashes and charges cost nothing.",
		"color": "6fd6ff",
		"stamina_time": 12.0,
		"max_stack": 3,
		"cooldown": 1.1,
		"action": "use_stim",
		"credits": 45,
	},
	FRAG_CHARGE: {
		"name": "FRAG CHARGE",
		"short": "FRAG",
		"kind": "grenade",
		"description": "Bouncing demolition charge. 95 damage inside 6m.",
		"color": "ffba52",
		"damage": 95.0,
		"radius": 6.0,
		"fuse": 1.9,
		"throw_speed": 17.0,
		"max_stack": 4,
		"cooldown": 0.85,
		"action": "throw_grenade",
		"credits": 40,
	},
	CREDIT_SHARD: {
		"name": "CREDIT SHARD",
		"short": "SHARD",
		"kind": "currency",
		"description": "Salvaged routing credit. Banked to your profile on extraction.",
		"color": "f2c66d",
		"amount": 45,
		"max_stack": 0,
		"credits": 0,
	},

	# ------------------------------------------------------------- weapons
	BUSTER_STANDARD: {
		"name": "STANDARD BUSTER",
		"short": "STD",
		"kind": "weapon",
		"slot": "buster",
		"weapon_index": 0,
		"description": "Flexible arm cannon. Chargeable. Every Delver's first weapon.",
		"color": "58d6ff",
		"max_stack": 1,
	},
	BUSTER_RAPID: {
		"name": "RAPID BUSTER",
		"short": "RAPID",
		"kind": "weapon",
		"slot": "buster",
		"weapon_index": 1,
		"description": "Full-auto pressure at close and mid range.",
		"color": "6cff7d",
		"max_stack": 1,
	},
	BUSTER_SCATTER: {
		"name": "SCATTER BUSTER",
		"short": "SCTR",
		"kind": "weapon",
		"slot": "buster",
		"weapon_index": 2,
		"description": "Five-pellet crowd sweeper. Short range, big spread.",
		"color": "ffba52",
		"max_stack": 1,
	},
	BUSTER_SIEGE: {
		"name": "SIEGE BUSTER",
		"short": "SIEGE",
		"kind": "weapon",
		"slot": "buster",
		"weapon_index": 3,
		"description": "Long-range burst cannon on a heavy frame.",
		"color": "ef5d69",
		"max_stack": 1,
	},

	# ----------------------------------------------------------- equipment
	# `stats` keys:
	#   health / stamina  — flat additions to the maximums
	#   speed / regen     — fractional bonuses (0.15 = +15%)
	#   jump              — fractional jump HEIGHT bonus
	#   backpack          — extra backpack slots
	#   weapon_mod        — buster synergy, only active with that weapon:
	#     weapon (index), slow_factor/slow_time, fire_rate (cooldown mult),
	#     pellets (extra), stamina_cost (mult)
	"cryo_visor": {
		"name": "CRYO VISOR",
		"short": "CRYO-V",
		"kind": "equipment",
		"slot": "head",
		"description": "Standard Buster synergy: shots coat targets in coolant, slowing them 35% for 2.5s.",
		"color": "9fe8ff",
		"max_stack": 1,
		"stats": {"weapon_mod": {"weapon": 0, "slow_factor": 0.65, "slow_time": 2.5}},
	},
	"tempest_visor": {
		"name": "TEMPEST VISOR",
		"short": "TMP-V",
		"kind": "equipment",
		"slot": "head",
		"description": "Rapid Buster synergy: predictive tracking raises fire rate 20%.",
		"color": "6cff7d",
		"max_stack": 1,
		"stats": {"weapon_mod": {"weapon": 1, "fire_rate": 0.8}},
	},
	"aegis_helm": {
		"name": "AEGIS HELM",
		"short": "AEGIS",
		"kind": "equipment",
		"slot": "head",
		"description": "Reinforced cranial plating. +25 max integrity.",
		"color": "d5e6ee",
		"max_stack": 1,
		"stats": {"health": 25.0},
	},
	"flux_gauntlets": {
		"name": "FLUX GAUNTLETS",
		"short": "FLUX-G",
		"kind": "equipment",
		"slot": "arms",
		"description": "Regenerative actuators. Stamina recharges 45% faster.",
		"color": "6fd6ff",
		"max_stack": 1,
		"stats": {"regen": 0.45},
	},
	"recoil_bracers": {
		"name": "RECOIL BRACERS",
		"short": "RCL-B",
		"kind": "equipment",
		"slot": "arms",
		"description": "Scatter Buster synergy: braced housing fits 2 extra pellets per shell.",
		"color": "ffba52",
		"max_stack": 1,
		"stats": {"weapon_mod": {"weapon": 2, "pellets": 2}},
	},
	"siege_stabilizers": {
		"name": "SIEGE STABILIZERS",
		"short": "SGE-S",
		"kind": "equipment",
		"slot": "arms",
		"description": "Siege Buster synergy: recoil capture cuts stamina cost 30%.",
		"color": "ef5d69",
		"max_stack": 1,
		"stats": {"weapon_mod": {"weapon": 3, "stamina_cost": 0.7}},
	},
	"plated_chassis": {
		"name": "PLATED CHASSIS",
		"short": "PLATE",
		"kind": "equipment",
		"slot": "body",
		"description": "Heavy armour shell. +50 max integrity, -5% speed.",
		"color": "aab8c2",
		"max_stack": 1,
		"stats": {"health": 50.0, "speed": -0.05},
	},
	"capacitor_core": {
		"name": "CAPACITOR CORE",
		"short": "CAP-C",
		"kind": "equipment",
		"slot": "body",
		"description": "Expanded energy reserve. +40 max stamina.",
		"color": "6fd6ff",
		"max_stack": 1,
		"stats": {"stamina": 40.0},
	},
	"cargo_harness": {
		"name": "CARGO HARNESS",
		"short": "CARGO",
		"kind": "equipment",
		"slot": "body",
		"description": "Strapped external webbing. +3 backpack slots.",
		"color": "f2c66d",
		"max_stack": 1,
		"stats": {"backpack": 3},
	},
	"guardian_plate": {
		"name": "GUARDIAN PLATE",
		"short": "GRD-P",
		"kind": "equipment",
		"slot": "body",
		"description": "Unique. Forged from a guardian's dragon core: +35 integrity, +20 stamina, +10% speed.",
		"color": "b48cff",
		"max_stack": 1,
		"stats": {"health": 35.0, "stamina": 20.0, "speed": 0.10},
	},
	"servo_actuators": {
		"name": "SERVO ACTUATORS",
		"short": "SRV-A",
		"kind": "equipment",
		"slot": "legs",
		"description": "Overdriven leg servos. +15% movement speed.",
		"color": "55efb5",
		"max_stack": 1,
		"stats": {"speed": 0.15},
	},
	"coil_springs": {
		"name": "COIL SPRINGS",
		"short": "COIL",
		"kind": "equipment",
		"slot": "legs",
		"description": "Compression launch coils. +30% jump height.",
		"color": "8be0ff",
		"max_stack": 1,
		"stats": {"jump": 0.30},
	},
	"featherweight_frame": {
		"name": "FEATHERWEIGHT FRAME",
		"short": "FTHR",
		"kind": "equipment",
		"slot": "legs",
		"description": "Hollow alloy legs. +20% stamina recharge, +5% speed.",
		"color": "dfe3e8",
		"max_stack": 1,
		"stats": {"regen": 0.20, "speed": 0.05},
	},

	# ---------------------------------------------------------- components
	SCRAP_ALLOY: {
		"name": "SCRAP ALLOY",
		"short": "SCRAP",
		"kind": "component",
		"description": "Structural salvage. The base metal of every recipe.",
		"color": "aab8c2",
		"max_stack": 20,
		"credits": 12,
	},
	POWER_CELL: {
		"name": "POWER CELL",
		"short": "P-CELL",
		"kind": "component",
		"description": "Charged energy cell pulled from machine cores.",
		"color": "ffe066",
		"max_stack": 20,
		"credits": 18,
	},
	SERVO_MOTOR: {
		"name": "SERVO MOTOR",
		"short": "SERVO",
		"kind": "component",
		"description": "Actuator motor stripped from melee Mavericks.",
		"color": "55efb5",
		"max_stack": 20,
		"credits": 20,
	},
	RAPID_ACTUATOR: {
		"name": "RAPID ACTUATOR",
		"short": "R-ACT",
		"kind": "component",
		"description": "Autoloader mechanism dropped by Rapid gunners.",
		"color": "6cff7d",
		"max_stack": 20,
		"credits": 24,
	},
	SCATTER_MANIFOLD: {
		"name": "SCATTER MANIFOLD",
		"short": "S-MAN",
		"kind": "component",
		"description": "Pellet splitter manifold dropped by Scatter gunners.",
		"color": "ffba52",
		"max_stack": 20,
		"credits": 24,
	},
	SIEGE_FRAME: {
		"name": "SIEGE FRAME",
		"short": "S-FRM",
		"kind": "component",
		"description": "Recoil frame section dropped by Siege gunners.",
		"color": "ef5d69",
		"max_stack": 20,
		"credits": 28,
	},
	CRYO_MODULE: {
		"name": "CRYO MODULE",
		"short": "CRYO",
		"kind": "component",
		"description": "Coolant regulator pulled from wall turrets.",
		"color": "9fe8ff",
		"max_stack": 20,
		"credits": 26,
	},
	DRAGON_CORE: {
		"name": "DRAGON CORE",
		"short": "D-CORE",
		"kind": "component",
		"description": "The reactor heart of a backbone guardian. Forges unique gear.",
		"color": "b48cff",
		"max_stack": 5,
		"credits": 200,
	},
}

static func has(item_id: String) -> bool:
	return ITEMS.has(item_id)

static func get_item(item_id: String) -> Dictionary:
	return ITEMS.get(item_id, {})

static func display_name(item_id: String) -> String:
	return str(get_item(item_id).get("name", item_id.to_upper()))

static func short_name(item_id: String) -> String:
	return str(get_item(item_id).get("short", item_id.to_upper()))

static func color(item_id: String) -> Color:
	return Color(str(get_item(item_id).get("color", "ffffff")))

static func max_stack(item_id: String) -> int:
	return int(get_item(item_id).get("max_stack", 1))

static func value(item_id: String, key: String, fallback: float = 0.0) -> float:
	return float(get_item(item_id).get(key, fallback))

static func kind(item_id: String) -> String:
	return str(get_item(item_id).get("kind", ""))

## Equipment/weapon slot this item occupies, or "" for everything else.
static func slot(item_id: String) -> String:
	return str(get_item(item_id).get("slot", ""))

static func is_gear(item_id: String) -> bool:
	var item_kind := kind(item_id)
	return item_kind == "equipment" or item_kind == "weapon"

## Stat block for a piece of equipment ({} for anything else).
static func stats(item_id: String) -> Dictionary:
	var block: Variant = get_item(item_id).get("stats", {})
	return block if block is Dictionary else {}

## PlayerController.WEAPONS index for a weapon item, -1 otherwise.
static func weapon_index(item_id: String) -> int:
	return int(get_item(item_id).get("weapon_index", -1))

## Weapon item id for a WEAPONS index, used to bank a run-found buster.
static func weapon_id_for_index(index: int) -> String:
	for item_id in WEAPON_ORDER:
		if weapon_index(item_id) == index:
			return item_id
	return BUSTER_STANDARD

## Items that consume a backpack slot during a run (per distinct stack).
static func uses_backpack(item_id: String) -> bool:
	var item_kind := kind(item_id)
	return item_kind == "consumable" or item_kind == "grenade" or item_kind == "component"

## The action a consumable is bound to, used by the inventory screen to show
## "[H] USE" style hints without duplicating the binding table.
static func action_for(item_id: String) -> String:
	return str(get_item(item_id).get("action", ""))

## Folds a whole loadout ({slot: item_id}) into one stat block. Static so the
## host can price any peer's equipment straight off the lobby roster.
## Returns flat bonuses, fractional multiplier bonuses, and the per-weapon mods:
## {"health": f, "stamina": f, "speed": f, "jump": f, "regen": f,
##  "backpack": i, "weapon_mods": {weapon_index: {merged mod}}}
static func aggregate_stats(equipment: Dictionary) -> Dictionary:
	var total := {
		"health": 0.0, "stamina": 0.0, "speed": 0.0, "jump": 0.0,
		"regen": 0.0, "backpack": 0, "weapon_mods": {},
	}
	for slot_id in equipment:
		var block := stats(str(equipment[slot_id]))
		total["health"] += float(block.get("health", 0.0))
		total["stamina"] += float(block.get("stamina", 0.0))
		total["speed"] += float(block.get("speed", 0.0))
		total["jump"] += float(block.get("jump", 0.0))
		total["regen"] += float(block.get("regen", 0.0))
		total["backpack"] += int(block.get("backpack", 0))
		if block.has("weapon_mod"):
			var mod: Dictionary = block["weapon_mod"]
			var index := int(mod.get("weapon", -1))
			var merged: Dictionary = total["weapon_mods"].get(index, {})
			for key in mod:
				if key != "weapon":
					merged[key] = mod[key]
			total["weapon_mods"][index] = merged
	return total

## One-line stat summary for tooltips and the loadout screen.
static func stat_summary(item_id: String) -> String:
	var parts: Array[String] = []
	var block := stats(item_id)
	if block.has("health"):
		parts.append("%+d HP" % int(block["health"]))
	if block.has("stamina"):
		parts.append("%+d STAMINA" % int(block["stamina"]))
	if block.has("speed"):
		parts.append("%+d%% SPEED" % int(round(float(block["speed"]) * 100.0)))
	if block.has("jump"):
		parts.append("%+d%% JUMP" % int(round(float(block["jump"]) * 100.0)))
	if block.has("regen"):
		parts.append("%+d%% REGEN" % int(round(float(block["regen"]) * 100.0)))
	if block.has("backpack"):
		parts.append("%+d SLOTS" % int(block["backpack"]))
	if block.has("weapon_mod"):
		var mod: Dictionary = block["weapon_mod"]
		var weapon_name := display_name(weapon_id_for_index(int(mod.get("weapon", 0))))
		if mod.has("slow_factor"):
			parts.append("%s: SLOWS TARGETS" % weapon_name)
		if mod.has("fire_rate"):
			parts.append("%s: +%d%% FIRE RATE" % [weapon_name, int(round((1.0 / float(mod["fire_rate"]) - 1.0) * 100.0))])
		if mod.has("pellets"):
			parts.append("%s: +%d PELLETS" % [weapon_name, int(mod["pellets"])])
		if mod.has("stamina_cost"):
			parts.append("%s: -%d%% STAMINA" % [weapon_name, int(round((1.0 - float(mod["stamina_cost"])) * 100.0))])
	return "  •  ".join(parts)
