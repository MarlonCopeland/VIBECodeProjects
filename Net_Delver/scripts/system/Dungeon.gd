extends Node3D

const PLAYER_SCENE := preload("res://scenes/Player.tscn")
const ENEMY_SCENE := preload("res://scenes/Maverick.tscn")
const PICKUP_SCRIPT := preload("res://scripts/system/WeaponPickup.gd")
const ITEM_PICKUP_SCRIPT := preload("res://scripts/system/ItemPickup.gd")
const CHEST_SCRIPT := preload("res://scripts/system/Chest.gd")
const TRAP_SCRIPT := preload("res://scripts/system/Trap.gd")
const SHOT_SCRIPT := preload("res://scripts/weapons/BusterShot.gd")
const GRENADE_SCRIPT := preload("res://scripts/weapons/Grenade.gd")
const BOSS_SCRIPT := preload("res://scripts/enemy/Boss.gd")
const TURRET_SCRIPT := preload("res://scripts/enemy/Turret.gd")
const BOSS_GATE_SCRIPT := preload("res://scripts/system/BossGate.gd")

const HOSTILE_COLOR := Color("ff4d3d")
const WEAK_POINT_COLOR := Color("ffd34d")
const BLAST_COLOR := Color("ffb347")

const MAVERICK_CREDITS := 65
const BOSS_CREDITS := 450
const EXTRACTION_BONUS := 250
## Interval between clock broadcasts. Traps derive their whole animation from
## this one float, so a couple of seconds of drift correction is plenty and
## costs one tiny packet.
const CLOCK_SYNC_INTERVAL := 2.0

var layout: Dictionary = {}
var enemies_remaining := 0
var mavericks_purged := 0
var completed := false
var consumed_pickups: Dictionary = {}
var last_shot: Dictionary = {}
var last_item_use: Dictionary = {}
## Server-owned copy of every Delver's inventory: peer id -> {item_id: count}.
var inventories: Dictionary = {}
## Declared loadout per peer, taken from the lobby roster. The host prices
## fire-rate mods and on-hit effects from this rather than trusting the client.
var equipment_by_peer: Dictionary = {}
## Backpack slot count per peer (base + equipment bonus).
var backpack_by_peer: Dictionary = {}
var next_drop_id := 0
## Shared trap clock. Advances locally on every peer and is nudged back into
## line by the host, so hazard phases agree without replicating each trap.
var dungeon_time := 0.0
var players_root: Node3D
var enemies_root: Node3D
var pickups_root: Node3D
var traps_root: Node3D
var shots_root: Node3D
var boss: Node3D
var boss_active := false
var next_shot_id := 0
var _loot_rng := RandomNumberGenerator.new()
var _clock_timer := 0.0

func _ready() -> void:
	# Everything that needs the dungeon finds it through this group rather than
	# assuming it is the current scene — that assumption breaks the moment the
	# dungeon is mounted under another node (tests, future hub scenes).
	add_to_group("dungeon")
	# A seed of 0 means nobody set one (direct scene load, tests); roll one so
	# the sector is still valid rather than degenerate.
	if GameManager.delve_seed == 0:
		GameManager.delve_seed = randi()
	layout = DungeonGenerator.generate(GameManager.delve_seed)
	# Chest contents are host-rolled, so this stream never has to match anyone.
	_loot_rng.seed = GameManager.delve_seed ^ 0x5eed
	_build_environment()
	_build_sector()
	_spawn_party()
	_spawn_enemies()
	_spawn_pickups()
	_spawn_traps()
	shots_root = Node3D.new()
	shots_root.name = "Shots"
	add_child(shots_root)
	# The viewport-level graphics options (MSAA, render scale, shadow atlas)
	# need a live viewport, which only exists once this scene is mounted.
	SaveManager.apply_graphics()
	Input.mouse_mode = Input.MOUSE_MODE_CAPTURED

func _process(delta: float) -> void:
	dungeon_time += delta
	if not multiplayer.is_server():
		return
	_clock_timer -= delta
	if _clock_timer <= 0.0:
		_clock_timer = CLOCK_SYNC_INTERVAL
		sync_clock.rpc(dungeon_time)

@rpc("authority", "call_remote", "unreliable")
func sync_clock(host_time: float) -> void:
	dungeon_time = host_time

func objective_text() -> String:
	if completed:
		return "OBJECTIVE // BACKBONE SECURED"
	if boss_active and is_instance_valid(boss):
		return "OBJECTIVE // SENTINEL PRIME  PHASE %d — STRIKE THE VENTS" % boss.phase
	return "OBJECTIVE // PURGE MAVERICKS  %d REMAIN" % enemies_remaining

## Name of the section a point sits in, for the HUD's location readout.
func section_label(position: Vector3) -> String:
	var kind := DungeonGenerator.section_at(layout, position)
	return SectionLibrary.label(kind) if not kind.is_empty() else "DEEP BACKBONE"

func sector_name() -> String:
	# The seed is the sector designation — two players quoting the same number
	# are describing the same place, which makes runs shareable.
	return "SECTOR %04X // %d NODES" % [GameManager.delve_seed & 0xFFFF, layout["cells"].size()]

func spawn_position_for(peer_id: int) -> Vector3:
	var ids := NetworkManager.players.keys()
	ids.sort()
	var index := maxi(0, ids.find(peer_id))
	var origin: Vector3 = DungeonGenerator.cell_origin(layout["start"])
	return origin + Vector3(-2.4 + index * 2.4, 0.2, 4.0)

func _spawn_party() -> void:
	players_root = Node3D.new()
	players_root.name = "Players"
	add_child(players_root)
	var roster := NetworkManager.players
	if roster.is_empty():
		roster = {1: {"id": 1, "name": "Solo Delver", "host": true, "kit": SaveManager.planned_kit()}}
	for id in roster:
		var player := PLAYER_SCENE.instantiate()
		player.name = str(id)
		players_root.add_child(player)
		player.global_position = spawn_position_for(id)
		# Seeded from the roster rather than RPC'd, because the clients are
		# still loading this scene when the host finishes building it — a sync
		# sent now would land before the node exists.
		var kit: Dictionary = roster[id].get("kit", SaveManager.STARTER_KIT)
		player.inventory = kit.duplicate()
		inventories[id] = kit.duplicate()
		var loadout: Dictionary = roster[id].get("equipment", {"buster": ItemDatabase.BUSTER_STANDARD})
		equipment_by_peer[id] = loadout.duplicate()
		backpack_by_peer[id] = DelverDatabase.backpack_slots(
			ItemDatabase.aggregate_stats(loadout))

