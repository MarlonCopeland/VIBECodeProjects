extends Area3D

# Sector hazards.
#
# Two kinds so far: a coolant laser that strobes across a span, and a crusher
# piston that slams a column of the floor. Both run on the dungeon's shared
# clock rather than each peer's own uptime, so the beam you dodge is the beam
# the host says is off. Only the host applies damage; every peer animates.
#
# The cycle is a pure function of (clock + phase), which means a trap has no
# state to replicate and a late-joining peer is instantly in step.

const LASER := "laser"
const CRUSHER := "crusher"

const LASER_DAMAGE := 16.0
const CRUSHER_DAMAGE := 34.0
## Per-player re-hit delay, so standing in a beam chips rather than deletes.
const HIT_INTERVAL := 0.8

var kind := LASER
var period := 3.4
var duty := 0.4
var phase := 0.0
var span := 8.0
var yaw := 0.0

var _dungeon: Node
var _mesh: MeshInstance3D
var _light: OmniLight3D
var _shape: CollisionShape3D
var _last_hit: Dictionary = {}
var _armed := false

func _ready() -> void:
	add_to_group("traps")
	monitoring = true
	monitorable = false
	rotation.y = yaw
	_dungeon = get_tree().get_first_node_in_group("dungeon")
	_build()

func _build() -> void:
	var color := Color("ff4d3d") if kind == LASER else Color("ffba52")
	var material := StandardMaterial3D.new()
	material.albedo_color = color
	material.emission_enabled = true
	material.emission = color
	material.emission_energy_multiplier = 4.0
	material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED

	var mesh := BoxMesh.new()
	_shape = CollisionShape3D.new()
	var box := BoxShape3D.new()
	if kind == LASER:
		mesh.size = Vector3(span, 0.16, 0.16)
		box.size = Vector3(span, 1.6, 0.5)
		_shape.position = Vector3(0, 0.9, 0)
	else:
		mesh.size = Vector3(3.2, 3.2, 3.2)
		box.size = Vector3(3.2, 1.2, 3.2)
		_shape.position = Vector3(0, 0.6, 0)
	mesh.material = material
	_mesh = MeshInstance3D.new()
	_mesh.mesh = mesh
	_mesh.position.y = 1.0 if kind == LASER else 5.5
	add_child(_mesh)
	_shape.shape = box
	add_child(_shape)

	_light = OmniLight3D.new()
	_light.light_color = color
	_light.light_energy = 0.0
	_light.omni_range = 7.0
	_light.position.y = 1.4
	add_child(_light)

	# Emitter housings, so a laser reads as machinery bolted to the walls rather
	# than a floating line.
	if kind == LASER:
		for side in [-1.0, 1.0]:
			var post := MeshInstance3D.new()
			var post_mesh := BoxMesh.new()
			post_mesh.size = Vector3(0.5, 2.4, 0.5)
			var post_material := StandardMaterial3D.new()
			post_material.albedo_color = Color("29363c")
			post_material.metallic = 0.8
			post_mesh.material = post_material
			post.mesh = post_mesh
			post.position = Vector3(side * span * 0.5, 1.2, 0.0)
			add_child(post)
	else:
		var pad := MeshInstance3D.new()
		var pad_mesh := BoxMesh.new()
		pad_mesh.size = Vector3(3.4, 0.12, 3.4)
		var pad_material := StandardMaterial3D.new()
		pad_material.albedo_color = Color("ffba52")
		pad_material.emission_enabled = true
		pad_material.emission = Color("ffba52")
		pad_material.emission_energy_multiplier = 1.5
		pad_mesh.material = pad_material
		pad.mesh = pad_mesh
		pad.position.y = 0.07
		add_child(pad)

func _physics_process(delta: float) -> void:
	var cycle := _cycle()
	_armed = _is_armed(cycle)
	_animate(cycle)
	if not multiplayer.is_server():
		return
	for id in _last_hit:
		_last_hit[id] = maxf(0.0, float(_last_hit[id]) - delta)
	if _armed:
		_strike()

## Position in the cycle, 0..1. Falls back to engine uptime when the trap is
## somehow orphaned from a dungeon, so it never freezes mid-slam.
func _cycle() -> float:
	var clock: float = _dungeon.dungeon_time if _dungeon and "dungeon_time" in _dungeon else Time.get_ticks_msec() * 0.001
	return fposmod(clock + phase, period) / period

func _is_armed(cycle: float) -> bool:
	if kind == LASER:
		return cycle < duty
	# The crusher only hurts on the way down and while it is bottomed out.
	return cycle >= 0.55 and cycle < 0.78

func _animate(cycle: float) -> void:
	if kind == LASER:
		var warning := cycle >= duty - 0.06 and cycle < duty
		_mesh.visible = _armed or warning
		_mesh.scale.y = 1.0 if _armed else 0.35
		_light.light_energy = 3.2 if _armed else (1.2 if warning else 0.0)
		return

	var height := 5.5
	if cycle < 0.5:
		height = 5.5
	elif cycle < 0.62:
		# Slam: fast fall over a narrow slice of the cycle.
		height = lerpf(5.5, 1.7, clampf((cycle - 0.5) / 0.12, 0.0, 1.0))
	elif cycle < 0.78:
		height = 1.7
	else:
		height = lerpf(1.7, 5.5, clampf((cycle - 0.78) / 0.22, 0.0, 1.0))
	_mesh.position.y = height
	_light.light_energy = 3.0 if _armed else 0.6

func _strike() -> void:
	for body in get_overlapping_bodies():
		if not body.is_in_group("players") or not body.has_method("receive_damage"):
			continue
		var id := body.get_instance_id()
		if float(_last_hit.get(id, 0.0)) > 0.0:
			continue
		_last_hit[id] = HIT_INTERVAL
		body.receive_damage.rpc(LASER_DAMAGE if kind == LASER else CRUSHER_DAMAGE)

## Exposed for the smoke test and for anything that wants to know whether a
## hazard is live without duplicating the cycle maths.
func is_armed() -> bool:
	return _armed
