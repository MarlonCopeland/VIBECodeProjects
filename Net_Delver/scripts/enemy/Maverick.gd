extends CharacterBody3D

# Maverick combat frame. One scene, four archetypes:
#
#   melee   — closes to arm's reach and swipes. Drops SERVO MOTOR.
#   rapid   — orbits at mid range firing fast weak bursts. Drops RAPID ACTUATOR.
#   scatter — pushes close and fires a wide pellet fan.   Drops SCATTER MANIFOLD.
#   siege   — hangs back and lobs slow heavy slugs.       Drops SIEGE FRAME.
#
# Each gunner fires the hostile version of the buster its component builds, so
# fighting one is a live demo of the weapon you can craft from its wreck.
#
# Mavericks idle until something wakes them: a player entering aggro range or
# any damage taken. That turns each room into an ambush the party can start on
# its own terms instead of a sector-wide bee-line.

const VARIANTS := {
	"melee": {
		"aggro": 14.0, "speed": 3.2, "health": 78.0,
		"attack_damage": 18.0, "attack_range": 2.3, "attack_cooldown": 1.35,
		"accent": "ff4d3d",
	},
	"rapid": {
		"aggro": 17.0, "speed": 2.8, "health": 64.0,
		"hold_range": Vector2(9.0, 13.0), "fire_cooldown": 1.7,
		"shot": {"speed": 30.0, "damage": 6.0, "count": 3, "spread": 0.05, "stagger": 0.14},
		"accent": "6cff7d",
	},
	"scatter": {
		"aggro": 15.0, "speed": 3.0, "health": 88.0,
		"hold_range": Vector2(6.0, 9.0), "fire_cooldown": 2.2,
		"shot": {"speed": 24.0, "damage": 5.0, "count": 4, "spread": 0.16, "stagger": 0.0},
		"accent": "ffba52",
	},
	"siege": {
		"aggro": 22.0, "speed": 2.2, "health": 110.0,
		"hold_range": Vector2(13.0, 18.0), "fire_cooldown": 3.1,
		"shot": {"speed": 20.0, "damage": 22.0, "count": 1, "spread": 0.0, "stagger": 0.0},
		"accent": "ef5d69",
	},
}

@export var variant := "melee"
@export var max_health := 78.0
@export var move_speed := 3.2
@export var attack_damage := 18.0

var health := 78.0
var attack_timer := 0.0
var hit_flash := 0.0
var dead := false
var aggroed := false
var idle_scan := 0.0
## Coolant slow from a Cryo Visor hit: speed is multiplied by slow_factor
## while slow_timer runs.
var slow_timer := 0.0
var slow_factor := 1.0
## Pending burst shots (rapid variant staggers its volley over a few ticks).
var _burst_remaining := 0
var _burst_timer := 0.0

@onready var core: MeshInstance3D = $Model/Core

func _ready() -> void:
	var profile := _profile()
	max_health = float(profile.get("health", max_health))
	move_speed = float(profile.get("speed", move_speed))
	attack_damage = float(profile.get("attack_damage", attack_damage))
	health = max_health
	idle_scan = randf() * TAU
	_paint_variant()

func _profile() -> Dictionary:
	return VARIANTS.get(variant, VARIANTS["melee"])

## Gunners advertise their archetype: the core takes the weapon's colour and a
## barrel replaces part of the face plate. Materials are duplicated first —
## the .tscn shares them across every instance.
func _paint_variant() -> void:
	var accent := Color(str(_profile().get("accent", "ff4d3d")))
	var core_material := core.mesh.surface_get_material(0).duplicate() as StandardMaterial3D
	core_material.albedo_color = accent
	core_material.emission = accent
	core.material_override = core_material
	if variant == "melee":
		return
	var barrel := MeshInstance3D.new()
	barrel.name = "Barrel"
	var mesh := CylinderMesh.new()
	mesh.top_radius = 0.09 if variant == "rapid" else 0.14
	mesh.bottom_radius = 0.16
	mesh.height = 0.7 if variant != "siege" else 1.0
	var material := StandardMaterial3D.new()
	material.albedo_color = accent
	material.metallic = 0.7
	material.emission_enabled = true
	material.emission = accent
	material.emission_energy_multiplier = 1.4
	mesh.material = material
	barrel.mesh = mesh
	barrel.rotation_degrees.x = 90.0
	barrel.position = Vector3(0, 0.05, -0.95)
	$Model.add_child(barrel)

func muzzle_position() -> Vector3:
	return global_position + Vector3.UP * 1.05 - global_basis.z * 1.3

func _physics_process(delta: float) -> void:
	if dead:
		return
	attack_timer = maxf(0.0, attack_timer - delta)
	if hit_flash > 0.0:
		hit_flash -= delta
		core.scale = Vector3.ONE * (1.2 if hit_flash > 0.0 else 1.0)
	if slow_timer > 0.0:
		slow_timer -= delta
	if not multiplayer.is_server():
		return

	var target := _nearest_player()
	if not target:
		velocity = Vector3.ZERO
		return

	var offset: Vector3 = target.global_position - global_position
	offset.y = 0.0
	var distance := offset.length()

	if not aggroed:
		if distance <= float(_profile().get("aggro", 14.0)):
			aggroed = true
			SynthAudio.play("enemy", 1.3, -14.0)
		else:
			# Dormant: a slow sensor sweep, no pursuit.
			idle_scan += delta * 0.5
			rotation.y = idle_scan
			velocity.x = 0.0
			velocity.z = 0.0
			_apply_gravity(delta)
			move_and_slide()
			return

	var speed := move_speed * (slow_factor if slow_timer > 0.0 else 1.0)
	if variant == "melee":
		_tick_melee(target, offset, distance, speed)
	else:
		_tick_gunner(target, offset, distance, speed, delta)
	_apply_gravity(delta)
	move_and_slide()