func _spawn_enemies() -> void:
	enemies_root = Node3D.new()
	enemies_root.name = "Enemies"
	add_child(enemies_root)
	var spawns: Array = layout["enemies"]
	for index in spawns.size():
		var enemy := ENEMY_SCENE.instantiate()
		enemy.name = "Maverick_%02d" % index
		# Set before add_child so _ready() adopts the archetype's stats.
		enemy.variant = str(spawns[index].get("variant", "melee"))
		enemies_root.add_child(enemy)
		enemy.global_position = spawns[index]["position"]

	# Wall turrets count as enemies: they take buster fire, pay credits, count
	# against the purge, and drop the component their coolant gun is built from.
	var turret_spawns: Array = layout.get("turrets", [])
	for index in turret_spawns.size():
		var turret := StaticBody3D.new()
		turret.name = "Turret_%02d" % index
		turret.set_script(TURRET_SCRIPT)
		turret.add_to_group("enemies")
		enemies_root.add_child(turret)
		turret.global_position = turret_spawns[index]["position"]
		turret.rotation.y = float(turret_spawns[index]["yaw"])
	enemies_remaining = spawns.size() + turret_spawns.size()

func _spawn_pickups() -> void:
	pickups_root = Node3D.new()
	pickups_root.name = "Pickups"
	add_child(pickups_root)
	for index in layout["loot"].size():
		var entry: Dictionary = layout["loot"][index]
		var location: Vector3 = entry["position"]
		match str(entry["kind"]):
			"weapon":
				var weapon_index := int(entry.get("weapon_index", 1))
				_create_pickup("Cache%02d" % index, weapon_index,
					WeaponDatabase.display_name(weapon_index),
					location, WeaponDatabase.color(weapon_index))
			"chest":
				_create_chest("Chest%02d" % index, location)
			"shard":
				_create_item_pickup("Shard%02d" % index, ItemDatabase.CREDIT_SHARD, 45, location, 0.0)
			_:
				# Consumables come back after a while so a long push cannot
				# strand the party with nothing; shards and chests are one-shot.
				var item_id: String = ItemDatabase.ORDER[index % ItemDatabase.ORDER.size()]
				_create_item_pickup("Item%02d" % index, item_id, 1, location, 55.0)

func _spawn_traps() -> void:
	traps_root = Node3D.new()
	traps_root.name = "Traps"
	add_child(traps_root)
	for index in layout["traps"].size():
		var entry: Dictionary = layout["traps"][index]
		var trap := Area3D.new()
		trap.name = "Trap%02d" % index
		trap.set_script(TRAP_SCRIPT)
		trap.kind = str(entry["kind"])
		trap.period = float(entry["period"])
		trap.duty = float(entry["duty"])
		trap.phase = float(entry["phase"])
		trap.span = float(entry["span"])
		trap.yaw = float(entry["yaw"])
		traps_root.add_child(trap)
		trap.global_position = entry["position"]

func _create_chest(node_name: String, location: Vector3) -> void:
	var chest := Node3D.new()
	chest.name = node_name
	chest.set_script(CHEST_SCRIPT)
	chest.position = location
	chest.add_to_group("pickups")
	pickups_root.add_child(chest)

func _create_item_pickup(node_name: String, item_id: String, amount: int, location: Vector3, respawn: float) -> void:
	var pickup := Node3D.new()
	pickup.name = node_name
	pickup.set_script(ITEM_PICKUP_SCRIPT)
	pickup.item_id = item_id
	pickup.amount = amount
	pickup.respawn_time = respawn
	pickup.position = location
	pickup.add_to_group("pickups")
	pickups_root.add_child(pickup)

func _create_pickup(node_name: String, index: int, label: String, location: Vector3, color: Color) -> void:
	var pickup := Node3D.new()
	pickup.name = node_name
	pickup.set_script(PICKUP_SCRIPT)
	pickup.weapon_index = index
	pickup.display_name = label
	pickup.position = location
	pickup.add_to_group("pickups")
	pickups_root.add_child(pickup)
	var mesh := MeshInstance3D.new()
	var shape := CylinderMesh.new()
	shape.top_radius = 0.26
	shape.bottom_radius = 0.38
	shape.height = 1.25
	var material := StandardMaterial3D.new()
	material.albedo_color = color
	material.metallic = 0.6
	material.emission_enabled = true
	material.emission = color
	material.emission_energy_multiplier = 3.0
	shape.material = material
	mesh.mesh = shape
	pickup.add_child(mesh)
	var light := OmniLight3D.new()
	light.light_color = color
	light.light_energy = 2.0
	light.omni_range = 4.0
	pickup.add_child(light)

