extends Node3D

# Travelling buster projectile (Mega Man style) that replaces the old instant
# hitscan. Movement is deterministic from the spawn parameters, so every peer
# simulates the same flight path and only the server resolves damage.
#
# Collision uses a swept ray from the previous position to the next one rather
# than an Area3D overlap: charged shots move fast enough to skip past thin
# geometry in a single physics tick, and a swept segment cannot tunnel.

const LIFETIME := 2.6

var direction := Vector3.FORWARD
var speed := 42.0
var damage := 24.0
var charge_level := 0
var weapon_index := 0
var hostile := false            # true = fired by an enemy machine, damages players
var authoritative := false      # only the server instance resolves damage
var pierce_remaining := 0
## Cryo Visor synergy: a slow_time above zero coats whatever this hits.
var slow_time := 0.0
var slow_factor := 1.0
var exclude_rids: Array[RID] = []

var _age := 0.0
var _core: MeshInstance3D
var _glow: OmniLight3D

const HOSTILE_COLOR := Color("ff4d3d")

func _ready() -> void:
	var color := HOSTILE_COLOR if hostile else WeaponDatabase.color(weapon_index)
	var radius := 0.16 + 0.1 * charge_level
	if hostile:
		radius = 0.22

	_core = MeshInstance3D.new()
	var mesh := SphereMesh.new()
	mesh.radius = radius
	mesh.height = radius * 2.0
	var material := StandardMaterial3D.new()
	material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	material.albedo_color = color
	material.emission_enabled = true
	material.emission = color
	material.emission_energy_multiplier = 4.0 + charge_level * 2.0
	mesh.material = material
	_core.mesh = mesh
	add_child(_core)

	# Charged shots get a stretched plasma tail and a brighter light.
	if charge_level > 0:
		_core.scale = Vector3(1.0, 1.0, 1.6 + 0.5 * charge_level)
	_glow = OmniLight3D.new()
	_glow.light_color = color
	_glow.light_energy = 1.6 + charge_level * 1.4
	_glow.omni_range = 3.0 + charge_level * 1.5
	add_child(_glow)

func _physics_process(delta: float) -> void:
	_age += delta
	if _age >= LIFETIME:
		queue_free()
		return

	var from := global_position
	var to := from + direction * speed * delta
	var query := PhysicsRayQueryParameters3D.create(from, to)
	query.collide_with_areas = true    # boss weak points are Area3D
	query.collide_with_bodies = true
	query.exclude = exclude_rids
	# A machine standing against a wall has its muzzle inside that wall, and a
	# ray that STARTS inside a shape reports no hit by default — which is how
	# enemy bolts were flying straight through the level. Only hostile fire opts
	# in: a player shot begun inside a trap volume should still leave the barrel.
	query.hit_from_inside = hostile
	var hit := get_world_3d().direct_space_state.intersect_ray(query)

	if hit.is_empty():
		global_position = to
		if charge_level > 0:
			_core.rotate_object_local(Vector3.FORWARD, delta * 12.0)
		return

	var collider: Object = hit.get("collider")
	var point: Vector3 = hit.get("position", to)
	if _resolve_hit(collider, point):
		return
	# Passed through a pierceable target: keep flying from just past the hit.
	global_position = point + direction * 0.05

## Returns true when the shot is consumed.
func _resolve_hit(collider: Object, point: Vector3) -> bool:
	if collider == null:
		_burst(point)
		queue_free()
		return true

	if hostile:
		# Boss fire: only players matter, everything else is scenery.
		if collider.is_in_group("players"):
			if authoritative and collider.has_method("receive_damage"):
				collider.receive_damage.rpc(damage)
			_burst(point)
			queue_free()
			return true
		_burst(point)
		queue_free()
		return true

	if collider.is_in_group("weakpoints"):
		if authoritative:
			var boss: Object = collider.get_meta("boss_root", null)
			var multiplier := float(collider.get_meta("damage_multiplier", 1.0))
			if boss and boss.has_method("take_damage"):
				boss.take_damage.rpc(damage * multiplier, true)
		_burst(point, true)
		return _consume()

	if collider.is_in_group("bosses"):
		if authoritative and collider.has_method("take_damage"):
			collider.take_damage.rpc(damage, false)
		_burst(point)
		return _consume()

	if collider.is_in_group("enemies"):
		if authoritative and collider.has_method("take_damage"):
			collider.take_damage.rpc(damage)
			if slow_time > 0.0 and collider.has_method("apply_slow"):
				collider.apply_slow.rpc(slow_time, slow_factor)
		_burst(point)
		return _consume()

	# Geometry stops everything, including fully charged shots.
	_burst(point)
	queue_free()
	return true

func _consume() -> bool:
	if pierce_remaining > 0:
		pierce_remaining -= 1
		return false
	queue_free()
	return true

func _burst(point: Vector3, weak_point := false) -> void:
	var dungeon := get_tree().get_first_node_in_group("dungeon")
	if dungeon and dungeon.has_method("impact_effect"):
		dungeon.impact_effect(point, weapon_index, charge_level, hostile, weak_point)
