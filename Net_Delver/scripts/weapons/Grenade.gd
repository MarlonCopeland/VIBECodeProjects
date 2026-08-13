extends Node3D

# Thrown frag charge.
#
# Like BusterShot this is simulated identically on every peer from its spawn
# parameters — the arc, the bounces, and the fuse are all deterministic — while
# only the server instance resolves the explosion damage. Movement uses a swept
# ray per tick rather than a RigidBody so it cannot tunnel through the thin
# arena geometry at throw speed, and so peers cannot drift apart the way an
# independently-stepped physics body would.

const GRAVITY := 22.0
const BOUNCE := 0.42
const FRICTION := 0.78
const RADIUS := 0.17

var velocity := Vector3.ZERO
var damage := 95.0
var blast_radius := 6.0
var fuse := 1.9
var authoritative := false
var exclude_rids: Array[RID] = []

var _exploded := false
var _mesh: MeshInstance3D
var _light: OmniLight3D

func _ready() -> void:
	var color := ItemDatabase.color(ItemDatabase.FRAG_CHARGE)
	var material := StandardMaterial3D.new()
	material.albedo_color = color
	material.metallic = 0.7
	material.emission_enabled = true
	material.emission = color
	material.emission_energy_multiplier = 3.0

	_mesh = MeshInstance3D.new()
	var mesh := SphereMesh.new()
	mesh.radius = RADIUS
	mesh.height = RADIUS * 2.0
	mesh.material = material
	_mesh.mesh = mesh
	add_child(_mesh)

	_light = OmniLight3D.new()
	_light.light_color = color
	_light.light_energy = 1.8
	_light.omni_range = 3.5
	add_child(_light)

func _physics_process(delta: float) -> void:
	if _exploded:
		return

	fuse -= delta
	# The blink accelerates as the fuse burns down, so the throw reads at a
	# glance without a UI element.
	if _light:
		var urgency := clampf(1.0 - fuse / 1.9, 0.0, 1.0)
		_light.light_energy = 1.2 + 2.6 * absf(sin(Time.get_ticks_msec() * 0.004 * (1.0 + urgency * 5.0)))
	if fuse <= 0.0:
		_explode()
		return

	velocity.y -= GRAVITY * delta
	var from := global_position
	var to := from + velocity * delta
	var query := PhysicsRayQueryParameters3D.create(from, to)
	query.collide_with_areas = false
	query.collide_with_bodies = true
	query.exclude = exclude_rids
	var hit := get_world_3d().direct_space_state.intersect_ray(query)

	if hit.is_empty():
		global_position = to
		_mesh.rotate_object_local(Vector3.RIGHT, delta * 9.0)
		return

	# Contact with a hostile detonates immediately; scenery just bounces it.
	var collider: Object = hit.get("collider")
	if collider and (collider.is_in_group("enemies") or collider.is_in_group("bosses")):
		global_position = hit.get("position", to)
		_explode()
		return

	var normal: Vector3 = hit.get("normal", Vector3.UP)
	global_position = hit.get("position", to) + normal * (RADIUS + 0.02)
	velocity = velocity.bounce(normal) * BOUNCE
	velocity.x *= FRICTION
	velocity.z *= FRICTION
	if velocity.length() < 0.6:
		velocity = Vector3.ZERO
	SynthAudio.play("roll", 1.8, -26.0)

func _explode() -> void:
	if _exploded:
		return
	_exploded = true
	var point := global_position
	if authoritative:
		_apply_blast(point)
	_effect(point)
	queue_free()

## Damage falls off linearly to the blast edge. Players are never hit — the
## project keeps friendly fire off everywhere else too.
func _apply_blast(point: Vector3) -> void:
	for enemy in get_tree().get_nodes_in_group("enemies"):
		if not (enemy is Node3D) or not enemy.has_method("take_damage"):
			continue
		var falloff := _falloff(point, enemy.global_position + Vector3.UP)
		if falloff > 0.0:
			enemy.take_damage.rpc(damage * falloff)

	# Vents are the boss's soft spots, so a charge that lands against one hits
	# far harder than one that just scorches the chassis.
	var vents_hit := {}
	for area in get_tree().get_nodes_in_group("weakpoints"):
		if not (area is Node3D) or not area.monitorable:
			continue
		var boss: Object = area.get_meta("boss_root", null)
		if not boss or not boss.has_method("take_damage"):
			continue
		var falloff := _falloff(point, area.global_position)
		if falloff <= 0.0:
			continue
		var multiplier := float(area.get_meta("damage_multiplier", 1.0))
		boss.take_damage.rpc(damage * falloff * multiplier * 0.5, true)
		vents_hit[boss.get_instance_id()] = true

	for boss in get_tree().get_nodes_in_group("bosses"):
		if not (boss is Node3D) or not boss.has_method("take_damage"):
			continue
		if vents_hit.has(boss.get_instance_id()):
			continue
		var falloff := _falloff(point, boss.global_position + Vector3.UP * 2.5)
		if falloff > 0.0:
			boss.take_damage.rpc(damage * falloff, false)

func _falloff(point: Vector3, target: Vector3) -> float:
	var distance := point.distance_to(target)
	if distance > blast_radius:
		return 0.0
	return clampf(1.0 - distance / blast_radius, 0.15, 1.0)

func _effect(point: Vector3) -> void:
	SynthAudio.play("heavy", 0.45, -3.0)
	var dungeon := get_tree().get_first_node_in_group("dungeon")
	if dungeon and dungeon.has_method("blast_effect"):
		dungeon.blast_effect(point, blast_radius)
