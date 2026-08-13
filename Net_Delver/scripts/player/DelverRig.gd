class_name DelverRig
extends RefCounted

# THE BONE CONTRACT.
#
# This is the one file in the project that must not change casually. Every
# animation clip, every customization slot mesh, and the muzzle the firing code
# reads are all authored against these bone names and rest positions. Change a
# name or a rest offset and every clip and every model authored so far is
# invalidated — so it is defined once, here, before anything depends on it.
#
# Names follow Godot's standard humanoid convention (`SkeletonProfileHumanoid`),
# which is what lets a Blender or Mixamo rig retarget onto this skeleton later
# without hand-mapping every bone.
#
# Proportions are Mega Man Legends: ~1.75m tall over a 0.32m head, so 5.5 heads.
# Big head, chunky boots, thin upper limbs. The player origin is at the feet, so
# a bone's accumulated Y *is* its height off the floor — the same space the
# CapsuleShape3D in Player.tscn is authored in.
#
# The proxy geometry attached here is deliberately blocky and rigid: every part
# is parented to a bone with a BoneAttachment3D rather than skinned. That is not
# a shortcut for the placeholder, it is the technique the real MML-style model
# will use too — hard-surface armour plates need no weight painting, which is
# the single hardest step for someone new to Blender.

const HEIGHT := 1.75
const HEAD_SIZE := 0.32

## Bone name -> parent name ("" for root) and rest offset from that parent.
## Order matters: a parent must appear before its children.
const BONES: Array[Dictionary] = [
	{"name": "Hips", "parent": "", "rest": Vector3(0.0, 0.92, 0.0)},
	{"name": "Spine", "parent": "Hips", "rest": Vector3(0.0, 0.16, 0.0)},
	{"name": "Chest", "parent": "Spine", "rest": Vector3(0.0, 0.18, 0.0)},
	{"name": "Neck", "parent": "Chest", "rest": Vector3(0.0, 0.17, 0.0)},
	{"name": "Head", "parent": "Neck", "rest": Vector3(0.0, 0.09, 0.0)},

	# +X is the Delver's right: the controller reads `global_basis.x` as right
	# and `-global_basis.z` as forward, so the buster arm is the +X one.
	{"name": "LeftShoulder", "parent": "Chest", "rest": Vector3(-0.10, 0.12, 0.0)},
	{"name": "LeftUpperArm", "parent": "LeftShoulder", "rest": Vector3(-0.13, 0.0, 0.0)},
	{"name": "LeftLowerArm", "parent": "LeftUpperArm", "rest": Vector3(0.0, -0.25, 0.0)},
	{"name": "LeftHand", "parent": "LeftLowerArm", "rest": Vector3(0.0, -0.23, 0.0)},

	{"name": "RightShoulder", "parent": "Chest", "rest": Vector3(0.10, 0.12, 0.0)},
	{"name": "RightUpperArm", "parent": "RightShoulder", "rest": Vector3(0.13, 0.0, 0.0)},
	{"name": "RightLowerArm", "parent": "RightUpperArm", "rest": Vector3(0.0, -0.25, 0.0)},
	{"name": "RightHand", "parent": "RightLowerArm", "rest": Vector3(0.0, -0.23, 0.0)},

	# The muzzle is a BONE, not a marker parented to the weapon mesh. That way
	# swapping, rescaling, or reskinning the buster cannot move where shots come
	# from, and a Blender author only has to add a bone with this name.
	# EXPORT GOTCHA: a bone with no vertex weights is stripped by glTF export
	# when "Only Deform Bones" is on. Mark Muzzle as a deform bone or turn that
	# option off, or shots will silently start leaving from the player's feet.
	{"name": "Muzzle", "parent": "RightHand", "rest": Vector3(0.0, -0.16, -0.06)},

	{"name": "LeftUpperLeg", "parent": "Hips", "rest": Vector3(-0.11, -0.06, 0.0)},
	{"name": "LeftLowerLeg", "parent": "LeftUpperLeg", "rest": Vector3(0.0, -0.42, 0.0)},
	{"name": "LeftFoot", "parent": "LeftLowerLeg", "rest": Vector3(0.0, -0.38, 0.0)},

	{"name": "RightUpperLeg", "parent": "Hips", "rest": Vector3(0.11, -0.06, 0.0)},
	{"name": "RightLowerLeg", "parent": "RightUpperLeg", "rest": Vector3(0.0, -0.42, 0.0)},
	{"name": "RightFoot", "parent": "RightLowerLeg", "rest": Vector3(0.0, -0.38, 0.0)},
]