## The client sends the muzzle position and the direction its reticle resolved
## to, because only the client knows its own camera pitch. The server still
## owns rate limiting, weapon ownership, and all damage.
@rpc("any_peer", "reliable")
func request_fire(peer_id: int, weapon_index: int, origin: Vector3, direction: Vector3, charge_level: int, aiming := false) -> void:
	if not multiplayer.is_server():
		return
	var player := players_root.get_node_or_null(str(peer_id))
	if not player or player.weapon_index != weapon_index:
		return
	var weapon: Dictionary = WeaponDatabase.stats(weapon_index)
	var level := clampi(charge_level, 0, 2)
	# Buster synergy mods come from the roster's declared equipment, priced on
	# the host — a client cannot invent a faster gun than it deployed with.
	var mods: Dictionary = ItemDatabase.aggregate_stats(
		equipment_by_peer.get(peer_id, {})).get("weapon_mods", {}).get(weapon_index, {})
	var now := Time.get_ticks_msec()
	var cooldown := float(weapon.cooldown) \
		* (1.0 if level == 0 else WeaponDatabase.CHARGE_COOLDOWN_SCALE) \
		* float(mods.get("fire_rate", 1.0))
	# Check `has` rather than defaulting to 0: early in engine uptime
	# `now - 0` is still smaller than the cooldown window, which silently ate
	# every shot fired in the first moments of a match.
	if last_shot.has(peer_id) and now - int(last_shot[peer_id]) < int(cooldown * 900.0):
		return
	last_shot[peer_id] = now

	# Never trust the reported muzzle blindly — clamp it back to the body if it
	# is implausibly far from the player who claims to have fired it.
	var start := origin
	if start.distance_to(player.global_position) > 3.0:
		start = player.global_position + Vector3.UP * 1.2
	var aim := direction.normalized()
	if aim.is_zero_approx():
		aim = -player.global_basis.z

	var damage := float(weapon.damage) * WeaponDatabase.CHARGE_DAMAGE[level]
	var pellets := int(weapon.spread) + int(mods.get("pellets", 0))
	if level == 2 and pellets > 1:
		pellets += WeaponDatabase.CHARGE_BONUS_PELLETS   # charged scatter throws wider
	var slow_time := float(mods.get("slow_time", 0.0))
	var slow_factor := float(mods.get("slow_factor", 1.0))

	# Fan the spread around the aim vector itself, not around global up, so the
	# pattern stays correct when firing steeply up or down.
	var right := aim.cross(Vector3.UP).normalized()
	if right.is_zero_approx():
		right = Vector3.RIGHT
	var up := right.cross(aim).normalized()
	# Aiming down the sight tightens the pattern. The client reports its own aim
	# state the same way it reports its muzzle: the host cannot see the camera,
	# and the worst a lie buys is a slightly tighter scatter cone.
	var aim_tighten := 0.55 if aiming else 1.0
	for index in pellets:
		var offset := (float(index) - float(pellets - 1) * 0.5)
		var spread_scale := (0.055 * aim_tighten) if pellets > 1 else 0.0
		var jitter := 0.0 if pellets == 1 else randf_range(-0.012, 0.012) * aim_tighten
		var shot_dir := (aim + right * (offset * spread_scale) + up * jitter).normalized()
		next_shot_id += 1
		spawn_shot.rpc(next_shot_id, start, shot_dir, weapon_index, level, damage,
			float(weapon.speed), peer_id, slow_time, slow_factor)

@rpc("authority", "call_local", "reliable")
func spawn_shot(shot_id: int, origin: Vector3, direction: Vector3, weapon_index: int, level: int, damage: float, speed: float, shooter_id: int, slow_time := 0.0, slow_factor := 1.0) -> void:
	if not shots_root:
		return
	var shot := Node3D.new()
	shot.name = "Shot_%d" % shot_id
	shot.set_script(SHOT_SCRIPT)
	shot.direction = direction
	shot.speed = speed * (1.0 + 0.12 * level)
	shot.damage = damage
	shot.charge_level = level
	shot.weapon_index = weapon_index
	shot.hostile = false
	shot.authoritative = multiplayer.is_server()
	shot.pierce_remaining = WeaponDatabase.CHARGE_PIERCE if level == 2 else 0
	shot.slow_time = slow_time
	shot.slow_factor = slow_factor
	shot.exclude_rids = _player_rids()
	shots_root.add_child(shot)
	shot.global_position = origin

	# Heavy report for a big slug or any charged shot, read off the weapon's own
	# weight rather than a hard-coded index.
	var heavy: bool = float(WeaponDatabase.stats(weapon_index).get("weight", 0.0)) >= 25.0
	var cue := "heavy" if (heavy or level == 2) else "shot"
	SynthAudio.play(cue, (0.85 + weapon_index * 0.09) - level * 0.16, -8.0)
	_muzzle_flash(origin, weapon_index, level, shooter_id)

func spawn_boss_shot(origin: Vector3, direction: Vector3) -> void:
	spawn_enemy_shot(origin, direction, 26.0, 14.0)

## Any hostile machine — the guardian, a gunner Maverick, a wall turret — fires
## through here, so every enemy weapon behaves like the same physics object.
func spawn_enemy_shot(origin: Vector3, direction: Vector3, speed: float, damage: float) -> void:
	if not multiplayer.is_server():
		return
	next_shot_id += 1
	spawn_hostile_shot.rpc(next_shot_id, origin, direction, speed, damage)

@rpc("authority", "call_local", "reliable")
func spawn_hostile_shot(shot_id: int, origin: Vector3, direction: Vector3, speed := 26.0, damage := 14.0) -> void:
	if not shots_root:
		return
	var shot := Node3D.new()
	shot.name = "BossShot_%d" % shot_id
	shot.set_script(SHOT_SCRIPT)
	shot.direction = direction
	shot.speed = speed
	shot.damage = damage
	shot.hostile = true
	shot.authoritative = multiplayer.is_server()
	shot.exclude_rids = _hostile_rids()
	shots_root.add_child(shot)
	shot.global_position = origin

## Consumables are spent on the host so a client cannot conjure kits or frags.
## The origin/direction come from the client for the same reason firing does:
## only it knows where its camera is pointing.
@rpc("any_peer", "reliable")
func request_use_item(peer_id: int, item_id: String, origin: Vector3, direction: Vector3) -> void:
	if not multiplayer.is_server() or not ItemDatabase.has(item_id):
		return
	var player := players_root.get_node_or_null(str(peer_id)) if players_root else null
	if not player:
		return
	var inventory: Dictionary = inventories.get(peer_id, {})
	if int(inventory.get(item_id, 0)) <= 0:
		return

	# Keyed per peer *and* item: throwing a frag should not lock out a heal,
	# only spamming the same item should.
	var key := "%d:%s" % [peer_id, item_id]
	var now := Time.get_ticks_msec()
	var cooldown := int(ItemDatabase.value(item_id, "cooldown", 0.8) * 900.0)
	if last_item_use.has(key) and now - int(last_item_use[key]) < cooldown:
		return
	last_item_use[key] = now

	inventory[item_id] = int(inventory[item_id]) - 1
	inventories[peer_id] = inventory
	player.sync_inventory.rpc(inventory)
	player.apply_item_effect.rpc(item_id)

	if item_id == ItemDatabase.FRAG_CHARGE:
		_throw_grenade(player, origin, direction)

func _throw_grenade(player: Node3D, origin: Vector3, direction: Vector3) -> void:
	var start := origin
	if start.distance_to(player.global_position) > 3.0:
		start = player.global_position + Vector3.UP * 1.4
	var aim := direction.normalized()
	if aim.is_zero_approx():
		aim = -player.global_basis.z
	# A little loft so a flat throw still arcs over cover instead of skidding.
	var launch := aim * ItemDatabase.value(ItemDatabase.FRAG_CHARGE, "throw_speed", 17.0) + Vector3.UP * 3.4
	next_shot_id += 1
	spawn_grenade.rpc(next_shot_id, start + aim * 0.4, launch)

