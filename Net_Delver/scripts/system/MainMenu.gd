extends Control

const SETTINGS_MENU := preload("res://scripts/ui/SettingsMenu.gd")
const STASH_MENU := preload("res://scripts/ui/StashMenu.gd")

var name_edit: LineEdit
var address_edit: LineEdit
var host_button: Button
var join_button: Button
var start_button: Button
var leave_button: Button
var settings_button: Button
var roster_label: Label
var status_label: Label
var profile_label: Label
var settings_screen: Control
var stash_screen: Control
var browser_box: VBoxContainer
var roster_box: VBoxContainer
var session_list: VBoxContainer
var browser_hint: Label
var color_row: HBoxContainer
var preview_viewport: SubViewport
var preview_root: Node3D

func _ready() -> void:
	_build_interface()
	NetworkManager.roster_changed.connect(_refresh_roster)
	NetworkManager.connection_status_changed.connect(_set_status)
	NetworkManager.lobby_closed.connect(_on_lobby_closed)
	SaveManager.credits_changed.connect(_refresh_profile)
	# Armour colour changes ride the stash signal; repainting the preview also
	# covers gear swaps that will matter once slot meshes exist.
	SaveManager.stash_changed.connect(_refresh_preview, CONNECT_DEFERRED)
	LanDiscovery.sessions_changed.connect(_refresh_sessions)
	LanDiscovery.start_listening()
	_refresh_sessions(LanDiscovery.sessions())
	_refresh_roster(NetworkManager.players)
	_refresh_profile(SaveManager.credits())
	_refresh_preview()
	host_button.grab_focus()

func _exit_tree() -> void:
	# Deploying into a delve leaves the lobby; nothing is browsing any more, and
	# holding the port would block the other local instance from discovering.
	LanDiscovery.stop_listening()