## Customization slots, reconciled from the two conflicting lists in
## docs/Roadmap.md: five MESH slots, with complexion handled as a tint channel
## rather than geometry, and boots merged into legs (which is how MML characters
## actually read — the boot is part of the leg silhouette).
const SLOTS := {
	"head": ["Head"],
	"hair_helmet": ["Head"],
	"torso": ["Hips", "Spine", "Chest", "LeftShoulder", "RightShoulder"],
	"arms": ["LeftUpperArm", "LeftLowerArm", "LeftHand",
			"RightUpperArm", "RightLowerArm", "RightHand"],
	"legs": ["LeftUpperLeg", "LeftLowerLeg", "LeftFoot",
			"RightUpperLeg", "RightLowerLeg", "RightFoot"],
}

## Bones the upper-body animation layer is allowed to drive. The aim pose and
## the fire one-shot are filtered to these so you can aim and shoot without
## interrupting the legs.
const UPPER_BODY: Array[String] = [
	"Spine", "Chest", "Neck", "Head",
	"LeftShoulder", "LeftUpperArm", "LeftLowerArm", "LeftHand",
	"RightShoulder", "RightUpperArm", "RightLowerArm", "RightHand", "Muzzle",
]

## The ready stance the rig sits in before any animation plays: buster arm up
## and forward, off arm relaxed. Applied as a POSE, never baked into the rest —
## the rest stays a clean A-pose because that is what a Blender author expects
## to receive, and what retargeting assumes.
##
## SIGN CONVENTION, and it is the one thing here that is easy to get backwards:
## limb bones hang DOWN (their rest offset is -Y from the parent), so a rotation
## of +θ about X maps that -Y to (0, -cos θ, -sin θ) — the hand or foot swings
## toward -Z, which is forward. **Positive pitch is forward for every limb.**
## The legs already used positive values; the arms were authored negative, which
## had the Delver reaching behind itself while its legs ran forward.
const READY_POSE := {
	"RightUpperArm": Vector3(70.0, 0.0, -8.0),
	"RightLowerArm": Vector3(18.0, 0.0, 0.0),
	"LeftUpperArm": Vector3(12.0, 0.0, 6.0),
	"LeftLowerArm": Vector3(24.0, 0.0, 0.0),
}

const ARMOUR := Color("2f7fc4")
const TRIM := Color("dfe3e8")
const JOINT := Color("223245")
const VISOR := Color("6fe6c8")

