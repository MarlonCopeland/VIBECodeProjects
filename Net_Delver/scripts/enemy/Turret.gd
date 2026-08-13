extends StaticBody3D

# Wall-mounted sentry turret. Bolted to a solid wall by the generator, it
# sleeps until a player crosses into range with a clear line of sight, then
# tracks and fires coolant bolts. It cannot chase, so the counterplay is
# positional: break the sight line or close the range and burn it down.
#
# Counts as a regular enemy: it takes buster damage, pays party credits, counts
# against the purge objective, and drops the CRYO MODULE component its own
# coolant gun is built from.

## Range, cadence, tracking speed, projectile, and drops all come from
## EnemyDatabase.ARCHETYPES["turret"].
const ARCHETYPE := EnemyDatabase.TURRET

@export var max_health := 60.0

var health := 60.0
var dead := false
var aggroed := false
var fire_timer := 1.0
var hit_flash := 0.0

var _head: Node3D
var _eye: MeshInstance3D
var _barrel: MeshInstance3D

func _ready() -> void:
	max_health = EnemyDatabase.value(ARCHETYPE, "health", max_health)
	health = max_health
	_build_body()

func _build_body() -> void:
	var shape := CollisionShape3D.new()
	var box := BoxShape3D.new()
	box.size = Vector3(1.1, 1.1, 1.1)
	shape.shape = box
	add_child(shape)

	var plate_material := StandardMaterial3D.new()
	plate_material.albedo_color = Color("222b31")
	plate_material.metallic = 0.85
	plate_material.roughness = 0.3

	# Wall mount plate sits behind the head, flush against the wall.
	var plate := MeshInstance3D.new()
	var plate_mesh := BoxMesh.new()
	plate_mesh.size = Vector3(0.9, 0.9, 0.25)
	plate_mesh.material = plate_material
	plate.mesh = plate_mesh
	plate.position = Vector3(0, 0, 0.35)
	add_child(plate)

	_head = Node3D.new()
	_head.name = "Head"
	add_child(_head)

	var housing := MeshInstance3D.new()
	var housing_mesh := BoxMesh.new()
	housing_mesh.size = Vector3(0.6, 0.5, 0.6)
	housing_mesh.material = plate_material
	housing.mesh = housing_mesh
	_head.add_child(housing)

	var accent := EnemyDatabase.accent(ARCHETYPE)
	var eye_material := StandardMaterial3D.new()
	eye_material.albedo_color = accent
	eye_material.emission_enabled = true
	eye_material.emission = accent
	eye_material.emission_energy_multiplier = 3.0
	_eye = MeshInstance3D.new()
	var eye_mesh := SphereMesh.new()
	eye_mesh.radius = 0.14
	eye_mesh.height = 0.28
	eye_mesh.material = eye_material
	_eye.mesh = eye_mesh
	_eye.position = Vector3(0, 0.08, -0.32)
	_head.add_child(_eye)

	_barrel = MeshInstance3D.new()
	var barrel_mesh := CylinderMesh.new()
	barrel_mesh.top_radius = 0.07
	barrel_mesh.bottom_radius = 0.11
	barrel_mesh.height = 0.55
	barrel_mesh.material = eye_material
	_barrel.mesh = barrel_mesh
	_barrel.rotation_degrees.x = 90.0
	_barrel.position = Vector3(0, -0.08, -0.5)
	_head.add_child(_barrel)

func muzzle_position() -> Vector3:
	return _head.to_global(Vector3(0, -0.08, -0.8)) if _head else global_position

func _physics_process(delta: float) -> void:
	if dead:
		return
	fire_timer = maxf(0.0, fire_timer - delta)
	if hit_flash > 0.0:
		hit_flash -= delta
		if _eye:
			_eye.scale = Vector3.ONE * (1.5 if hit_flash > 0.0 else 1.0)

	# Tracking runs on every peer (player positions are replicated) so the head
	# visibly follows its target everywhere; only the host resolves fire.
	var target := _visible_target()
	if target and _head:
		var aim := target.global_position + Vector3.UP * 1.1 - _head.global_position
		var desired := atan2(aim.x, aim.z) + PI - rotation.y
		var track := EnemyDatabase.value(ARCHETYPE, "track_speed", 3.0)
		_head.rotation.y = lerp_angle(_head.rotation.y, desired, clampf(delta * track, 0.0, 1.0))

	if not multiplayer.is_server():
		return
	if not target:
		aggroed = false
		return
	if not aggroed:
		aggroed = true
		SynthAudio.play("enemy", 1.6, -16.0)
		# Wind-up beat, so a turret never opens fire the frame it sees you.
		fire_timer = maxf(fire_timer, EnemyDatabase.value(ARCHETYPE, "wind_up", 0.6))
		return
	if fire_timer <= 0.0:
		fire_timer = EnemyDatabase.value(ARCHETYPE, "fire_cooldown", 1.9)
		var dungeon := get_tree().get_first_node_in_group("dungeon")
		if dungeon and dungeon.has_method("spawn_enemy_shot"):
			var shot := EnemyDatabase.shot(ARCHETYPE)
			var origin := muzzle_position()
			var direction: Vector3 = (target.global_position + Vector3.UP * 1.0 - origin).normalized()
			dungeon.spawn_enemy_shot(origin, direction,
				float(shot.get("speed", 24.0)), float(shot.get("damage", 11.0)))

## Nearest living player inside range with an unbroken sight line.
func _visible_target() -> Node3D:
	var nearest: Node3D
	var range_limit := EnemyDatabase.value(ARCHETYPE, "aggro", 20.0)
	var best := range_limit * range_limit
	for player in get_tree().get_nodes_in_group("players"):
		if player.get("current_health") != null and float(player.current_health) <= 0.0:
			continue
		var distance := global_position.distance_squared_to(player.global_position)
		if distance < best and _has_line_of_sight(player):
			best = distance
			nearest = player
	return nearest

func _has_line_of_sight(player: Node3D) -> bool:
	var from := muzzle_position()
	var to: Vector3 = player.global_position + Vector3.UP * 1.0
	var query := PhysicsRayQueryParameters3D.create(from, to)
	query.exclude = [get_rid()]
	var hit := get_world_3d().direct_space_state.intersect_ray(query)
	return hit.is_empty() or hit.get("collider") == player

@rpc("authority", "call_local", "reliable")
func take_damage(amount: float) -> void:
	if dead:
		return
	health -= amount
	hit_flash = 0.09
	aggroed = true
	if health <= 0.0:
		dead = true
		var dungeon := get_tree().get_first_node_in_group("dungeon")
		if dungeon and dungeon.has_method("enemy_defeated"):
			dungeon.enemy_defeated(name)

@rpc("authority", "call_local", "reliable")
func destroy() -> void:
	queue_free()
