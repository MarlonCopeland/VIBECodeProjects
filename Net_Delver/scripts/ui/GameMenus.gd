extends CanvasLayer

# Owns every in-run screen and the one piece of state they all share: whether
# something has the player's attention.
#
# Screens are stacked, so SETTINGS opened from the pause menu returns to the
# pause menu rather than dropping straight back into the fight. While anything
# is open the mouse is released and the local player's input is locked — the
# 3D world keeps running (it is a live co-op session), except in a solo run
# where pausing the tree is safe and expected.

const PAUSE_MENU := preload("res://scripts/ui/PauseMenu.gd")
const CHARACTER_MENU := preload("res://scripts/ui/CharacterMenu.gd")
const SETTINGS_MENU := preload("res://scripts/ui/SettingsMenu.gd")

var player: Node
var stack: Array[Control] = []

var _pause: Control
var _character: Control
var _settings: Control

func setup(owner_player: Node) -> void:
	player = owner_player
	layer = 20
	process_mode = Node.PROCESS_MODE_ALWAYS

	_pause = PAUSE_MENU.new()
	_pause.menus = self
	_character = CHARACTER_MENU.new()
	_character.menus = self
	_settings = SETTINGS_MENU.new()
	_settings.menus = self
	for screen in [_pause, _character, _settings]:
		screen.visible = false
		screen.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		add_child(screen)

func is_open() -> bool:
	return not stack.is_empty()

func _unhandled_input(event: InputEvent) -> void:
	if not is_instance_valid(player) or not player.is_multiplayer_authority():
		return
	if not get_window().has_focus():
		return
	if event.is_action_pressed("pause"):
		get_viewport().set_input_as_handled()
		if is_open():
			close_top()
		elif GameManager.current_state == GameManager.GameState.DUNGEON:
			# Nothing to pause once the results screen is up — opening it there
			# would offer to "resume" a delve that is already over.
			open(_pause)
	elif event.is_action_pressed("character"):
		get_viewport().set_input_as_handled()
		if stack.has(_character):
			close_top()
		elif not is_open():
			open(_character)

func open(screen: Control) -> void:
	if stack.has(screen):
		return
	if not stack.is_empty():
		stack.back().visible = false
	stack.append(screen)
	screen.visible = true
	if screen.has_method("refresh"):
		screen.refresh()
	_sync_state()

func close_top() -> void:
	if stack.is_empty():
		return
	var screen: Control = stack.pop_back()
	screen.visible = false
	if screen.has_method("on_closed"):
		screen.on_closed()
	SynthAudio.play("ui_back", 1.0, -20.0)
	if not stack.is_empty():
		var below: Control = stack.back()
		below.visible = true
		if below.has_method("refresh"):
			below.refresh()
	_sync_state()

func close_all() -> void:
	while not stack.is_empty():
		var screen: Control = stack.pop_back()
		screen.visible = false
		if screen.has_method("on_closed"):
			screen.on_closed()
	_sync_state()

func open_pause() -> void:
	open(_pause)

func open_character() -> void:
	open(_character)

func open_settings() -> void:
	open(_settings)

## Pausing the SceneTree would stall ENet polling and time the party out, so
## it only happens when nobody else is connected.
func _can_pause_tree() -> bool:
	return NetworkManager.players.size() <= 1

func _sync_state() -> void:
	var open_now := is_open()
	if is_instance_valid(player):
		player.input_locked = open_now
	# The results screen needs the cursor too, so only recapture it when there
	# is still a delve to go back to.
	var playing := GameManager.current_state == GameManager.GameState.DUNGEON
	Input.mouse_mode = Input.MOUSE_MODE_CAPTURED if (playing and not open_now) else Input.MOUSE_MODE_VISIBLE
	get_tree().paused = open_now and _can_pause_tree()
