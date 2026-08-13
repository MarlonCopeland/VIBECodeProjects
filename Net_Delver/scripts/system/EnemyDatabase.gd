class_name EnemyDatabase
extends RefCounted

# ============================================================================
# ENEMY TUNING TABLE — every machine in the sector, and what it sheds.
# ============================================================================
#
# TO ADD AN ENEMY ARCHETYPE:
#   1. Add an id constant and an entry in ARCHETYPES.
#   2. Give it a `behavior` the enemy script understands ("melee", "gunner",
#      "turret"). A new behavior needs a branch in the matching script; a new
#      *variation* of an existing behavior needs nothing but this table.
#   3. Give it a `spawn_weight` above zero to let the generator roll it.
#   4. List what it drops. Drop entries are validated by the smoke test, so a
#      typo in an item id fails loudly instead of silently dropping nothing.
#
# TO RETUNE: change health, speed, aggro, damage, cadence, or drop chances
# below. Nothing else in the project hard-codes them.
#
# FIELD REFERENCE
#   label            Shown wherever the archetype is named.
#   behavior         "melee" closes and swings; "gunner" holds a range band and
#                    shoots; "turret" is wall-mounted and cannot move.
#   health           Hit points.
#   speed            Metres per second while pursuing (ignored by turrets).
#   aggro            Metres at which it wakes. Line of sight is also required.
#   accent           Core/barrel tint, so an archetype is readable at a glance.
#   credits          Paid to the whole party on defeat.
#   spawn_weight     Relative chance the generator picks it. 0 = never rolled
#                    (turrets are placed by wall mounts, not by this weight).
#   attack_*         Melee only: damage, reach, seconds between swings.
#   hold_range       Gunner only: the Vector2 band it tries to keep.
#   fire_cooldown    Gunner/turret: seconds between volleys.
#   track_speed      Turret only: how fast the head swings onto a target.
#   shot             Projectile: speed, damage, count, spread, stagger.
#                    `stagger` above 0 fires the volley as a burst over time.
#   drops            List of {item, chance, count}. chance 1.0 is guaranteed.
#                    `every_player` hands one to each Delver instead of
#                    dropping it on the floor.

const MELEE := "melee"
const RAPID := "rapid"
const SCATTER := "scatter"
const SIEGE := "siege"
const TURRET := "turret"
const GUARDIAN := "guardian"

## Archetypes the mobile-frame generator may roll, in a stable order so a seed
## always produces the same sector on every peer.
const SPAWNABLE: Array[String] = [MELEE, RAPID, SCATTER, SIEGE]

