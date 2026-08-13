extends Node

# Authoritative input map.
#
# Every action the game uses is declared here rather than in project.godot, so
# one table drives gameplay, the controls menu, and the on-screen prompts. The
# map is rebuilt from DEFAULTS plus whatever the player rebound (stored in
# SaveManager.bindings), which means `apply_all()` is always safe to call again
# after a change or a reset.
#
# Events are described as plain dictionaries so they can round-trip through the
# ConfigFile without any resource serialization:
#   {"type": "key",        "code": KEY_W}
#   {"type": "mouse",      "button": MOUSE_BUTTON_LEFT}
#   {"type": "joy_button", "button": JOY_BUTTON_A}
#   {"type": "joy_axis",   "axis": JOY_AXIS_TRIGGER_RIGHT, "value": 1.0}

signal bindings_changed

const DEADZONE := 0.22

## `kb` holds keyboard/mouse events, `pad` holds controller events. Actions
## flagged `rebind: false` (the analogue sticks) stay fixed — remapping a stick
## axis onto a button would silently break analogue movement and look.
const DEFAULTS := {
	"move_forward": {
		"label": "Move Forward", "section": "Movement", "order": 0,
		"kb": [{"type": "key", "code": KEY_W}],
		"pad": [{"type": "joy_axis", "axis": JOY_AXIS_LEFT_Y, "value": -1.0}],
		"rebind_pad": false,
	},
	"move_backward": {
		"label": "Move Backward", "section": "Movement", "order": 1,
		"kb": [{"type": "key", "code": KEY_S}],
		"pad": [{"type": "joy_axis", "axis": JOY_AXIS_LEFT_Y, "value": 1.0}],
		"rebind_pad": false,
	},
	"move_left": {
		"label": "Strafe Left", "section": "Movement", "order": 2,
		"kb": [{"type": "key", "code": KEY_A}],
		"pad": [{"type": "joy_axis", "axis": JOY_AXIS_LEFT_X, "value": -1.0}],
		"rebind_pad": false,
	},
	"move_right": {
		"label": "Strafe Right", "section": "Movement", "order": 3,
		"kb": [{"type": "key", "code": KEY_D}],
		"pad": [{"type": "joy_axis", "axis": JOY_AXIS_LEFT_X, "value": 1.0}],
		"rebind_pad": false,
	},
	"jump": {
		"label": "Jump", "section": "Movement", "order": 4,
		"kb": [{"type": "key", "code": KEY_SPACE}],
		"pad": [{"type": "joy_button", "button": JOY_BUTTON_A}],
	},
	# Shift moved from dodge to sprint: "hold Shift to run" is close to universal
	# in a shooter, and the dodge keeps Ctrl plus its controller button. Both are
	# remappable in Settings → Controls if the old habit wins.
	"roll": {
		"label": "Dodge / Air Dash", "section": "Movement", "order": 5,
		"kb": [{"type": "key", "code": KEY_CTRL}],
		"pad": [{"type": "joy_button", "button": JOY_BUTTON_B}],
	},
	"sprint": {
		"label": "Sprint", "section": "Movement", "order": 6,
		"kb": [{"type": "key", "code": KEY_SHIFT}],
		"pad": [{"type": "joy_button", "button": JOY_BUTTON_LEFT_STICK}],
	},
	# The look actions carry KEYBOARD bindings as well as the right stick, and
	# that is not a convenience — it is the only camera control that survives a
	# laptop touchpad. Windows Precision Touchpad suppresses pointer motion
	# while keys are held (its palm-rejection "disable while typing" rule), so
	# holding W to walk kills mouse-look on a trackpad and nothing in the game
	# can observe it, let alone override it. The arrow keys are polled through
	# the input map instead of the pointer, so they always work.
	"look_left": {
		"label": "Look Left", "section": "Camera", "order": 0,
		"kb": [{"type": "key", "code": KEY_LEFT}],
		"pad": [{"type": "joy_axis", "axis": JOY_AXIS_RIGHT_X, "value": -1.0}],
		"rebind_pad": false,
	},
	"look_right": {
		"label": "Look Right", "section": "Camera", "order": 1,
		"kb": [{"type": "key", "code": KEY_RIGHT}],
		"pad": [{"type": "joy_axis", "axis": JOY_AXIS_RIGHT_X, "value": 1.0}],
		"rebind_pad": false,
	},
	"look_up": {
		"label": "Look Up", "section": "Camera", "order": 2,
		"kb": [{"type": "key", "code": KEY_UP}],
		"pad": [{"type": "joy_axis", "axis": JOY_AXIS_RIGHT_Y, "value": -1.0}],
		"rebind_pad": false,
	},
	"look_down": {
		"label": "Look Down", "section": "Camera", "order": 3,
		"kb": [{"type": "key", "code": KEY_DOWN}],
		"pad": [{"type": "joy_axis", "axis": JOY_AXIS_RIGHT_Y, "value": 1.0}],
		"rebind_pad": false,
	},
	"swap_shoulder": {
		"label": "Swap Shoulder (R3)", "section": "Camera", "order": 4,
		"kb": [{"type": "key", "code": KEY_V}],
		"pad": [{"type": "joy_button", "button": JOY_BUTTON_RIGHT_STICK}],
	},
	"attack": {
		"label": "Fire", "section": "Combat", "order": 0,
		"kb": [{"type": "mouse", "button": MOUSE_BUTTON_LEFT}],
		"pad": [{"type": "joy_axis", "axis": JOY_AXIS_TRIGGER_RIGHT, "value": 1.0}],
	},
	"aim": {
		"label": "Aim Down Sight", "section": "Combat", "order": 1,
		"kb": [{"type": "mouse", "button": MOUSE_BUTTON_RIGHT}],
		"pad": [{"type": "joy_axis", "axis": JOY_AXIS_TRIGGER_LEFT, "value": 1.0}],
	},
	"throw_grenade": {
		"label": "Throw Grenade", "section": "Combat", "order": 2,
		"kb": [{"type": "key", "code": KEY_G}],
		"pad": [{"type": "joy_button", "button": JOY_BUTTON_LEFT_SHOULDER}],
	},
	"use_heal": {
		"label": "Use Repair Kit", "section": "Items", "order": 0,
		"kb": [{"type": "key", "code": KEY_H}],
		"pad": [{"type": "joy_button", "button": JOY_BUTTON_DPAD_UP}],
	},
	"use_stim": {
		"label": "Use Overclock Cell", "section": "Items", "order": 1,
		"kb": [{"type": "key", "code": KEY_F}],
		"pad": [{"type": "joy_button", "button": JOY_BUTTON_DPAD_LEFT}],
	},
	"interact": {
		"label": "Interact / Loot", "section": "Items", "order": 2,
		"kb": [{"type": "key", "code": KEY_E}],
		"pad": [{"type": "joy_button", "button": JOY_BUTTON_X}],
	},
	"character": {
		"label": "Loadout & Status", "section": "Interface", "order": 0,
		"kb": [{"type": "key", "code": KEY_TAB}],
		"pad": [{"type": "joy_button", "button": JOY_BUTTON_BACK}],
	},
	"pause": {
		"label": "Pause Menu", "section": "Interface", "order": 1,
		"kb": [{"type": "key", "code": KEY_ESCAPE}],
		"pad": [{"type": "joy_button", "button": JOY_BUTTON_START}],
	},
}

