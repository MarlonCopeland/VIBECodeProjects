extends Control

# In-run pause screen: resume, loadout, settings, and the two ways out of a
# session. Forfeiting and exiting both destroy unbanked credits, so both go
# through an inline confirmation rather than firing on a single press.

var menus: Node

var _credits_label: Label
var _confirm_box: VBoxContainer
var _confirm_label: Label
var _menu_box: VBoxContainer
var _pending := ""
var _resume_button: Button

func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP
	_build()

func _build() -> void:
	add_child(UIKit.scrim())

	var center := CenterContainer.new()
	center.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(center)

	var panel := UIKit.panel(Vector2(420, 0))
	center.add_child(panel)

	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 10)
	panel.add_child(column)

	column.add_child(UIKit.heading("SESSION PAUSED", 30))
	column.add_child(UIKit.body("Uplink held. The sector is still live.", UIKit.MUTED))
	_credits_label = UIKit.body("", UIKit.WARNING, 17)
	column.add_child(_credits_label)
	column.add_child(UIKit.separator())

	_menu_box = VBoxContainer.new()
	_menu_box.add_theme_constant_override("separation", 8)
	column.add_child(_menu_box)

	_resume_button = UIKit.button("RESUME DELVE")
	_resume_button.pressed.connect(func(): menus.close_top())
	_menu_box.add_child(_resume_button)

	var loadout := UIKit.button("LOADOUT & STATUS")
	loadout.pressed.connect(func(): menus.open_character())
	_menu_box.add_child(loadout)

	var settings := UIKit.button("SETTINGS")
	settings.pressed.connect(func(): menus.open_settings())
	_menu_box.add_child(settings)

	var forfeit := UIKit.button("FORFEIT DELVE", true)
	forfeit.pressed.connect(func(): _ask("forfeit"))
	_menu_box.add_child(forfeit)

	var quit := UIKit.button("EXIT GAME", true)
	quit.pressed.connect(func(): _ask("exit"))
	_menu_box.add_child(quit)

	_confirm_box = VBoxContainer.new()
	_confirm_box.add_theme_constant_override("separation", 8)
	_confirm_box.visible = false
	column.add_child(_confirm_box)
	_confirm_label = UIKit.body("", UIKit.DANGER, 16)
	_confirm_box.add_child(_confirm_label)
	var confirm := UIKit.button("CONFIRM", true)
	confirm.pressed.connect(_apply)
	_confirm_box.add_child(confirm)
	var cancel := UIKit.button("CANCEL")
	cancel.pressed.connect(_dismiss)
	_confirm_box.add_child(cancel)

func refresh() -> void:
	_dismiss()
	var carried := 0
	if menus and is_instance_valid(menus.player):
		carried = int(menus.player.run_credits)
	_credits_label.text = "CARRIED %s  •  BANKED %s" % [
		UIKit.credits_text(carried), UIKit.credits_text(SaveManager.credits())]
	_resume_button.grab_focus()

func _ask(action: String) -> void:
	_pending = action
	var carried := 0
	if menus and is_instance_valid(menus.player):
		carried = int(menus.player.run_credits)
	var warning := "%s carried this delve will be lost." % UIKit.credits_text(carried) if carried > 0 else "Nothing is carried right now."
	_confirm_label.text = ("ABANDON THE SECTOR?\n%s" % warning) if action == "forfeit" else ("CLOSE NET DELVER?\n%s" % warning)
	_menu_box.visible = false
	_confirm_box.visible = true
	_confirm_box.get_child(1).grab_focus()

func _dismiss() -> void:
	_pending = ""
	_confirm_box.visible = false
	_menu_box.visible = true

func _apply() -> void:
	var action := _pending
	_dismiss()
	match action:
		"forfeit":
			menus.close_all()
			GameManager.forfeit_delve()
		"exit":
			GameManager.exit_game()