## Proxy limb geometry: bone -> box size, offset from the bone, and colour.
## Replaced wholesale when real slot meshes arrive; the bones stay.
const PROXY_PARTS := [
	{"bone": "Hips", "size": Vector3(0.30, 0.18, 0.21), "offset": Vector3(0, -0.02, 0), "color": JOINT},
	{"bone": "Spine", "size": Vector3(0.34, 0.20, 0.23), "offset": Vector3(0, 0.08, 0), "color": ARMOUR},
	{"bone": "Chest", "size": Vector3(0.40, 0.24, 0.26), "offset": Vector3(0, 0.10, 0), "color": ARMOUR},
	{"bone": "Head", "size": Vector3(0.30, 0.30, 0.29), "offset": Vector3(0, 0.15, 0), "color": ARMOUR},
	{"bone": "Head", "size": Vector3(0.22, 0.09, 0.04), "offset": Vector3(0, 0.13, -0.15), "color": VISOR, "emissive": true},

	{"bone": "LeftShoulder", "size": Vector3(0.15, 0.16, 0.19), "offset": Vector3(-0.07, 0.0, 0), "color": ARMOUR},
	{"bone": "RightShoulder", "size": Vector3(0.15, 0.16, 0.19), "offset": Vector3(0.07, 0.0, 0), "color": ARMOUR},
	{"bone": "LeftUpperArm", "size": Vector3(0.11, 0.24, 0.11), "offset": Vector3(0, -0.13, 0), "color": TRIM},
	{"bone": "RightUpperArm", "size": Vector3(0.11, 0.24, 0.11), "offset": Vector3(0, -0.13, 0), "color": TRIM},
	{"bone": "LeftLowerArm", "size": Vector3(0.12, 0.22, 0.12), "offset": Vector3(0, -0.12, 0), "color": ARMOUR},
	{"bone": "LeftHand", "size": Vector3(0.13, 0.13, 0.13), "offset": Vector3(0, -0.07, 0), "color": TRIM},
	# The right forearm is a cuff rather than a limb: the buster IS the hand on
	# that arm, the way Volnutt's is. Without the cuff there is a visible gap
	# between the upper arm and the weapon.
	{"bone": "RightLowerArm", "size": Vector3(0.15, 0.20, 0.15), "offset": Vector3(0, -0.13, 0), "color": ARMOUR},

	{"bone": "LeftUpperLeg", "size": Vector3(0.14, 0.40, 0.15), "offset": Vector3(0, -0.21, 0), "color": ARMOUR},
	{"bone": "RightUpperLeg", "size": Vector3(0.14, 0.40, 0.15), "offset": Vector3(0, -0.21, 0), "color": ARMOUR},
	{"bone": "LeftLowerLeg", "size": Vector3(0.13, 0.36, 0.14), "offset": Vector3(0, -0.19, 0), "color": TRIM},
	{"bone": "RightLowerLeg", "size": Vector3(0.13, 0.36, 0.14), "offset": Vector3(0, -0.19, 0), "color": TRIM},
	# Chunky boots — the most recognisable part of the Legends silhouette.
	{"bone": "LeftFoot", "size": Vector3(0.18, 0.15, 0.30), "offset": Vector3(0, -0.05, -0.05), "color": ARMOUR},
	{"bone": "RightFoot", "size": Vector3(0.18, 0.15, 0.30), "offset": Vector3(0, -0.05, -0.05), "color": ARMOUR},
]

## Built by `build()` so callers do not have to know the node layout.
class Rig extends RefCounted:
	var skeleton: Skeleton3D
	var buster_mesh: MeshInstance3D
	var muzzle: Marker3D
	var charge_fx: Node3D
	var attachments: Dictionary = {}     ## bone name -> BoneAttachment3D

## Constructs the whole rig under `model` and returns the handles the controller
## and animator need. Everything is built in code on every peer independently —
## the same reason the rest of this project builds its world procedurally, and
## the reason no part of the character costs any bandwidth.
##
## `armor_color` replaces the default cobalt on every ARMOUR-coloured plate, so
## a party of three reads as three different Delvers at a glance.
static func build(model: Node3D, armor_color := ARMOUR) -> Rig:
	var rig := Rig.new()

	var skeleton := Skeleton3D.new()
	skeleton.name = "Skeleton3D"
	model.add_child(skeleton)
	rig.skeleton = skeleton

	for entry in BONES:
		# add_bone()'s return type changed across 4.x point releases, so the
		# index is looked up by name rather than taken from the call.
		skeleton.add_bone(str(entry["name"]))
		var index := skeleton.find_bone(str(entry["name"]))
		var parent_name := str(entry["parent"])
		if not parent_name.is_empty():
			skeleton.set_bone_parent(index, skeleton.find_bone(parent_name))
		var rest := Transform3D(Basis(), entry["rest"])
		skeleton.set_bone_rest(index, rest)
		skeleton.set_bone_pose_position(index, rest.origin)
		skeleton.set_bone_pose_rotation(index, Quaternion())
		skeleton.set_bone_pose_scale(index, Vector3.ONE)

	for bone_name in READY_POSE:
		var index := skeleton.find_bone(str(bone_name))
		if index >= 0:
			var degrees: Vector3 = READY_POSE[bone_name]
			skeleton.set_bone_pose_rotation(index, Quaternion.from_euler(
				Vector3(deg_to_rad(degrees.x), deg_to_rad(degrees.y), deg_to_rad(degrees.z))))

	for part in PROXY_PARTS:
		var part_color: Color = part["color"]
		if part_color == ARMOUR:
			part_color = armor_color
		_attach_box(rig, str(part["bone"]), part["size"], part["offset"],
			part_color, bool(part.get("emissive", false)))

	_attach_buster(rig)
	return rig

