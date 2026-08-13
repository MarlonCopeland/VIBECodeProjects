extends Node

# Camera framing harness. Renders the dungeon from the player camera in
# hip-fire, aimed, and left-shoulder framing and writes each to a PNG in
# `user://`, so the over-the-shoulder rig can be re-tuned by looking at the
# result instead of by playing the game. Not part of the smoke test — run it
# directly, with a renderer (not --headless):
#
#   godot --path "<project>" res://tests/CameraShot.tscn

func _ready() -> void:
	SaveManager.use_profile("user://net_delver_camerashot.cfg")
	NetworkManager.players = {1: {"id": 1, "name": "Shot", "host": true}}
	var dungeon := preload("res://scenes/Dungeon.tscn").instantiate()
	add_child(dungeon)
	await get_tree().process_frame
	var player: Node = dungeon.get_node("Players/1")
	# Freeze gameplay input; otherwise _read_aim resets `aiming` from the
	# (unpressed) real trigger every physics tick.
	player.set_physics_process(false)
	player.set_process(false)
	player.global_position = Vector3(0, 0.2, 6)
	player.rotation.y = 0.0
	player.look_pitch = -0.05

	await _shoot(player, false, 1, "hip_right")
	await _shoot(player, true, 1, "ads_right")
	await _shoot(player, false, -1, "hip_left")
	get_tree().quit()

func _shoot(player: Node, aiming: bool, shoulder: int, label: String) -> void:
	player.aiming = aiming
	player.shoulder = shoulder
	for frame in 30:
		player._update_camera_rig(0.1)
		await get_tree().process_frame
	await RenderingServer.frame_post_draw
	var image := get_viewport().get_texture().get_image()
	image.save_png("user://%s.png" % label)
	print("SHOT %s spring=%.2f fov=%.1f offset=%.2f" % [
		label, player.spring.spring_length, player.camera.fov, player.spring.position.x])