@rpc("authority", "call_local", "reliable")
func spawn_grenade(grenade_id: int, origin: Vector3, launch: Vector3) -> void:
	if not shots_root:
		return
	var grenade := Node3D.new()
	grenade.name = "Grenade_%d" % grenade_id
	grenade.set_script(GRENADE_SCRIPT)
	grenade.velocity = launch
	grenade.damage = ItemDatabase.value(ItemDatabase.FRAG_CHARGE, "damage", 95.0)
	grenade.blast_radius = ItemDatabase.value(ItemDatabase.FRAG_CHARGE, "radius", 6.0)
	grenade.fuse = ItemDatabase.value(ItemDatabase.FRAG_CHARGE, "fuse", 1.9)
	grenade.authoritative = multiplayer.is_server()
	grenade.exclude_rids = _player_rids()
	shots_root.add_child(grenade)
	grenade.global_position = origin

## True when the peer's backpack can take this item: either it stacks onto an
## existing pile, or a free slot remains for a new one.
func _can_accept(peer_id: int, item_id: String) -> bool:
	if not ItemDatabase.uses_backpack(item_id):
		return true
	var inventory: Dictionary = inventories.get(peer_id, {})
	if int(inventory.get(item_id, 0)) > 0:
		return true
	var stacks := 0
	for held_id in inventory:
		if int(inventory[held_id]) > 0 and ItemDatabase.uses_backpack(str(held_id)):
			stacks += 1
	return stacks < int(backpack_by_peer.get(peer_id, DelverDatabase.BASE_BACKPACK_SLOTS))

## `force` bypasses the slot check for guaranteed rewards (the guardian's
## dragon core must never bounce off a full pack).
func _grant_item(peer_id: int, item_id: String, amount: int, force := false) -> void:
	var player := players_root.get_node_or_null(str(peer_id)) if players_root else null
	if not player:
		return
	if not force and not _can_accept(peer_id, item_id):
		return
	var inventory: Dictionary = inventories.get(peer_id, {})
	var limit := ItemDatabase.max_stack(item_id)
	var total := int(inventory.get(item_id, 0)) + amount
	inventory[item_id] = mini(total, limit) if limit > 0 else total
	inventories[peer_id] = inventory
	player.sync_inventory.rpc(inventory)

func _player_rids() -> Array[RID]:
	# Friendly fire is off: shots pass straight through the party.
	var rids: Array[RID] = []
	for player in get_tree().get_nodes_in_group("players"):
		if player is CollisionObject3D:
			rids.append(player.get_rid())
	return rids

## Hostile shots must not collide with the machines firing them — a turret
## volley clipping its own wall mount, or a gunner shooting a nearby Maverick,
## reads as a bug rather than friendly fire.
func _hostile_rids() -> Array[RID]:
	var rids: Array[RID] = []
	for node in get_tree().get_nodes_in_group("bosses") + get_tree().get_nodes_in_group("enemies"):
		if node is CollisionObject3D:
			rids.append(node.get_rid())
	return rids

func _muzzle_flash(origin: Vector3, weapon_index: int, level: int, _shooter_id: int) -> void:
	var flash := OmniLight3D.new()
	flash.light_color = WeaponDatabase.color(weapon_index)
	flash.light_energy = 3.0 + level * 2.5
	flash.omni_range = 3.5 + level
	flash.position = origin
	add_child(flash)
	var tween := create_tween()
	tween.tween_property(flash, "light_energy", 0.0, 0.09)
	tween.tween_callback(flash.queue_free)

## Called by BusterShot on every peer when a shot terminates.
func impact_effect(point: Vector3, weapon_index: int, level: int, hostile: bool, weak_point: bool) -> void:
	var color: Color = HOSTILE_COLOR if hostile else WeaponDatabase.color(weapon_index)
	if weak_point:
		color = WEAK_POINT_COLOR
	var light := OmniLight3D.new()
	light.light_color = color
	light.light_energy = 2.5 + level * 1.5 + (2.0 if weak_point else 0.0)
	light.omni_range = 3.0 + level
	light.position = point
	add_child(light)
	var tween := create_tween()
	tween.tween_property(light, "light_energy", 0.0, 0.14)
	tween.tween_callback(light.queue_free)

	var shards := 3 + level * 2 + (4 if weak_point else 0)
	for index in shards:
		var shard := MeshInstance3D.new()
		var box := BoxMesh.new()
		box.size = Vector3.ONE * (0.07 + 0.03 * level)
		var material := StandardMaterial3D.new()
		material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
		material.albedo_color = color
		material.emission_enabled = true
		material.emission = color
		box.material = material
		shard.mesh = box
		shard.position = point
		add_child(shard)
		var target := point + Vector3(randf_range(-1, 1), randf_range(0.1, 1.4), randf_range(-1, 1))
		var shard_tween := create_tween()
		shard_tween.tween_property(shard, "position", target, 0.22)
		shard_tween.tween_callback(shard.queue_free)
	if weak_point:
		SynthAudio.play("weak", randf_range(1.0, 1.25), -13.0)

## Grenade detonation: a hard flash plus a ring of debris sized to the actual
## blast radius, so players can read how far the damage reached.
func blast_effect(point: Vector3, radius: float) -> void:
	var light := OmniLight3D.new()
	light.light_color = BLAST_COLOR
	light.light_energy = 14.0
	light.omni_range = radius * 2.2
	light.position = point
	add_child(light)
	var tween := create_tween()
	tween.tween_property(light, "light_energy", 0.0, 0.32)
	tween.tween_callback(light.queue_free)

	for index in 18:
		var shard := MeshInstance3D.new()
		var box := BoxMesh.new()
		box.size = Vector3.ONE * randf_range(0.09, 0.2)
		var material := StandardMaterial3D.new()
		material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
		material.albedo_color = BLAST_COLOR
		material.emission_enabled = true
		material.emission = BLAST_COLOR
		box.material = material
		shard.mesh = box
		shard.position = point
		add_child(shard)
		var angle := TAU * float(index) / 18.0
		var target := point + Vector3(cos(angle), randf_range(0.15, 0.9), sin(angle)) * radius * 0.85
		var shard_tween := create_tween()
		shard_tween.tween_property(shard, "position", target, 0.34)
		shard_tween.parallel().tween_property(shard, "scale", Vector3.ZERO, 0.34)
		shard_tween.tween_callback(shard.queue_free)