func _build_interface() -> void:
	var background := ColorRect.new()
	background.color = Color("07131b")
	background.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(background)

	var grid := GridContainer.new()
	grid.columns = 2
	grid.add_theme_constant_override("h_separation", 64)
	grid.set_anchors_and_offsets_preset(Control.PRESET_CENTER)
	# Sized for the full stack (profile line, two fields, six buttons) so the
	# last button is not clipped off the bottom of a 720p window.
	grid.position = Vector2(-390, -292)
	grid.size = Vector2(780, 584)
	add_child(grid)

	var left := VBoxContainer.new()
	left.custom_minimum_size = Vector2(420, 574)
	left.add_theme_constant_override("separation", 10)
	grid.add_child(left)
	var eyebrow := Label.new()
	eyebrow.text = "TERMINAL // PARTY UPLINK"
	eyebrow.add_theme_color_override("font_color", Color("54e6a6"))
	eyebrow.add_theme_font_size_override("font_size", 16)
	left.add_child(eyebrow)
	var title := Label.new()
	title.text = "NET DELVER"
	title.add_theme_font_size_override("font_size", 48)
	left.add_child(title)
	var subtitle := Label.new()
	subtitle.text = "Descend into dead infrastructure.\nRecover forbidden buster technology."
	subtitle.add_theme_color_override("font_color", Color("91a8b5"))
	left.add_child(subtitle)
	profile_label = Label.new()
	profile_label.add_theme_font_size_override("font_size", 17)
	profile_label.add_theme_color_override("font_color", Color("f2c66d"))
	left.add_child(profile_label)
	# The callsign persists with the profile, so the field starts where the
	# player left it rather than back at the default every launch.
	name_edit = _line_edit("CALLSIGN", SaveManager.callsign())
	# Committed on submit/blur rather than per keystroke — each save rewrites
	# the whole profile file.
	name_edit.text_submitted.connect(func(value): SaveManager.set_callsign(value))
	name_edit.focus_exited.connect(func(): SaveManager.set_callsign(name_edit.text))
	left.add_child(name_edit)
	# Armour tint swatches. The pick lands on the profile, travels with the
	# roster, and paints this Delver on every peer's screen.
	color_row = HBoxContainer.new()
	color_row.add_theme_constant_override("separation", 6)
	var color_label := Label.new()
	color_label.text = "ARMOR"
	color_label.add_theme_font_size_override("font_size", 14)
	color_label.add_theme_color_override("font_color", Color("78909c"))
	color_row.add_child(color_label)
	for index in SaveManager.ARMOR_COLORS.size():
		color_row.add_child(_color_swatch(index))
	left.add_child(color_row)
	address_edit = _line_edit("HOST ADDRESS", "127.0.0.1")
	left.add_child(address_edit)
	host_button = _button("HOST PARTY")
	host_button.pressed.connect(_host)
	left.add_child(host_button)
	join_button = _button("JOIN PARTY")
	join_button.pressed.connect(_join)
	left.add_child(join_button)
	start_button = _button("DEPLOY SQUAD")
	start_button.disabled = true
	start_button.pressed.connect(GameManager.start_delve)
	left.add_child(start_button)
	leave_button = _button("LEAVE PARTY")
	leave_button.visible = false
	leave_button.pressed.connect(NetworkManager.close_lobby)
	left.add_child(leave_button)
	# Stash and Settings share a row: the left column is already as tall as a
	# 720p window allows, and neither needs full width.
	var utility_row := HBoxContainer.new()
	utility_row.add_theme_constant_override("separation", 10)
	left.add_child(utility_row)
	var stash_button := _button("STASH & LOADOUT")
	stash_button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	stash_button.pressed.connect(_open_stash)
	utility_row.add_child(stash_button)
	settings_button = _button("SETTINGS")
	settings_button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	settings_button.pressed.connect(_open_settings)
	utility_row.add_child(settings_button)
	var exit_button := _button("EXIT GAME")
	exit_button.pressed.connect(GameManager.exit_game)
	left.add_child(exit_button)

	var right := VBoxContainer.new()
	right.custom_minimum_size = Vector2(290, 574)
	right.add_theme_constant_override("separation", 14)
	grid.add_child(right)

	# Live 3D pane: whoever is in the party, standing shoulder to shoulder in
	# their chosen armour. Solo it is a mirror; in a lobby it is the squad.
	right.add_child(_build_preview())

	# The right column answers one question at a time: who can I join (offline),
	# or who is in my party (connected). Showing both at once wastes the only
	# screen space a 1280x800 handheld has.
	browser_box = VBoxContainer.new()
	browser_box.add_theme_constant_override("separation", 8)
	right.add_child(browser_box)
	var browser_title := Label.new()
	browser_title.text = "SESSIONS ON THIS NETWORK"
	browser_title.add_theme_font_size_override("font_size", 20)
	browser_box.add_child(browser_title)
	session_list = VBoxContainer.new()
	session_list.add_theme_constant_override("separation", 6)
	session_list.custom_minimum_size = Vector2(290, 150)
	browser_box.add_child(session_list)
	browser_hint = Label.new()
	browser_hint.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	browser_hint.custom_minimum_size.x = 290
	browser_hint.add_theme_font_size_override("font_size", 14)
	browser_hint.add_theme_color_override("font_color", Color("78909c"))
	browser_box.add_child(browser_hint)

	roster_box = VBoxContainer.new()
	roster_box.visible = false
	roster_box.add_theme_constant_override("separation", 8)
	right.add_child(roster_box)
	var squad_title := Label.new()
	squad_title.text = "SQUAD // 3 MAX"
	squad_title.add_theme_font_size_override("font_size", 22)
	roster_box.add_child(squad_title)
	roster_label = Label.new()
	roster_label.custom_minimum_size = Vector2(280, 170)
	roster_label.add_theme_color_override("font_color", Color("8ee9c3"))
	roster_label.add_theme_font_size_override("font_size", 18)
	roster_box.add_child(roster_label)

	status_label = Label.new()
	status_label.text = "OFFLINE // Select Host or Join"
	status_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	status_label.custom_minimum_size.x = 290
	status_label.add_theme_color_override("font_color", Color("e5b567"))
	right.add_child(status_label)
	# Built from the live input map so it stays truthful after a rebind.
	var controls := Label.new()
	controls.text = _control_summary()
	controls.add_theme_color_override("font_color", Color("78909c"))
	right.add_child(controls)

## One button per discovered host. Rebuilt whenever the beacon listener reports
## a change, which is only when a name, a player count, or the set of hosts
## actually moved — not once per beacon.
func _refresh_sessions(sessions: Array) -> void:
	for child in session_list.get_children():
		session_list.remove_child(child)
		child.queue_free()
	for session in sessions:
		var full: bool = LanDiscovery.is_full(session)
		var button := _button("%s   %d/%d" % [session["name"], session["players"], session["max"]])
		button.custom_minimum_size.y = 38
		button.tooltip_text = str(session["address"])
		button.disabled = full or not NetworkManager.players.is_empty()
		var address := str(session["address"])
		button.pressed.connect(func(): _join_address(address))
		session_list.add_child(button)
	if sessions.is_empty():
		browser_hint.text = "Searching… The host must be on this Wi-Fi and sitting in their lobby. You can still join by address below."
	else:
		browser_hint.text = "Pick a session to join. No address needed."

