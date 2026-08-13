class_name DungeonGenerator
extends RefCounted

# Seeded layout generator.
#
# Produces a plain-data description of a sector — cells, doors, and every spawn
# point — without touching the scene tree. That separation is what makes the
# result trustworthy in multiplayer: the host rolls a seed, ships it with the
# "deploy" RPC, and every peer runs this same function to reach byte-identical
# geometry. Nothing about the level is replicated at runtime.
#
# It also means the generator is testable on its own: connectivity, room count,
# and determinism are all assertions over the returned dictionary.
#
# Layout growth is a frontier walk on a square grid. Starting from the landing
# cell, a random occupied cell with a free neighbour is chosen and extended.
# Because doors are derived from adjacency *after* placement rather than
# recorded during it, incidental neighbours become loops, and the sector reads
# as a network rather than a tree.

const MIN_ROOMS := 8
const MAX_ROOMS := 13
## The core has to be a real walk from the landing, not the room next door.
const MIN_CORE_DEPTH := 3

const DIRECTIONS: Array[Vector2i] = [
	Vector2i(0, -1), Vector2i(1, 0), Vector2i(0, 1), Vector2i(-1, 0),
]

## Builds the whole sector description. `room_count` of 0 lets the seed pick.
static func generate(seed_value: int, room_count := 0) -> Dictionary:
	var rng := RandomNumberGenerator.new()
	rng.seed = seed_value
	var target := room_count if room_count > 0 else rng.randi_range(MIN_ROOMS, MAX_ROOMS)
	target = maxi(target, MIN_CORE_DEPTH + 1)

	var cells := _grow(rng, target)
	var start := Vector2i.ZERO
	var depths := _depths(cells, start)
	var core := _pick_core(cells, depths)
	cells[core]["kind"] = SectionLibrary.CORE
	_ensure_vault(cells, depths, core, rng)
	# The guardian deserves more floor than one grid cell: annex free
	# neighbours into the arena, then re-derive depths so the new cells are
	# first-class citizens of the connectivity map.
	_annex_arena(cells, core)
	depths = _depths(cells, start)
	_assign_doors(cells)

	var layout := {
		"seed": seed_value,
		"cells": cells,
		"start": start,
		"core": core,
		"depths": depths,
		"enemies": [],
		"loot": [],
		"traps": [],
		"obstacles": [],
		"turrets": [],
	}
	_populate(layout, rng)
	return layout

# ------------------------------------------------------------------- layout

static func _grow(rng: RandomNumberGenerator, target: int) -> Dictionary:
	var cells := {Vector2i.ZERO: {"coord": Vector2i.ZERO, "kind": SectionLibrary.START, "doors": []}}
	var pool := SectionLibrary.random_pool()
	# Cells that might still have room to grow. Pulling from here rather than
	# from every placed cell is what keeps the sector sprawling outward instead
	# of filling in a solid block around the landing.
	var frontier: Array[Vector2i] = [Vector2i.ZERO]

	while cells.size() < target and not frontier.is_empty():
		var index := rng.randi_range(0, frontier.size() - 1)
		var from: Vector2i = frontier[index]
		var options := _free_neighbours(cells, from)
		if options.is_empty():
			frontier.remove_at(index)
			continue
		var coord: Vector2i = options[rng.randi_range(0, options.size() - 1)]
		cells[coord] = {"coord": coord, "kind": _weighted_pick(pool, rng), "doors": []}
		frontier.append(coord)
	return cells

static func _free_neighbours(cells: Dictionary, coord: Vector2i) -> Array[Vector2i]:
	var free: Array[Vector2i] = []
	for direction in DIRECTIONS:
		var candidate := coord + direction
		if not cells.has(candidate):
			free.append(candidate)
	return free

static func _weighted_pick(pool: Dictionary, rng: RandomNumberGenerator) -> String:
	var total := 0.0
	for kind in pool:
		total += float(pool[kind])
	var pick := rng.randf() * total
	for kind in pool:
		pick -= float(pool[kind])
		if pick <= 0.0:
			return str(kind)
	return SectionLibrary.CORRIDOR

## Breadth-first walk distance from the landing, used to place the core and to
## tell the HUD how deep the party has pushed.
static func _depths(cells: Dictionary, start: Vector2i) -> Dictionary:
	var depths := {start: 0}
	var queue: Array[Vector2i] = [start]
	while not queue.is_empty():
		var coord: Vector2i = queue.pop_front()
		for direction in DIRECTIONS:
			var next := coord + direction
			if cells.has(next) and not depths.has(next):
				depths[next] = int(depths[coord]) + 1
				queue.append(next)
	return depths

