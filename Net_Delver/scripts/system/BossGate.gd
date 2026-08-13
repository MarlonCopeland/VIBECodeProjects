extends Node3D

# Mega Man style boss shutter. Guards every doorway into the guardian's arena:
# approach and the slab rumbles up; step through and it slides shut behind you.
#
# No replication: every peer runs the same rule against replicated player
# positions, so the door agrees everywhere without costing a packet. The slab
# is a StaticBody3D, so while it is down it really does seal the arena.

const OPEN_RANGE := 6.0
const SLIDE_SPEED := 5.5

## Set by the dungeon so the slab spans the doorway exactly.
var door_width := 7.0
var door_height := 5.4
## True when the doorway runs along X (a north/south wall).
var along_x := true

var _slab: StaticBody3D
var _open := false
var _closed_y := 0.0

func _ready() -> void:
	_build()

func _build() -> void:
	_slab = StaticBody3D.new()
	_slab.name = "Slab"
	add_child(_slab)
	_closed_y = door_height * 0.5
	_slab.position = Vector3(0, _closed_y, 0)

	var size := Vector3(door_width, door_height, 0.7) if along_x else Vector3(0.7, door_height, door_width)
	var mesh_instance := MeshInstance3D.new()
	var mesh := BoxMesh.new()
	mesh.size = size
	var material := StandardMaterial3D.new()
	material.albedo_color = Color("2c3540")
	material.metallic = 0.8
	material.roughness = 0.25
	mesh.material = material
	mesh_instance.mesh = mesh
	_slab.add_child(mesh_instance)

	# Hazard chevrons so the shutter reads as a boss door, not a wall glitch.
	for row in 3:
		var stripe := MeshInstance3D.new()
		var stripe_mesh := BoxMesh.new()
		stripe_mesh.size = Vector3(door_width - 0.8, 0.22, 0.74) if along_x \
			else Vector3(0.74, 0.22, door_width - 0.8)
		var stripe_material := StandardMaterial3D.new()
		stripe_material.albedo_color = Color("ff4d3d")
		stripe_material.emission_enabled = true
		stripe_material.emission = Color("ff4d3d")
		stripe_material.emission_energy_multiplier = 1.8
		stripe_mesh.material = stripe_material
		stripe.mesh = stripe_mesh
		stripe.position = Vector3(0, -door_height * 0.28 + row * door_height * 0.28, 0)
		_slab.add_child(stripe)

	var collision := CollisionShape3D.new()
	var shape := BoxShape3D.new()
	shape.size = size
	collision.shape = shape
	_slab.add_child(collision)

func _process(delta: float) -> void:
	var should_open := false
	for player in get_tree().get_nodes_in_group("players"):
		if global_position.distance_to(player.global_position) < OPEN_RANGE:
			should_open = true
			break
	if should_open != _open:
		_open = should_open
		SynthAudio.play("heavy", 0.4 if _open else 0.32, -14.0)
	var target_y := _closed_y + (door_height + 0.4 if _open else 0.0)
	_slab.position.y = move_toward(_slab.position.y, target_y, SLIDE_SPEED * delta)