@rpc("any_peer", "reliable")
func request_pickup(peer_id: int, pickup_name: String) -> void:
	if not multiplayer.is_server() or consumed_pickups.has(pickup_name):
		return
	var player := players_root.get_node_or_null(str(peer_id))
	var pickup := pickups_root.get_node_or_null(pickup_name)
	if not player or not pickup or not pickup.visible:
		return
	if player.global_position.distance_to(pickup.global_position) > 3.2:
		return

	# Weapon caches are permanent swaps; item caches hand over stock and may
	# come back on a timer, so only the one-shot ones get burned for good.
	match str(pickup.pickup_kind()):
		"weapon":
			consumed_pickups[pickup_name] = true
			pickup_consumed.rpc(pickup_name)
			player.equip_weapon.rpc(pickup.weapon_index)
		"chest":
			consumed_pickups[pickup_name] = true
			pickup_consumed.rpc(pickup_name)
			_open_chest(peer_id, player)
		"currency":
			consumed_pickups[pickup_name] = true
			pickup_consumed.rpc(pickup_name)
			player.grant_credits.rpc(int(pickup.amount))
		_:
			# A full backpack refuses the pickup and leaves it in the world for
			# someone with room — the whole point of a slot limit.
			if not _can_accept(peer_id, str(pickup.item_id)):
				return
			if float(pickup.respawn_time) <= 0.0:
				consumed_pickups[pickup_name] = true
			pickup_consumed.rpc(pickup_name)
			_grant_item(peer_id, str(pickup.item_id), int(pickup.amount))

## Chest contents are rolled here rather than at generation time, so two
## players cannot both read the same chest's payload before either opens it.
func _open_chest(peer_id: int, player: Node) -> void:
	var contents: Dictionary = CHEST_SCRIPT.roll_contents(_loot_rng)
	for item_id in contents["items"]:
		_grant_item(peer_id, str(item_id), int(contents["items"][item_id]))
	player.grant_credits.rpc(int(contents["credits"]))
	player.grant_parts.rpc(int(contents["parts"]))

@rpc("authority", "call_local", "reliable")
func pickup_consumed(pickup_name: String) -> void:
	var pickup := pickups_root.get_node_or_null(pickup_name)
	if pickup:
		pickup.consume()

## A player tossing stock out of the backpack for a teammate. The host debits
## the inventory and materialises a ground pickup everyone can see and claim.
@rpc("any_peer", "reliable")
func request_drop_item(peer_id: int, item_id: String) -> void:
	if not multiplayer.is_server() or not ItemDatabase.has(item_id):
		return
	var player := players_root.get_node_or_null(str(peer_id)) if players_root else null
	if not player:
		return
	var inventory: Dictionary = inventories.get(peer_id, {})
	if int(inventory.get(item_id, 0)) <= 0:
		return
	inventory[item_id] = int(inventory[item_id]) - 1
	if int(inventory[item_id]) <= 0:
		inventory.erase(item_id)
	inventories[peer_id] = inventory
	player.sync_inventory.rpc(inventory)
	# Tossed a step forward so the dropper does not immediately stand on it.
	var spot: Vector3 = player.global_position - player.global_basis.z * 1.2 + Vector3.UP * 0.7
	next_drop_id += 1
	spawn_world_drop.rpc(next_drop_id, item_id, 1, spot)

## A dropped or wreck-salvaged item appearing in the world, on every peer.
## One-shot (no respawn) and immediately in the pickups group, so the existing
## interact path claims it with no extra plumbing.
@rpc("authority", "call_local", "reliable")
func spawn_world_drop(drop_id: int, item_id: String, amount: int, location: Vector3) -> void:
	if not pickups_root:
		return
	_create_item_pickup("Drop%04d" % drop_id, item_id, amount, location, 0.0)
	SynthAudio.play("pickup", 0.75, -20.0)

func enemy_defeated(enemy_name: String) -> void:
	if not multiplayer.is_server():
		return
	enemies_remaining -= 1
	award_credits.rpc(MAVERICK_CREDITS)
	_drop_wreck_components(enemy_name)
	enemy_destroyed.rpc(enemy_name, enemies_remaining)
	if enemies_remaining <= 0 and not boss_active:
		spawn_boss.rpc()

## Host-rolled salvage at the wreck. What each archetype sheds, and how often,
## is EnemyDatabase's `drops` table — retuning a drop rate never means opening
## this file.
func _drop_wreck_components(enemy_name: String) -> void:
	var enemy := enemies_root.get_node_or_null(enemy_name) if enemies_root else null
	if not enemy:
		return
	var archetype := EnemyDatabase.TURRET if enemy_name.begins_with("Turret") \
		else str(enemy.get("variant"))
	# Wall turrets die metres up the wall; their salvage falls to the floor
	# where a Delver can actually reach it.
	var spot: Vector3 = enemy.global_position
	spot.y = 0.9
	_scatter_drops(EnemyDatabase.roll_drops(archetype, _loot_rng), spot, 0.8)

## Materialises one rolled drop set: floor items scatter around `origin`, and
## anything flagged `every_player` is handed straight to each Delver.
func _scatter_drops(rolled: Dictionary, origin: Vector3, spread: float) -> void:
	for award in rolled["floor"]:
		next_drop_id += 1
		var offset := Vector3(_loot_rng.randf_range(-spread, spread), 0.0,
			_loot_rng.randf_range(-spread, spread))
		spawn_world_drop.rpc(next_drop_id, str(award["item"]), int(award["count"]), origin + offset)
	for award in rolled["every_player"]:
		for id in inventories:
			# Forced past the slot limit: a guaranteed reward must never bounce
			# off a full pack.
			_grant_item(int(id), str(award["item"]), int(award["count"]), true)

## Credits are shared by the whole party rather than split, so nobody has to
## race a teammate to a kill.
@rpc("authority", "call_local", "reliable")
func award_credits(amount: int) -> void:
	mavericks_purged += 1 if amount == MAVERICK_CREDITS else 0
	for player in get_tree().get_nodes_in_group("players"):
		player.grant_credits(amount)

## Clearing the sector no longer ends the run — it wakes the guardian.
@rpc("authority", "call_local", "reliable")
func spawn_boss() -> void:
	if boss_active:
		return
	boss_active = true
	boss = CharacterBody3D.new()
	boss.name = "SentinelPrime"
	boss.set_script(BOSS_SCRIPT)
	enemies_root.add_child(boss)
	var arrival := boss_spawn_point()
	boss.global_position = arrival
	var bounds := _arena_bounds()
	boss.arena_center = bounds["center"]
	boss.arena_extent = bounds["extent"]
	SynthAudio.play("boss", 0.5, -2.0)
	_boss_arrival(arrival)