static func _pick_core(cells: Dictionary, depths: Dictionary) -> Vector2i:
	var best := Vector2i.ZERO
	var best_depth := -1
	for coord in cells:
		var depth := int(depths.get(coord, 0))
		# Ties break on coordinate so the choice is stable across peers, which
		# iterate the dictionary in insertion order but must still agree.
		if depth > best_depth or (depth == best_depth and _before(coord, best)):
			best = coord
			best_depth = depth
	return best

static func _before(a: Vector2i, b: Vector2i) -> bool:
	return a.x < b.x or (a.x == b.x and a.y < b.y)

## Every run guarantees one weapon vault, otherwise a seed can hand the party a
## sector with nothing but the Standard Buster in it.
static func _ensure_vault(cells: Dictionary, depths: Dictionary, core: Vector2i, rng: RandomNumberGenerator) -> void:
	for coord in cells:
		if cells[coord]["kind"] == SectionLibrary.VAULT:
			return
	var candidates: Array[Vector2i] = []
	for coord in cells:
		if coord != core and coord != Vector2i.ZERO and int(depths.get(coord, 0)) >= 1:
			candidates.append(coord)
	if candidates.is_empty():
		return
	candidates.sort_custom(func(a, b): return _before(a, b))
	cells[candidates[rng.randi_range(0, candidates.size() - 1)]]["kind"] = SectionLibrary.VAULT

## Enlarges the guardian's arena by claiming up to two free cells next to the
## core. Only cells whose sole occupied neighbour is the core (or another
## annexed cell) qualify, so the annex never adds a second entrance to the
## arena — the one door in stays the one door in, which is what lets the
## approach corridor be a real threshold moment. Deterministic: candidates are
## visited in sorted order, no rng involved.
static func _annex_arena(cells: Dictionary, core: Vector2i) -> void:
	var arena: Array[Vector2i] = [core]
	for pass_index in 2:
		var candidates: Array[Vector2i] = []
		for owned in arena:
			for direction in DIRECTIONS:
				var coord: Vector2i = owned + direction
				if cells.has(coord) or candidates.has(coord):
					continue
				var outside_neighbours := 0
				for check in DIRECTIONS:
					var neighbour: Vector2i = coord + check
					if cells.has(neighbour) and not arena.has(neighbour):
						outside_neighbours += 1
				if outside_neighbours == 0:
					candidates.append(coord)
		if candidates.is_empty():
			return
		candidates.sort_custom(func(a, b): return _before(a, b))
		var claimed: Vector2i = candidates[0]
		cells[claimed] = {"coord": claimed, "kind": SectionLibrary.CORE_EXT, "doors": []}
		arena.append(claimed)

static func _assign_doors(cells: Dictionary) -> void:
	for coord in cells:
		var doors: Array[Vector2i] = []
		for direction in DIRECTIONS:
			if cells.has(coord + direction):
				doors.append(direction)
		cells[coord]["doors"] = doors

# ------------------------------------------------------------------ content

