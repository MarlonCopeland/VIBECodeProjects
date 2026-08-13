extends Node

# Persistent player profile and options.
#
# One ConfigFile in `user://` holds everything that must survive a restart:
# the callsign, banked currency, lifetime run stats, every settings value, and
# any input rebinds. Gameplay code never touches the file — it reads and writes
# through the typed helpers here, which keep the on-disk shape stable even as
# defaults change (missing keys fall back to DEFAULT_SETTINGS).

const SAVE_PATH := "user://net_delver_profile.cfg"
const SAVE_VERSION := 1

## Redirectable so the smoke test can exercise banking and persistence against
## a scratch file instead of the player's real profile.
var save_path := SAVE_PATH

const SFX_BUS := "SFX"
const UI_BUS := "UI"

signal credits_changed(total: int)
signal settings_changed(section: String)
signal stash_changed

## Graphics presets map to the individual toggles below; picking one just
## stamps its values over the graphics section.
const QUALITY_PRESETS := {
	"POTATO": {"msaa": 0, "shadows": 0, "render_scale": 0.65, "glow": false, "fog": false},
	"BALANCED": {"msaa": 1, "shadows": 2, "render_scale": 1.0, "glow": true, "fog": true},
	"ULTRA": {"msaa": 3, "shadows": 3, "render_scale": 1.0, "glow": true, "fog": true},
}

const DEFAULT_SETTINGS := {
	"graphics": {
		"window_mode": 0,          # 0 windowed, 1 borderless fullscreen, 2 exclusive fullscreen
		"resolution": "1280x720",
		"vsync": 1,                # 0 off, 1 on
		"msaa": 1,                 # index into MSAA_LEVELS
		"shadows": 2,              # 0 off .. 3 high
		"render_scale": 1.0,
		"glow": true,
		"fog": true,
		"preset": "BALANCED",
	},
	"audio": {
		"master": 0.9,
		"sfx": 0.85,
		"ui": 0.7,
		"muted": false,
	},
	"gameplay": {
		"fov": 74.0,
		"mouse_sensitivity": 1.0,
		"stick_sensitivity": 1.0,
		"aim_sensitivity": 0.6,    # multiplier applied while aiming down sight
		"invert_y": false,
		"default_shoulder": 1,     # 1 right, -1 left
		"hold_to_aim": true,
	},
}

const DEFAULT_PROFILE := {
	"callsign": "Delver",
	"credits": 0,
	"lifetime_credits": 0,
	"delves_completed": 0,
	"delves_forfeited": 0,
	"mavericks_purged": 0,
	"best_run_credits": 0,
	"parts": 0,
	## item_id -> count. Survives between runs; the run inventory does not.
	"stash": {},
	## item_id -> count the player wants to carry in. Clamped against the stash
	## at deploy time, so an edited file cannot conjure stock.
	"deploy_kit": {},
	## slot -> equipped item id. Gear moves between here and the stash; the
	## buster slot always resolves to a weapon (Standard is the free floor).
	"equipment": {},
	## Index into ARMOR_COLORS.
	"armor_color": 0,
	## Stash capacity, bought up with credits. See BASE_STASH_SLOTS.
	"stash_slots": 16,
}

## Base backpack slots before equipment bonuses, aliased from the Delver tuning
## table so the number is spelled once.
const BASE_BACKPACK_SLOTS := DelverDatabase.BASE_BACKPACK_SLOTS

# --- Stash capacity ---------------------------------------------------------
# One slot per distinct item stack, matching the backpack. Counting individual
# units instead would make the starting sixteen meaningless the first time a
# component stack came home twenty deep.
const BASE_STASH_SLOTS := 16
const STASH_SLOT_STEP := 4
const MAX_STASH_SLOTS := 64
## Each expansion costs this times the number of expansions already bought,
## so the first four slots are pocket change and the last four are a campaign.
## Buying all the way to 64 totals 19,500 credits.
const STASH_EXPANSION_STEP_COST := 250

## The armour tints a Delver can pick in the lobby. The default is the classic
## DelverRig blue so an untouched profile looks exactly as it always has.
const ARMOR_COLORS := [
	{"name": "COBALT", "color": "2f7fc4"},
	{"name": "CRIMSON", "color": "c43b3b"},
	{"name": "EMERALD", "color": "2fae6e"},
	{"name": "AMBER", "color": "cf8a2c"},
	{"name": "VIOLET", "color": "7d5cc4"},
	{"name": "CYAN", "color": "2fb7c4"},
	{"name": "GRAPHITE", "color": "3d4a57"},
	{"name": "PEARL", "color": "c9d4dc"},
]

