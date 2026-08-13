class_name DelverAnimSet
extends RefCounted

# Animation clips, generated in code.
#
# These are placeholders in the sense that a Blender author will replace them,
# but they are NOT fake: they are real `Animation` resources with real rotation
# tracks that a real `AnimationTree` blends. That is the point — the whole
# animation and networking system gets built and proven against them, so when a
# hand-authored set arrives it drops onto a rig that already works.
#
# Two deliberate economies:
#
# 1. **No walk clips.** The locomotion blend space has idle at its centre and
#    the run set on its rim, so any radius between the two already *is* a walk.
#    Adding walk clips would only duplicate what interpolation gives free.
# 2. **Committed-action clip lengths are read from ActionTable**, never typed
#    twice. A roll animation cannot drift out of sync with the roll's i-frames
#    because there is only one number.
#
# Poses are keyed in degrees for legibility. Everything is relative to the
# skeleton's A-pose rest, so each clip has to re-state the ready stance for the
# arms — an animation overrides the bone pose entirely, it does not add to it.

## The metres-per-second the run cycle was built to travel at. The animator
## divides real speed by this to pick a playback rate, which is what stops the
## feet sliding. Matches PlayerController.move_speed.
const REFERENCE_SPEED := 6.5

const RUN_CYCLE := 0.70
const IDLE_CYCLE := 2.60

## Arm stance shared by every clip, so the buster stays up and forward instead
## of snapping back to the A-pose the moment an animation plays. Mirrors
## DelverRig.READY_POSE — see the sign-convention note there: positive pitch
## swings a limb forward, for arms exactly as for legs.
const READY_ARMS := {
	"RightUpperArm": Vector3(70.0, 0.0, -8.0),
	"RightLowerArm": Vector3(18.0, 0.0, 0.0),
	"LeftUpperArm": Vector3(12.0, 0.0, 6.0),
	"LeftLowerArm": Vector3(24.0, 0.0, 0.0),
}

static func build() -> AnimationLibrary:
	var library := AnimationLibrary.new()
	library.add_animation("idle", _idle())
	library.add_animation("run_fwd", _run(1.0))
	library.add_animation("run_back", _run(-1.0))
	library.add_animation("strafe_left", _strafe(-1.0))
	library.add_animation("strafe_right", _strafe(1.0))
	library.add_animation("jump", _jump())
	library.add_animation("fall", _fall())
	library.add_animation("land", _land())
	# One clip per committed action, never one clip shared by two: a heavy frame
	# rolls for 0.62s and a light one for 0.46s, and a single clip cannot be
	# both. RigCheck asserts each clip against its own ActionTable entry.
	library.add_animation("roll", _roll("roll"))
	library.add_animation("roll_heavy", _roll("roll_heavy"))
	library.add_animation("air_dash", _air_dash())
	return library

# ------------------------------------------------------------------- clips

static func _idle() -> Animation:
	var anim := _clip(IDLE_CYCLE, true)
	# A slow breath on the hips and a touch of sway. Without this the Delver
	# looks switched off between fights.
	_position(anim, "Hips", [
		[0.0, Vector3(0, 0.0, 0)], [IDLE_CYCLE * 0.5, Vector3(0, -0.018, 0)], [IDLE_CYCLE, Vector3(0, 0.0, 0)]])
	_rotate(anim, "Chest", [
		[0.0, Vector3(1.5, 0, 0)], [IDLE_CYCLE * 0.5, Vector3(-1.0, 0, 0)], [IDLE_CYCLE, Vector3(1.5, 0, 0)]])
	_ready_arms(anim, IDLE_CYCLE, 3.0)
	return anim