const SECTION_ORDER: Array[String] = ["Movement", "Camera", "Combat", "Items", "Interface"]

## Godot's built-in UI actions, which drive every menu.
##
## This build ships gamepad bindings for the ui_* direction actions but NOT for
## ui_accept or ui_cancel, so a controller could move the highlight around a
## menu and then had no way to choose anything. On a Steam Deck that makes the
## entire game unreachable, and it is invisible from reading our code because
## these actions are the engine's, not ours.
##
## Added, never erased: the keyboard defaults (Enter, Space, Escape) have to
## survive, and these are not exposed in the rebinding screen.
const UI_BINDINGS := {
	&"ui_accept": [JOY_BUTTON_A],
	&"ui_cancel": [JOY_BUTTON_B],
	&"ui_up": [JOY_BUTTON_DPAD_UP],
	&"ui_down": [JOY_BUTTON_DPAD_DOWN],
	&"ui_left": [JOY_BUTTON_DPAD_LEFT],
	&"ui_right": [JOY_BUTTON_DPAD_RIGHT],
}

const JOY_BUTTON_NAMES := {
	JOY_BUTTON_A: "A / CROSS", JOY_BUTTON_B: "B / CIRCLE",
	JOY_BUTTON_X: "X / SQUARE", JOY_BUTTON_Y: "Y / TRIANGLE",
	JOY_BUTTON_BACK: "VIEW / SHARE", JOY_BUTTON_GUIDE: "GUIDE",
	JOY_BUTTON_START: "MENU / OPTIONS",
	JOY_BUTTON_LEFT_STICK: "L3", JOY_BUTTON_RIGHT_STICK: "R3",
	JOY_BUTTON_LEFT_SHOULDER: "LB / L1", JOY_BUTTON_RIGHT_SHOULDER: "RB / R1",
	JOY_BUTTON_DPAD_UP: "D-PAD UP", JOY_BUTTON_DPAD_DOWN: "D-PAD DOWN",
	JOY_BUTTON_DPAD_LEFT: "D-PAD LEFT", JOY_BUTTON_DPAD_RIGHT: "D-PAD RIGHT",
}