## What a fresh profile deploys with when the stash is empty, so a first run is
## never unarmed.
const STARTER_KIT := {
	"repair_kit": 2,
	"overclock_cell": 1,
	"frag_charge": 2,
}

const MSAA_LEVELS: Array[int] = [
	Viewport.MSAA_DISABLED, Viewport.MSAA_2X, Viewport.MSAA_4X, Viewport.MSAA_8X,
]
const MSAA_LABELS: Array[String] = ["OFF", "2X", "4X", "8X"]
const SHADOW_LABELS: Array[String] = ["OFF", "LOW", "MEDIUM", "HIGH"]
const SHADOW_ATLAS: Array[int] = [1024, 2048, 4096, 8192]
const WINDOW_LABELS: Array[String] = ["WINDOWED", "BORDERLESS", "FULLSCREEN"]
const RESOLUTIONS: Array[String] = ["1280x720", "1600x900", "1920x1080", "2560x1440"]

var profile: Dictionary = {}
var settings: Dictionary = {}
## action name -> {"key": <int or -1>, "mouse": <int or -1>, "joy": <int or -1>}
## Only entries the player actually changed are stored; everything else falls
## through to InputSettings.DEFAULTS.
var bindings: Dictionary = {}

var _loaded := false

func _ready() -> void:
	load_profile()

func _notification(what: int) -> void:
	if what == NOTIFICATION_WM_CLOSE_REQUEST or what == NOTIFICATION_CRASH:
		save_profile()

# ---------------------------------------------------------------- persistence

func load_profile() -> void:
	profile = DEFAULT_PROFILE.duplicate(true)
	settings = _duplicate_settings(DEFAULT_SETTINGS)
	bindings = {}

	var file := ConfigFile.new()
	if file.load(save_path) == OK:
		for key in DEFAULT_PROFILE:
			profile[key] = file.get_value("profile", key, DEFAULT_PROFILE[key])
		for section in DEFAULT_SETTINGS:
			for key in DEFAULT_SETTINGS[section]:
				settings[section][key] = file.get_value(section, key, DEFAULT_SETTINGS[section][key])
		var stored: Dictionary = file.get_value("input", "bindings", {})
		for action in stored:
			# Guard against a hand-edited or older file smuggling in junk.
			if stored[action] is Dictionary:
				bindings[action] = stored[action]

	_loaded = true
	apply_audio()
	apply_graphics()
	credits_changed.emit(credits())

func save_profile() -> void:
	if not _loaded:
		return
	var file := ConfigFile.new()
	file.set_value("profile", "version", SAVE_VERSION)
	for key in profile:
		file.set_value("profile", key, profile[key])
	for section in settings:
		for key in settings[section]:
			file.set_value(section, key, settings[section][key])
	file.set_value("input", "bindings", bindings)
	file.save(save_path)

## Points the profile at another file and reloads it. Bindings are applied by
## InputSettings, which owns the InputMap.
func use_profile(path: String) -> void:
	save_path = path
	load_profile()

func _duplicate_settings(source: Dictionary) -> Dictionary:
	var copy := {}
	for section in source:
		copy[section] = (source[section] as Dictionary).duplicate(true)
	return copy

# -------------------------------------------------------------------- profile

func callsign() -> String:
	return str(profile.get("callsign", "Delver"))

func set_callsign(value: String) -> void:
	var cleaned := value.strip_edges().left(18)
	profile["callsign"] = cleaned if not cleaned.is_empty() else "Delver"
	save_profile()

func credits() -> int:
	return int(profile.get("credits", 0))

## Banks a completed run. Returns the new balance.
func add_credits(amount: int) -> int:
	if amount <= 0:
		return credits()
	profile["credits"] = credits() + amount
	profile["lifetime_credits"] = int(profile.get("lifetime_credits", 0)) + amount
	profile["best_run_credits"] = maxi(int(profile.get("best_run_credits", 0)), amount)
	save_profile()
	credits_changed.emit(credits())
	return credits()

