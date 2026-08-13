extends Control

# Between-runs storage, loadout, and the door to the crafting bench.
#
# Two panes, ARC-style (docs/concepts/arc_raiders_inventory.png): the STASH
# grid on the left holds everything owned — weapons, gear, components,
# consumables — and the LOADOUT pane on the right is the Delver being specced:
# five gear slots (HEAD / ARMS / BODY / LEGS / BUSTER) and a backpack of six
# slots (more with a Cargo Harness) for the consumables carried into the run.
#
# Interaction is one-click: click a stash tile to equip gear into its slot or
# load a consumable into the backpack; click a gear slot to send it back to the
# stash; click a backpack stack to unload one. Components do not deploy — they
# exist to be spent at the bench, which opens from the CRAFTING button.

const CRAFTING_MENU := preload("res://scripts/ui/CraftingMenu.gd")

const STASH_COLUMNS := 5

var standalone_close: Callable

var _stash_grid: GridContainer
var _stash_label: Label
var _expand_button: Button
var _summary: Label
var _slot_rows: VBoxContainer
var _backpack_grid: GridContainer
var _backpack_label: Label
var _stats_label: Label
var _kit_summary: Label
var _hint: Label
var _back_button: Button
var _crafting_screen: Control

func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP
	_build()
	# Deferred: a click changes the stash, which rebuilds these tiles — and
	# rebuilding them frees the very button whose signal is still on the stack.
	SaveManager.stash_changed.connect(refresh, CONNECT_DEFERRED)

func _build() -> void:
	add_child(UIKit.scrim())

	var center := CenterContainer.new()
	center.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(center)

	var panel := UIKit.panel(Vector2(1150, 0))
	center.add_child(panel)

	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 8)
	panel.add_child(column)

	var header := HBoxContainer.new()
	header.add_theme_constant_override("separation", 20)
	column.add_child(header)
	var title := UIKit.heading("STASH & LOADOUT", 28)
	title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	header.add_child(title)
	_summary = UIKit.body("", UIKit.WARNING, 15)
	_summary.autowrap_mode = TextServer.AUTOWRAP_OFF
	header.add_child(_summary)
	column.add_child(UIKit.separator())

	var panes := HBoxContainer.new()
	panes.add_theme_constant_override("separation", 26)
	column.add_child(panes)

	# ---- left: the stash grid -------------------------------------------
	var stash_pane := VBoxContainer.new()
	stash_pane.custom_minimum_size = Vector2(560, 430)
	stash_pane.add_theme_constant_override("separation", 6)
	panes.add_child(stash_pane)
	var stash_header := HBoxContainer.new()
	stash_header.add_theme_constant_override("separation", 12)
	stash_pane.add_child(stash_header)
	_stash_label = UIKit.heading("STASH", 18, UIKit.ACCENT_DIM)
	_stash_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	stash_header.add_child(_stash_label)
	_expand_button = UIKit.button("EXPAND")
	_expand_button.custom_minimum_size = Vector2(190, 32)
	_expand_button.pressed.connect(_expand)
	stash_header.add_child(_expand_button)

	_stash_grid = GridContainer.new()
	_stash_grid.columns = STASH_COLUMNS
	_stash_grid.add_theme_constant_override("h_separation", 6)
	_stash_grid.add_theme_constant_override("v_separation", 6)
	stash_pane.add_child(UIKit.scroll(_stash_grid, Vector2(560, 360)))
	_hint = UIKit.body("", UIKit.MUTED, 12)
	stash_pane.add_child(_hint)

	# ---- right: the Delver being specced --------------------------------
	var loadout_pane := VBoxContainer.new()
	loadout_pane.custom_minimum_size = Vector2(470, 430)
	loadout_pane.add_theme_constant_override("separation", 6)
	panes.add_child(loadout_pane)
	loadout_pane.add_child(UIKit.heading("LOADOUT", 18, UIKit.ACCENT_DIM))
	_slot_rows = VBoxContainer.new()
	_slot_rows.add_theme_constant_override("separation", 4)
	loadout_pane.add_child(_slot_rows)
	_backpack_label = UIKit.heading("BACKPACK", 15, UIKit.ACCENT_DIM)
	loadout_pane.add_child(_backpack_label)
	_backpack_grid = GridContainer.new()
	_backpack_grid.columns = 3
	_backpack_grid.add_theme_constant_override("h_separation", 6)
	_backpack_grid.add_theme_constant_override("v_separation", 6)
	loadout_pane.add_child(_backpack_grid)
	_stats_label = UIKit.body("", UIKit.ACCENT, 13)
	loadout_pane.add_child(_stats_label)

	column.add_child(UIKit.separator())
	_kit_summary = UIKit.body("", UIKit.MUTED, 13)
	column.add_child(_kit_summary)

	var buttons := HBoxContainer.new()
	buttons.add_theme_constant_override("separation", 10)
	column.add_child(buttons)
	var craft_button := UIKit.button("CRAFTING BENCH")
	craft_button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	craft_button.pressed.connect(_open_crafting)
	buttons.add_child(craft_button)
	_back_button = UIKit.button("BACK")
	_back_button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_back_button.pressed.connect(_close)
	buttons.add_child(_back_button)

