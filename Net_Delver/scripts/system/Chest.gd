extends Node3D

# Salvage cache.
#
# The one loot source that pays in *parts* as well as consumables. Parts are the
# raw material of the robot-building loop (see docs/Roadmap.md); today they are
# banked to the stash on extraction and nothing consumes them yet, which is
# deliberate — the economy is being seeded before the sink is built, so early
# players arrive at the crafting bench with something in hand.
#
# Contents are rolled by the host on open and pushed to the looter, so two
# players cannot both claim the same chest.

const PART_RANGE := Vector2i(2, 5)
const CREDIT_RANGE := Vector2i(40, 110)
const ITEM_RANGE := Vector2i(1, 2)

@export var display_name := "SALVAGE CACHE"

var opened := false

var _lid: Node3D
var _light: OmniLight3D
var _base_height := 0.0

func _ready() -> void:
	_base_height = position.y
	_build()

func pickup_kind() -> String:
	return "chest"

func prompt_text() -> String:
	return "OPEN %s" % display_name

func _process(delta: float) -> void:
	if opened:
		return
	# A slow pulse so a chest reads as interactive from across a room, without
	# the spin that marks the free-standing pickups.
	if _light:
		_light.light_energy = 1.6 + sin(Time.get_ticks_msec() * 0.003) * 0.5
	position.y = _base_height + sin(Time.get_ticks_msec() * 0.0018) * 0.03
	if _lid:
		_lid.rotation.x = lerpf(_lid.rotation.x, 0.0, delta * 4.0)

func consume() -> void:
	if opened:
		return
	opened = true
	if _lid:
		var tween := create_tween()
		tween.tween_property(_lid, "rotation:x", -1.25, 0.35).set_trans(Tween.TRANS_BACK)
	if _light:
		_light.light_color = Color("6cff7d")
	SynthAudio.play("pickup", 0.7, -6.0)

## Rolled on the host only. Returns {"items": {id: count}, "credits": int,
## "parts": int} so the caller can grant and report it in one place.
static func roll_contents(rng: RandomNumberGenerator) -> Dictionary:
	var items := {}
	var draws := rng.randi_range(ITEM_RANGE.x, ITEM_RANGE.y)
	for index in draws:
		var item_id: String = ItemDatabase.ORDER[rng.randi_range(0, ItemDatabase.ORDER.size() - 1)]
		items[item_id] = int(items.get(item_id, 0)) + 1
	return {
		"items": items,
		"credits": rng.randi_range(CREDIT_RANGE.x, CREDIT_RANGE.y),
		"parts": rng.randi_range(PART_RANGE.x, PART_RANGE.y),
	}

func _build() -> void:
	var shell := StandardMaterial3D.new()
	shell.albedo_color = Color("2b3a44")
	shell.metallic = 0.85
	shell.roughness = 0.3

	var body := MeshInstance3D.new()
	var body_mesh := BoxMesh.new()
	body_mesh.size = Vector3(1.35, 0.75, 0.95)
	body_mesh.material = shell
	body.mesh = body_mesh
	add_child(body)

	# The lid pivots on its back edge, so the hinge node sits there rather than
	# at the lid's centre.
	_lid = Node3D.new()
	_lid.position = Vector3(0, 0.38, 0.47)
	add_child(_lid)
	var lid_mesh := BoxMesh.new()
	lid_mesh.size = Vector3(1.4, 0.18, 1.0)
	lid_mesh.material = shell
	var lid := MeshInstance3D.new()
	lid.mesh = lid_mesh
	lid.position = Vector3(0, 0.06, -0.5)
	_lid.add_child(lid)

	var trim := StandardMaterial3D.new()
	trim.albedo_color = Color("f2c66d")
	trim.emission_enabled = true
	trim.emission = Color("f2c66d")
	trim.emission_energy_multiplier = 3.0
	var seal := MeshInstance3D.new()
	var seal_mesh := BoxMesh.new()
	seal_mesh.size = Vector3(1.4, 0.08, 0.08)
	seal_mesh.material = trim
	seal.mesh = seal_mesh
	seal.position = Vector3(0, 0.3, -0.48)
	add_child(seal)

	_light = OmniLight3D.new()
	_light.light_color = Color("f2c66d")
	_light.light_energy = 1.6
	_light.omni_range = 4.5
	_light.position.y = 0.8
	add_child(_light)
