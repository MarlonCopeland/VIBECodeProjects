extends CanvasLayer

var player: Node
var health_bar: ProgressBar
var stamina_bar: ProgressBar
var charge_bar: ProgressBar
var weapon_label: Label
var objective_label: Label
var prompt_label: Label
var result_panel: PanelContainer
var result_credits: Label
var reticle: Label
var boss_box: VBoxContainer
var boss_bar: ProgressBar
var boss_label: Label
var credits_label: Label
var buff_label: Label
var sector_label: Label
var item_labels: Dictionary = {}
var vignette: ColorRect

## Binding names only change on a rebind, so they are formatted once instead of
## rebuilt three times per frame.
var _item_prefix: Dictionary = {}

func setup(owner_player: Node) -> void:
	player = owner_player
	_build()
	_refresh_item_prefixes()
	InputSettings.bindings_changed.connect(_refresh_item_prefixes)

func _refresh_item_prefixes() -> void:
	for item_id in ItemDatabase.ORDER:
		_item_prefix[item_id] = "%s  %s" % [
			InputSettings.describe_binding(ItemDatabase.action_for(item_id), "kb"),
			ItemDatabase.short_name(item_id)]

func _process(_delta: float) -> void:
	if not is_instance_valid(player):
		return
	health_bar.value = player.current_health
	stamina_bar.value = player.current_stamina
	weapon_label.text = "%s\nLOAD %d%% // %s" % [player.weapon_name(), int(player.equip_load() * 100.0), player.weight_class()]
	var dungeon := get_tree().get_first_node_in_group("dungeon")
	if dungeon and dungeon.has_method("objective_text"):
		objective_label.text = dungeon.objective_text()
	if dungeon and dungeon.has_method("section_label"):
		# Sectors are generated now, so the header has to say where you actually
		# are rather than naming one hand-built room.
		sector_label.text = "%s\n%s" % [dungeon.sector_name(), dungeon.section_label(player.global_position)]
	prompt_label.text = player.interaction_prompt
	var carried := "◈ %s CARRIED" % UIKit.credits_text(int(player.run_credits))
	if int(player.run_parts) > 0:
		carried += "   ⚙ %d PARTS" % int(player.run_parts)
	credits_label.text = carried

	# Stamina reads as a different colour while the Overclock Cell is running,
	# because the bar itself stops moving and would otherwise look broken.
	var boosted: bool = player.stamina_boosted()
	buff_label.visible = boosted
	if boosted:
		buff_label.text = "OVERCLOCK  %.1fs" % player.stamina_boost
	_style_bar(stamina_bar, Color("6fd6ff") if boosted else Color("4de18b"))

	for item_id in ItemDatabase.ORDER:
		var label: Label = item_labels[item_id]
		var count: int = player.item_count(item_id)
		label.text = "%s  x%d" % [_item_prefix[item_id], count]
		label.add_theme_color_override("font_color",
			ItemDatabase.color(item_id) if count > 0 else Color("4a5d68"))

	# Charge meter: only visible while actually charging, and it recolours as
	# it crosses each tier so the payoff is readable without looking away.
	var charge: float = player.charge
	var level: int = player.charge_level()
	charge_bar.visible = charge > 0.01
	charge_bar.value = charge * 100.0
	if charge_bar.visible:
		_style_bar(charge_bar, [Color("6fd6ff"), Color("ffd34d"), Color("ff7bf1")][level])

	_update_reticle(level)

	var boss_alive := false
	if dungeon and dungeon.get("boss_active") == true:
		var boss = dungeon.get("boss")
		if is_instance_valid(boss):
			boss_alive = true
			boss_bar.value = boss.health_ratio() * 100.0
			boss_label.text = "SENTINEL PRIME // PHASE %d" % boss.phase
	boss_box.visible = boss_alive

	# A dark frame closes in as the camera tightens, selling the ADS zoom the
	# way a scope shroud would.
	vignette.modulate.a = player.aim_blend * 0.55

## The reticle collapses to a precision dot while aiming and blooms with charge.
func _update_reticle(level: int) -> void:
	var aiming: bool = player.aim_blend > 0.5
	if aiming and level == 0:
		reticle.text = "•"
	else:
		reticle.text = ["+", "◈", "✦"][level]
	var color: Color = [Color("ffffff"), Color("ffd34d"), Color("ff7bf1")][level]
	if aiming and level == 0:
		color = Color("7fffd4")
	reticle.add_theme_color_override("font_color", color)

