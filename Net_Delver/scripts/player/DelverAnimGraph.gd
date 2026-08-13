class_name DelverAnimGraph
extends RefCounted

# The AnimationTree graph, built in code.
#
# Shape:
#
#   BlendTree (root)
#     └─ Locomotion : StateMachine
#          ├─ Ground : BlendTree { Move : BlendSpace2D → Scale : TimeScale }
#          ├─ Jump / Fall / Land / Roll / AirDash : Animation
#          └─ output
#
# The one idea worth understanding is the ground blend space. Idle sits at its
# centre and the run set on its rim, so the *radius* is speed and the *angle* is
# direction. That gives walking for free (any radius between the two), and it
# gives both halves of the hybrid feel from one node: while free-running the rig
# has turned to face the movement, so the blend position is (0, 1) and you get a
# pure forward run; while aiming the rig faces the camera, so the same
# calculation yields the true strafe vector. No mode switch anywhere.

const PARAM_PLAYBACK := "parameters/Locomotion/playback"
const PARAM_BLEND := "parameters/Locomotion/Ground/Move/blend_position"
const PARAM_TIME_SCALE := "parameters/Locomotion/Ground/Scale/scale"

const GROUND := &"Ground"
const JUMP := &"Jump"
const FALL := &"Fall"
const LAND := &"Land"
const ROLL := &"Roll"
const ROLL_HEAVY := &"RollHeavy"
const AIR_DASH := &"AirDash"

## Every state is reachable from every other one. A Delver can be interrupted
## out of anything into anything — landing mid-dodge, dashing out of a fall —
## so a hand-maintained transition list would only be a list of the cases
## somebody remembered.
const STATES: Array[StringName] = [GROUND, JUMP, FALL, LAND, ROLL, ROLL_HEAVY, AIR_DASH]

## Which animation state a committed action maps to. Keyed by ActionTable id.
const ACTION_STATES := {"roll": ROLL, "roll_heavy": ROLL_HEAVY}

## Short enough that a transition reads as a cut rather than a fade. Anything
## past ~0.2s makes a shooter feel like it is wading.
const XFADE := 0.10
const XFADE_SNAP := 0.05

static func build() -> AnimationNodeBlendTree:
	var root := AnimationNodeBlendTree.new()
	root.add_node("Locomotion", _locomotion(), Vector2(180, 60))
	root.connect_node("output", 0, "Locomotion")
	return root

static func _locomotion() -> AnimationNodeStateMachine:
	var machine := AnimationNodeStateMachine.new()
	machine.add_node(GROUND, _ground(), Vector2(80, 120))
	machine.add_node(JUMP, _clip("jump"), Vector2(300, 40))
	machine.add_node(FALL, _clip("fall"), Vector2(460, 40))
	machine.add_node(LAND, _clip("land"), Vector2(620, 120))
	machine.add_node(ROLL, _clip("roll"), Vector2(80, 260))
	machine.add_node(ROLL_HEAVY, _clip("roll_heavy"), Vector2(80, 360))
	machine.add_node(AIR_DASH, _clip("air_dash"), Vector2(300, 260))

	# Transitions are driven explicitly by the animator calling travel(), rather
	# than by advance conditions. The controller already knows whether it is
	# grounded, rolling, or dashing — re-deriving that inside the graph would be
	# a second source of truth for the same facts.
	#
	# Self-transitions are skipped because a state machine rejects them; a roll
	# cancelled straight into another roll is handled by the animator restarting
	# the state, which is the only way to replay it from frame zero anyway.
	for from in STATES:
		for to in STATES:
			if from != to:
				machine.add_transition(from, to, _transition(to in ACTION_STATES.values()))
	return machine

## Idle at the centre, the run set on the rim. Diagonals are covered by
## interpolation between the four cardinal points, which for a four-limbed
## blocky proxy is indistinguishable from authoring them.
static func _ground() -> AnimationNodeBlendTree:
	var space := AnimationNodeBlendSpace2D.new()
	space.min_space = Vector2(-1.0, -1.0)
	space.max_space = Vector2(1.0, 1.0)
	space.snap = Vector2(0.1, 0.1)
	space.blend_mode = AnimationNodeBlendSpace2D.BLEND_MODE_INTERPOLATED
	space.add_blend_point(_clip("idle"), Vector2(0.0, 0.0))
	space.add_blend_point(_clip("run_fwd"), Vector2(0.0, 1.0))
	space.add_blend_point(_clip("run_back"), Vector2(0.0, -1.0))
	space.add_blend_point(_clip("strafe_left"), Vector2(-1.0, 0.0))
	space.add_blend_point(_clip("strafe_right"), Vector2(1.0, 0.0))

	var tree := AnimationNodeBlendTree.new()
	tree.add_node("Move", space, Vector2(60, 60))
	# The time scale is what actually kills foot sliding: the animator feeds it
	# real speed over DelverAnimSet.REFERENCE_SPEED, so the cycle always matches
	# the ground being covered.
	tree.add_node("Scale", AnimationNodeTimeScale.new(), Vector2(280, 60))
	tree.connect_node("Scale", 0, "Move")
	tree.connect_node("output", 0, "Scale")
	return tree

static func _clip(name: String) -> AnimationNodeAnimation:
	var node := AnimationNodeAnimation.new()
	node.animation = name
	return node

static func _transition(snap: bool) -> AnimationNodeStateMachineTransition:
	var transition := AnimationNodeStateMachineTransition.new()
	# A dodge has to start on the frame it was pressed; everything else can
	# afford a short blend.
	transition.xfade_time = XFADE_SNAP if snap else XFADE
	transition.switch_mode = AnimationNodeStateMachineTransition.SWITCH_MODE_IMMEDIATE
	transition.advance_mode = AnimationNodeStateMachineTransition.ADVANCE_MODE_ENABLED
	transition.reset = false
	return transition