## `facing` is +1 running forward, -1 backpedalling — the leg swing reverses and
## the lean flips, which is what makes a backpedal read as one.
static func _run(facing: float) -> Animation:
	var anim := _clip(RUN_CYCLE, true)
	var swing := 34.0 * facing
	var half := RUN_CYCLE * 0.5
	_rotate(anim, "LeftUpperLeg", [
		[0.0, Vector3(swing, 0, 0)], [half, Vector3(-swing, 0, 0)], [RUN_CYCLE, Vector3(swing, 0, 0)]])
	_rotate(anim, "RightUpperLeg", [
		[0.0, Vector3(-swing, 0, 0)], [half, Vector3(swing, 0, 0)], [RUN_CYCLE, Vector3(-swing, 0, 0)]])
	# Knees only bend one way, so the lower legs key at the quarter beats.
	_rotate(anim, "LeftLowerLeg", [
		[0.0, Vector3(-8.0, 0, 0)], [RUN_CYCLE * 0.25, Vector3(-48.0, 0, 0)],
		[half, Vector3(-6.0, 0, 0)], [RUN_CYCLE * 0.75, Vector3(-20.0, 0, 0)], [RUN_CYCLE, Vector3(-8.0, 0, 0)]])
	_rotate(anim, "RightLowerLeg", [
		[0.0, Vector3(-6.0, 0, 0)], [RUN_CYCLE * 0.25, Vector3(-20.0, 0, 0)],
		[half, Vector3(-8.0, 0, 0)], [RUN_CYCLE * 0.75, Vector3(-48.0, 0, 0)], [RUN_CYCLE, Vector3(-6.0, 0, 0)]])
	# Two bobs per stride, and a forward lean into the run.
	_position(anim, "Hips", [
		[0.0, Vector3(0, 0.0, 0)], [RUN_CYCLE * 0.25, Vector3(0, 0.045, 0)],
		[half, Vector3(0, 0.0, 0)], [RUN_CYCLE * 0.75, Vector3(0, 0.045, 0)], [RUN_CYCLE, Vector3(0, 0.0, 0)]])
	_rotate(anim, "Spine", [[0.0, Vector3(-7.0 * facing, 0, 0)]])
	# The off arm counter-swings; the buster arm stays close to its stance so
	# the weapon never flails while running.
	_ready_arms(anim, RUN_CYCLE, 6.0)
	# Counter-swing: the left arm goes back as the left leg comes forward.
	var base: float = READY_ARMS["LeftUpperArm"].x
	_rotate(anim, "LeftUpperArm", [
		[0.0, Vector3(base - 26.0 * facing, 0, 6)], [half, Vector3(base + 26.0 * facing, 0, 6)],
		[RUN_CYCLE, Vector3(base - 26.0 * facing, 0, 6)]])
	return anim

## Strafing keeps the hips square to the camera and steps sideways, which is
## what separates it from a run — a Delver aiming down the sight never turns.
static func _strafe(side: float) -> Animation:
	var anim := _clip(RUN_CYCLE, true)
	var lift := 26.0
	var half := RUN_CYCLE * 0.5
	_rotate(anim, "LeftUpperLeg", [
		[0.0, Vector3(0, 0, lift * side)], [half, Vector3(0, 0, -lift * 0.35 * side)], [RUN_CYCLE, Vector3(0, 0, lift * side)]])
	_rotate(anim, "RightUpperLeg", [
		[0.0, Vector3(0, 0, -lift * 0.35 * side)], [half, Vector3(0, 0, lift * side)], [RUN_CYCLE, Vector3(0, 0, -lift * 0.35 * side)]])
	_rotate(anim, "LeftLowerLeg", [
		[0.0, Vector3(-10.0, 0, 0)], [RUN_CYCLE * 0.25, Vector3(-34.0, 0, 0)], [RUN_CYCLE, Vector3(-10.0, 0, 0)]])
	_rotate(anim, "RightLowerLeg", [
		[0.0, Vector3(-10.0, 0, 0)], [RUN_CYCLE * 0.75, Vector3(-34.0, 0, 0)], [RUN_CYCLE, Vector3(-10.0, 0, 0)]])
	_position(anim, "Hips", [
		[0.0, Vector3(0, 0.0, 0)], [RUN_CYCLE * 0.25, Vector3(0, 0.03, 0)],
		[half, Vector3(0, 0.0, 0)], [RUN_CYCLE * 0.75, Vector3(0, 0.03, 0)], [RUN_CYCLE, Vector3(0, 0.0, 0)]])
	_rotate(anim, "Spine", [[0.0, Vector3(0, 0, -5.0 * side)]])
	_ready_arms(anim, RUN_CYCLE, 4.0)
	return anim

