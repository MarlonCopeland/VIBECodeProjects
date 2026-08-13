extends Control

# Options screen. Reachable from the main menu and from an in-run pause, so it
# never assumes a player exists — everything it changes goes through
# SaveManager, which persists and applies the value itself.
#
# Rebinding uses a listening overlay: the next real input event is captured and
# handed to InputSettings, which resolves conflicts by stealing the binding from
# whoever else had it.

var menus: Node                 ## set when opened from the in-run stack
var standalone_close: Callable  ## set when opened from the main menu

var _tabs: TabContainer
var _listen_panel: Control
var _listen_label: Label
var _listening_action := ""
var _listening_slot := ""
var _binding_rows: Array = []
var _back_button: Button

func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP
	_build()

func _build() -> void:
	add_child(UIKit.scrim())

	var center := CenterContainer.new()
	center.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(center)

	var panel := UIKit.panel(Vector2(880, 0))
	center.add_child(panel)

	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 12)
	panel.add_child(column)
	column.add_child(UIKit.heading("SETTINGS", 30))

	_tabs = TabContainer.new()
	_tabs.custom_minimum_size = Vector2(840, 430)
	_tabs.add_theme_constant_override("side_margin", 8)
	column.add_child(_tabs)
	_tabs.add_child(_build_graphics())
	_tabs.add_child(_build_audio())
	_tabs.add_child(_build_controls())
	_tabs.add_child(_build_gameplay())

	column.add_child(UIKit.separator())
	_back_button = UIKit.button("BACK")
	_back_button.pressed.connect(_close)
	column.add_child(_back_button)

	_build_listen_overlay()

func refresh() -> void:
	_refresh_binding_rows()
	_back_button.grab_focus()

func _close() -> void:
	if menus:
		menus.close_top()
	elif standalone_close.is_valid():
		standalone_close.call()

# -------------------------------------------------------------------- panels

func _section(title: String) -> VBoxContainer:
	var page := VBoxContainer.new()
	page.name = title
	page.add_theme_constant_override("separation", 10)
	return page

func _build_graphics() -> VBoxContainer:
	var page := _section("GRAPHICS")

	var preset := UIKit.option(SaveManager.QUALITY_PRESETS.keys(),
		SaveManager.QUALITY_PRESETS.keys().find(SaveManager.get_setting("graphics", "preset")))
	preset.item_selected.connect(func(index):
		SaveManager.apply_preset(str(SaveManager.QUALITY_PRESETS.keys()[index]))
		_rebuild_graphics_page())
	page.add_child(UIKit.row("QUALITY PRESET", preset))
	page.add_child(UIKit.separator())

	var window := UIKit.option(SaveManager.WINDOW_LABELS, int(SaveManager.get_setting("graphics", "window_mode")))
	window.item_selected.connect(func(index): SaveManager.set_setting("graphics", "window_mode", index))
	page.add_child(UIKit.row("WINDOW MODE", window))

	var resolution := UIKit.option(SaveManager.RESOLUTIONS,
		SaveManager.RESOLUTIONS.find(str(SaveManager.get_setting("graphics", "resolution"))))
	resolution.item_selected.connect(func(index):
		SaveManager.set_setting("graphics", "resolution", SaveManager.RESOLUTIONS[index]))
	page.add_child(UIKit.row("RESOLUTION", resolution))

	var vsync := UIKit.option(["OFF", "ON"], int(SaveManager.get_setting("graphics", "vsync")))
	vsync.item_selected.connect(func(index): SaveManager.set_setting("graphics", "vsync", index))
	page.add_child(UIKit.row("VERTICAL SYNC", vsync))

	var msaa := UIKit.option(SaveManager.MSAA_LABELS, int(SaveManager.get_setting("graphics", "msaa")))
	msaa.item_selected.connect(func(index): SaveManager.set_setting("graphics", "msaa", index))
	page.add_child(UIKit.row("ANTI-ALIASING", msaa))

	var shadows := UIKit.option(SaveManager.SHADOW_LABELS, int(SaveManager.get_setting("graphics", "shadows")))
	shadows.item_selected.connect(func(index): SaveManager.set_setting("graphics", "shadows", index))
	page.add_child(UIKit.row("SHADOW QUALITY", shadows))

	var scale_value := float(SaveManager.get_setting("graphics", "render_scale"))
	var scale_label := UIKit.body("%d%%" % int(scale_value * 100.0), UIKit.TEXT)
	var scale_slider := UIKit.slider(scale_value, 0.5, 1.0, 0.05)
	scale_slider.value_changed.connect(func(value):
		scale_label.text = "%d%%" % int(value * 100.0)
		SaveManager.set_setting("graphics", "render_scale", value))
	page.add_child(UIKit.row("RENDER SCALE", _with_readout(scale_slider, scale_label)))

	var glow := UIKit.check(bool(SaveManager.get_setting("graphics", "glow")))
	glow.toggled.connect(func(on): SaveManager.set_setting("graphics", "glow", on))
	page.add_child(UIKit.row("BLOOM", glow))

	var fog := UIKit.check(bool(SaveManager.get_setting("graphics", "fog")))
	fog.toggled.connect(func(on): SaveManager.set_setting("graphics", "fog", on))
	page.add_child(UIKit.row("VOLUMETRIC HAZE", fog))

	var reset := UIKit.button("RESET GRAPHICS")
	reset.pressed.connect(func():
		SaveManager.reset_settings("graphics")
		_rebuild_graphics_page())
	page.add_child(reset)
	return page