## Axis-aligned bounds of the whole arena (core plus annexed cells), inset by
## the spawn margin so the guardian never grinds along a wall.
func _arena_bounds() -> Dictionary:
	var cells: Dictionary = layout["cells"]
	var low := Vector3.INF
	var high := -Vector3.INF
	for coord in cells:
		if not SectionLibrary.is_arena_kind(str(cells[coord]["kind"])):
			continue
		var origin: Vector3 = DungeonGenerator.cell_origin(coord)
		var half := SectionLibrary.CELL_SIZE * 0.5 - 3.0
		low = low.min(origin - Vector3(half, 0, half))
		high = high.max(origin + Vector3(half, 0, half))
	if low == Vector3.INF:
		return {"center": boss_spawn_point(), "extent": Vector3(12.0, 0.0, 12.0)}
	return {"center": (low + high) * 0.5, "extent": (high - low) * 0.5}

## The guardian wakes in the deepest node the generator placed, so clearing the
## sector always ends with the walk back through everything you opened.
func boss_spawn_point() -> Vector3:
	return DungeonGenerator.cell_origin(layout["core"]) + Vector3(0, 0.4, 0)

func _boss_arrival(location: Vector3) -> void:
	var light := OmniLight3D.new()
	light.light_color = Color("ff2f2f")
	light.light_energy = 12.0
	light.omni_range = 22.0
	light.position = location + Vector3.UP * 3.0
	add_child(light)
	var tween := create_tween()
	tween.tween_property(light, "light_energy", 1.2, 1.1)
	tween.tween_callback(light.queue_free)

func boss_defeated() -> void:
	if not multiplayer.is_server():
		return
	award_credits.rpc(BOSS_CREDITS)
	# The guardian's reactor is the whole reason to fight it. What it pays, and
	# which part of it goes straight into every Delver's pack rather than onto
	# the floor, is EnemyDatabase's guardian `drops` table.
	if is_instance_valid(boss):
		var wreck: Vector3 = boss.global_position
		wreck.y = 0.9
		_scatter_drops(EnemyDatabase.roll_drops(EnemyDatabase.GUARDIAN, _loot_rng), wreck, 2.0)
	boss_destroyed.rpc()

@rpc("authority", "call_local", "reliable")
func boss_destroyed() -> void:
	if is_instance_valid(boss):
		_death_effect(boss.global_position + Vector3.UP * 2.0)
		_death_effect(boss.global_position + Vector3.UP * 3.5)
		boss.destroy()
	# Drop the reference immediately: queue_free() leaves it dangling for the
	# rest of the frame, and anything that reads it then hits a freed instance.
	boss = null
	boss_active = false
	complete_delve()

@rpc("authority", "call_local", "reliable")
func enemy_destroyed(enemy_name: String, remaining: int) -> void:
	enemies_remaining = remaining
	var enemy := enemies_root.get_node_or_null(enemy_name)
	if enemy:
		_death_effect(enemy.global_position)
		enemy.destroy()

func _death_effect(location: Vector3) -> void:
	SynthAudio.play("heavy", 0.55, -5.0)
	for index in 8:
		var shard := MeshInstance3D.new()
		var box := BoxMesh.new()
		box.size = Vector3.ONE * 0.16
		var material := StandardMaterial3D.new()
		material.albedo_color = Color("ff493d")
		material.emission_enabled = true
		material.emission = Color("ff493d")
		box.material = material
		shard.mesh = box
		shard.position = location + Vector3.UP
		add_child(shard)
		var target := shard.position + Vector3(randf_range(-2, 2), randf_range(0.5, 3), randf_range(-2, 2))
		var tween := create_tween()
		tween.tween_property(shard, "position", target, 0.35)
		tween.tween_callback(shard.queue_free)

## Extraction. This is the only moment a run's credits become real: they move
## out of the volatile run total and into the saved profile.
@rpc("authority", "call_local", "reliable")
func complete_delve() -> void:
	if completed:
		return
	completed = true
	GameManager.current_state = GameManager.GameState.RESULTS
	SynthAudio.play("victory", 1.0, -5.0)
	Input.mouse_mode = Input.MOUSE_MODE_VISIBLE
	for player in get_tree().get_nodes_in_group("players"):
		if not player.is_multiplayer_authority():
			continue
		player.grant_credits(EXTRACTION_BONUS)
		var banked: int = player.bank_credits()
		# Everything still in the pack comes home. This is the other half of the
		# extraction bargain: die or bail and the kit you carried in is gone.
		var report: Dictionary = player.bank_loadout()
		SaveManager.record_delve(true, mavericks_purged)
		if player.hud:
			player.hud.show_results(banked, report)

## Bailing out. Nothing is banked — the credits picked up this run are gone,
## which is what makes pushing for the extraction worth the risk.
func forfeit_delve() -> int:
	var lost := 0
	for player in get_tree().get_nodes_in_group("players"):
		if player.is_multiplayer_authority():
			lost = player.run_credits
			player.run_credits = 0
	if not completed:
		SaveManager.record_delve(false, mavericks_purged)
	return lost

func local_player() -> Node:
	for player in get_tree().get_nodes_in_group("players"):
		if player.is_multiplayer_authority():
			return player
	return null

func _build_environment() -> void:
	var world := WorldEnvironment.new()
	var environment := Environment.new()
	environment.background_mode = Environment.BG_COLOR
	environment.background_color = Color("02070b")
	environment.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	environment.ambient_light_color = Color("276078")
	environment.ambient_light_energy = 0.62
	environment.fog_enabled = true
	environment.fog_light_color = Color("102d38")
	environment.fog_density = 0.012
	environment.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	world.environment = environment
	# Group + apply so the graphics options can reach an Environment that only
	# exists at runtime, and keep reaching it when the player changes a toggle.
	world.add_to_group("world_environment")
	SaveManager.style_environment(environment)
	add_child(world)
	var light := DirectionalLight3D.new()
	light.rotation_degrees = Vector3(-58, -28, 0)
	light.light_color = Color("8bcde0")
	light.light_energy = 1.15
	light.shadow_enabled = int(SaveManager.get_setting("graphics", "shadows")) > 0
	light.add_to_group("sun")
	add_child(light)