## A short crib sheet, not the full map — the whole thing lives in
## Settings → Controls. Read from the live bindings so a rebind is reflected.
func _control_summary() -> String:
	var lines: Array[String] = ["KEYBOARD"]
	for action in ["aim", "throw_grenade", "use_heal", "interact", "character"]:
		lines.append(_control_line(action, "kb"))
	lines.append("")
	lines.append("CONTROLLER")
	for action in ["aim", "swap_shoulder", "throw_grenade", "character"]:
		lines.append(_control_line(action, "pad"))
	return "\n".join(lines)

func _control_line(action: String, slot: String) -> String:
	return "%s  %s" % [
		InputSettings.describe_binding(action, slot).rpad(15),
		str(InputSettings.DEFAULTS[action].get("label", action))]

func _refresh_profile(total: int) -> void:
	var runs := int(SaveManager.profile.get("delves_completed", 0))
	profile_label.text = "PROFILE // %s BANKED  •  %d EXTRACTION%s" % [
		UIKit.credits_text(total), runs, "" if runs == 1 else "S"]

## The options screen is shared with the in-run pause menu; here it just
## overlays the lobby and hands focus back when it closes.
func _open_settings() -> void:
	if is_instance_valid(settings_screen):
		return
	settings_screen = SETTINGS_MENU.new()
	settings_screen.standalone_close = _close_settings
	add_child(settings_screen)
	settings_screen.refresh()

func _close_settings() -> void:
	if is_instance_valid(settings_screen):
		settings_screen.queue_free()
	settings_screen = null
	settings_button.grab_focus()

func _open_stash() -> void:
	if is_instance_valid(stash_screen):
		return
	stash_screen = STASH_MENU.new()
	stash_screen.standalone_close = _close_stash
	add_child(stash_screen)
	stash_screen.refresh()

func _close_stash() -> void:
	if is_instance_valid(stash_screen):
		stash_screen.queue_free()
	stash_screen = null
	_refresh_profile(SaveManager.credits())

## One clickable armour tint. The selected swatch wears an accent border.
func _color_swatch(index: int) -> Button:
	var swatch := Button.new()
	swatch.custom_minimum_size = Vector2(26, 26)
	swatch.tooltip_text = str(SaveManager.ARMOR_COLORS[index]["name"])
	swatch.focus_mode = Control.FOCUS_ALL
	var color := Color(str(SaveManager.ARMOR_COLORS[index]["color"]))
	var style := StyleBoxFlat.new()
	style.bg_color = color
	style.set_corner_radius_all(3)
	if index == SaveManager.armor_color_index():
		style.border_color = Color("55efb5")
		style.set_border_width_all(3)
	swatch.add_theme_stylebox_override("normal", style)
	swatch.add_theme_stylebox_override("hover", style)
	swatch.add_theme_stylebox_override("pressed", style)
	swatch.add_theme_stylebox_override("focus", style)
	swatch.pressed.connect(func():
		SaveManager.set_armor_color(index)
		_refresh_swatches())
	return swatch

func _refresh_swatches() -> void:
	if not color_row:
		return
	for child in color_row.get_children():
		color_row.remove_child(child)
		child.queue_free()
	var color_label := Label.new()
	color_label.text = "ARMOR"
	color_label.add_theme_font_size_override("font_size", 14)
	color_label.add_theme_color_override("font_color", Color("78909c"))
	color_row.add_child(color_label)
	for index in SaveManager.ARMOR_COLORS.size():
		color_row.add_child(_color_swatch(index))

## The 3D squad pane: its own SubViewport world so lobby lighting cannot leak
## into (or out of) the menu.
func _build_preview() -> SubViewportContainer:
	var container := SubViewportContainer.new()
	container.stretch = true
	container.custom_minimum_size = Vector2(290, 190)
	preview_viewport = SubViewport.new()
	preview_viewport.own_world_3d = true
	preview_viewport.transparent_bg = false
	container.add_child(preview_viewport)

	var world := WorldEnvironment.new()
	var environment := Environment.new()
	environment.background_mode = Environment.BG_COLOR
	environment.background_color = Color("06111a")
	environment.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	environment.ambient_light_color = Color("35586b")
	environment.ambient_light_energy = 0.9
	environment.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	world.environment = environment
	preview_viewport.add_child(world)

	var key_light := DirectionalLight3D.new()
	key_light.rotation_degrees = Vector3(-42, -30, 0)
	key_light.light_color = Color("bfe6f2")
	key_light.light_energy = 1.4
	preview_viewport.add_child(key_light)

	var camera := Camera3D.new()
	camera.position = Vector3(0, 1.25, 2.9)
	camera.rotation_degrees = Vector3(-8, 0, 0)
	camera.fov = 55
	preview_viewport.add_child(camera)

	preview_root = Node3D.new()
	preview_root.name = "Squad"
	preview_viewport.add_child(preview_root)
	return container

