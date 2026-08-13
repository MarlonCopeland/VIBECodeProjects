extends CharacterBody3D

# SENTINEL PRIME — the backbone guardian that wakes once every Maverick is
# purged. A dragon-frame war machine: horned head on a serpent neck, swept
# wings, a segmented tail, all hard-surface primitives built at runtime like
# the rest of the project. The chassis is armoured (chip damage only); real
# damage comes from the exposed cooling vents, which open as phases advance.
#
# On defeat it vents its reactor: every member of the party is handed a DRAGON
# CORE, the component that forges the unique Guardian Plate at the bench.

const SHOT_SCRIPT := preload("res://scripts/weapons/BusterShot.gd")

const ARMOR_MULTIPLIER := 0.22
const PHASE_TWO_AT := 0.62
const PHASE_THREE_AT := 0.28

const ARMOR_COLOR := Color("2a2145")      # deep violet plate
const TRIM_COLOR := Color("2fae6e")       # emerald trim
const MEMBRANE_COLOR := Color("ff8c3a")   # burning wing membrane
const EYE_COLOR := Color("ff2f2f")

@export var max_health := 1400.0
@export var contact_damage := 22.0

var health := 1400.0
var phase := 1
var dead := false
var hit_flash := 0.0
var volley_timer := 3.0
var reposition_timer := 0.0
var move_target := Vector3.ZERO
var weak_points: Array[Area3D] = []
var hover_phase := 0.0

## Set by the dungeon when it wakes the guardian, so repositioning roams the
## whole (enlarged) arena instead of a hard-coded rectangle.
var arena_center := Vector3.ZERO
var arena_extent := Vector3(13.0, 0.0, 25.0)

var _chassis: MeshInstance3D
var _model: Node3D
var _head: Node3D
var _neck: Node3D
var _jaw: MeshInstance3D
var _tail: Array[Node3D] = []
var _wings: Array[Node3D] = []
var _eyes: Array[MeshInstance3D] = []

func _ready() -> void:
	add_to_group("bosses")
	health = max_health
	_build_body()
	move_target = global_position
	arena_center = global_position

func _armor_material() -> StandardMaterial3D:
	var material := StandardMaterial3D.new()
	material.albedo_color = ARMOR_COLOR
	material.metallic = 0.95
	material.roughness = 0.2
	return material

func _emissive_material(color: Color, energy := 3.0) -> StandardMaterial3D:
	var material := StandardMaterial3D.new()
	material.albedo_color = color
	material.emission_enabled = true
	material.emission = color
	material.emission_energy_multiplier = energy
	return material

func _plate(parent: Node3D, size: Vector3, offset: Vector3, material: Material) -> MeshInstance3D:
	var plate := MeshInstance3D.new()
	var mesh := BoxMesh.new()
	mesh.size = size
	mesh.material = material
	plate.mesh = mesh
	plate.position = offset
	parent.add_child(plate)
	return plate

