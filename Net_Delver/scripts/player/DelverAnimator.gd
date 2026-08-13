extends Node3D

# Drives the rig from controller state.
#
# This is a SEPARATE NODE from PlayerController, and that is the whole design.
# The controller's `_process` and `_physics_process` both return early for
# non-authority peers, so a teammate's Delver runs no logic at all locally. An
# animator living inside the controller would therefore never tick for anyone
# but you, and the rest of the party would slide around frozen. Godot dispatches
# process callbacks per node, so a sibling node is simply unaffected by the
# controller's early return — this node ticks for every Delver on every machine.
#
# Two things it owns outright:
#
# * **Rig yaw** — the visual facing. The body always faces the camera (that is
#   the aim yaw, and the collision capsule is radially symmetric so it costs
#   nothing physically). The rig on top of it turns to face where you are
#   actually running, and snaps back to the aim when you fight. That split is
#   what makes the hybrid work without touching movement, the camera, or any of
#   the four test harnesses that drive them.
#
# * **Speed, measured rather than intended.** Everything is derived from actual
#   displacement, never from `velocity` or `move_direction`. A Delver pressed
#   against a wall has full velocity but covers no ground, and the run cycle has
#   to stop. It also means the local and remote paths use literally the same
#   number, so they cannot disagree.

const SNAP_SPEED := 26.0        ## rad/s back to the aim when fighting
const TURN_SPEED := 11.0        ## rad/s toward the run direction when free
const REVERSE_SNAP := 2.6       ## rad past which a turn cuts instead of sweeping
const COMBAT_STANCE := 0.85     ## seconds a shot pins the rig to the aim
const TORSO_LIMIT := 0.9        ## rad the spine may counter-rotate
const MOVING := 0.4             ## m/s below which the Delver counts as still
const STALL_TIMEOUT := 0.25     ## no new transform for this long means stopped

var controller: CharacterBody3D
var rig: DelverRig.Rig
var model: Node3D

var rig_yaw := 0.0
var combat_stance := 0.0
var planar_velocity := Vector3.ZERO

var _tree: AnimationTree
var _player: AnimationPlayer
var _playback: AnimationNodeStateMachinePlayback
var _state := DelverAnimGraph.GROUND
var _last_position := Vector3.ZERO
var _still_time := 0.0
var _raw_planar := Vector3.ZERO
var _was_grounded := true
var _spine_index := -1
var _land_hold := 0.0
var _last_action_time := 0.0

func setup(owner_controller: CharacterBody3D) -> void:
	controller = owner_controller
	rig = owner_controller.rig
	model = owner_controller.model
	_spine_index = rig.skeleton.find_bone("Spine")

	_player = AnimationPlayer.new()
	_player.name = "AnimationPlayer"
	# root_node has to be assigned AFTER add_child: get_path_to() needs both
	# nodes in the tree, and calling it on an orphan fails with a null parent.
	add_child(_player)
	# Rooted at the model so every track path is "Skeleton3D:BoneName", which is
	# what DelverAnimSet writes and what a glTF import will produce too.
	_player.root_node = _player.get_path_to(model)
	_player.add_animation_library("", DelverAnimSet.build())

	_tree = AnimationTree.new()
	_tree.name = "AnimationTree"
	add_child(_tree)
	_tree.anim_player = _tree.get_path_to(_player)
	_tree.tree_root = DelverAnimGraph.build()
	_tree.active = true

	_playback = _tree.get(DelverAnimGraph.PARAM_PLAYBACK)
	if _playback:
		_playback.start(DelverAnimGraph.GROUND)
	_last_position = controller.global_position

func _physics_process(delta: float) -> void:
	if not is_instance_valid(controller) or not _tree:
		return
	_measure(delta)
	_advance_stance(delta)
	_drive_facing(delta)
	_drive_locomotion(delta)

# ------------------------------------------------------------------ measure

## Derives planar speed from how far the Delver actually moved.
##
## For a remote peer this has to cope with stepped arrivals: the transform is
## constant between replication snapshots and then jumps, so dividing by `delta`
## every tick would produce a sawtooth. Dividing by the time since the transform
## last *changed* gives the right answer at any replication rate.
func _measure(delta: float) -> void:
	var here := controller.global_position
	if here.is_equal_approx(_last_position):
		_still_time += delta
		if _still_time > STALL_TIMEOUT:
			_raw_planar = Vector3.ZERO
	else:
		var elapsed := maxf(_still_time, delta)
		var moved := here - _last_position
		# Teleport rejection. Respawns and the test harness both jump the
		# Delver across the sector; without this the derived speed spikes to
		# hundreds of m/s and the blend space saturates for a frame.
		if moved.length() < controller.move_speed * 3.0 * elapsed:
			_raw_planar = Vector3(moved.x, 0.0, moved.z) / elapsed
		else:
			_raw_planar = Vector3.ZERO
			rig_yaw = 0.0
		_last_position = here
		_still_time = 0.0
	planar_velocity = planar_velocity.lerp(_raw_planar, 1.0 - exp(-14.0 * delta))

func planar_speed() -> float:
	return planar_velocity.length()

