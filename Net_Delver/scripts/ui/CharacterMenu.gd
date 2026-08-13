extends Control

# Loadout screen. Three panes side by side rather than tabs, because all three
# answer the same question mid-run ("what am I holding and can I survive the
# next room?") and a tab would hide half the answer.

var menus: Node

var _equipment: VBoxContainer
var _inventory: VBoxContainer
var _status: VBoxContainer
var _close_button: Button

func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP
	_build()

func _build() -> void:
	add_child(UIKit.scrim())

	var center := CenterContainer.new()
	center.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(center)

	var panel := UIKit.panel(Vector2(940, 0))
	center.add_child(panel)

	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 12)
	panel.add_child(column)
	column.add_child(UIKit.heading("DELVER LOADOUT", 30))
	column.add_child(UIKit.separator())

	var columns := HBoxContainer.new()
	columns.add_theme_constant_override("separation", 28)
	column.add_child(columns)
	_equipment = _pane(columns, "EQUIPMENT")
	_inventory = _pane(columns, "BACKPACK")
	_status = _pane(columns, "STATUS")

	column.add_child(UIKit.separator())
	_close_button = UIKit.button("BACK")
	_close_button.pressed.connect(func(): menus.close_top())
	column.add_child(_close_button)

func _pane(parent: Control, title: String) -> VBoxContainer:
	var wrapper := VBoxContainer.new()
	wrapper.custom_minimum_size = Vector2(288, 320)
	wrapper.add_theme_constant_override("separation", 6)
	wrapper.add_child(UIKit.heading(title, 18, UIKit.ACCENT_DIM))
	var content := VBoxContainer.new()
	content.add_theme_constant_override("separation", 6)
	content.size_flags_vertical = Control.SIZE_EXPAND_FILL
	wrapper.add_child(content)
	parent.add_child(wrapper)
	return content

func refresh() -> void:
	var player: Node = menus.player if menus else null
	if not is_instance_valid(player):
		return
	_fill_equipment(player)
	_fill_inventory(player)
	_fill_status(player)
	_close_button.grab_focus()

func _clear(box: VBoxContainer) -> void:
	for child in box.get_children():
		box.remove_child(child)
		child.queue_free()

func _fill_equipment(player: Node) -> void:
	_clear(_equipment)
	var weapon: Dictionary = player.WEAPONS[player.weapon_index]
	_equipment.add_child(UIKit.heading(str(weapon.name), 20, UIKit.TEXT))
	var traits: Array[String] = []
	if weapon.auto:
		traits.append("FULL AUTO")
	if weapon.chargeable:
		traits.append("CHARGEABLE")
	if int(weapon.spread) > 1:
		traits.append("%d PELLETS" % int(weapon.spread))
	_equipment.add_child(UIKit.body(" • ".join(traits) if traits else "SINGLE SHOT", UIKit.WARNING, 13))
	_equipment.add_child(UIKit.separator())
	_stat(_equipment, "DAMAGE", "%.0f" % float(weapon.damage))
	_stat(_equipment, "CYCLE", "%.2f s" % float(weapon.cooldown))
	_stat(_equipment, "STAMINA / SHOT", "%.0f" % float(weapon.stamina))
	_stat(_equipment, "MUZZLE SPEED", "%.0f m/s" % float(weapon.speed))
	_stat(_equipment, "EQUIP LOAD", "%d%%  %s" % [int(player.equip_load() * 100.0), player.weight_class()])
	_equipment.add_child(UIKit.separator())
	# The gear this Delver deployed with, slot by slot. Locked for the run —
	# respec happens at the uplink terminal between delves.
	for slot_id in ItemDatabase.SLOTS:
		if slot_id == "buster":
			continue
		var held := str(player.equipment.get(slot_id, ""))
		_stat(_equipment, slot_id.to_upper(),
			ItemDatabase.short_name(held) if not held.is_empty() else "—",
			ItemDatabase.color(held) if not held.is_empty() else UIKit.MUTED)
	var mod: Dictionary = player.active_weapon_mod()
	if not mod.is_empty():
		_equipment.add_child(UIKit.body("SYNERGY ACTIVE — gear is boosting this buster.", UIKit.ACCENT, 12))
	_equipment.add_child(UIKit.separator())
	_equipment.add_child(UIKit.body(
		"Charged shots cost more stamina and hit for up to 4.2x. Aiming tightens the pattern.",
		UIKit.MUTED, 13))