## Builds the generated sector, one cell at a time. Walls are per-side: a side
## with a neighbour gets a doorway gap, a side without gets a solid slab. That
## is the whole of the connectivity contract — a cell literally cannot be sealed
## off from a neighbour the generator placed.
func _build_sector() -> void:
	var cells: Dictionary = layout["cells"]
	var coords: Array = cells.keys()
	coords.sort_custom(func(a, b): return a.x < b.x or (a.x == b.x and a.y < b.y))
	for coord in coords:
		_build_cell(cells[coord])
	for entry in layout["obstacles"]:
		_build_obstacle(entry)

func _build_cell(cell: Dictionary) -> void:
	var coord: Vector2i = cell["coord"]
	var kind: String = cell["kind"]
	var origin := DungeonGenerator.cell_origin(coord)
	var size := SectionLibrary.CELL_SIZE
	var half := size * 0.5

	_box("Floor_%d_%d" % [coord.x, coord.y], Vector3(size, 1.0, size),
		origin + Vector3(0, -0.5, 0), SectionLibrary.floor_color(kind), true)

	var doors: Array = cell["doors"]
	var cells: Dictionary = layout["cells"]
	for direction in DungeonGenerator.DIRECTIONS:
		var neighbour: Vector2i = coord + direction
		var neighbour_kind := str(cells[neighbour]["kind"]) if cells.has(neighbour) else ""
		_build_wall(coord, origin, direction, doors.has(direction), kind, neighbour_kind)

	# One accent light per cell, tinted by section type. It is the main way the
	# player tells a vault from a corridor before stepping inside.
	var light := OmniLight3D.new()
	light.light_color = SectionLibrary.accent(kind)
	light.light_energy = float(SectionLibrary.get_section(kind).get("light_energy", 1.5))
	light.omni_range = size * 0.85
	light.position = origin + Vector3(0, 5.0, 0)
	add_child(light)

	match kind:
		SectionLibrary.START:
			_terminal(origin + Vector3(-5, 0, -half + 3.0))
			_terminal(origin + Vector3(5, 0, -half + 3.0))
			_plate_outline("LandingPad", origin + Vector3(0, 0.04, 4.0), 9.0, SectionLibrary.accent(kind))
		SectionLibrary.CORRIDOR:
			for side in [-1.0, 1.0]:
				for step in 3:
					_server_rack(origin + Vector3(side * (half - 4.0), 2.5, -half + 7.0 + step * 8.0))
			_box("DataLine_%d_%d" % [coord.x, coord.y], Vector3(0.14, 0.04, size - 4.0),
				origin + Vector3(0, 0.03, 0), Color("19d3ae"), false, true)
		SectionLibrary.ARENA:
			for side in [-1.0, 1.0]:
				_server_rack(origin + Vector3(side * (half - 3.5), 2.5, -6.0))
				_server_rack(origin + Vector3(side * (half - 3.5), 2.5, 6.0))
		SectionLibrary.VAULT:
			_plate_outline("VaultPlate", origin + Vector3(0, 0.04, 0), size - 10.0, SectionLibrary.accent(kind))
			_terminal(origin + Vector3(0, 0, -half + 3.0))
		SectionLibrary.GALLERY:
			for side in [-1.0, 1.0]:
				_box("Coolant_%d_%d_%d" % [coord.x, coord.y, int(side)],
					Vector3(1.2, 4.0, size - 6.0), origin + Vector3(side * (half - 2.6), 2.0, 0),
					Color("1c2a30"), true)
		SectionLibrary.CORE:
			_plate_outline("CorePlate", origin + Vector3(0, 0.04, 0), size - 6.0, SectionLibrary.accent(kind))
		SectionLibrary.CORE_EXT:
			_plate_outline("CorePlateExt", origin + Vector3(0, 0.04, 0), size - 6.0, SectionLibrary.accent(kind))
		_:
			_plate_outline("HubRing", origin + Vector3(0, 0.03, 0), size - 14.0, SectionLibrary.accent(kind))

## A side either has a doorway (two slabs with a gap) or it does not (one slab).
## Arena rules layer on top: the wall between two arena cells is omitted so the
## enlarged boss room reads as one floor, and the doorway from anywhere else
## into the arena becomes a Mega Man style corridor with a rising shutter gate.
func _build_wall(coord: Vector2i, origin: Vector3, direction: Vector2i, open: bool,
		kind := "", neighbour_kind := "") -> void:
	var size := SectionLibrary.CELL_SIZE
	var half := size * 0.5
	var in_arena := SectionLibrary.is_arena_kind(kind)
	var neighbour_arena := SectionLibrary.is_arena_kind(neighbour_kind)
	if in_arena and neighbour_arena:
		return
	# The arena's outer shell runs half again as tall, so the guardian's room
	# reads as a cathedral before the fight even starts.
	var height := SectionLibrary.WALL_HEIGHT * (1.5 if in_arena or neighbour_arena else 1.0)
	var color := Color("1a1526") if in_arena or neighbour_arena else Color("151e26")
	var along_x := direction.y != 0     # north/south walls run along X
	var centre := origin + Vector3(float(direction.x) * half, height * 0.5, float(direction.y) * half)
	var tag := "Wall_%d_%d_%d_%d" % [coord.x, coord.y, direction.x, direction.y]

	if not open:
		var full := Vector3(size, height, 1.0) if along_x else Vector3(1.0, height, size)
		_box(tag, full, centre, color, true)
		return

	# Doorway: two shoulders either side of a gap, plus a lintel over the top so
	# the opening reads as a door rather than a missing wall.
	var shoulder := (size - SectionLibrary.DOOR_WIDTH) * 0.5
	var offset := (SectionLibrary.DOOR_WIDTH + shoulder) * 0.5
	for side in [-1.0, 1.0]:
		var slab := Vector3(shoulder, height, 1.0) if along_x else Vector3(1.0, height, shoulder)
		var shift := Vector3(side * offset, 0, 0) if along_x else Vector3(0, 0, side * offset)
		_box(tag, slab, centre + shift, color, true)
	var lintel := Vector3(SectionLibrary.DOOR_WIDTH, height - 5.4, 1.0) if along_x \
		else Vector3(1.0, height - 5.4, SectionLibrary.DOOR_WIDTH)
	_box(tag + "_Lintel", lintel, centre + Vector3(0, height * 0.5 - (height - 5.4) * 0.5, 0), color, true)
	var trim_color := Color("ff4d3d") if in_arena or neighbour_arena else Color("37e6af")
	var trim := Vector3(SectionLibrary.DOOR_WIDTH, 0.08, 0.12) if along_x else Vector3(0.12, 0.08, SectionLibrary.DOOR_WIDTH)
	_box(tag + "_Trim", trim, centre + Vector3(0, -height * 0.5 + 0.06, 0), trim_color, false, true)

	# The threshold into the arena. Built once, from the arena side only —
	# both neighbouring cells walk this doorway, and two stacked gates would
	# fight over the same slab of air.
	if in_arena and not neighbour_arena:
		_build_boss_gate(centre + Vector3(0, -height * 0.5, 0), along_x, tag)