## Rebuilds the squad from the roster (or the local profile when offline).
## A handful of boxes per Delver — cheap enough to redo on every change.
func _refresh_preview() -> void:
	if not preview_root:
		return
	for child in preview_root.get_children():
		preview_root.remove_child(child)
		child.queue_free()

	var entries: Array[Dictionary] = []
	var ids := NetworkManager.players.keys()
	ids.sort()
	for id in ids:
		entries.append(NetworkManager.players[id])
	if entries.is_empty():
		entries.append({"name": SaveManager.callsign(), "color": SaveManager.armor_color_index()})

	for index in entries.size():
		var entry: Dictionary = entries[index]
		var stand := Node3D.new()
		stand.position = Vector3((float(index) - float(entries.size() - 1) * 0.5) * 1.15, 0, 0)
		# The rig faces -Z; spin it round so it looks into the camera.
		stand.rotation.y = PI
		preview_root.add_child(stand)

		var color_index := clampi(int(entry.get("color", 0)), 0, SaveManager.ARMOR_COLORS.size() - 1)
		DelverRig.build(stand, Color(str(SaveManager.ARMOR_COLORS[color_index]["color"])))

		var plate := MeshInstance3D.new()
		var plate_mesh := CylinderMesh.new()
		plate_mesh.top_radius = 0.42
		plate_mesh.bottom_radius = 0.42
		plate_mesh.height = 0.05
		var plate_material := StandardMaterial3D.new()
		plate_material.albedo_color = Color("112430")
		plate_material.emission_enabled = true
		plate_material.emission = Color("37e6af")
		plate_material.emission_energy_multiplier = 0.5
		plate_mesh.material = plate_material
		plate.mesh = plate_mesh
		plate.position.y = -0.02
		stand.add_child(plate)

		var tag := Label3D.new()
		tag.text = str(entry.get("name", "Delver"))
		tag.font_size = 30
		tag.pixel_size = 0.004
		tag.billboard = BaseMaterial3D.BILLBOARD_ENABLED
		tag.position = Vector3(0, 2.05, 0)
		tag.modulate = Color("8ee9c3")
		stand.add_child(tag)

func _line_edit(placeholder: String, value: String) -> LineEdit:
	var field := LineEdit.new()
	field.placeholder_text = placeholder
	field.text = value
	field.custom_minimum_size.y = 42
	return field

func _button(label: String) -> Button:
	var button := Button.new()
	button.text = label
	button.custom_minimum_size.y = 40
	return button

func _host() -> void:
	NetworkManager.create_lobby(name_edit.text)

func _join() -> void:
	_join_address(address_edit.text)

func _join_address(address: String) -> void:
	if not NetworkManager.players.is_empty():
		return
	address_edit.text = address
	NetworkManager.join_lobby(address, name_edit.text)

func _refresh_roster(roster: Dictionary) -> void:
	var lines: Array[String] = []
	var ids := roster.keys()
	ids.sort()
	for id in ids:
		var info: Dictionary = roster[id]
		lines.append("[%s]  %s%s" % [str(id).pad_zeros(2), info.name, "  // HOST" if info.host else ""])
	for slot in range(lines.size(), NetworkManager.MAX_PARTY_SIZE):
		lines.append("[--]  OPEN SLOT")
	roster_label.text = "\n\n".join(lines)
	var active := not roster.is_empty()
	host_button.disabled = active
	join_button.disabled = active
	name_edit.editable = not active
	address_edit.editable = not active
	leave_button.visible = active
	start_button.disabled = not NetworkManager.is_host()
	browser_box.visible = not active
	roster_box.visible = active
	_refresh_sessions(LanDiscovery.sessions())
	_refresh_preview()

func _set_status(message: String) -> void:
	status_label.text = message

func _on_lobby_closed() -> void:
	_set_status("OFFLINE // Select Host or Join")
	_refresh_roster({})