## The run backpack: consumables plus any components pulled from wrecks and
## chests. Everything can be DROPPED to the floor as a world pickup — that is
## how stock moves between party members mid-run.
func _fill_inventory(player: Node) -> void:
	_clear(_inventory)
	var stacks := 0
	var held: Array[String] = []
	for item_id in ItemDatabase.ORDER:
		if player.item_count(item_id) > 0:
			held.append(item_id)
	for item_id in player.inventory:
		if int(player.inventory[item_id]) > 0 and not held.has(str(item_id)):
			held.append(str(item_id))
	for item_id in held:
		if ItemDatabase.uses_backpack(item_id):
			stacks += 1
	_inventory.add_child(UIKit.body("%d/%d SLOTS USED" % [stacks, int(player.backpack_capacity)],
		UIKit.ACCENT_DIM, 12))

	for item_id in held:
		var count: int = player.item_count(item_id)
		var item: Dictionary = ItemDatabase.get_item(item_id)
		var line := HBoxContainer.new()
		line.add_theme_constant_override("separation", 8)
		var name_label := UIKit.body("%s  x%d" % [ItemDatabase.display_name(item_id), count],
			ItemDatabase.color(item_id), 15)
		name_label.autowrap_mode = TextServer.AUTOWRAP_OFF
		name_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		line.add_child(name_label)
		if not str(item.get("action", "")).is_empty():
			var use := UIKit.button("[%s] USE" % InputSettings.describe_binding(str(item.get("action", "")), "kb"))
			use.custom_minimum_size = Vector2(110, 30)
			use.pressed.connect(func(): _use(item_id))
			line.add_child(use)
		var drop := UIKit.button("DROP")
		drop.custom_minimum_size = Vector2(70, 30)
		drop.tooltip_text = "Drop one to the floor for a teammate to pick up."
		drop.pressed.connect(func(): _drop(item_id))
		line.add_child(drop)
		_inventory.add_child(line)
		_inventory.add_child(UIKit.body(str(item.get("description", "")), UIKit.MUTED, 12))
		_inventory.add_child(UIKit.separator())
	if held.is_empty():
		_inventory.add_child(UIKit.body("Backpack empty. Caches respawn across the sector.", UIKit.WARNING, 13))

func _use(item_id: String) -> void:
	var player: Node = menus.player if menus else null
	if is_instance_valid(player) and player.use_item(item_id):
		# The host answers with a fresh inventory a moment later; repaint on the
		# next frame so the count the player sees matches what was spent.
		await get_tree().create_timer(0.15).timeout
		if visible:
			refresh()

func _drop(item_id: String) -> void:
	var player: Node = menus.player if menus else null
	if is_instance_valid(player) and player.drop_item(item_id):
		await get_tree().create_timer(0.15).timeout
		if visible:
			refresh()

func _fill_status(player: Node) -> void:
	_clear(_status)
	_stat(_status, "INTEGRITY", "%d / %d" % [int(player.current_health), int(player.max_health)])
	_stat(_status, "STAMINA", "%d / %d" % [int(player.current_stamina), int(player.max_stamina)])
	var boost: float = player.stamina_boost
	_stat(_status, "OVERCLOCK", "%.1f s REMAINING" % boost if boost > 0.0 else "INACTIVE",
		UIKit.ACCENT if boost > 0.0 else UIKit.MUTED)
	_status.add_child(UIKit.separator())
	_stat(_status, "CARRIED THIS DELVE", UIKit.credits_text(int(player.run_credits)), UIKit.WARNING)
	_stat(_status, "BANKED", UIKit.credits_text(SaveManager.credits()), UIKit.ACCENT)
	_status.add_child(UIKit.body("Credits only bank on extraction. Going down scatters half of them.",
		UIKit.MUTED, 12))
	_status.add_child(UIKit.separator())
	_stat(_status, "CALLSIGN", SaveManager.callsign())
	_stat(_status, "DELVES EXTRACTED", str(SaveManager.profile.get("delves_completed", 0)))
	_stat(_status, "DELVES ABANDONED", str(SaveManager.profile.get("delves_forfeited", 0)))
	_stat(_status, "MAVERICKS PURGED", str(SaveManager.profile.get("mavericks_purged", 0)))
	_stat(_status, "BEST EXTRACTION", UIKit.credits_text(int(SaveManager.profile.get("best_run_credits", 0))))

func _stat(box: VBoxContainer, label: String, value: String, color := UIKit.TEXT) -> void:
	var line := HBoxContainer.new()
	var name_label := UIKit.body(label, UIKit.MUTED, 13)
	name_label.autowrap_mode = TextServer.AUTOWRAP_OFF
	name_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	line.add_child(name_label)
	var value_label := UIKit.body(value, color, 13)
	value_label.autowrap_mode = TextServer.AUTOWRAP_OFF
	line.add_child(value_label)
	box.add_child(line)