## The classic boss-corridor moment: a short tunnel through the doorway with a
## striped shutter in the middle that rumbles up as you approach and seals
## behind you. The tunnel walls squeeze the party single file, which is what
## sells stepping out into the oversized arena beyond.
func _build_boss_gate(floor_centre: Vector3, along_x: bool, tag: String) -> void:
	var tunnel_length := 7.0
	var tunnel_height := 5.4
	var side_offset := SectionLibrary.DOOR_WIDTH * 0.5 + 0.5
	for side in [-1.0, 1.0]:
		var slab := Vector3(1.0, tunnel_height, tunnel_length) if along_x \
			else Vector3(tunnel_length, tunnel_height, 1.0)
		var shift := Vector3(side * side_offset, tunnel_height * 0.5, 0) if along_x \
			else Vector3(0, tunnel_height * 0.5, side * side_offset)
		_box(tag + "_Corridor", slab, floor_centre + shift, Color("10141c"), true)
		# Guide lights running the tunnel floor.
		var strip := Vector3(0.14, 0.06, tunnel_length) if along_x else Vector3(tunnel_length, 0.06, 0.14)
		var strip_shift := Vector3(side * (side_offset - 0.7), 0.05, 0) if along_x \
			else Vector3(0, 0.05, side * (side_offset - 0.7))
		_box(tag + "_CorridorTrim", strip, floor_centre + strip_shift, Color("ff4d3d"), false, true, 2.0)
	var roof := Vector3(SectionLibrary.DOOR_WIDTH + 2.0, 1.0, tunnel_length) if along_x \
		else Vector3(tunnel_length, 1.0, SectionLibrary.DOOR_WIDTH + 2.0)
	_box(tag + "_CorridorRoof", roof, floor_centre + Vector3(0, tunnel_height + 0.5, 0), Color("10141c"), true)

	var gate := Node3D.new()
	gate.name = tag + "_Gate"
	gate.set_script(BOSS_GATE_SCRIPT)
	gate.door_width = SectionLibrary.DOOR_WIDTH
	gate.door_height = tunnel_height
	gate.along_x = along_x
	add_child(gate)
	gate.global_position = floor_centre

func _build_obstacle(entry: Dictionary) -> void:
	var size: Vector3 = entry["size"]
	var location: Vector3 = entry["position"] + Vector3(0, size.y * 0.5, 0)
	var root := StaticBody3D.new()
	root.name = "Obstacle"
	root.position = location
	root.rotation.y = float(entry["yaw"])
	add_child(root)
	var mesh_instance := MeshInstance3D.new()
	var mesh := BoxMesh.new()
	mesh.size = size
	var material := StandardMaterial3D.new()
	material.albedo_color = Color("1d272e")
	material.metallic = 0.7
	material.roughness = 0.35
	mesh.material = material
	mesh_instance.mesh = mesh
	root.add_child(mesh_instance)
	var collision_shape := CollisionShape3D.new()
	var shape := BoxShape3D.new()
	shape.size = size
	collision_shape.shape = shape
	root.add_child(collision_shape)

## A marked-out zone on the floor, drawn as four thin strips rather than a
## filled slab. A solid emissive square the size of a room lights the whole cell
## and washes everything in it flat — the outline reads as "this area means
## something" without becoming the light source.
func _plate_outline(node_name: String, centre: Vector3, extent: float, color: Color) -> void:
	var thickness := 0.28
	var half := extent * 0.5
	for side in [-1.0, 1.0]:
		_box(node_name, Vector3(extent, 0.06, thickness),
			centre + Vector3(0, 0, side * half), color, false, true, 1.6)
		_box(node_name, Vector3(thickness, 0.06, extent),
			centre + Vector3(side * half, 0, 0), color, false, true, 1.6)

func _server_rack(location: Vector3) -> void:
	_box("Rack", Vector3(3.5, 5, 2.2), location, Color("222b31"), true)
	for row in 4:
		_box("RackLight", Vector3(2.8, 0.08, 0.05), location + Vector3(0, -1.45 + row * 0.88, -1.13), Color("37e6af" if row % 2 == 0 else "ee9b35"), false, true)

func _terminal(location: Vector3) -> void:
	_box("TerminalBody", Vector3(2.5, 1.4, 1.2), location + Vector3(0, 0.7, 0), Color("29363c"), true)
	_box("TerminalScreen", Vector3(1.8, 0.75, 0.06), location + Vector3(0, 1.05, -0.63), Color("36e8b1"), false, true)

## `emission_energy` matters more than it looks: the thin trim strips want a
## hot 3.0, but a floor plate the size of a room at that value blows the whole
## cell to white. Large emissive surfaces pass a fraction of it.
func _box(node_name: String, size: Vector3, location: Vector3, color: Color, collision: bool, emissive := false, emission_energy := 3.0) -> void:
	var root: Node3D = StaticBody3D.new() if collision else Node3D.new()
	root.name = node_name
	root.position = location
	add_child(root)
	var mesh_instance := MeshInstance3D.new()
	var mesh := BoxMesh.new()
	mesh.size = size
	var material := StandardMaterial3D.new()
	material.albedo_color = color
	material.metallic = 0.65
	material.roughness = 0.32
	if emissive:
		material.emission_enabled = true
		material.emission = color
		material.emission_energy_multiplier = emission_energy
	mesh.material = material
	mesh_instance.mesh = mesh
	root.add_child(mesh_instance)
	if collision:
		var collision_shape := CollisionShape3D.new()
		var shape := BoxShape3D.new()
		shape.size = size
		collision_shape.shape = shape
		root.add_child(collision_shape)
