extends Node

enum GameState { LOBBY, DUNGEON, RESULTS }

var current_state := GameState.LOBBY

## Layout seed for the run about to start. The host rolls it and ships it with
## the deploy order; every peer then generates the identical sector locally,
## which is why no level geometry is ever replicated.
var delve_seed := 0

func _input(event: InputEvent) -> void:
	# Gamepads are global devices on desktop platforms. Prevent an unfocused
	# local test instance from forwarding their events to menus and HUD buttons.
	if event is InputEventJoypadButton or event is InputEventJoypadMotion:
		if not get_window().has_focus():
			get_viewport().set_input_as_handled()

func start_delve() -> void:
	if NetworkManager.is_host():
		_begin_delve.rpc(randi())

func return_to_lobby() -> void:
	current_state = GameState.LOBBY
	Input.mouse_mode = Input.MOUSE_MODE_VISIBLE
	get_tree().paused = false
	get_tree().change_scene_to_file("res://scenes/MainMenu.tscn")

## Bail out of a run. Everything the party picked up this delve is dropped —
## only an extraction banks credits — so the pause menu confirms first.
func forfeit_delve() -> int:
	var lost := 0
	var dungeon := get_tree().get_first_node_in_group("dungeon")
	if dungeon and dungeon.has_method("forfeit_delve"):
		lost = dungeon.forfeit_delve()
	# There is no host migration in this slice, so leaving a run always tears
	# the session down rather than stranding the rest of the party in it.
	NetworkManager.close_lobby()
	return_to_lobby()
	return lost

func exit_game() -> void:
	SaveManager.save_profile()
	get_tree().quit()

@rpc("authority", "call_local", "reliable")
func _begin_delve(seed_value: int) -> void:
	delve_seed = seed_value
	current_state = GameState.DUNGEON
	# Each peer spends its own loadout locally. The roster already told everyone
	# what everyone is carrying, so this only touches the local stash.
	SaveManager.commit_deploy()
	get_tree().change_scene_to_file("res://scenes/Dungeon.tscn")