func spend_credits(amount: int) -> bool:
	if amount <= 0 or credits() < amount:
		return false
	profile["credits"] = credits() - amount
	save_profile()
	credits_changed.emit(credits())
	return true

# ---------------------------------------------------------------------- stash

## Everything the player owns between runs. The run inventory is volatile; this
## is not. Extraction moves one into the other.
func stash() -> Dictionary:
	var block: Variant = profile.get("stash", {})
	return block if block is Dictionary else {}

func stash_count(item_id: String) -> int:
	return int(stash().get(item_id, 0))

## Slots this stash can hold, one per distinct item stack.
func stash_slots() -> int:
	return clampi(int(profile.get("stash_slots", BASE_STASH_SLOTS)),
		BASE_STASH_SLOTS, MAX_STASH_SLOTS)

func stash_used() -> int:
	return _slots_used(stash())

func _slots_used(block: Dictionary) -> int:
	var used := 0
	for item_id in block:
		if int(block[item_id]) > 0:
			used += 1
	return used

## True when `item_id` has somewhere to land: an existing stack to grow, or a
## free slot to open.
func stash_has_room(item_id: String) -> bool:
	return stash_count(item_id) > 0 or stash_used() < stash_slots()

## Credits for the next four slots, or 0 once the stash is maxed out.
func stash_expansion_cost() -> int:
	if stash_slots() >= MAX_STASH_SLOTS:
		return 0
	var bought := (stash_slots() - BASE_STASH_SLOTS) / STASH_SLOT_STEP
	return STASH_EXPANSION_STEP_COST * (bought + 1)

func expand_stash() -> bool:
	var cost := stash_expansion_cost()
	if cost <= 0 or not spend_credits(cost):
		return false
	profile["stash_slots"] = mini(stash_slots() + STASH_SLOT_STEP, MAX_STASH_SLOTS)
	save_profile()
	stash_changed.emit()
	return true

func parts() -> int:
	return int(profile.get("parts", 0))

func add_parts(amount: int) -> void:
	if amount <= 0:
		return
	profile["parts"] = parts() + amount
	save_profile()
	stash_changed.emit()

## Whatever the last deposit could not fit, so the results screen can tell the
## player what a full stash cost them instead of quietly binning it.
var last_deposit_overflow: Dictionary = {}

## Banks a run's surviving goods. Returns the merged deposit so the results
## screen can report exactly what came home.
##
## Items that already have a stack are banked first: they need no new slot, so
## taking them in a second pass could see the last slot spent on a novelty and
## strand goods that would always have fit. Salvage parts are a plain counter,
## not a stack, and never consume a slot.
func deposit_to_stash(items: Dictionary, part_count := 0) -> Dictionary:
	var current := stash().duplicate()
	var deposited := {}
	last_deposit_overflow = {}
	var newcomers: Array[String] = []
	for item_id in items:
		var amount := int(items[item_id])
		if amount <= 0:
			continue
		if int(current.get(item_id, 0)) > 0:
			current[item_id] = int(current[item_id]) + amount
			deposited[str(item_id)] = amount
		else:
			newcomers.append(str(item_id))
	for item_id in newcomers:
		if _slots_used(current) >= stash_slots():
			last_deposit_overflow[item_id] = int(items[item_id])
			continue
		current[item_id] = int(items[item_id])
		deposited[item_id] = int(items[item_id])
	profile["stash"] = current
	if part_count > 0:
		profile["parts"] = parts() + part_count
	save_profile()
	stash_changed.emit()
	return deposited

func withdraw_from_stash(item_id: String, count: int) -> int:
	var current := stash()
	var taken := mini(count, int(current.get(item_id, 0)))
	if taken <= 0:
		return 0
	current[item_id] = int(current[item_id]) - taken
	if int(current[item_id]) <= 0:
		current.erase(item_id)
	profile["stash"] = current
	save_profile()
	stash_changed.emit()
	return taken

# ------------------------------------------------------------------ equipment

## The equipped loadout, validated: unknown ids and wrong-slot items are
## dropped, and the buster slot always resolves to a real weapon.
func equipment() -> Dictionary:
	var stored: Variant = profile.get("equipment", {})
	var loadout := {}
	if stored is Dictionary:
		for slot_id in stored:
			var item_id := str(stored[slot_id])
			if ItemDatabase.has(item_id) and ItemDatabase.slot(item_id) == str(slot_id):
				loadout[str(slot_id)] = item_id
	if not loadout.has("buster"):
		loadout["buster"] = ItemDatabase.BUSTER_STANDARD
	return loadout