## A preset stamps several values at once, so the page is rebuilt rather than
## trying to push each new value back into its own control.
func _rebuild_graphics_page() -> void:
	var index := _tabs.current_tab
	var old := _tabs.get_child(0)
	_tabs.remove_child(old)
	old.queue_free()
	var page := _build_graphics()
	_tabs.add_child(page)
	_tabs.move_child(page, 0)
	_tabs.current_tab = index

func _build_audio() -> VBoxContainer:
	var page := _section("AUDIO")
	page.add_child(_volume_row(page, "MASTER", "master"))
	page.add_child(_volume_row(page, "EFFECTS", "sfx"))
	page.add_child(_volume_row(page, "INTERFACE", "ui"))
	var muted := UIKit.check(bool(SaveManager.get_setting("audio", "muted")))
	muted.toggled.connect(func(on): SaveManager.set_setting("audio", "muted", on))
	page.add_child(UIKit.row("MUTE ALL", muted))
	page.add_child(UIKit.separator())
	page.add_child(UIKit.body(
		"Every cue in Net Delver is generated at runtime — there are no audio files to stream.",
		UIKit.MUTED, 13))
	return page

func _volume_row(_page: Control, label: String, key: String) -> HBoxContainer:
	var value := float(SaveManager.get_setting("audio", key))
	var readout := UIKit.body("%d%%" % int(value * 100.0), UIKit.TEXT)
	var control := UIKit.slider(value, 0.0, 1.0, 0.05)
	control.value_changed.connect(func(new_value):
		readout.text = "%d%%" % int(new_value * 100.0)
		SaveManager.set_setting("audio", key, new_value))
	# A blip on release lets you hear what you just set.
	control.drag_ended.connect(func(changed):
		if changed:
			SynthAudio.play("ui_press", 1.0, -14.0))
	return UIKit.row(label, _with_readout(control, readout))

func _build_controls() -> VBoxContainer:
	var page := _section("CONTROLS")
	_binding_rows.clear()

	# Column headers must never wrap: UIKit.body word-wraps by default, and a
	# narrow HBox cell turns "CONTROLLER" into one letter per line.
	var header := HBoxContainer.new()
	header.add_theme_constant_override("separation", 14)
	for entry in [["ACTION", 250], ["KEYBOARD / MOUSE", 230], ["CONTROLLER", 230]]:
		var column := UIKit.body(str(entry[0]), UIKit.ACCENT_DIM, 13)
		column.autowrap_mode = TextServer.AUTOWRAP_OFF
		column.custom_minimum_size.x = int(entry[1])
		header.add_child(column)
	page.add_child(header)

	var list := VBoxContainer.new()
	list.add_theme_constant_override("separation", 4)
	var grouped := InputSettings.sections()
	for section in grouped:
		var actions: Array = grouped[section]
		if actions.is_empty():
			continue
		list.add_child(UIKit.body(section.to_upper(), UIKit.WARNING, 13))
		for action in actions:
			list.add_child(_binding_row(str(action)))
		list.add_child(UIKit.separator())
	page.add_child(UIKit.scroll(list, Vector2(790, 330)))

	var reset := UIKit.button("RESET ALL BINDINGS")
	reset.pressed.connect(func():
		InputSettings.reset_bindings()
		_refresh_binding_rows())
	page.add_child(reset)
	return page