static func _jump() -> Animation:
	var anim := _clip(0.34, false)
	_rotate(anim, "LeftUpperLeg", [[0.0, Vector3(-26, 0, 0)], [0.34, Vector3(18, 0, 0)]])
	_rotate(anim, "RightUpperLeg", [[0.0, Vector3(-26, 0, 0)], [0.34, Vector3(-6, 0, 0)]])
	_rotate(anim, "LeftLowerLeg", [[0.0, Vector3(-46, 0, 0)], [0.34, Vector3(-14, 0, 0)]])
	_rotate(anim, "RightLowerLeg", [[0.0, Vector3(-46, 0, 0)], [0.34, Vector3(-40, 0, 0)]])
	_rotate(anim, "Spine", [[0.0, Vector3(-10, 0, 0)], [0.34, Vector3(4, 0, 0)]])
	_ready_arms(anim, 0.34, 8.0)
	return anim

static func _fall() -> Animation:
	var anim := _clip(0.9, true)
	_rotate(anim, "LeftUpperLeg", [[0.0, Vector3(14, 0, 0)], [0.45, Vector3(20, 0, 0)], [0.9, Vector3(14, 0, 0)]])
	_rotate(anim, "RightUpperLeg", [[0.0, Vector3(-10, 0, 0)], [0.45, Vector3(-16, 0, 0)], [0.9, Vector3(-10, 0, 0)]])
	_rotate(anim, "LeftLowerLeg", [[0.0, Vector3(-30, 0, 0)]])
	_rotate(anim, "RightLowerLeg", [[0.0, Vector3(-22, 0, 0)]])
	_rotate(anim, "Spine", [[0.0, Vector3(5, 0, 0)]])
	_ready_arms(anim, 0.9, 5.0)
	return anim

## A hard compression on contact, released quickly. This is the clip that sells
## weight — without it a landing reads as the character teleporting to the floor.
static func _land() -> Animation:
	var anim := _clip(0.28, false)
	_position(anim, "Hips", [
		[0.0, Vector3(0, -0.14, 0)], [0.10, Vector3(0, -0.19, 0)], [0.28, Vector3(0, 0.0, 0)]])
	_rotate(anim, "LeftUpperLeg", [[0.0, Vector3(24, 0, 0)], [0.10, Vector3(30, 0, 0)], [0.28, Vector3(0, 0, 0)]])
	_rotate(anim, "RightUpperLeg", [[0.0, Vector3(24, 0, 0)], [0.10, Vector3(30, 0, 0)], [0.28, Vector3(0, 0, 0)]])
	_rotate(anim, "LeftLowerLeg", [[0.0, Vector3(-52, 0, 0)], [0.28, Vector3(-8, 0, 0)]])
	_rotate(anim, "RightLowerLeg", [[0.0, Vector3(-52, 0, 0)], [0.28, Vector3(-8, 0, 0)]])
	_rotate(anim, "Spine", [[0.0, Vector3(16, 0, 0)], [0.28, Vector3(0, 0, 0)]])
	_ready_arms(anim, 0.28, 10.0)
	return anim