func _apply_gravity(delta: float) -> void:
	if not is_on_floor():
		velocity.y -= 18.0 * delta
	else:
		velocity.y = -0.5

func _tick_melee(target: Node3D, offset: Vector3, distance: float, speed: float) -> void:
	if distance > float(_profile().get("attack_range", 2.3)):
		velocity.x = offset.normalized().x * speed
		velocity.z = offset.normalized().z * speed
		look_at(global_position + offset.normalized(), Vector3.UP)
	else:
		velocity.x = 0.0
		velocity.z = 0.0
		if attack_timer <= 0.0:
			attack_timer = float(_profile().get("attack_cooldown", 1.35))
			attack.rpc(target.name.to_int())

## Gunners hold a preferred band: close if the target drifts out, back off if
## it pushes in, and fire whenever the cooldown allows.
func _tick_gunner(target: Node3D, offset: Vector3, distance: float, speed: float, delta: float) -> void:
	var band: Vector2 = _profile().get("hold_range", Vector2(9.0, 13.0))
	var direction := offset.normalized()
	if distance > band.y:
		velocity.x = direction.x * speed
		velocity.z = direction.z * speed
	elif distance < band.x:
		velocity.x = -direction.x * speed
		velocity.z = -direction.z * speed
	else:
		velocity.x = move_toward(velocity.x, 0.0, speed)
		velocity.z = move_toward(velocity.z, 0.0, speed)
	look_at(global_position + direction, Vector3.UP)

	# Stagger a pending burst.
	if _burst_remaining > 0:
		_burst_timer -= delta
		if _burst_timer <= 0.0:
			_burst_remaining -= 1
			_burst_timer = float(_profile()["shot"].get("stagger", 0.14))
			_fire_at(target)
		return

	if attack_timer <= 0.0:
		attack_timer = float(_profile().get("fire_cooldown", 2.0))
		var shot: Dictionary = _profile()["shot"]
		if float(shot.get("stagger", 0.0)) > 0.0:
			_burst_remaining = int(shot.get("count", 1))
			_burst_timer = 0.0
		else:
			_fire_volley(target)

func _fire_volley(target: Node3D) -> void:
	var shot: Dictionary = _profile()["shot"]
	var count := int(shot.get("count", 1))
	for index in count:
		_fire_at(target, float(index) - float(count - 1) * 0.5)

func _fire_at(target: Node3D, fan_offset := 0.0) -> void:
	var dungeon := get_tree().get_first_node_in_group("dungeon")
	if not dungeon or not dungeon.has_method("spawn_enemy_shot"):
		return
	var shot: Dictionary = _profile()["shot"]
	var origin := muzzle_position()
	var aim: Vector3 = (target.global_position + Vector3.UP * 1.0 - origin).normalized()
	var right := aim.cross(Vector3.UP).normalized()
	if right.is_zero_approx():
		right = Vector3.RIGHT
	var direction := (aim + right * fan_offset * float(shot.get("spread", 0.0))).normalized()
	dungeon.spawn_enemy_shot(origin, direction,
		float(shot.get("speed", 26.0)), float(shot.get("damage", 10.0)))
	SynthAudio.play("enemy", randf_range(0.9, 1.15), -16.0)

func _nearest_player() -> Node3D:
	var nearest: Node3D
	var best := INF
	for player in get_tree().get_nodes_in_group("players"):
		var distance := global_position.distance_squared_to(player.global_position)
		if distance < best:
			best = distance
			nearest = player
	return nearest

@rpc("authority", "call_local", "reliable")
func attack(peer_id: int) -> void:
	SynthAudio.play("enemy", randf_range(0.85, 1.1), -10.0)
	var dungeon := _dungeon()
	var target := dungeon.get_node_or_null("Players/%d" % peer_id) if dungeon else null
	if multiplayer.is_server() and target and global_position.distance_to(target.global_position) < 3.0:
		target.receive_damage.rpc(attack_damage)

@rpc("authority", "call_local", "reliable")
func take_damage(amount: float) -> void:
	if dead:
		return
	health -= amount
	hit_flash = 0.09
	# Getting shot wakes a dormant frame no matter the range.
	aggroed = true
	if health <= 0.0:
		dead = true
		var dungeon := _dungeon()
		if dungeon:
			dungeon.enemy_defeated(name)

## Coolant debuff from Cryo Visor shots. Refreshes rather than stacks, and the
## core tints icy while it runs so the slow is readable at a glance.
@rpc("authority", "call_local", "reliable")
func apply_slow(duration: float, factor: float) -> void:
	slow_timer = maxf(slow_timer, duration)
	slow_factor = clampf(factor, 0.1, 1.0)
	if core and core.material_override is StandardMaterial3D:
		var material := core.material_override as StandardMaterial3D
		material.emission = Color("9fe8ff")
		var reset := get_tree().create_timer(duration)
		reset.timeout.connect(func():
			if is_instance_valid(self) and not dead and slow_timer <= 0.05:
				material.emission = Color(str(_profile().get("accent", "ff4d3d"))))

@rpc("authority", "call_local", "reliable")
func destroy() -> void:
	queue_free()

func _dungeon() -> Node:
	var node := get_parent()
	while node:
		if node.has_method("enemy_defeated"):
			return node
		node = node.get_parent()
	return null
