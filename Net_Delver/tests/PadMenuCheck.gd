extends Node

# Can a gamepad drive the menus?
#
# Pushes real InputEventJoypadButton events through the engine and asserts that
# focus moves and a button actually fires. Everything about menu navigation is
# invisible from code inspection — Godot builds focus neighbours from geometry
# at runtime, and a missing ui_* binding fails by simply doing nothing.
#
# Needs a real window:
#   godot --path "<project>" res://tests/PadMenuCheck.tscn

var failures: Array[String] = []
var _pressed := false

func check(condition: bool, label: String) -> void:
	if not condition:
		failures.append(label)

func _ready() -> void:
	SaveManager.use_profile("user://net_delver_padmenu.cfg")
	InputSettings.apply_all()

	# --- the bindings the UI itself depends on -----------------------------
	# These are engine defaults, not ours, but InputSettings rebuilds the map at
	# startup and a mistake there would silently strip them.
	for action in ["ui_up", "ui_down", "ui_left", "ui_right", "ui_accept", "ui_cancel"]:
		check(InputMap.has_action(action), "UI action exists: %s" % action)
		var has_pad := false
		for event in InputMap.action_get_events(action):
			if event is InputEventJoypadButton or event is InputEventJoypadMotion:
				has_pad = true
		check(has_pad, "%s has a gamepad binding" % action)

	# --- a real menu ------------------------------------------------------
	var lobby: Control = preload("res://scenes/MainMenu.tscn").instantiate()
	add_child(lobby)
	await get_tree().process_frame
	await get_tree().process_frame

	var first := lobby.get_viewport().gui_get_focus_owner()
	check(first != null, "the lobby gives something focus on open")
	if first:
		print("FOCUS START: %s" % first.name)

	await _tap(JOY_BUTTON_DPAD_DOWN)
	var second := lobby.get_viewport().gui_get_focus_owner()
	check(second != null and second != first,
		"D-pad down moves focus (%s -> %s)" % [
			first.name if first else "<none>", second.name if second else "<none>"])

	# --- does a press actually activate? ----------------------------------
	var probe := Button.new()
	probe.text = "PROBE"
	probe.pressed.connect(func(): _pressed = true)
	lobby.add_child(probe)
	await get_tree().process_frame
	probe.grab_focus()
	await get_tree().process_frame
	check(lobby.get_viewport().gui_get_focus_owner() == probe, "a button can take focus")
	await _tap(JOY_BUTTON_A)
	check(_pressed, "the gamepad's accept button fires the focused control")

	if failures.is_empty():
		print("NET_DELVER_PAD_MENU_OK")
	else:
		for failure in failures:
			printerr("FAIL: %s" % failure)
		printerr("NET_DELVER_PAD_MENU_FAILED (%d)" % failures.size())
	get_tree().quit(0 if failures.is_empty() else 1)

func _tap(button: int) -> void:
	for pressed in [true, false]:
		var event := InputEventJoypadButton.new()
		event.button_index = button
		event.pressed = pressed
		event.device = 0
		Input.parse_input_event(event)
		await get_tree().process_frame
		await get_tree().process_frame