const JOY_AXIS_NAMES := {
	JOY_AXIS_LEFT_X: "LEFT STICK X", JOY_AXIS_LEFT_Y: "LEFT STICK Y",
	JOY_AXIS_RIGHT_X: "RIGHT STICK X", JOY_AXIS_RIGHT_Y: "RIGHT STICK Y",
	JOY_AXIS_TRIGGER_LEFT: "LT / L2", JOY_AXIS_TRIGGER_RIGHT: "RT / R2",
}

const MOUSE_NAMES := {
	MOUSE_BUTTON_LEFT: "LEFT MOUSE", MOUSE_BUTTON_RIGHT: "RIGHT MOUSE",
	MOUSE_BUTTON_MIDDLE: "MIDDLE MOUSE",
	MOUSE_BUTTON_WHEEL_UP: "WHEEL UP", MOUSE_BUTTON_WHEEL_DOWN: "WHEEL DOWN",
	MOUSE_BUTTON_XBUTTON1: "MOUSE 4", MOUSE_BUTTON_XBUTTON2: "MOUSE 5",
}

func _ready() -> void:
	apply_all()

# ----------------------------------------------------------------- input map

func apply_all() -> void:
	for action in DEFAULTS:
		_apply_action(action)
	_ensure_ui_bindings()
	bindings_changed.emit()

## Tops up the engine's UI actions with gamepad buttons, idempotently. Runs on
## every apply, so a "reset bindings" cannot strand a controller-only player in
## a menu they can navigate but not use.
func _ensure_ui_bindings() -> void:
	for action in UI_BINDINGS:
		if not InputMap.has_action(action):
			continue
		for button in UI_BINDINGS[action]:
			var event := InputEventJoypadButton.new()
			event.button_index = button
			if not InputMap.action_has_event(action, event):
				InputMap.action_add_event(action, event)

func _apply_action(action: String) -> void:
	if not InputMap.has_action(action):
		InputMap.add_action(action, DEADZONE)
	else:
		# Wipe first: project.godot ships a few of these actions, and leaving the
		# old events in place would make a rebind add a second binding instead of
		# replacing the one the player is looking at.
		InputMap.action_erase_events(action)
	InputMap.action_set_deadzone(action, DEADZONE)
	for description in events_for(action, "kb"):
		var event := build_event(description)
		if event:
			InputMap.action_add_event(action, event)
	for description in events_for(action, "pad"):
		var event := build_event(description)
		if event:
			InputMap.action_add_event(action, event)

## Resolved event list for one half of a binding, override first.
func events_for(action: String, slot: String) -> Array:
	var override: Dictionary = SaveManager.bindings.get(action, {})
	if override.has(slot) and override[slot] is Array:
		return override[slot]
	var default: Dictionary = DEFAULTS.get(action, {})
	return default.get(slot, [])

func is_rebindable(action: String, slot: String) -> bool:
	var default: Dictionary = DEFAULTS.get(action, {})
	return bool(default.get("rebind_%s" % slot, true))

# ------------------------------------------------------------------ rebinding

## Assigns a captured event to one slot of an action. Any other action holding
## the same input in the same slot loses it, so a binding can never be
## ambiguous. Returns false when the action or event is not rebindable.
func rebind(action: String, slot: String, event: InputEvent) -> bool:
	if not DEFAULTS.has(action) or not is_rebindable(action, slot):
		return false
	var description := describe_event(event)
	if description.is_empty():
		return false
	if slot == "kb" and description.type == "joy_button":
		return false
	if slot == "pad" and description.type not in ["joy_button", "joy_axis"]:
		return false

	for other in DEFAULTS:
		if other == action:
			continue
		var existing := events_for(other, slot)
		var filtered := []
		for candidate in existing:
			if not _same_event(candidate, description):
				filtered.append(candidate)
		if filtered.size() != existing.size():
			_store(other, slot, filtered)

	_store(action, slot, [description])
	_apply_action(action)
	for other in DEFAULTS:
		if other != action:
			_apply_action(other)
	SaveManager.save_profile()
	bindings_changed.emit()
	return true