func refresh() -> void:
	_summary.text = "%s BANKED   •   %d SALVAGE PARTS" % [
		UIKit.credits_text(SaveManager.credits()), SaveManager.parts()]
	_fill_stash()
	_fill_slots()
	_fill_backpack()
	_fill_stats()
	_fill_kit_summary()
	if not is_instance_valid(_crafting_screen):
		_back_button.grab_focus()

# ------------------------------------------------------------------ stash grid

func _clear(container: Container) -> void:
	for child in container.get_children():
		container.remove_child(child)
		child.queue_free()

## Stash ordering groups by purpose: weapons, gear, components, consumables —
## the same top-to-bottom order a player actually thinks in when kitting up.
func _stash_order() -> Array[String]:
	var ids: Array[String] = []
	for group in [ItemDatabase.WEAPON_ORDER, ItemDatabase.EQUIPMENT_ORDER,
			ItemDatabase.COMPONENT_ORDER, ItemDatabase.ORDER]:
		for item_id in group:
			if SaveManager.stash_count(item_id) > 0:
				ids.append(item_id)
	# Anything unknown to the ordering (future items) still shows up at the end.
	for item_id in SaveManager.stash():
		if SaveManager.stash_count(str(item_id)) > 0 and not ids.has(str(item_id)):
			ids.append(str(item_id))
	return ids

func _fill_stash() -> void:
	_clear(_stash_grid)
	var ids := _stash_order()
	for item_id in ids:
		_stash_grid.add_child(_stash_tile(item_id))
	if ids.is_empty():
		var empty := UIKit.body("Stash empty. Extract with loot, or craft at the bench.", UIKit.MUTED, 13)
		_stash_grid.add_child(empty)

	var used := SaveManager.stash_used()
	var slots := SaveManager.stash_slots()
	_stash_label.text = "STASH   %d/%d" % [used, slots]
	_stash_label.add_theme_color_override("font_color",
		UIKit.DANGER if used >= slots else UIKit.ACCENT_DIM)
	var cost := SaveManager.stash_expansion_cost()
	if cost <= 0:
		_expand_button.text = "MAX CAPACITY"
		_expand_button.disabled = true
	else:
		_expand_button.text = "EXPAND +%d   %s" % [SaveManager.STASH_SLOT_STEP, UIKit.credits_text(cost)]
		_expand_button.disabled = SaveManager.credits() < cost

	if used >= slots:
		_hint.text = "Stash is FULL — loot you extract with will be left behind. Expand it, or spend what you are holding at the bench."
	else:
		_hint.text = "Click gear to equip it  •  click a consumable to load it into the backpack  •  components are spent at the bench."

func _expand() -> void:
	var cost := SaveManager.stash_expansion_cost()
	if SaveManager.expand_stash():
		SynthAudio.play("pickup", 1.2, -10.0)
	else:
		_hint.text = "Not enough credits — %s needed for the next %d slots." % [
			UIKit.credits_text(cost), SaveManager.STASH_SLOT_STEP]

func _stash_tile(item_id: String) -> Button:
	var count := SaveManager.stash_count(item_id)
	var tile := UIKit.button("%s\nx%d" % [ItemDatabase.short_name(item_id), count])
	tile.custom_minimum_size = Vector2(104, 58)
	tile.add_theme_font_size_override("font_size", 13)
	tile.add_theme_color_override("font_color", ItemDatabase.color(item_id))
	tile.tooltip_text = _tooltip(item_id)
	tile.pressed.connect(func(): _stash_clicked(item_id))
	return tile

func _tooltip(item_id: String) -> String:
	var lines: Array[String] = [ItemDatabase.display_name(item_id)]
	var summary := ItemDatabase.stat_summary(item_id)
	if not summary.is_empty():
		lines.append(summary)
	lines.append(str(ItemDatabase.get_item(item_id).get("description", "")))
	return "\n".join(lines)

func _stash_clicked(item_id: String) -> void:
	if ItemDatabase.is_gear(item_id):
		if not SaveManager.equip(item_id):
			_hint.text = "No stash slot free to store the gear coming off. Expand the stash or spend something first."
	elif ItemDatabase.uses_backpack(item_id) and ItemDatabase.kind(item_id) != "component":
		SaveManager.set_deploy_count(item_id,
			int(SaveManager.deploy_kit().get(item_id, 0)) + 1)
	else:
		_hint.text = "%s is a crafting material — spend it at the bench." % ItemDatabase.display_name(item_id)

# --------------------------------------------------------------- gear + pack

