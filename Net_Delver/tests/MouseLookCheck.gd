extends Node

# End-to-end mouse-look check.
#
# Pushes a real InputEventMouseMotion through the engine's input pipeline —
# GUI picking included — and asserts the camera actually turned. That routing is
# the whole point: a full-screen HUD Control with the default MOUSE_FILTER_STOP
# silently swallows motion before _unhandled_input ever sees it, and the symptom
# is "the mouse does nothing" with no error anywhere.
#
# Needs a real window (mouse capture is a no-op headless), so run without
# --headless:
#
#   godot --path "<project>" res://tests/MouseLookCheck.tscn

var failures: Array[String] = []

func check(condition: bool, label: String) -> void:
	if not condition:
		failures.append(label)

func _ready() -> void:
	SaveManager.use_profile("user://net_delver_mouselook.cfg")
	GameManager.delve_seed = 20260810
	GameManager.current_state = GameManager.GameState.DUNGEON
	NetworkManager.players = {1: {"id": 1, "name": "Mouse", "host": true, "kit": {}}}
	var dungeon := preload("res://scenes/Dungeon.tscn").instantiate()
	add_child(dungeon)
	await get_tree().process_frame
	await get_tree().physics_frame

	var player: Node = dungeon.get_node("Players/1")
	Input.mouse_mode = Input.MOUSE_MODE_CAPTURED
	await get_tree().process_frame
	check(Input.mouse_mode == Input.MOUSE_MODE_CAPTURED, "mouse is captured during a delve")

	# --- yaw ---
	var yaw_before: float = player.rotation.y
	await _motion(Vector2(120, 0))
	var yaw_delta: float = player.rotation.y - yaw_before
	check(absf(yaw_delta) > 0.001, "mouse X turns the camera (delta %.4f)" % yaw_delta)
	check(yaw_delta < 0.0, "moving the mouse right turns the view right")

	# --- pitch ---
	var pitch_before: float = player.look_pitch
	await _motion(Vector2(0, 120))
	var pitch_delta: float = player.look_pitch - pitch_before
	check(absf(pitch_delta) > 0.001, "mouse Y pitches the camera (delta %.4f)" % pitch_delta)
	check(pitch_delta < 0.0, "moving the mouse down looks down")

	# The pivot has to follow, or the camera stays put while the value moves.
	await get_tree().process_frame
	check(is_equal_approx(player.pivot.rotation.x, player.look_pitch), "camera pivot tracks the pitch value")

	# --- pitch clamp ---
	for step in 40:
		await _motion(Vector2(0, -400))
	check(player.look_pitch <= player.PITCH_MAX + 0.001, "pitch clamps looking up")
	for step in 80:
		await _motion(Vector2(0, 400))
	check(player.look_pitch >= player.PITCH_MIN - 0.001, "pitch clamps looking down")

	# --- sensitivity ---
	SaveManager.set_setting("gameplay", "mouse_sensitivity", 2.0)
	player.look_pitch = 0.0
	var fast_before: float = player.rotation.y
	await _motion(Vector2(100, 0))
	var fast: float = absf(player.rotation.y - fast_before)
	SaveManager.set_setting("gameplay", "mouse_sensitivity", 0.5)
	var slow_before: float = player.rotation.y
	await _motion(Vector2(100, 0))
	var slow: float = absf(player.rotation.y - slow_before)
	check(fast > slow * 2.0, "sensitivity scales the turn (%.4f vs %.4f)" % [fast, slow])
	SaveManager.set_setting("gameplay", "mouse_sensitivity", 1.0)

	# --- inverted look ---
	SaveManager.set_setting("gameplay", "invert_y", true)
	player.look_pitch = 0.0
	await _motion(Vector2(0, 120))
	check(player.look_pitch > 0.0, "invert Y flips the pitch direction")
	SaveManager.set_setting("gameplay", "invert_y", false)

	# --- a menu must stop the camera dead ---
	player.menus.open_pause()
	await get_tree().process_frame
	var locked_yaw: float = player.rotation.y
	await _motion(Vector2(200, 200))
	check(is_equal_approx(player.rotation.y, locked_yaw), "an open menu stops mouse look")
	player.menus.close_all()
	await get_tree().process_frame
	var resumed_yaw: float = player.rotation.y
	await _motion(Vector2(120, 0))
	check(not is_equal_approx(player.rotation.y, resumed_yaw), "closing the menu restores mouse look")

	if failures.is_empty():
		print("NET_DELVER_MOUSE_LOOK_OK")
	else:
		for failure in failures:
			printerr("FAIL: %s" % failure)
		printerr("NET_DELVER_MOUSE_LOOK_FAILED (%d)" % failures.size())
	get_tree().quit(0 if failures.is_empty() else 1)

## Feeds the event through Input rather than calling the handler directly, so
## GUI picking and the unhandled-input chain are both exercised.
func _motion(relative: Vector2) -> void:
	var event := InputEventMouseMotion.new()
	event.relative = relative
	event.position = get_viewport().get_visible_rect().size * 0.5
	event.global_position = event.position
	Input.parse_input_event(event)
	await get_tree().process_frame
