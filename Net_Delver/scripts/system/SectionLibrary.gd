class_name SectionLibrary
extends RefCounted

# The tuning table for procedural sectors.
#
# A dungeon is a grid of same-sized cells. Every cell holds one *section* whose
# type decides what is inside it: how open the floor is, how many Mavericks
# spawn and in what formation, how much loot appears and of what kind, how many
# traps and obstacles, and how the lights read.
#
# Everything a designer would want to move lives in SECTIONS below. Adding a new
# section type is a new entry here plus, if it needs bespoke geometry, a branch
# in DungeonGenerator._decorate. Nothing else needs to know it exists.
#
# Spawn patterns place points inside the cell without hand-authored markers:
#   ring    — evenly spaced around the middle, facing in (arenas, boss rooms)
#   lane    — strung along the cell's long axis (corridors)
#   flanks  — pushed out toward the side walls, none in the middle (galleries)
#   scatter — seeded random inside the safe margin (junctions, vaults)

const CELL_SIZE := 30.0
const WALL_HEIGHT := 7.0
const DOOR_WIDTH := 7.0
## Nothing spawns closer than this to a wall, so a Maverick cannot be dropped
## inside geometry and a chest is always reachable from every angle.
const SPAWN_MARGIN := 5.0

const START := "start"
const CORRIDOR := "corridor"
const ARENA := "arena"
const JUNCTION := "junction"
const GALLERY := "gallery"
const VAULT := "vault"
const CORE := "core"
## Cells annexed onto the core to enlarge the guardian's arena. Placed by rule
## (never rolled), spawn nothing, and share the core's look. The wall between a
## core cell and an ext cell is omitted entirely so the arena reads as one room.
const CORE_EXT := "core_ext"

const SECTIONS := {
	START: {
		"label": "UPLINK LANDING",
		# Weight 0 keeps a section out of the random pool; it is placed by rule.
		"weight": 0.0,
		"enemies": Vector2i(0, 0),
		"enemy_pattern": "scatter",
		"obstacles": 2,
		"traps": 0,
		"trap_kinds": [],
		"loot": 1,
		"loot_table": {"item": 1.0},
		"chest_chance": 0.0,
		"weapon_cache": false,
		"floor_color": "13222b",
		"accent_color": "37e6af",
		"light_energy": 2.2,
	},
	CORRIDOR: {
		"label": "CONDUIT RUN",
		"weight": 3.2,
		"enemies": Vector2i(1, 2),
		"enemy_pattern": "lane",
		"obstacles": 5,
		"traps": 1,
		"trap_kinds": ["laser"],
		"loot": 1,
		"loot_table": {"shard": 0.7, "item": 0.3},
		"chest_chance": 0.08,
		"weapon_cache": false,
		"floor_color": "101b22",
		"accent_color": "19d3ae",
		"light_energy": 1.2,
	},
	ARENA: {
		"label": "PROCESSING FLOOR",
		"weight": 2.6,
		"enemies": Vector2i(3, 5),
		"enemy_pattern": "ring",
		"obstacles": 6,
		"traps": 0,
		"trap_kinds": [],
		"loot": 2,
		"loot_table": {"item": 0.6, "shard": 0.4},
		"chest_chance": 0.3,
		"weapon_cache": false,
		"floor_color": "0e1a20",
		"accent_color": "58d6ff",
		"light_energy": 1.8,
	},
	JUNCTION: {
		"label": "ROUTING HUB",
		"weight": 2.0,
		"enemies": Vector2i(1, 3),
		"enemy_pattern": "scatter",
		"obstacles": 3,
		"traps": 0,
		"trap_kinds": [],
		"loot": 1,
		"loot_table": {"item": 0.5, "shard": 0.5},
		"chest_chance": 0.12,
		"weapon_cache": false,
		"floor_color": "111d24",
		"accent_color": "8be0ff",
		"light_energy": 1.6,
	},
	GALLERY: {
		"label": "COOLANT GALLERY",
		"weight": 1.6,
		"enemies": Vector2i(0, 2),
		"enemy_pattern": "flanks",
		"obstacles": 2,
		"traps": 3,
		"trap_kinds": ["laser", "crusher"],
		"loot": 2,
		"loot_table": {"shard": 0.55, "item": 0.45},
		"chest_chance": 0.4,
		"weapon_cache": false,
		"floor_color": "141a1f",
		"accent_color": "ffba52",
		"light_energy": 1.1,
	},
	VAULT: {
		"label": "ARMS VAULT",
		"weight": 0.9,
		"enemies": Vector2i(1, 2),
		"enemy_pattern": "ring",
		"obstacles": 2,
		"traps": 1,
		"trap_kinds": ["crusher"],
		"loot": 2,
		"loot_table": {"item": 0.6, "shard": 0.4},
		"chest_chance": 1.0,
		"weapon_cache": true,
		"floor_color": "17222a",
		"accent_color": "ef5d69",
		"light_energy": 2.4,
	},
	CORE: {
		"label": "BACKBONE CORE",
		"weight": 0.0,
		"enemies": Vector2i(0, 0),
		"enemy_pattern": "ring",
		"obstacles": 0,
		"traps": 0,
		"trap_kinds": [],
		"loot": 1,
		"loot_table": {"item": 1.0},
		"chest_chance": 0.0,
		"weapon_cache": false,
		"floor_color": "0b1418",
		"accent_color": "ff4d3d",
		"light_energy": 2.0,
	},
	CORE_EXT: {
		"label": "BACKBONE CORE",
		"weight": 0.0,
		"enemies": Vector2i(0, 0),
		"enemy_pattern": "ring",
		"obstacles": 0,
		"traps": 0,
		"trap_kinds": [],
		"loot": 0,
		"loot_table": {},
		"chest_chance": 0.0,
		"weapon_cache": false,
		"floor_color": "0b1418",
		"accent_color": "ff4d3d",
		"light_energy": 2.0,
	},
}