func equipped(slot_id: String) -> String:
	return str(equipment().get(slot_id, ""))

## Equips a piece of gear out of the stash, returning whatever previously held
## the slot to the stash. The Standard Buster is exempt from ownership — it is
## the free weapon every profile starts with.
func equip(item_id: String) -> bool:
	var slot_id := ItemDatabase.slot(item_id)
	if slot_id.is_empty() or not ItemDatabase.is_gear(item_id):
		return false
	var free_item := item_id == ItemDatabase.BUSTER_STANDARD
	if not free_item and stash_count(item_id) <= 0:
		return false
	var current := equipment()
	if str(current.get(slot_id, "")) == item_id:
		return true

	# The swap is worked out on a copy first. Taking the incoming gear out of
	# the stash can free the very slot the outgoing gear needs, so the two moves
	# have to be judged together — one at a time, a full stash would either
	# refuse a swap that fits or delete the piece being replaced.
	var projected := stash().duplicate()
	if not free_item:
		var left := int(projected.get(item_id, 0)) - 1
		if left <= 0:
			projected.erase(item_id)
		else:
			projected[item_id] = left
	var outgoing := str(current.get(slot_id, ""))
	if not outgoing.is_empty() and outgoing != ItemDatabase.BUSTER_STANDARD:
		if int(projected.get(outgoing, 0)) <= 0 and _slots_used(projected) >= stash_slots():
			return false
		projected[outgoing] = int(projected.get(outgoing, 0)) + 1

	profile["stash"] = projected
	current[slot_id] = item_id
	profile["equipment"] = current
	save_profile()
	stash_changed.emit()
	return true

## Empties a slot back into the stash. The buster slot falls back to the free
## Standard Buster rather than going empty — a Delver is never unarmed.
## Returns false when the stash has no room to take the piece back.
func unequip(slot_id: String) -> bool:
	var current := equipment()
	var held := str(current.get(slot_id, ""))
	if held.is_empty():
		return false
	if slot_id == "buster" and held == ItemDatabase.BUSTER_STANDARD:
		return false
	if not _return_to_stash(held):
		return false
	if slot_id == "buster":
		current["buster"] = ItemDatabase.BUSTER_STANDARD
	else:
		current.erase(slot_id)
	profile["equipment"] = current
	save_profile()
	stash_changed.emit()
	return true

func _return_to_stash(item_id: String) -> bool:
	if item_id.is_empty() or item_id == ItemDatabase.BUSTER_STANDARD:
		return true
	if not stash_has_room(item_id):
		return false
	var current := stash()
	current[item_id] = int(current.get(item_id, 0)) + 1
	profile["stash"] = current
	return true

## Aggregate stat block of everything equipped.
func equipment_stats() -> Dictionary:
	return ItemDatabase.aggregate_stats(equipment())

## Backpack slots this loadout deploys with.
func backpack_capacity() -> int:
	return BASE_BACKPACK_SLOTS + int(equipment_stats().get("backpack", 0))

func armor_color_index() -> int:
	return clampi(int(profile.get("armor_color", 0)), 0, ARMOR_COLORS.size() - 1)

func armor_color() -> Color:
	return Color(str(ARMOR_COLORS[armor_color_index()]["color"]))

func set_armor_color(index: int) -> void:
	profile["armor_color"] = clampi(index, 0, ARMOR_COLORS.size() - 1)
	save_profile()
	# Rides the stash signal so the lobby preview and roster sync both repaint
	# without needing a dedicated channel for one integer.
	stash_changed.emit()

# ------------------------------------------------------------------- crafting

func can_craft(item_id: String) -> bool:
	if not CraftingDatabase.has_recipe(item_id):
		return false
	if parts() < CraftingDatabase.parts_cost(item_id):
		return false
	var needed := CraftingDatabase.components(item_id)
	for component_id in needed:
		if stash_count(str(component_id)) < int(needed[component_id]):
			return false
	# Paying the bill can empty component stacks and free their slots, so the
	# result is measured against the stash as it will be, not as it is.
	return _slots_used(_stash_after_craft(item_id)) <= stash_slots()