func _build_body() -> void:
	var shape := CollisionShape3D.new()
	var capsule := CapsuleShape3D.new()
	capsule.radius = 2.1
	capsule.height = 5.0
	shape.shape = capsule
	shape.position = Vector3(0, 2.5, 0)
	add_child(shape)

	_model = Node3D.new()
	_model.name = "Model"
	_model.position = Vector3(0, 2.5, 0)
	add_child(_model)

	var armor := _armor_material()
	var trim := _emissive_material(TRIM_COLOR, 1.8)
	var membrane := _emissive_material(MEMBRANE_COLOR, 2.2)

	# Torso: a long plated body, ridged with emerald trim lines.
	_chassis = _plate(_model, Vector3(3.6, 2.6, 5.2), Vector3.ZERO, armor)
	_plate(_model, Vector3(3.8, 0.35, 5.4), Vector3(0, 1.35, 0), trim)
	_plate(_model, Vector3(2.6, 0.9, 5.4), Vector3(0, -1.5, 0), armor)

	# Haunches over the hips, like folded rear legs.
	for side in [-1.0, 1.0]:
		_plate(_model, Vector3(1.3, 2.0, 2.2), Vector3(side * 2.2, -0.5, 1.4), armor)
		_plate(_model, Vector3(1.4, 0.25, 2.3), Vector3(side * 2.2, 0.55, 1.4), trim)

	# Serpent neck: two segments stepping up and forward to the head.
	_neck = Node3D.new()
	_neck.name = "Neck"
	_neck.position = Vector3(0, 0.9, -2.4)
	_model.add_child(_neck)
	_plate(_neck, Vector3(1.5, 1.3, 1.8), Vector3(0, 0.3, -0.4), armor)
	_plate(_neck, Vector3(1.2, 1.1, 1.5), Vector3(0, 0.9, -1.6), armor)
	_plate(_neck, Vector3(1.3, 0.2, 1.6), Vector3(0, 1.45, -1.6), trim)

	# Dragon head: skull, snout, working jaw, horns, twin eyes.
	_head = Node3D.new()
	_head.name = "Head"
	_head.position = Vector3(0, 1.5, -2.9)
	_neck.add_child(_head)
	_plate(_head, Vector3(1.5, 1.1, 1.6), Vector3.ZERO, armor)
	_plate(_head, Vector3(0.9, 0.55, 1.3), Vector3(0, -0.1, -1.3), armor)      # snout
	_plate(_head, Vector3(0.95, 0.15, 1.35), Vector3(0, 0.25, -1.25), trim)    # snout ridge
	_jaw = _plate(_head, Vector3(0.8, 0.25, 1.2), Vector3(0, -0.55, -1.1), armor)
	for side in [-1.0, 1.0]:
		# Swept-back horns.
		var horn := _plate(_head, Vector3(0.22, 0.22, 1.3), Vector3(side * 0.55, 0.6, 0.9), trim)
		horn.rotation_degrees.x = -18.0
		var eye := _plate(_head, Vector3(0.28, 0.18, 0.1), Vector3(side * 0.45, 0.18, -0.83),
			_emissive_material(EYE_COLOR, 5.0))
		_eyes.append(eye)

	# Wings: an angled strut plus a burning membrane on each side.
	for side in [-1.0, 1.0]:
		var wing := Node3D.new()
		wing.name = "WingL" if side < 0 else "WingR"
		wing.position = Vector3(side * 1.9, 1.1, -0.4)
		_model.add_child(wing)
		var strut := _plate(wing, Vector3(3.6, 0.28, 0.5), Vector3(side * 1.8, 0.7, 0), armor)
		strut.rotation_degrees.z = side * -22.0
		var sail := _plate(wing, Vector3(3.2, 0.08, 2.6), Vector3(side * 2.0, 0.35, 0.9), membrane)
		sail.rotation_degrees.z = side * -22.0
		_wings.append(wing)

	# Segmented tail, tipped with an emerald blade.
	var parent: Node3D = _model
	var tail_anchor := Vector3(0, 0.2, 2.8)
	for index in 3:
		var segment := Node3D.new()
		segment.name = "Tail%d" % index
		segment.position = tail_anchor if index == 0 else Vector3(0, -0.08, 1.5)
		parent.add_child(segment)
		var girth := 1.1 - 0.28 * index
		_plate(segment, Vector3(girth, girth * 0.8, 1.7), Vector3(0, 0, 0.7), _armor_material())
		_tail.append(segment)
		parent = segment
	_plate(parent, Vector3(0.18, 0.75, 1.0), Vector3(0, 0, 1.7), trim)

	# Weak points: shoulder vents open in phase 1, the core cracks open in
	# phase 2, and the rear heat sink exposes itself in phase 3.
	_add_weak_point("VentLeft", Vector3(-2.4, 0.35, -1.6), 0.75, 3.0, 1)
	_add_weak_point("VentRight", Vector3(2.4, 0.35, -1.6), 0.75, 3.0, 1)
	_add_weak_point("Core", Vector3(0, -0.4, -2.4), 0.95, 4.0, 2)
	_add_weak_point("HeatSink", Vector3(0, 1.0, 2.2), 1.05, 5.0, 3)
	_refresh_weak_points()

