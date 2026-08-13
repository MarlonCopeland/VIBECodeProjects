extends Node

# Renders the Delver at several points through the run cycle, from a fixed
# camera, so the animation can be checked by eye. Assertions can prove the graph
# is wired; only looking proves the pose is worth having.
#
# Needs a renderer:
#   godot --path "<project>" res://tests/AnimationShot.tscn

const SPEED := 6.5

func _ready() -> void:
	SaveManager.use_profile("user://net_delver_animshot.cfg")
	GameManager.delve_seed = 20260810
	NetworkManager.players = {1: {"id": 1, "name": "Anim", "host": true, "kit": {}}}
	var dungeon := preload("res://scenes/Dungeon.tscn").instantiate()
	add_child(dungeon)
	await get_tree().process_frame

	var player: Node = dungeon.get_node("Players/1")
	player.set_physics_process(false)
	player.set_process(false)
	if player.hud:
		player.hud.visible = false
	if player.menus:
		player.menus.visible = false

	# Side-on, so leg swing and hip bob are both readable. The player's own
	# camera is over the shoulder, which hides exactly what needs checking.
	var camera := Camera3D.new()
	camera.fov = 40.0
	dungeon.add_child(camera)
	_place(camera, player, Vector3(4.2, 1.1, 1.4))
	camera.current = true

	var anim: Node = player.animator

	# The Delver faces -Z. A camera in front of it therefore stands at -Z, and
	# must see the visor and the buster pointing at it. Anything reaching the
	# other way is the limb sign convention being wrong (see DelverRig).
	_place(camera, player, Vector3(0.9, 1.1, -3.4))
	await _sample(anim, "anim_front", Vector3.ZERO, 0.6)
	_place(camera, player, Vector3(0.9, 1.1, 3.4))
	await _sample(anim, "anim_back", Vector3.ZERO, 0.3)
	_place(camera, player, Vector3(4.2, 1.1, 1.4))
	await _sample(anim, "anim_idle", Vector3.ZERO, 0.9)
	await _sample(anim, "anim_run_a", Vector3(0, 0, -SPEED), 0.10)
	await _sample(anim, "anim_run_b", Vector3(0, 0, -SPEED), 0.18)
	await _sample(anim, "anim_run_c", Vector3(0, 0, -SPEED), 0.18)

	# Free-running sideways should NOT strafe — the rig turns to face the run.
	await _sample(anim, "anim_freerun_right", Vector3(SPEED, 0, 0), 0.5)
	# Aiming pins the body to the camera, and only then do the strafe clips play.
	player.aim_blend = 1.0
	await _sample(anim, "anim_strafe_right", Vector3(SPEED, 0, 0), 0.5)
	get_tree().quit()

func _place(camera: Camera3D, player: Node, offset: Vector3) -> void:
	camera.global_position = player.global_position + offset
	camera.look_at(player.global_position + Vector3(0, 0.95, 0), Vector3.UP)

## Pins the derived speed rather than actually moving the Delver, so the camera
## stays put and successive frames are directly comparable.
func _sample(anim: Node, label: String, velocity: Vector3, hold: float) -> void:
	var elapsed := 0.0
	while elapsed < hold:
		anim.planar_velocity = velocity
		anim._raw_planar = velocity
		anim._still_time = 0.0
		await get_tree().physics_frame
		elapsed += get_physics_process_delta_time()
	await RenderingServer.frame_post_draw
	get_viewport().get_texture().get_image().save_png("user://%s.png" % label)
	print("SNAP %s  blend=%s" % [label, anim._tree.get(DelverAnimGraph.PARAM_BLEND)])