## True for any cell that belongs to the guardian's arena.
static func is_arena_kind(kind_id: String) -> bool:
	return kind_id == CORE or kind_id == CORE_EXT

## Wall turrets a section may mount (rolled 0..n per cell). Sections that read
## as machine rooms get them; the landing and the arena stay clean — the boss
## fight has its own pressure.
const TURRET_MOUNTS := {
	CORRIDOR: 1,
	ARENA: 2,
	JUNCTION: 1,
	GALLERY: 2,
	VAULT: 1,
}

static func turret_mounts(kind_id: String) -> int:
	return int(TURRET_MOUNTS.get(kind_id, 0))

## Maverick variant weights. Melee frames dominate, gunners salt the mix so
## every archetype's crafting component stays obtainable in a normal run.
const ENEMY_VARIANTS := {
	"melee": 0.5,
	"rapid": 0.2,
	"scatter": 0.18,
	"siege": 0.12,
}

static func roll_variant(rng: RandomNumberGenerator) -> String:
	var total := 0.0
	for variant in ENEMY_VARIANTS:
		total += float(ENEMY_VARIANTS[variant])
	var pick := rng.randf() * total
	for variant in ENEMY_VARIANTS:
		pick -= float(ENEMY_VARIANTS[variant])
		if pick <= 0.0:
			return str(variant)
	return "melee"

## Difficulty knobs applied on top of the per-section counts, so a whole run can
## be scaled without editing every entry.
const DIFFICULTY := {
	"enemy_multiplier": 1.0,
	"trap_multiplier": 1.0,
	"loot_multiplier": 1.0,
}

static func get_section(kind: String) -> Dictionary:
	return SECTIONS.get(kind, SECTIONS[CORRIDOR])

static func label(kind: String) -> String:
	return str(get_section(kind).get("label", kind.to_upper()))

static func accent(kind: String) -> Color:
	return Color(str(get_section(kind).get("accent_color", "58d6ff")))

static func floor_color(kind: String) -> Color:
	return Color(str(get_section(kind).get("floor_color", "101b22")))

## Section types eligible for random placement, with their weights.
static func random_pool() -> Dictionary:
	var pool := {}
	for kind in SECTIONS:
		var weight := float(SECTIONS[kind].get("weight", 0.0))
		if weight > 0.0:
			pool[kind] = weight
	return pool

## Local-space points inside one cell, laid out by pattern. Returned in cell
## coordinates centred on (0, 0) so the caller only has to add the cell origin.
static func spawn_points(pattern: String, count: int, rng: RandomNumberGenerator) -> Array[Vector2]:
	var points: Array[Vector2] = []
	if count <= 0:
		return points
	var reach := CELL_SIZE * 0.5 - SPAWN_MARGIN
	match pattern:
		"ring":
			var radius := reach * 0.62
			var turn := rng.randf() * TAU
			for index in count:
				var angle := turn + TAU * float(index) / float(count)
				points.append(Vector2(cos(angle), sin(angle)) * radius)
		"lane":
			for index in count:
				# Spread evenly down the middle, nudged off the centre line so a
				# corridor fight is not a single-file queue.
				var t := (float(index) + 1.0) / (float(count) + 1.0)
				var along := lerpf(-reach, reach, t)
				points.append(Vector2(rng.randf_range(-reach, reach) * 0.35, along))
		"flanks":
			for index in count:
				var side := -1.0 if index % 2 == 0 else 1.0
				var along := rng.randf_range(-reach, reach)
				points.append(Vector2(side * reach * rng.randf_range(0.62, 0.95), along))
		_:
			for index in count:
				points.append(Vector2(rng.randf_range(-reach, reach), rng.randf_range(-reach, reach)))
	return points

## Rolls one loot kind ("item", "shard") from a section's weighted table.
static func roll_loot(table: Dictionary, rng: RandomNumberGenerator) -> String:
	var total := 0.0
	for kind in table:
		total += float(table[kind])
	if total <= 0.0:
		return "shard"
	var pick := rng.randf() * total
	for kind in table:
		pick -= float(table[kind])
		if pick <= 0.0:
			return str(kind)
	return "shard"

static func scaled_count(range_value: Vector2i, multiplier: float, rng: RandomNumberGenerator) -> int:
	var low := mini(range_value.x, range_value.y)
	var high := maxi(range_value.x, range_value.y)
	if high <= 0:
		return 0
	return int(round(float(rng.randi_range(low, high)) * multiplier))