func show_results(banked_credits := 0, deposit := {}) -> void:
	var lines: Array[String] = ["%s BANKED  •  BALANCE %s" % [
		UIKit.credits_text(banked_credits), UIKit.credits_text(SaveManager.credits())]]
	var items: Dictionary = deposit.get("items", {})
	if items.is_empty():
		lines.append("Nothing left in the pack.")
	else:
		var carried: Array[String] = []
		for item_id in items:
			carried.append("%s x%d" % [ItemDatabase.short_name(str(item_id)), int(items[item_id])])
		lines.append("TO STASH: %s" % ", ".join(carried))
	var parts := int(deposit.get("parts", 0))
	if parts > 0:
		lines.append("SALVAGE: %d PARTS  (total %d)" % [parts, SaveManager.parts()])
	result_credits.text = "\n".join(lines)
	result_panel.visible = true
	result_panel.get_node("Margin/VBox/Return").grab_focus()

## Fills are cached per colour: this runs every frame for three bars, and a
## fresh StyleBoxFlat each time would churn allocations for nothing.
var _fill_cache: Dictionary = {}

func _style_bar(bar: ProgressBar, color: Color) -> void:
	if not _fill_cache.has(color):
		var fill := StyleBoxFlat.new()
		fill.bg_color = color
		_fill_cache[color] = fill
	if bar.get_theme_stylebox("fill") != _fill_cache[color]:
		bar.add_theme_stylebox_override("fill", _fill_cache[color])