static func _populate(layout: Dictionary, rng: RandomNumberGenerator) -> void:
	var cells: Dictionary = layout["cells"]
	# Sorted so content ordering does not depend on dictionary iteration order,
	# which would otherwise be the one thing that could drift between peers.
	var coords: Array = cells.keys()
	coords.sort_custom(func(a, b): return _before(a, b))

	for coord in coords:
		var cell: Dictionary = cells[coord]
		var kind: String = cell["kind"]
		var section := SectionLibrary.get_section(kind)
		var origin := cell_origin(coord)

		var enemy_count := SectionLibrary.scaled_count(
			section["enemies"], float(SectionLibrary.DIFFICULTY["enemy_multiplier"]), rng)
		for point in SectionLibrary.spawn_points(str(section["enemy_pattern"]), enemy_count, rng):
			layout["enemies"].append({
				"cell": coord,
				"position": origin + Vector3(point.x, 0.2, point.y),
				"variant": SectionLibrary.roll_variant(rng),
			})

		var trap_count := SectionLibrary.scaled_count(
			Vector2i(int(section["traps"]), int(section["traps"])),
			float(SectionLibrary.DIFFICULTY["trap_multiplier"]), rng)
		var trap_kinds: Array = section["trap_kinds"]
		if not trap_kinds.is_empty():
			for point in SectionLibrary.spawn_points("scatter", trap_count, rng):
				var trap_kind := str(trap_kinds[rng.randi_range(0, trap_kinds.size() - 1)])
				layout["traps"].append({
					"cell": coord,
					"kind": trap_kind,
					"position": origin + Vector3(point.x, 0.0, point.y),
					"period": rng.randf_range(2.6, 4.4),
					"duty": rng.randf_range(0.32, 0.48),
					"phase": rng.randf_range(0.0, 6.0),
					"yaw": rng.randf_range(0.0, PI),
					"span": rng.randf_range(6.0, 11.0),
				})

		var loot_count := SectionLibrary.scaled_count(
			Vector2i(int(section["loot"]), int(section["loot"])),
			float(SectionLibrary.DIFFICULTY["loot_multiplier"]), rng)
		for point in SectionLibrary.spawn_points("scatter", loot_count, rng):
			layout["loot"].append({
				"cell": coord,
				"kind": SectionLibrary.roll_loot(section["loot_table"], rng),
				"position": origin + Vector3(point.x, 0.9, point.y),
			})
		if rng.randf() < float(section["chest_chance"]):
			var spot := SectionLibrary.spawn_points("scatter", 1, rng)[0]
			layout["loot"].append({
				"cell": coord, "kind": "chest",
				"position": origin + Vector3(spot.x, 0.55, spot.y),
			})
		if bool(section["weapon_cache"]):
			var spot := SectionLibrary.spawn_points("ring", 1, rng)[0]
			layout["loot"].append({
				"cell": coord, "kind": "weapon",
				"weapon_index": rng.randi_range(1, 3),
				"position": origin + Vector3(spot.x, 1.1, spot.y),
			})

		for point in SectionLibrary.spawn_points("scatter", int(section["obstacles"]), rng):
			layout["obstacles"].append({
				"cell": coord,
				"position": origin + Vector3(point.x, 0.0, point.y),
				"size": Vector3(rng.randf_range(1.6, 3.4), rng.randf_range(1.4, 3.6), rng.randf_range(1.6, 3.4)),
				"yaw": rng.randf_range(0.0, PI),
			})

		# Wall turrets mount on solid walls only — a doorway side never gets one,
		# so a turret can never shoot straight down the connecting corridor the
		# moment a door comes into view.
		var mounts := SectionLibrary.turret_mounts(kind)
		if mounts > 0:
			var turret_count := rng.randi_range(0, mounts)
			var solid_sides: Array[Vector2i] = []
			for direction in DIRECTIONS:
				if not cells.has(coord + direction):
					solid_sides.append(direction)
			for index in turret_count:
				if solid_sides.is_empty():
					break
				var side: Vector2i = solid_sides.pop_at(rng.randi_range(0, solid_sides.size() - 1))
				var half := SectionLibrary.CELL_SIZE * 0.5
				var along := rng.randf_range(-half * 0.55, half * 0.55)
				var mount := origin + Vector3(
					float(side.x) * (half - 1.1) + float(side.y) * along,
					3.4,
					float(side.y) * (half - 1.1) + float(side.x) * along)
				layout["turrets"].append({
					"cell": coord,
					"position": mount,
					# Face into the room: the wall normal points opposite the side.
					"yaw": atan2(float(-side.x), float(-side.y)),
				})

# ------------------------------------------------------------------ helpers

static func cell_origin(coord: Vector2i) -> Vector3:
	return Vector3(float(coord.x) * SectionLibrary.CELL_SIZE, 0.0, float(coord.y) * SectionLibrary.CELL_SIZE)

## True when every placed cell is walk-reachable from the landing. Doors are
## derived from adjacency, so this is really a check that growth never orphaned
## a cell — cheap to run and the one invariant the whole run depends on.
## (Named `fully_connected` rather than `is_connected`: the latter is an Object
## method, and shadowing it makes the whole class fail to resolve.)
static func fully_connected(layout: Dictionary) -> bool:
	var cells: Dictionary = layout["cells"]
	return _depths(cells, layout["start"]).size() == cells.size()

static func section_at(layout: Dictionary, position: Vector3) -> String:
	var coord := Vector2i(
		int(round(position.x / SectionLibrary.CELL_SIZE)),
		int(round(position.z / SectionLibrary.CELL_SIZE)))
	var cells: Dictionary = layout["cells"]
	return str(cells[coord]["kind"]) if cells.has(coord) else ""