## One BoneAttachment3D per bone, reused across every part on that bone, so the
## attachment count stays at one per bone rather than one per prop.
static func _attachment_for(rig: Rig, bone_name: String) -> BoneAttachment3D:
	if rig.attachments.has(bone_name):
		return rig.attachments[bone_name]
	var attachment := BoneAttachment3D.new()
	attachment.name = "Attach_%s" % bone_name
	rig.skeleton.add_child(attachment)
	attachment.bone_name = bone_name
	rig.attachments[bone_name] = attachment
	return attachment

static func _attach_box(rig: Rig, bone_name: String, size: Vector3, offset: Vector3,
		color: Color, emissive: bool) -> void:
	var attachment := _attachment_for(rig, bone_name)
	var mesh_instance := MeshInstance3D.new()
	var mesh := BoxMesh.new()
	mesh.size = size
	mesh.material = _material(color, emissive)
	mesh_instance.mesh = mesh
	mesh_instance.position = offset
	attachment.add_child(mesh_instance)

## The buster hangs off RightHand and is kept as a named handle, because
## `PlayerController._update_buster_color()` retints it on every weapon swap.
static func _attach_buster(rig: Rig) -> void:
	var attachment := _attachment_for(rig, "RightHand")
	var mesh_instance := MeshInstance3D.new()
	mesh_instance.name = "Buster"
	var mesh := CylinderMesh.new()
	mesh.top_radius = 0.10
	mesh.bottom_radius = 0.14
	mesh.height = 0.38
	mesh.material = _material(Color("58d6ff"), false)
	mesh_instance.mesh = mesh
	mesh_instance.position = Vector3(0.0, -0.14, 0.0)
	attachment.add_child(mesh_instance)
	rig.buster_mesh = mesh_instance

	# Muzzle and charge FX ride the Muzzle BONE, not the weapon mesh, so nothing
	# that happens to the weapon's transform can move where shots originate.
	var muzzle_attachment := _attachment_for(rig, "Muzzle")
	var muzzle := Marker3D.new()
	muzzle.name = "Muzzle"
	muzzle_attachment.add_child(muzzle)
	rig.muzzle = muzzle

	var charge_fx := Node3D.new()
	charge_fx.name = "ChargeFX"
	muzzle.add_child(charge_fx)
	rig.charge_fx = charge_fx

static func _material(color: Color, emissive: bool) -> StandardMaterial3D:
	var material := StandardMaterial3D.new()
	material.albedo_color = color
	material.metallic = 0.15
	material.roughness = 0.62
	if emissive:
		material.emission_enabled = true
		material.emission = color
		material.emission_energy_multiplier = 2.4
	return material

## Where the muzzle sits with no animation applied. Used by tests and by
## anything that needs the position before the skeleton has been processed —
## BoneAttachment3D transforms are one frame behind on the tick they are built.
static func rest_muzzle_offset() -> Vector3:
	var accumulated := Vector3.ZERO
	var lookup := {}
	for entry in BONES:
		lookup[str(entry["name"])] = entry
	var cursor := "Muzzle"
	while not cursor.is_empty() and lookup.has(cursor):
		accumulated += lookup[cursor]["rest"] as Vector3
		cursor = str(lookup[cursor]["parent"])
	return accumulated