func _build() -> void:
	# Sits under the menus (layer 20) so a pause screen covers the HUD.
	layer = 5
	vignette = ColorRect.new()
	vignette.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	vignette.color = Color(0, 0, 0, 0)
	vignette.modulate.a = 0.0
	vignette.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var shade := Gradient.new()
	shade.set_color(0, Color(0, 0, 0, 0))
	shade.set_color(1, Color(0, 0, 0, 1))
	var texture := GradientTexture2D.new()
	texture.gradient = shade
	texture.fill = GradientTexture2D.FILL_RADIAL
	texture.fill_from = Vector2(0.5, 0.5)
	texture.fill_to = Vector2(1.0, 0.5)
	texture.width = 256
	texture.height = 256
	var frame := TextureRect.new()
	frame.texture = texture
	frame.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	frame.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	frame.stretch_mode = TextureRect.STRETCH_SCALE
	frame.mouse_filter = Control.MOUSE_FILTER_IGNORE
	vignette.add_child(frame)
	add_child(vignette)

	var margin := MarginContainer.new()
	margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	margin.add_theme_constant_override("margin_left", 28)
	margin.add_theme_constant_override("margin_top", 24)
	margin.add_theme_constant_override("margin_right", 28)
	margin.add_theme_constant_override("margin_bottom", 24)
	add_child(margin)
	var root := Control.new()
	margin.add_child(root)
	var stats := VBoxContainer.new()
	stats.custom_minimum_size = Vector2(300, 0)
	root.add_child(stats)
	sector_label = Label.new()
	sector_label.text = "SECTOR"
	sector_label.add_theme_color_override("font_color", Color("55efb5"))
	stats.add_child(sector_label)
	health_bar = _bar(Color("e25555"), 100.0)
	stats.add_child(health_bar)
	stamina_bar = _bar(Color("4de18b"), 100.0)
	stats.add_child(stamina_bar)
	charge_bar = _bar(Color("6fd6ff"), 100.0)
	charge_bar.custom_minimum_size = Vector2(300, 8)
	charge_bar.visible = false
	stats.add_child(charge_bar)
	buff_label = Label.new()
	buff_label.visible = false
	buff_label.add_theme_font_size_override("font_size", 15)
	buff_label.add_theme_color_override("font_color", Color("6fd6ff"))
	stats.add_child(buff_label)
	weapon_label = Label.new()
	weapon_label.add_theme_font_size_override("font_size", 18)
	stats.add_child(weapon_label)
	credits_label = Label.new()
	credits_label.add_theme_font_size_override("font_size", 16)
	credits_label.add_theme_color_override("font_color", Color("f2c66d"))
	stats.add_child(credits_label)

	objective_label = Label.new()
	objective_label.position = Vector2(0, 178)
	objective_label.add_theme_color_override("font_color", Color("f2c66d"))
	root.add_child(objective_label)

	# Item strip, bottom right: binding, name, and stock for each consumable.
	var items := VBoxContainer.new()
	items.set_anchors_preset(Control.PRESET_BOTTOM_RIGHT)
	items.position = Vector2(-250, -96)
	items.custom_minimum_size = Vector2(250, 0)
	items.alignment = BoxContainer.ALIGNMENT_END
	root.add_child(items)
	for item_id in ItemDatabase.ORDER:
		var label := Label.new()
		label.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
		label.add_theme_font_size_override("font_size", 15)
		items.add_child(label)
		item_labels[item_id] = label

	prompt_label = Label.new()
	prompt_label.set_anchors_preset(Control.PRESET_CENTER_BOTTOM)
	prompt_label.position = Vector2(-190, -80)
	prompt_label.size = Vector2(380, 42)
	prompt_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	prompt_label.add_theme_font_size_override("font_size", 18)
	prompt_label.add_theme_color_override("font_color", Color("7fffd4"))
	root.add_child(prompt_label)
	reticle = Label.new()
	reticle.text = "+"
	reticle.set_anchors_preset(Control.PRESET_CENTER)
	reticle.position = Vector2(-8, -15)
	reticle.add_theme_font_size_override("font_size", 26)
	root.add_child(reticle)

	# Boss bar, hidden until Sentinel Prime wakes.
	boss_box = VBoxContainer.new()
	boss_box.visible = false
	boss_box.set_anchors_preset(Control.PRESET_CENTER_TOP)
	boss_box.position = Vector2(-260, 8)
	boss_box.custom_minimum_size = Vector2(520, 0)
	root.add_child(boss_box)
	boss_label = Label.new()
	boss_label.text = "SENTINEL PRIME"
	boss_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	boss_label.add_theme_font_size_override("font_size", 20)
	boss_label.add_theme_color_override("font_color", Color("ff6a5d"))
	boss_box.add_child(boss_label)
	boss_bar = _bar(Color("ff3b30"), 100.0)
	boss_bar.custom_minimum_size = Vector2(520, 18)
	boss_box.add_child(boss_bar)
	result_panel = PanelContainer.new()
	result_panel.visible = false
	result_panel.set_anchors_preset(Control.PRESET_CENTER)
	result_panel.position = Vector2(-230, -150)
	result_panel.size = Vector2(460, 300)
	root.add_child(result_panel)
	var result_margin := MarginContainer.new()
	result_margin.name = "Margin"
	result_margin.add_theme_constant_override("margin_left", 32)
	result_margin.add_theme_constant_override("margin_top", 28)
	result_margin.add_theme_constant_override("margin_right", 32)
	result_margin.add_theme_constant_override("margin_bottom", 28)
	result_panel.add_child(result_margin)
	var box := VBoxContainer.new()
	box.name = "VBox"
	result_margin.add_child(box)
	var title := Label.new()
	title.text = "SECTOR PURGED"
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	title.add_theme_font_size_override("font_size", 30)
	title.add_theme_color_override("font_color", Color("55efb5"))
	box.add_child(title)
	var copy := Label.new()
	copy.text = "Maverick signatures eliminated.\nThe backbone terminal is secure."
	copy.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	box.add_child(copy)
	result_credits = Label.new()
	result_credits.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	result_credits.add_theme_font_size_override("font_size", 17)
	result_credits.add_theme_color_override("font_color", Color("f2c66d"))
	box.add_child(result_credits)
	var button := Button.new()
	button.name = "Return"
	button.text = "RETURN TO LOBBY"
	button.pressed.connect(GameManager.return_to_lobby)
	box.add_child(button)

	_make_passive(self)

## The HUD is a readout, not a surface you click.
##
## Control defaults to MOUSE_FILTER_STOP, and a Control that stops mouse events
## consumes InputEventMouseMotion before it can reach the player's
## _unhandled_input — which kills mouse look outright, with no error anywhere to
## explain it. The full-rect root Control alone was enough to do it.
##
## Rather than getting the filter right on a dozen nodes and hoping the next
## widget added here remembers, everything is forced passive after the build.
## The results panel is the one exception: it owns a button.
func _make_passive(node: Node) -> void:
	for child in node.get_children():
		if child == result_panel:
			continue
		if child is Control:
			child.mouse_filter = Control.MOUSE_FILTER_IGNORE
		_make_passive(child)

func _bar(color: Color, maximum: float) -> ProgressBar:
	var bar := ProgressBar.new()
	bar.max_value = maximum
	bar.value = maximum
	bar.custom_minimum_size = Vector2(300, 13)
	bar.show_percentage = false
	_style_bar(bar, color)
	var background := StyleBoxFlat.new()
	background.bg_color = Color("162832")
	bar.add_theme_stylebox_override("background", background)
	return bar