## Length comes from ActionTable, so the tuck and the i-frame window are
## describing the same seconds by construction.
static func _roll(id: String) -> Animation:
	var length := ActionTable.total(id)
	var anim := _clip(length, false)
	# A full forward revolution about the hips, tucked at the midpoint.
	_rotate(anim, "Hips", [
		[0.0, Vector3(0, 0, 0)], [length * 0.5, Vector3(-180, 0, 0)], [length, Vector3(-360, 0, 0)]])
	_position(anim, "Hips", [
		[0.0, Vector3(0, 0, 0)], [length * 0.5, Vector3(0, -0.34, 0)], [length, Vector3(0, 0, 0)]])
	_rotate(anim, "Spine", [
		[0.0, Vector3(10, 0, 0)], [length * 0.5, Vector3(46, 0, 0)], [length, Vector3(0, 0, 0)]])
	for bone in ["LeftUpperLeg", "RightUpperLeg"]:
		_rotate(anim, bone, [
			[0.0, Vector3(-20, 0, 0)], [length * 0.5, Vector3(-96, 0, 0)], [length, Vector3(0, 0, 0)]])
	for bone in ["LeftLowerLeg", "RightLowerLeg"]:
		_rotate(anim, bone, [
			[0.0, Vector3(-30, 0, 0)], [length * 0.5, Vector3(-104, 0, 0)], [length, Vector3(-8, 0, 0)]])
	_ready_arms(anim, length, 22.0)
	return anim

static func _air_dash() -> Animation:
	var anim := _clip(0.30, false)
	_rotate(anim, "Spine", [[0.0, Vector3(-22, 0, 0)], [0.30, Vector3(-4, 0, 0)]])
	_rotate(anim, "LeftUpperLeg", [[0.0, Vector3(30, 0, 0)], [0.30, Vector3(6, 0, 0)]])
	_rotate(anim, "RightUpperLeg", [[0.0, Vector3(-24, 0, 0)], [0.30, Vector3(-4, 0, 0)]])
	_rotate(anim, "LeftLowerLeg", [[0.0, Vector3(-56, 0, 0)], [0.30, Vector3(-16, 0, 0)]])
	_rotate(anim, "RightLowerLeg", [[0.0, Vector3(-18, 0, 0)], [0.30, Vector3(-10, 0, 0)]])
	_ready_arms(anim, 0.30, 14.0)
	return anim

# ------------------------------------------------------------------ helpers

static func _clip(length: float, loop: bool) -> Animation:
	var anim := Animation.new()
	anim.length = length
	anim.loop_mode = Animation.LOOP_LINEAR if loop else Animation.LOOP_NONE
	return anim

## Every clip restates the arm stance, because an animation replaces the bone
## pose rather than adding to it — omit these and the arms drop to the A-pose
## the instant anything plays. `sway` is the shoulder bob for that clip.
static func _ready_arms(anim: Animation, length: float, sway: float) -> void:
	for bone in READY_ARMS:
		var base: Vector3 = READY_ARMS[bone]
		if bone == "RightUpperArm":
			_rotate(anim, bone, [
				[0.0, base], [length * 0.5, base + Vector3(sway * 0.4, 0, 0)], [length, base]])
		else:
			_rotate(anim, bone, [[0.0, base]])

static func _rotate(anim: Animation, bone: String, keys: Array) -> void:
	var track := anim.add_track(Animation.TYPE_ROTATION_3D)
	anim.track_set_path(track, NodePath("Skeleton3D:%s" % bone))
	for key in keys:
		var degrees: Vector3 = key[1]
		anim.rotation_track_insert_key(track, float(key[0]), Quaternion.from_euler(
			Vector3(deg_to_rad(degrees.x), deg_to_rad(degrees.y), deg_to_rad(degrees.z))))

## Position tracks are relative to the bone REST, so a key of ZERO means "where
## the skeleton says this bone lives" rather than the model origin.
static func _position(anim: Animation, bone: String, keys: Array) -> void:
	var rest := _rest_of(bone)
	var track := anim.add_track(Animation.TYPE_POSITION_3D)
	anim.track_set_path(track, NodePath("Skeleton3D:%s" % bone))
	for key in keys:
		anim.position_track_insert_key(track, float(key[0]), rest + (key[1] as Vector3))

static func _rest_of(bone: String) -> Vector3:
	for entry in DelverRig.BONES:
		if str(entry["name"]) == bone:
			return entry["rest"]
	return Vector3.ZERO