# ------------------------------------------------------------------- facing

## `stance` is 1 while aiming or fighting, 0 while free-running. Everything
## about the hybrid is a blend between those two poses.
func stance() -> float:
	# A sprint always commits to the run direction — that is most of what makes
	# it read as a sprint rather than as "the same run, faster".
	if bool(controller.sprinting):
		return 0.0
	var aiming := float(controller.aim_blend)
	return maxf(aiming, 1.0 if combat_stance > 0.0 else 0.0)

func _advance_stance(delta: float) -> void:
	combat_stance = maxf(0.0, combat_stance - delta)
	if controller.is_multiplayer_authority() and controller.charge > 0.01:
		combat_stance = maxf(combat_stance, 0.12)

## Called by the controller when a shot leaves, and by anything else that means
## "you are in a fight now".
func enter_combat_stance() -> void:
	combat_stance = COMBAT_STANCE

func _drive_facing(delta: float) -> void:
	var weight := stance()
	var target := 0.0
	if weight < 0.5 and planar_speed() > MOVING:
		# Angle of travel expressed in the body's frame — the body faces the
		# camera, so this is "how far off-camera am I actually running".
		#
		# The sign matters and is easy to get backwards: a Basis rotated by yaw
		# maps its -Z (forward) to (-sin yaw, 0, -cos yaw), so solving for the
		# yaw that points forward at `local` gives atan2(-x, -z), not atan2(x, -z).
		# With the wrong sign the rig turns away from the direction of travel and
		# a rightward run resolves to a backpedal.
		var local := controller.global_basis.inverse() * planar_velocity
		target = atan2(-local.x, -local.z)

	var rate := (SNAP_SPEED if weight >= 0.5 else TURN_SPEED) * delta
	var difference := wrapf(target - rig_yaw, -PI, PI)
	# A hard reversal cuts rather than sweeping the long way round, which would
	# read as the character pirouetting.
	rig_yaw = target if absf(difference) > REVERSE_SNAP else rig_yaw + clampf(difference, -rate, rate)
	model.rotation.y = rig_yaw

	# DEFERRED: the spine counter-twist that would keep the chest and weapon on
	# the crosshair while the hips face the run direction. It has to be written
	# after the AnimationTree has posed the skeleton for the tick, or the tree
	# overwrites it — and composing onto the existing pose without a guaranteed
	# ordering accumulates rotation every frame. Worth doing, but it needs the
	# process-priority ordering proven first, and the hybrid reads correctly
	# without it. See TORSO_LIMIT.

# -------------------------------------------------------------- locomotion

func _drive_locomotion(delta: float) -> void:
	var grounded := controller.is_on_floor()
	var speed := planar_speed()

	# Direction is expressed in the MODEL's frame, not the body's. That single
	# choice is what lets one blend space serve both halves of the hybrid: the
	# model has already turned to face the run, so free-running resolves to a
	# pure forward run, while in combat stance it resolves to the true strafe.
	var local := (controller.global_basis * Basis(Vector3.UP, rig_yaw)).inverse() * planar_velocity
	var normalized := speed / DelverAnimSet.REFERENCE_SPEED
	var direction := Vector2(local.x, -local.z)
	if direction.length() > 0.001:
		direction = direction.normalized() * minf(normalized, 1.0)
	_tree.set(DelverAnimGraph.PARAM_BLEND, direction)
	# Above the reference speed the blend saturates and the playback rate takes
	# over, so a 1.65x roll or a slowed ADS walk both keep their feet planted.
	_tree.set(DelverAnimGraph.PARAM_TIME_SCALE,
		lerpf(1.0, clampf(normalized, 0.6, 2.0), minf(normalized, 1.0)))

	_land_hold = maxf(0.0, _land_hold - delta)
	var wanted := _wanted_state(grounded)
	# A roll cancelled straight into another roll keeps the same wanted state,
	# so the restart is detected by the action clock going backwards. Without
	# this the second dodge plays from wherever the first one had got to.
	var restarted: bool = wanted in DelverAnimGraph.ACTION_STATES.values() \
		and float(controller.action_time) < _last_action_time
	if _playback and (wanted != _state or restarted):
		if restarted:
			_playback.start(wanted)
		else:
			_playback.travel(wanted)
	_state = wanted
	_last_action_time = float(controller.action_time)
	_was_grounded = grounded

func _wanted_state(grounded: bool) -> StringName:
	# Committed actions map 1:1 onto their own state, so a heavy roll plays its
	# own longer clip rather than stretching the light one.
	if DelverAnimGraph.ACTION_STATES.has(controller.action):
		return DelverAnimGraph.ACTION_STATES[controller.action]
	if not grounded:
		return DelverAnimGraph.JUMP if controller.velocity.y > 1.0 else DelverAnimGraph.FALL
	# Landing is derived from the grounded edge rather than replicated — every
	# peer already knows when a Delver's feet touched down.
	if not _was_grounded:
		_land_hold = 0.28
	return DelverAnimGraph.LAND if _land_hold > 0.0 else DelverAnimGraph.GROUND

## Exposed for tests and for anything that needs to know what is playing.
func current_state() -> StringName:
	return _state