func _fill_slots() -> void:
	_clear(_slot_rows)
	var loadout := SaveManager.equipment()
	for slot_id in ItemDatabase.SLOTS:
		var row := HBoxContainer.new()
		row.add_theme_constant_override("separation", 10)
		var label := UIKit.body(slot_id.to_upper(), UIKit.MUTED, 14)
		label.autowrap_mode = TextServer.AUTOWRAP_OFF
		label.custom_minimum_size.x = 86
		row.add_child(label)
		var held := str(loadout.get(slot_id, ""))
		var slot_button: Button
		if held.is_empty():
			slot_button = UIKit.button("— EMPTY —")
			slot_button.add_theme_color_override("font_color", UIKit.MUTED)
			slot_button.disabled = true
		else:
			slot_button = UIKit.button(ItemDatabase.display_name(held))
			slot_button.add_theme_color_override("font_color", ItemDatabase.color(held))
			slot_button.tooltip_text = _tooltip(held) + "\n(click to unequip)"
			slot_button.pressed.connect(func():
				if not SaveManager.unequip(slot_id):
					_hint.text = "Stash is full — nowhere to put %s. Expand it first." % ItemDatabase.display_name(held))
			if slot_id == "buster" and held == ItemDatabase.BUSTER_STANDARD:
				slot_button.tooltip_text = _tooltip(held)
		slot_button.custom_minimum_size = Vector2(0, 36)
		slot_button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		row.add_child(slot_button)
		_slot_rows.add_child(row)

func _fill_backpack() -> void:
	_clear(_backpack_grid)
	var kit := SaveManager.deploy_kit()
	var capacity := SaveManager.backpack_capacity()
	_backpack_label.text = "BACKPACK   %d/%d SLOTS" % [kit.size(), capacity]
	for item_id in kit:
		var stack := UIKit.button("%s\nx%d" % [ItemDatabase.short_name(str(item_id)), int(kit[item_id])])
		stack.custom_minimum_size = Vector2(140, 52)
		stack.add_theme_font_size_override("font_size", 13)
		stack.add_theme_color_override("font_color", ItemDatabase.color(str(item_id)))
		stack.tooltip_text = _tooltip(str(item_id)) + "\n(click to unload one)"
		var id := str(item_id)
		stack.pressed.connect(func():
			SaveManager.set_deploy_count(id, int(SaveManager.deploy_kit().get(id, 0)) - 1))
		_backpack_grid.add_child(stack)
	for index in range(kit.size(), capacity):
		var empty := UIKit.button("")
		empty.custom_minimum_size = Vector2(140, 52)
		empty.disabled = true
		_backpack_grid.add_child(empty)

func _fill_stats() -> void:
	var stats := SaveManager.equipment_stats()
	var parts: Array[String] = []
	parts.append("HP %d" % int(PlayerControllerStats.BASE_HEALTH + float(stats.get("health", 0.0))))
	parts.append("STAMINA %d" % int(PlayerControllerStats.BASE_STAMINA + float(stats.get("stamina", 0.0))))
	if absf(float(stats.get("speed", 0.0))) > 0.001:
		parts.append("SPEED %+d%%" % int(round(float(stats["speed"]) * 100.0)))
	if absf(float(stats.get("jump", 0.0))) > 0.001:
		parts.append("JUMP %+d%%" % int(round(float(stats["jump"]) * 100.0)))
	if absf(float(stats.get("regen", 0.0))) > 0.001:
		parts.append("REGEN %+d%%" % int(round(float(stats["regen"]) * 100.0)))
	_stats_label.text = "DELVER  //  " + "   ".join(parts)

func _fill_kit_summary() -> void:
	var kit := SaveManager.deploy_kit()
	if kit.is_empty():
		_kit_summary.text = "Backpack empty — deploying with the free starter kit. Loading stash stock risks it: anything you do not extract with is lost."
	else:
		var parts: Array[String] = []
		for item_id in kit:
			parts.append("%s x%d" % [ItemDatabase.short_name(str(item_id)), int(kit[item_id])])
		_kit_summary.text = "Deploying with %s. These leave the stash when you deploy." % ", ".join(parts)

# ------------------------------------------------------------------- crafting

func _open_crafting() -> void:
	if is_instance_valid(_crafting_screen):
		return
	_crafting_screen = CRAFTING_MENU.new()
	_crafting_screen.standalone_close = _close_crafting
	add_child(_crafting_screen)
	_crafting_screen.refresh()

func _close_crafting() -> void:
	if is_instance_valid(_crafting_screen):
		_crafting_screen.queue_free()
	_crafting_screen = null
	refresh()

func _close() -> void:
	if standalone_close.is_valid():
		standalone_close.call()


## Tiny indirection so this screen can quote base stats without preloading the
## whole player controller script.
class PlayerControllerStats:
	const BASE_HEALTH := 100.0
	const BASE_STAMINA := 100.0
