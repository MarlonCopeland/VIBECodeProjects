extends Control

# The crafting bench. Every recipe in CraftingDatabase, listed with its
# component bill and salvage-part cost; anything affordable gets a live CRAFT
# button. Costs are painted per line — green when covered, red when short — so
# the answer to "what am I still missing" is readable without arithmetic.
#
# Crafted goods land in the stash, where the loadout screen equips them.

var standalone_close: Callable

var _rows: VBoxContainer
var _summary: Label
var _back_button: Button

func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP
	_build()
	SaveManager.stash_changed.connect(refresh, CONNECT_DEFERRED)

func _build() -> void:
	add_child(UIKit.scrim())

	var center := CenterContainer.new()
	center.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(center)

	var panel := UIKit.panel(Vector2(880, 0))
	center.add_child(panel)

	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 10)
	panel.add_child(column)
	column.add_child(UIKit.heading("CRAFTING BENCH", 28))
	_summary = UIKit.body("", UIKit.WARNING, 15)
	column.add_child(_summary)
	column.add_child(UIKit.separator())

	_rows = VBoxContainer.new()
	_rows.add_theme_constant_override("separation", 8)
	column.add_child(UIKit.scroll(_rows, Vector2(820, 430)))

	column.add_child(UIKit.separator())
	_back_button = UIKit.button("BACK")
	_back_button.pressed.connect(_close)
	column.add_child(_back_button)

func refresh() -> void:
	_summary.text = "%d SALVAGE PARTS AVAILABLE" % SaveManager.parts()
	for child in _rows.get_children():
		_rows.remove_child(child)
		child.queue_free()
	for item_id in CraftingDatabase.ordered_ids():
		_rows.add_child(_recipe_row(item_id))
		_rows.add_child(UIKit.separator())
	_back_button.grab_focus()

func _recipe_row(item_id: String) -> Control:
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 16)

	var info := VBoxContainer.new()
	info.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	info.add_theme_constant_override("separation", 2)
	row.add_child(info)

	var owned := SaveManager.stash_count(item_id)
	var title_text := ItemDatabase.display_name(item_id)
	if owned > 0:
		title_text += "   (x%d OWNED)" % owned
	info.add_child(UIKit.body(title_text, ItemDatabase.color(item_id), 16))
	var summary := ItemDatabase.stat_summary(item_id)
	info.add_child(UIKit.body(
		summary if not summary.is_empty() else str(ItemDatabase.get_item(item_id).get("description", "")),
		UIKit.MUTED, 12))

	# The bill of materials, one chip per component, coloured by affordability.
	var bill := HBoxContainer.new()
	bill.add_theme_constant_override("separation", 12)
	info.add_child(bill)
	var needed := CraftingDatabase.components(item_id)
	for component_id in needed:
		var have := SaveManager.stash_count(str(component_id))
		var want := int(needed[component_id])
		var chip := UIKit.body("%s %d/%d" % [ItemDatabase.short_name(str(component_id)), have, want],
			UIKit.ACCENT if have >= want else UIKit.DANGER, 13)
		chip.autowrap_mode = TextServer.AUTOWRAP_OFF
		chip.tooltip_text = ItemDatabase.display_name(str(component_id))
		bill.add_child(chip)
	var parts_needed := CraftingDatabase.parts_cost(item_id)
	if parts_needed > 0:
		var chip := UIKit.body("PARTS %d/%d" % [SaveManager.parts(), parts_needed],
			UIKit.ACCENT if SaveManager.parts() >= parts_needed else UIKit.DANGER, 13)
		chip.autowrap_mode = TextServer.AUTOWRAP_OFF
		bill.add_child(chip)

	var craft := UIKit.button("CRAFT")
	craft.custom_minimum_size = Vector2(120, 40)
	craft.disabled = not SaveManager.can_craft(item_id)
	craft.pressed.connect(func():
		if SaveManager.craft(item_id):
			SynthAudio.play("pickup", 1.4, -10.0))
	row.add_child(craft)
	return row

func _close() -> void:
	if standalone_close.is_valid():
		standalone_close.call()
