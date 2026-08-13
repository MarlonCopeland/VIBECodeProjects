class_name CraftingDatabase
extends RefCounted

# Recipes for the crafting bench. Plain data, same policy as ItemDatabase:
# the bench UI, the affordability checks, and the stash mutation all read this
# one table.
#
# Costs are components pulled from the stash plus (optionally) salvage parts —
# the generic currency chests have been paying out since the first slice. This
# is the sink that finally makes parts worth extracting.

## recipe id (== the item produced) -> {"components": {id: count}, "parts": int}
const RECIPES := {
	# Weapons — each built from the component its own gunner archetype drops.
	ItemDatabase.BUSTER_RAPID: {
		"components": {ItemDatabase.RAPID_ACTUATOR: 3, ItemDatabase.SCRAP_ALLOY: 2, ItemDatabase.POWER_CELL: 1},
		"parts": 4,
	},
	ItemDatabase.BUSTER_SCATTER: {
		"components": {ItemDatabase.SCATTER_MANIFOLD: 3, ItemDatabase.SCRAP_ALLOY: 2, ItemDatabase.POWER_CELL: 1},
		"parts": 4,
	},
	ItemDatabase.BUSTER_SIEGE: {
		"components": {ItemDatabase.SIEGE_FRAME: 3, ItemDatabase.SCRAP_ALLOY: 3, ItemDatabase.POWER_CELL: 2},
		"parts": 6,
	},

	# Head
	"cryo_visor": {
		"components": {ItemDatabase.CRYO_MODULE: 2, ItemDatabase.POWER_CELL: 2},
		"parts": 3,
	},
	"tempest_visor": {
		"components": {ItemDatabase.RAPID_ACTUATOR: 2, ItemDatabase.POWER_CELL: 2},
		"parts": 3,
	},
	"aegis_helm": {
		"components": {ItemDatabase.SCRAP_ALLOY: 3, ItemDatabase.POWER_CELL: 1},
		"parts": 2,
	},

	# Arms
	"flux_gauntlets": {
		"components": {ItemDatabase.POWER_CELL: 2, ItemDatabase.SERVO_MOTOR: 2},
		"parts": 3,
	},
	"recoil_bracers": {
		"components": {ItemDatabase.SCATTER_MANIFOLD: 2, ItemDatabase.SCRAP_ALLOY: 2},
		"parts": 3,
	},
	"siege_stabilizers": {
		"components": {ItemDatabase.SIEGE_FRAME: 2, ItemDatabase.SERVO_MOTOR: 2},
		"parts": 3,
	},

	# Body
	"plated_chassis": {
		"components": {ItemDatabase.SCRAP_ALLOY: 4, ItemDatabase.SERVO_MOTOR: 2},
		"parts": 4,
	},
	"capacitor_core": {
		"components": {ItemDatabase.POWER_CELL: 3, ItemDatabase.SCRAP_ALLOY: 2},
		"parts": 4,
	},
	"cargo_harness": {
		"components": {ItemDatabase.SCRAP_ALLOY: 3, ItemDatabase.SERVO_MOTOR: 2, ItemDatabase.POWER_CELL: 1},
		"parts": 4,
	},
	# Unique: only forgeable from the guardian's core.
	"guardian_plate": {
		"components": {ItemDatabase.DRAGON_CORE: 1, ItemDatabase.SCRAP_ALLOY: 4, ItemDatabase.POWER_CELL: 2},
		"parts": 8,
	},

	# Legs
	"servo_actuators": {
		"components": {ItemDatabase.SERVO_MOTOR: 3, ItemDatabase.POWER_CELL: 1},
		"parts": 3,
	},
	"coil_springs": {
		"components": {ItemDatabase.SERVO_MOTOR: 2, ItemDatabase.SCRAP_ALLOY: 2},
		"parts": 3,
	},
	"featherweight_frame": {
		"components": {ItemDatabase.SERVO_MOTOR: 2, ItemDatabase.POWER_CELL: 2},
		"parts": 3,
	},

	# Consumables — a cheap way to convert battlefield salvage into supplies.
	ItemDatabase.REPAIR_KIT: {
		"components": {ItemDatabase.SCRAP_ALLOY: 2},
		"parts": 1,
	},
	ItemDatabase.OVERCLOCK_CELL: {
		"components": {ItemDatabase.POWER_CELL: 2},
		"parts": 1,
	},
	ItemDatabase.FRAG_CHARGE: {
		"components": {ItemDatabase.POWER_CELL: 1, ItemDatabase.SCRAP_ALLOY: 1},
		"parts": 1,
	},
}

## Bench display order: weapons, then gear grouped by slot, then consumables.
static func ordered_ids() -> Array[String]:
	var ids: Array[String] = []
	for item_id in ItemDatabase.WEAPON_ORDER:
		if RECIPES.has(item_id):
			ids.append(item_id)
	for item_id in ItemDatabase.EQUIPMENT_ORDER:
		if RECIPES.has(item_id):
			ids.append(item_id)
	for item_id in ItemDatabase.ORDER:
		if RECIPES.has(item_id):
			ids.append(item_id)
	return ids

static func has_recipe(item_id: String) -> bool:
	return RECIPES.has(item_id)

static func components(item_id: String) -> Dictionary:
	var recipe: Dictionary = RECIPES.get(item_id, {})
	var block: Variant = recipe.get("components", {})
	return block if block is Dictionary else {}

static func parts_cost(item_id: String) -> int:
	return int(RECIPES.get(item_id, {}).get("parts", 0))