func clear_binding(action: String, slot: String) -> void:
	if not is_rebindable(action, slot):
		return
	_store(action, slot, [])
	_apply_action(action)
	SaveManager.save_profile()
	bindings_changed.emit()

func reset_bindings() -> void:
	SaveManager.bindings.clear()
	SaveManager.save_profile()
	apply_all()

func _store(action: String, slot: String, list: Array) -> void:
	var entry: Dictionary = SaveManager.bindings.get(action, {})
	entry[slot] = list
	SaveManager.bindings[action] = entry

func _same_event(a: Dictionary, b: Dictionary) -> bool:
	if a.get("type") != b.get("type"):
		return false
	match a.get("type"):
		"key": return a.get("code") == b.get("code")
		"mouse": return a.get("button") == b.get("button")
		"joy_button": return a.get("button") == b.get("button")
		"joy_axis": return a.get("axis") == b.get("axis") and signf(float(a.get("value", 1.0))) == signf(float(b.get("value", 1.0)))
	return false

# ---------------------------------------------------------- event conversion

func build_event(description: Dictionary) -> InputEvent:
	match description.get("type", ""):
		"key":
			var key := InputEventKey.new()
			key.physical_keycode = int(description.get("code", 0))
			return key
		"mouse":
			var mouse := InputEventMouseButton.new()
			mouse.button_index = int(description.get("button", 0))
			return mouse
		"joy_button":
			var button := InputEventJoypadButton.new()
			button.button_index = int(description.get("button", 0))
			return button
		"joy_axis":
			var motion := InputEventJoypadMotion.new()
			motion.axis = int(description.get("axis", 0))
			motion.axis_value = float(description.get("value", 1.0))
			return motion
	return null

## Converts a live InputEvent into the storable description, or {} when the
## event is not something we can bind (mouse motion, stick drift, releases).
func describe_event(event: InputEvent) -> Dictionary:
	if event is InputEventKey and event.pressed and not event.echo:
		var code: int = event.physical_keycode if event.physical_keycode != 0 else event.keycode
		return {"type": "key", "code": code}
	if event is InputEventMouseButton and event.pressed:
		return {"type": "mouse", "button": event.button_index}
	if event is InputEventJoypadButton and event.pressed:
		return {"type": "joy_button", "button": event.button_index}
	if event is InputEventJoypadMotion and absf(event.axis_value) > 0.65:
		return {"type": "joy_axis", "axis": event.axis, "value": signf(event.axis_value)}
	return {}

func describe_binding(action: String, slot: String) -> String:
	var list := events_for(action, slot)
	if list.is_empty():
		return "—"
	var parts: Array[String] = []
	for description in list:
		parts.append(event_name(description))
	return " / ".join(parts)

func event_name(description: Dictionary) -> String:
	match description.get("type", ""):
		"key":
			var label := OS.get_keycode_string(int(description.get("code", 0)))
			return label.to_upper() if not label.is_empty() else "KEY %d" % int(description.get("code", 0))
		"mouse":
			return MOUSE_NAMES.get(int(description.get("button", 0)), "MOUSE %d" % int(description.get("button", 0)))
		"joy_button":
			return JOY_BUTTON_NAMES.get(int(description.get("button", 0)), "PAD %d" % int(description.get("button", 0)))
		"joy_axis":
			var axis := int(description.get("axis", 0))
			var axis_name: String = JOY_AXIS_NAMES.get(axis, "AXIS %d" % axis)
			if axis in [JOY_AXIS_TRIGGER_LEFT, JOY_AXIS_TRIGGER_RIGHT]:
				return axis_name
			return "%s %s" % [axis_name, "+" if float(description.get("value", 1.0)) > 0.0 else "-"]
	return "—"

## Actions grouped for the controls screen, in a stable display order.
func sections() -> Dictionary:
	var grouped := {}
	for section in SECTION_ORDER:
		grouped[section] = []
	for action in DEFAULTS:
		var section: String = DEFAULTS[action].get("section", "Interface")
		if not grouped.has(section):
			grouped[section] = []
		grouped[section].append(action)
	for section in grouped:
		grouped[section].sort_custom(func(a, b): return int(DEFAULTS[a].get("order", 0)) < int(DEFAULTS[b].get("order", 0)))
	return grouped