## The stash as it would stand once a recipe is paid for and its output banked.
func _stash_after_craft(item_id: String) -> Dictionary:
	var projected := stash().duplicate()
	var needed := CraftingDatabase.components(item_id)
	for component_id in needed:
		var left := int(projected.get(component_id, 0)) - int(needed[component_id])
		if left <= 0:
			projected.erase(component_id)
		else:
			projected[component_id] = left
	projected[item_id] = int(projected.get(item_id, 0)) + 1
	return projected

## Consumes the recipe's components and parts from the stash and deposits the
## crafted item. Returns false (and spends nothing) if anything is missing or
## the result has no slot to land in.
func craft(item_id: String) -> bool:
	if not can_craft(item_id):
		return false
	profile["stash"] = _stash_after_craft(item_id)
	profile["parts"] = parts() - CraftingDatabase.parts_cost(item_id)
	save_profile()
	stash_changed.emit()
	return true

## What the player has asked to carry in, clamped to what they actually own.
func deploy_kit() -> Dictionary:
	var requested: Variant = profile.get("deploy_kit", {})
	var kit := {}
	if requested is Dictionary:
		for item_id in requested:
			var amount := mini(int(requested[item_id]), stash_count(item_id))
			if amount > 0:
				kit[item_id] = amount
	return kit

func set_deploy_count(item_id: String, count: int) -> void:
	var requested: Dictionary = profile.get("deploy_kit", {})
	var clamped := clampi(count, 0, stash_count(item_id))
	# A new stack needs a free backpack slot; growing an existing stack does not.
	if clamped > 0 and not requested.has(item_id) and requested.size() >= backpack_capacity():
		return
	if clamped <= 0:
		requested.erase(item_id)
	else:
		requested[item_id] = clamped
	profile["deploy_kit"] = requested
	save_profile()
	stash_changed.emit()

## What this Delver will actually carry in. Advertised to the party in the
## lobby roster so every peer can seed the run inventory identically without an
## RPC racing the scene load.
func planned_kit() -> Dictionary:
	var kit := deploy_kit()
	return kit if not kit.is_empty() else STARTER_KIT.duplicate()

## Called on deploy. Spends only what the player explicitly loaded out — the
## free starter kit leaves `deploy_kit()` empty, so the fallback never quietly
## drains stash stock the player did not choose to risk.
func commit_deploy() -> void:
	for item_id in deploy_kit():
		withdraw_from_stash(item_id, int(deploy_kit()[item_id]))

func record_delve(completed: bool, mavericks: int) -> void:
	var key := "delves_completed" if completed else "delves_forfeited"
	profile[key] = int(profile.get(key, 0)) + 1
	profile["mavericks_purged"] = int(profile.get("mavericks_purged", 0)) + maxi(0, mavericks)
	save_profile()

# ------------------------------------------------------------------- settings

func get_setting(section: String, key: String) -> Variant:
	var block: Dictionary = settings.get(section, {})
	var fallback: Dictionary = DEFAULT_SETTINGS.get(section, {})
	return block.get(key, fallback.get(key))

func set_setting(section: String, key: String, value: Variant) -> void:
	if not settings.has(section):
		settings[section] = {}
	settings[section][key] = value
	match section:
		"audio": apply_audio()
		"graphics": apply_graphics()
	save_profile()
	settings_changed.emit(section)

func apply_preset(preset: String) -> void:
	var values: Dictionary = QUALITY_PRESETS.get(preset, {})
	for key in values:
		settings["graphics"][key] = values[key]
	settings["graphics"]["preset"] = preset
	apply_graphics()
	save_profile()
	settings_changed.emit("graphics")

func reset_settings(section: String) -> void:
	if DEFAULT_SETTINGS.has(section):
		settings[section] = (DEFAULT_SETTINGS[section] as Dictionary).duplicate(true)
	match section:
		"audio": apply_audio()
		"graphics": apply_graphics()
	save_profile()
	settings_changed.emit(section)

# ---------------------------------------------------------------------- audio