func _binding_row(action: String) -> HBoxContainer:
	var line := HBoxContainer.new()
	line.add_theme_constant_override("separation", 14)
	var label := UIKit.body(str(InputSettings.DEFAULTS[action].get("label", action)), UIKit.TEXT, 14)
	label.autowrap_mode = TextServer.AUTOWRAP_OFF
	label.custom_minimum_size.x = 250
	line.add_child(label)

	var entry := {"action": action}
	for slot in ["kb", "pad"]:
		var button := UIKit.button("")
		button.custom_minimum_size = Vector2(230, 32)
		if InputSettings.is_rebindable(action, slot):
			button.pressed.connect(func(): _listen(action, slot))
		else:
			button.disabled = true
			button.tooltip_text = "Analogue stick axes are fixed."
		line.add_child(button)
		entry[slot] = button
	_binding_rows.append(entry)
	return line

func _refresh_binding_rows() -> void:
	for entry in _binding_rows:
		var action: String = entry["action"]
		for slot in ["kb", "pad"]:
			var button: Button = entry[slot]
			if is_instance_valid(button):
				button.text = InputSettings.describe_binding(action, slot)

func _build_gameplay() -> VBoxContainer:
	var page := _section("GAMEPLAY")

	var fov_value := float(SaveManager.get_setting("gameplay", "fov"))
	var fov_label := UIKit.body("%d°" % int(fov_value), UIKit.TEXT)
	var fov := UIKit.slider(fov_value, 60.0, 100.0, 1.0)
	fov.value_changed.connect(func(value):
		fov_label.text = "%d°" % int(value)
		SaveManager.set_setting("gameplay", "fov", value))
	page.add_child(UIKit.row("FIELD OF VIEW", _with_readout(fov, fov_label)))

	page.add_child(_sensitivity_row("MOUSE SENSITIVITY", "mouse_sensitivity", 0.2, 3.0))
	page.add_child(_sensitivity_row("STICK SENSITIVITY", "stick_sensitivity", 0.2, 3.0))
	page.add_child(_sensitivity_row("AIM SENSITIVITY", "aim_sensitivity", 0.2, 1.0))

	var invert := UIKit.check(bool(SaveManager.get_setting("gameplay", "invert_y")))
	invert.toggled.connect(func(on): SaveManager.set_setting("gameplay", "invert_y", on))
	page.add_child(UIKit.row("INVERT VERTICAL LOOK", invert))

	var hold := UIKit.check(bool(SaveManager.get_setting("gameplay", "hold_to_aim")))
	hold.toggled.connect(func(on): SaveManager.set_setting("gameplay", "hold_to_aim", on))
	page.add_child(UIKit.row("HOLD TO AIM", hold))

	var shoulder := UIKit.option(["RIGHT", "LEFT"],
		0 if int(SaveManager.get_setting("gameplay", "default_shoulder")) >= 0 else 1)
	shoulder.item_selected.connect(func(index):
		SaveManager.set_setting("gameplay", "default_shoulder", 1 if index == 0 else -1))
	page.add_child(UIKit.row("DEFAULT SHOULDER", shoulder))

	page.add_child(UIKit.separator())
	page.add_child(UIKit.body(
		"Swap shoulders mid-fight with %s or %s. Aiming pulls the camera in, narrows the field of view, and tightens the shot pattern." % [
			InputSettings.describe_binding("swap_shoulder", "kb"),
			InputSettings.describe_binding("swap_shoulder", "pad")],
		UIKit.MUTED, 13))

	var reset := UIKit.button("RESET GAMEPLAY")
	reset.pressed.connect(func():
		SaveManager.reset_settings("gameplay")
		_rebuild_gameplay_page())
	page.add_child(reset)
	return page

