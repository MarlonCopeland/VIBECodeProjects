extends Node3D

@export var weapon_index := 1
@export var display_name := "RAPID BUSTER"
var base_height := 0.0

## Every world pickup answers this so the host can branch on one value instead
## of duck-typing its way through has_method checks.
func pickup_kind() -> String:
	return "weapon"

func prompt_text() -> String:
	return "EQUIP %s" % display_name

func _ready() -> void:
	base_height = position.y

func _process(delta: float) -> void:
	rotate_y(delta * 1.4)
	position.y = base_height + sin(Time.get_ticks_msec() * 0.003 + weapon_index) * 0.12

func consume() -> void:
	visible = false
	process_mode = Node.PROCESS_MODE_DISABLED