func _add_weak_point(point_name: String, offset: Vector3, radius: float, multiplier: float, from_phase: int) -> void:
	var area := Area3D.new()
	area.name = point_name
	area.position = offset
	area.add_to_group("weakpoints")
	area.set_meta("from_phase", from_phase)
	# BusterShot reads these off the collider it hits. Metadata (not set())
	# because a plain Area3D has no such properties to assign.
	area.set_meta("boss_root", self)
	area.set_meta("damage_multiplier", multiplier)
	_model.add_child(area)

	var collision := CollisionShape3D.new()
	var sphere := SphereShape3D.new()
	sphere.radius = radius
	collision.shape = sphere
	area.add_child(collision)

	var glow := MeshInstance3D.new()
	var mesh := SphereMesh.new()
	mesh.radius = radius
	mesh.height = radius * 2.0
	var material := StandardMaterial3D.new()
	material.albedo_color = Color("ffd34d")
	material.emission_enabled = true
	material.emission = Color("ffb324")
	material.emission_energy_multiplier = 4.5
	mesh.material = material
	glow.mesh = mesh
	glow.name = "Glow"
	area.add_child(glow)

	var light := OmniLight3D.new()
	light.light_color = Color("ffb324")
	light.light_energy = 2.4
	light.omni_range = 5.0
	area.add_child(light)

	weak_points.append(area)

## Weak points only exist (and only take hits) once their phase is reached.
func _refresh_weak_points() -> void:
	for area in weak_points:
		var open: bool = phase >= int(area.get_meta("from_phase"))
		area.visible = open
		area.monitorable = open
		# Closing the shape stops rays from registering the vent at all.
		var collision := area.get_child(0) as CollisionShape3D
		if collision:
			collision.disabled = not open

func _physics_process(delta: float) -> void:
	if dead:
		return
	hover_phase += delta
	_animate_frame()
	if hit_flash > 0.0:
		hit_flash -= delta
		for eye in _eyes:
			eye.scale = Vector3.ONE * (1.35 if hit_flash > 0.0 else 1.0)

	if not multiplayer.is_server():
		return

	var target := _nearest_player()
	if not target:
		velocity = Vector3.ZERO
		move_and_slide()
		return

	_face(target.global_position, delta)

	volley_timer -= delta
	if volley_timer <= 0.0:
		volley_timer = _volley_interval()
		_fire_volley(target)

	# Strafe around the party rather than bee-lining, so the fight has space.
	reposition_timer -= delta
	if reposition_timer <= 0.0:
		reposition_timer = randf_range(1.6, 3.2)
		var angle := randf() * TAU
		var spread := randf_range(7.0, 12.0)
		move_target = target.global_position + Vector3(cos(angle) * spread, 0.0, sin(angle) * spread)
		move_target.x = clampf(move_target.x, arena_center.x - arena_extent.x, arena_center.x + arena_extent.x)
		move_target.z = clampf(move_target.z, arena_center.z - arena_extent.z, arena_center.z + arena_extent.z)

	var to_target := move_target - global_position
	to_target.y = 0.0
	var speed := 3.4 + (1.6 if phase >= 2 else 0.0) + (1.8 if phase >= 3 else 0.0)
	if to_target.length() > 1.5:
		velocity.x = to_target.normalized().x * speed
		velocity.z = to_target.normalized().z * speed
	else:
		velocity.x = move_toward(velocity.x, 0.0, speed)
		velocity.z = move_toward(velocity.z, 0.0, speed)

	if not is_on_floor():
		velocity.y -= 18.0 * delta
	else:
		velocity.y = -0.5
	move_and_slide()

	# Body-check anyone who stands underneath it.
	if global_position.distance_to(target.global_position) < 3.4 and volley_timer > 0.35:
		volley_timer = 0.35
		target.receive_damage.rpc(contact_damage)

