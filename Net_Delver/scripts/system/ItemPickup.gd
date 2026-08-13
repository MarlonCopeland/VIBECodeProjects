extends Node3D

# A consumable or currency drop lying in the sector. Weapon caches keep using
# WeaponPickup; this covers everything that goes into the inventory instead of
# the weapon slot, plus the credit shards that bank on extraction.
#
# Consumables respawn after a delay so a long fight cannot leave the party with
# no healing at all; currency shards are one-shot.

@export var item_id := ItemDatabase.REPAIR_KIT
@export var amount := 1
@export var display_name := "REPAIR KIT"
@export var respawn_time := 0.0

var base_height := 0.0
var _respawn_timer := 0.0
var _mesh: MeshInstance3D
var _light: OmniLight3D

func _ready() -> void:
	base_height = position.y
	display_name = ItemDatabase.display_name(item_id)
	_build_visual()

func _process(delta: float) -> void:
	if not visible:
		if respawn_time > 0.0:
			_respawn_timer -= delta
			if _respawn_timer <= 0.0:
				restore()
		return
	rotate_y(delta * 1.9)
	position.y = base_height + sin(Time.get_ticks_msec() * 0.0032 + base_height) * 0.1

func pickup_kind() -> String:
	return "currency" if is_currency() else "item"

func prompt_text() -> String:
	if is_currency():
		return "%s  +%d CR" % [display_name, amount]
	return "%s  x%d" % [display_name, amount]

func is_currency() -> bool:
	return str(ItemDatabase.get_item(item_id).get("kind", "")) == "currency"

func consume() -> void:
	visible = false
	_respawn_timer = respawn_time
	# Currency never comes back; consumables do, so they stay processing.
	if respawn_time <= 0.0:
		process_mode = Node.PROCESS_MODE_DISABLED

func restore() -> void:
	visible = true

## Rebuilt in code, like every other prop in the project. Consumables read as
## squat canisters and shards as spinning octahedra so they are distinguishable
## from the tall weapon caches at a glance.
func _build_visual() -> void:
	var color := ItemDatabase.color(item_id)
	var material := StandardMaterial3D.new()
	material.albedo_color = color
	material.metallic = 0.5
	material.emission_enabled = true
	material.emission = color
	material.emission_energy_multiplier = 2.6

	var mesh: Mesh
	if is_currency():
		var shard := SphereMesh.new()
		shard.radius = 0.26
		shard.height = 0.72
		shard.radial_segments = 4
		shard.rings = 2
		shard.material = material
		mesh = shard
	else:
		var canister := CapsuleMesh.new()
		canister.radius = 0.22
		canister.height = 0.68
		canister.material = material
		mesh = canister

	_mesh = MeshInstance3D.new()
	_mesh.mesh = mesh
	_mesh.rotation_degrees.z = 90.0 if not is_currency() else 0.0
	add_child(_mesh)

	_light = OmniLight3D.new()
	_light.light_color = color
	_light.light_energy = 1.5
	_light.omni_range = 3.0
	add_child(_light)