func _rebuild_gameplay_page() -> void:
	var index := _tabs.current_tab
	var old := _tabs.get_child(3)
	_tabs.remove_child(old)
	old.queue_free()
	var page := _build_gameplay()
	_tabs.add_child(page)
	_tabs.move_child(page, 3)
	_tabs.current_tab = index

func _sensitivity_row(label: String, key: String, minimum: float, maximum: float) -> HBoxContainer:
	var value := float(SaveManager.get_setting("gameplay", key))
	var readout := UIKit.body("%.2fx" % value, UIKit.TEXT)
	var control := UIKit.slider(value, minimum, maximum, 0.05)
	control.value_changed.connect(func(new_value):
		readout.text = "%.2fx" % new_value
		SaveManager.set_setting("gameplay", key, new_value))
	return UIKit.row(label, _with_readout(control, readout))

func _with_readout(control: Control, readout: Label) -> HBoxContainer:
	var line := HBoxContainer.new()
	line.add_theme_constant_override("separation", 12)
	control.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	readout.custom_minimum_size.x = 60
	readout.autowrap_mode = TextServer.AUTOWRAP_OFF
	line.add_child(control)
	line.add_child(readout)
	return line

# ----------------------------------------------------------------- rebinding

func _build_listen_overlay() -> void:
	_listen_panel = Control.new()
	_listen_panel.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_listen_panel.visible = false
	_listen_panel.mouse_filter = Control.MOUSE_FILTER_STOP
	add_child(_listen_panel)
	_listen_panel.add_child(UIKit.scrim())
	var center := CenterContainer.new()
	center.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_listen_panel.add_child(center)
	var panel := UIKit.panel(Vector2(460, 0))
	center.add_child(panel)
	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 8)
	panel.add_child(column)
	_listen_label = UIKit.heading("PRESS ANY INPUT", 24, UIKit.WARNING)
	_listen_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	column.add_child(_listen_label)
	var hint := UIKit.body("ESCAPE cancels  •  BACKSPACE clears the binding", UIKit.MUTED, 13)
	hint.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	column.add_child(hint)

func _listen(action: String, slot: String) -> void:
	_listening_action = action
	_listening_slot = slot
	_listen_label.text = "BIND %s\n%s" % [
		str(InputSettings.DEFAULTS[action].get("label", action)).to_upper(),
		"KEYBOARD OR MOUSE" if slot == "kb" else "CONTROLLER",
	]
	_listen_panel.visible = true

func _stop_listening() -> void:
	_listening_action = ""
	_listening_slot = ""
	_listen_panel.visible = false
	_refresh_binding_rows()
	_back_button.grab_focus()

func _input(event: InputEvent) -> void:
	if _listening_action.is_empty() or not visible:
		return
	# Swallow everything while listening: the very keys being rebound would
	# otherwise fire their old actions on the way through.
	if event is InputEventMouseMotion:
		return
	if not (event is InputEventKey or event is InputEventMouseButton
			or event is InputEventJoypadButton or event is InputEventJoypadMotion):
		return
	get_viewport().set_input_as_handled()

	if event is InputEventKey and event.pressed:
		if event.keycode == KEY_ESCAPE:
			_stop_listening()
			return
		if event.keycode == KEY_BACKSPACE:
			InputSettings.clear_binding(_listening_action, _listening_slot)
			_stop_listening()
			return

	var description := InputSettings.describe_event(event)
	if description.is_empty():
		return
	if InputSettings.rebind(_listening_action, _listening_slot, event):
		SynthAudio.play("ui_press", 1.3, -14.0)
		_stop_listening()
	else:
		_listen_label.text = "NOT VALID FOR THIS SLOT\nTRY ANOTHER INPUT"