## Idle motion runs on every peer: hover bob, wing beat, tail sway, jaw work.
## Faster and angrier as phases advance.
func _animate_frame() -> void:
	var tempo := 1.0 + 0.35 * float(phase - 1)
	if _model:
		_model.position.y = 2.5 + sin(hover_phase * 1.6 * tempo) * 0.22
	for index in _wings.size():
		var side := -1.0 if index == 0 else 1.0
		_wings[index].rotation.z = side * sin(hover_phase * 2.2 * tempo) * 0.28
	for index in _tail.size():
		_tail[index].rotation.y = sin(hover_phase * 1.4 * tempo - float(index) * 0.7) * 0.22
	if _neck:
		_neck.rotation.x = sin(hover_phase * 1.1 * tempo) * 0.06
	if _jaw:
		_jaw.rotation.x = maxf(0.0, sin(hover_phase * 2.0 * tempo)) * 0.35

func _volley_interval() -> float:
	match phase:
		3: return randf_range(0.85, 1.35)
		2: return randf_range(1.35, 2.0)
		_: return randf_range(2.1, 2.9)

func _face(point: Vector3, delta: float) -> void:
	var offset := point - global_position
	offset.y = 0.0
	if offset.is_zero_approx():
		return
	var desired := atan2(offset.x, offset.z)
	rotation.y = lerp_angle(rotation.y, desired, clampf(delta * 3.0, 0.0, 1.0))

## Volleys leave the dragon's mouth.
func _fire_volley(target: Node3D) -> void:
	var scene := get_tree().get_first_node_in_group("dungeon")
	if not scene or not scene.has_method("spawn_boss_shot"):
		return
	var origin := global_position + Vector3.UP * 3.0
	if _head:
		origin = _head.global_position + Vector3.UP * 0.2
	var aim: Vector3 = target.global_position + Vector3.UP * 1.1
	var base := (aim - origin).normalized()
	var count := 1 + phase
	var right := base.cross(Vector3.UP).normalized()
	if right.is_zero_approx():
		right = Vector3.RIGHT
	for index in count:
		var offset := (float(index) - float(count - 1) * 0.5) * 0.16
		var direction := (base + right * offset).normalized()
		scene.spawn_boss_shot(origin, direction)
	SynthAudio.play("boss", randf_range(0.85, 1.05), -7.0)

func _nearest_player() -> Node3D:
	var nearest: Node3D
	var best := INF
	for player in get_tree().get_nodes_in_group("players"):
		if player.current_health <= 0.0:
			continue
		var distance := global_position.distance_squared_to(player.global_position)
		if distance < best:
			best = distance
			nearest = player
	return nearest

@rpc("authority", "call_local", "reliable")
func take_damage(amount: float, weak_point := false) -> void:
	if dead:
		return
	var applied := amount if weak_point else amount * ARMOR_MULTIPLIER
	health = maxf(0.0, health - applied)
	hit_flash = 0.09
	SynthAudio.play("weak" if weak_point else "hit", randf_range(0.9, 1.2), -11.0 if weak_point else -16.0)

	var ratio := health / max_health
	var next_phase := 1
	if ratio <= PHASE_THREE_AT:
		next_phase = 3
	elif ratio <= PHASE_TWO_AT:
		next_phase = 2
	if next_phase != phase:
		phase = next_phase
		_refresh_weak_points()
		SynthAudio.play("boss", 0.6, -4.0)

	if health <= 0.0 and multiplayer.is_server():
		dead = true
		var scene := get_tree().get_first_node_in_group("dungeon")
		if scene and scene.has_method("boss_defeated"):
			scene.boss_defeated()

func health_ratio() -> float:
	return health / max_health

@rpc("authority", "call_local", "reliable")
func destroy() -> void:
	queue_free()