const ARCHETYPES := {
	MELEE: {
		"label": "MAVERICK FRAME",
		"behavior": "melee",
		"health": 78.0, "speed": 3.2, "aggro": 14.0,
		"accent": "ff4d3d", "credits": 65, "spawn_weight": 0.5,
		"attack_damage": 18.0, "attack_range": 2.3, "attack_cooldown": 1.35,
		"drops": [
			{"item": ItemDatabase.SERVO_MOTOR, "chance": 1.0, "count": 1},
			{"item": ItemDatabase.SCRAP_ALLOY, "chance": 0.35, "count": 1},
		],
	},
	RAPID: {
		"label": "RAPID GUNNER",
		"behavior": "gunner",
		"health": 64.0, "speed": 2.8, "aggro": 17.0,
		"accent": "6cff7d", "credits": 65, "spawn_weight": 0.2,
		"hold_range": Vector2(9.0, 13.0), "fire_cooldown": 1.7,
		"shot": {"speed": 30.0, "damage": 6.0, "count": 3, "spread": 0.05, "stagger": 0.14},
		"drops": [
			{"item": ItemDatabase.RAPID_ACTUATOR, "chance": 1.0, "count": 1},
			{"item": ItemDatabase.SCRAP_ALLOY, "chance": 0.2, "count": 1},
			{"item": ItemDatabase.POWER_CELL, "chance": 0.15, "count": 1},
		],
	},
	SCATTER: {
		"label": "SCATTER GUNNER",
		"behavior": "gunner",
		"health": 88.0, "speed": 3.0, "aggro": 15.0,
		"accent": "ffba52", "credits": 65, "spawn_weight": 0.18,
		"hold_range": Vector2(6.0, 9.0), "fire_cooldown": 2.2,
		"shot": {"speed": 24.0, "damage": 5.0, "count": 4, "spread": 0.16, "stagger": 0.0},
		"drops": [
			{"item": ItemDatabase.SCATTER_MANIFOLD, "chance": 1.0, "count": 1},
			{"item": ItemDatabase.SCRAP_ALLOY, "chance": 0.2, "count": 1},
			{"item": ItemDatabase.POWER_CELL, "chance": 0.15, "count": 1},
		],
	},
	SIEGE: {
		"label": "SIEGE GUNNER",
		"behavior": "gunner",
		"health": 110.0, "speed": 2.2, "aggro": 22.0,
		"accent": "ef5d69", "credits": 65, "spawn_weight": 0.12,
		"hold_range": Vector2(13.0, 18.0), "fire_cooldown": 3.1,
		"shot": {"speed": 20.0, "damage": 22.0, "count": 1, "spread": 0.0, "stagger": 0.0},
		"drops": [
			{"item": ItemDatabase.SIEGE_FRAME, "chance": 1.0, "count": 1},
			{"item": ItemDatabase.POWER_CELL, "chance": 0.35, "count": 1},
		],
	},
	TURRET: {
		"label": "SENTRY TURRET",
		"behavior": "turret",
		"health": 60.0, "speed": 0.0, "aggro": 20.0,
		"accent": "9fe8ff", "credits": 65, "spawn_weight": 0.0,
		"fire_cooldown": 1.9, "track_speed": 3.0,
		## Beat between waking and the first bolt, so a turret never opens fire
		## the same frame it sees you.
		"wind_up": 0.6,
		"shot": {"speed": 24.0, "damage": 11.0, "count": 1, "spread": 0.0, "stagger": 0.0},
		"drops": [
			{"item": ItemDatabase.CRYO_MODULE, "chance": 1.0, "count": 1},
			{"item": ItemDatabase.SCRAP_ALLOY, "chance": 0.25, "count": 1},
		],
	},
	GUARDIAN: {
		"label": "SENTINEL PRIME",
		"behavior": "boss",
		"health": 1400.0, "speed": 3.4, "aggro": 999.0,
		"accent": "b48cff", "credits": 450, "spawn_weight": 0.0,
		"contact_damage": 22.0,
		## Damage taken through the armoured chassis. Weak points bypass it.
		"armor_multiplier": 0.22,
		## Health fractions at which the next phase (and its vents) open.
		"phase_thresholds": [0.62, 0.28],
		## Extra movement speed granted at phase 2 and phase 3.
		"phase_speed_bonus": [0.0, 1.6, 1.8],
		## Seconds between volleys, per phase.
		"volley_interval": [Vector2(2.1, 2.9), Vector2(1.35, 2.0), Vector2(0.85, 1.35)],
		"drops": [
			{"item": ItemDatabase.DRAGON_CORE, "chance": 1.0, "count": 1, "every_player": true},
			{"item": ItemDatabase.SCRAP_ALLOY, "chance": 1.0, "count": 2},
			{"item": ItemDatabase.POWER_CELL, "chance": 1.0, "count": 1},
		],
	},
}

static func has_archetype(archetype: String) -> bool:
	return ARCHETYPES.has(archetype)

static func get_archetype(archetype: String) -> Dictionary:
	return ARCHETYPES.get(archetype, ARCHETYPES[MELEE])

static func value(archetype: String, key: String, fallback: float = 0.0) -> float:
	return float(get_archetype(archetype).get(key, fallback))

static func label(archetype: String) -> String:
	return str(get_archetype(archetype).get("label", archetype.to_upper()))

static func accent(archetype: String) -> Color:
	return Color(str(get_archetype(archetype).get("accent", "ff4d3d")))

static func behavior(archetype: String) -> String:
	return str(get_archetype(archetype).get("behavior", "melee"))

static func shot(archetype: String) -> Dictionary:
	var block: Variant = get_archetype(archetype).get("shot", {})
	return block if block is Dictionary else {}

static func drops(archetype: String) -> Array:
	var block: Variant = get_archetype(archetype).get("drops", [])
	return block if block is Array else []

## Picks a mobile archetype by weight. Deterministic for a given rng stream,
## which is what keeps every peer's sector identical.
static func roll_spawn(rng: RandomNumberGenerator) -> String:
	var total := 0.0
	for archetype in SPAWNABLE:
		total += value(archetype, "spawn_weight")
	if total <= 0.0:
		return MELEE
	var pick := rng.randf() * total
	for archetype in SPAWNABLE:
		pick -= value(archetype, "spawn_weight")
		if pick <= 0.0:
			return archetype
	return MELEE

## Rolls one wreck's worth of loot. Returns the floor drops as
## [{"item": id, "count": n}], and reports guaranteed per-player rewards
## separately because those bypass the backpack limit.
static func roll_drops(archetype: String, rng: RandomNumberGenerator) -> Dictionary:
	var floor_drops: Array[Dictionary] = []
	var per_player: Array[Dictionary] = []
	for entry in drops(archetype):
		if rng.randf() > float(entry.get("chance", 1.0)):
			continue
		var award := {"item": str(entry["item"]), "count": int(entry.get("count", 1))}
		if bool(entry.get("every_player", false)):
			per_player.append(award)
		else:
			floor_drops.append(award)
	return {"floor": floor_drops, "every_player": per_player}