## The project ships with only a Master bus, so the SFX/UI buses are created
## here rather than in a .tres layout — that keeps the "no binary assets"
## constraint the rest of the project follows, and it guarantees the buses
## exist before SynthAudio ever asks for them.
func ensure_buses() -> void:
	for bus_name in [SFX_BUS, UI_BUS]:
		if AudioServer.get_bus_index(bus_name) != -1:
			continue
		var index := AudioServer.bus_count
		AudioServer.add_bus(index)
		AudioServer.set_bus_name(index, bus_name)
		AudioServer.set_bus_send(index, "Master")

func apply_audio() -> void:
	ensure_buses()
	var muted: bool = bool(get_setting("audio", "muted"))
	_set_bus_volume("Master", float(get_setting("audio", "master")), muted)
	_set_bus_volume(SFX_BUS, float(get_setting("audio", "sfx")), false)
	_set_bus_volume(UI_BUS, float(get_setting("audio", "ui")), false)

func _set_bus_volume(bus_name: String, linear: float, muted: bool) -> void:
	var index := AudioServer.get_bus_index(bus_name)
	if index == -1:
		return
	AudioServer.set_bus_mute(index, muted or linear <= 0.001)
	AudioServer.set_bus_volume_db(index, linear_to_db(clampf(linear, 0.0001, 1.0)))

# ------------------------------------------------------------------- graphics

func apply_graphics() -> void:
	if DisplayServer.get_name() == "headless":
		return
	_apply_window()
	var vsync: int = int(get_setting("graphics", "vsync"))
	DisplayServer.window_set_vsync_mode(
		DisplayServer.VSYNC_ENABLED if vsync == 1 else DisplayServer.VSYNC_DISABLED)

	var shadows: int = clampi(int(get_setting("graphics", "shadows")), 0, 3)
	RenderingServer.directional_shadow_atlas_set_size(SHADOW_ATLAS[shadows], shadows >= 2)

	# The viewport only exists once we are inside the tree; menus can change
	# these before a 3D scene is up, so re-apply on every call.
	var viewport := get_viewport()
	if viewport:
		viewport.msaa_3d = MSAA_LEVELS[clampi(int(get_setting("graphics", "msaa")), 0, 3)]
		viewport.scaling_3d_scale = clampf(float(get_setting("graphics", "render_scale")), 0.5, 1.0)
		viewport.positional_shadow_atlas_size = SHADOW_ATLAS[shadows]

	apply_environment_settings()

func _apply_window() -> void:
	var mode: int = int(get_setting("graphics", "window_mode"))
	match mode:
		1:
			DisplayServer.window_set_mode(DisplayServer.WINDOW_MODE_FULLSCREEN)
			DisplayServer.window_set_flag(DisplayServer.WINDOW_FLAG_BORDERLESS, true)
		2:
			DisplayServer.window_set_flag(DisplayServer.WINDOW_FLAG_BORDERLESS, false)
			DisplayServer.window_set_mode(DisplayServer.WINDOW_MODE_EXCLUSIVE_FULLSCREEN)
		_:
			DisplayServer.window_set_mode(DisplayServer.WINDOW_MODE_WINDOWED)
			DisplayServer.window_set_flag(DisplayServer.WINDOW_FLAG_BORDERLESS, false)
			var size := resolution_size()
			DisplayServer.window_set_size(size)
			var screen := DisplayServer.screen_get_size()
			DisplayServer.window_set_position((screen - size) / 2)

func resolution_size() -> Vector2i:
	var parts := str(get_setting("graphics", "resolution")).split("x")
	if parts.size() != 2:
		return Vector2i(1280, 720)
	return Vector2i(maxi(640, int(parts[0])), maxi(360, int(parts[1])))

## Levels build their WorldEnvironment in code, so the quality toggles that
## live on the Environment resource are pushed to whatever is currently mounted.
func apply_environment_settings() -> void:
	var tree := get_tree()
	if not tree:
		return
	for node in tree.get_nodes_in_group("world_environment"):
		if node is WorldEnvironment and node.environment:
			style_environment(node.environment)
	var shadows: int = int(get_setting("graphics", "shadows"))
	for node in tree.get_nodes_in_group("sun"):
		if node is DirectionalLight3D:
			node.shadow_enabled = shadows > 0

func style_environment(environment: Environment) -> void:
	environment.fog_enabled = bool(get_setting("graphics", "fog"))
	environment.glow_enabled = bool(get_setting("graphics", "glow"))
	environment.glow_intensity = 0.6
	environment.glow_bloom = 0.15
