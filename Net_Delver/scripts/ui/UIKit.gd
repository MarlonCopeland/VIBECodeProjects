class_name UIKit
extends RefCounted

# Shared look for every runtime-built screen. The project has no theme
# resources on purpose (nothing binary, nothing licensed), so the terminal
# styling lives here instead of being retyped in each menu.

const ACCENT := Color("55efb5")
const ACCENT_DIM := Color("2f8f6b")
const WARNING := Color("f2c66d")
const DANGER := Color("ef5d69")
const TEXT := Color("d5e6ee")
const MUTED := Color("78909c")
const PANEL := Color(0.031, 0.075, 0.106, 0.96)
const PANEL_EDGE := Color("1d3b47")
const SCRIM := Color(0.004, 0.016, 0.027, 0.72)

static func panel_style() -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = PANEL
	style.border_color = PANEL_EDGE
	style.set_border_width_all(2)
	style.set_corner_radius_all(4)
	style.set_content_margin_all(22)
	return style

static func panel(minimum: Vector2 = Vector2.ZERO) -> PanelContainer:
	var container := PanelContainer.new()
	container.add_theme_stylebox_override("panel", panel_style())
	container.custom_minimum_size = minimum
	return container

static func heading(text: String, size := 30, color := ACCENT) -> Label:
	var label := Label.new()
	label.text = text
	label.add_theme_font_size_override("font_size", size)
	label.add_theme_color_override("font_color", color)
	return label

static func body(text: String, color := TEXT, size := 15) -> Label:
	var label := Label.new()
	label.text = text
	label.add_theme_font_size_override("font_size", size)
	label.add_theme_color_override("font_color", color)
	label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	return label

## Buttons carry their own hover/focus styling and a UI blip, so controller
## focus navigation is as legible as the mouse path.
static func button(text: String, danger := false) -> Button:
	var control := Button.new()
	control.text = text
	control.custom_minimum_size.y = 42
	control.focus_mode = Control.FOCUS_ALL
	var tint := DANGER if danger else ACCENT
	control.add_theme_color_override("font_color", TEXT)
	control.add_theme_color_override("font_hover_color", tint)
	control.add_theme_color_override("font_focus_color", tint)
	control.add_theme_stylebox_override("normal", _button_style(Color(0.06, 0.12, 0.16, 0.9), PANEL_EDGE))
	control.add_theme_stylebox_override("hover", _button_style(Color(0.09, 0.19, 0.24, 0.95), tint))
	control.add_theme_stylebox_override("focus", _button_style(Color(0.09, 0.19, 0.24, 0.95), tint))
	control.add_theme_stylebox_override("pressed", _button_style(Color(0.13, 0.26, 0.31, 1.0), tint))
	control.add_theme_stylebox_override("disabled", _button_style(Color(0.05, 0.08, 0.1, 0.7), Color("22303a")))
	control.focus_entered.connect(func(): SynthAudio.play("ui_move", 1.0, -24.0))
	control.pressed.connect(func(): SynthAudio.play("ui_press", 1.0, -18.0))
	return control

static func _button_style(background: Color, border: Color) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = background
	style.border_color = border
	style.set_border_width_all(1)
	style.set_corner_radius_all(3)
	style.content_margin_left = 14
	style.content_margin_right = 14
	style.content_margin_top = 8
	style.content_margin_bottom = 8
	return style

## A label/value row, returned as an HBox so callers can keep the value node.
static func row(label_text: String, value_node: Control, label_width := 230) -> HBoxContainer:
	var line := HBoxContainer.new()
	line.add_theme_constant_override("separation", 14)
	var label := body(label_text, MUTED)
	label.custom_minimum_size.x = label_width
	label.autowrap_mode = TextServer.AUTOWRAP_OFF
	line.add_child(label)
	value_node.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	line.add_child(value_node)
	return line

static func option(values: Array, selected: int) -> OptionButton:
	var picker := OptionButton.new()
	for value in values:
		picker.add_item(str(value))
	picker.selected = clampi(selected, 0, maxi(0, values.size() - 1))
	picker.custom_minimum_size = Vector2(200, 34)
	picker.item_selected.connect(func(_index): SynthAudio.play("ui_press", 1.2, -22.0))
	return picker

static func slider(value: float, minimum := 0.0, maximum := 1.0, step := 0.05) -> HSlider:
	var control := HSlider.new()
	control.min_value = minimum
	control.max_value = maximum
	control.step = step
	control.value = value
	control.custom_minimum_size = Vector2(220, 24)
	return control

static func check(pressed: bool, text := "") -> CheckButton:
	var control := CheckButton.new()
	control.button_pressed = pressed
	control.text = text
	control.toggled.connect(func(_on): SynthAudio.play("ui_press", 1.1, -22.0))
	return control

static func separator() -> HSeparator:
	var line := HSeparator.new()
	var style := StyleBoxFlat.new()
	style.bg_color = PANEL_EDGE
	style.content_margin_top = 1
	line.add_theme_stylebox_override("separator", style)
	return line

static func scrim() -> ColorRect:
	var rect := ColorRect.new()
	rect.color = SCRIM
	rect.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	rect.mouse_filter = Control.MOUSE_FILTER_STOP
	return rect

static func scroll(content: Control, minimum: Vector2) -> ScrollContainer:
	var container := ScrollContainer.new()
	container.custom_minimum_size = minimum
	container.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	content.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	container.add_child(content)
	return container

## Thousands separators, because a banked balance climbs into five digits and
## "18450 CR" is hard to read at a glance.
static func credits_text(amount: int) -> String:
	var digits := str(absi(amount))
	var grouped := ""
	for index in digits.length():
		if index > 0 and (digits.length() - index) % 3 == 0:
			grouped += ","
		grouped += digits[index]
	return "%s%s CR" % ["-" if amount < 0 else "", grouped]
