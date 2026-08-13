extends CharacterBody3D

# Gameplay numbers live in the tuning tables, not here:
#   WeaponDatabase — every buster, its damage/cadence/colour, and charge tiers
#   DelverDatabase — base health, stamina, speed, jump, sprint, stamina costs
#   ItemDatabase   — consumables and the equipment that modifies those bases
# This script owns behaviour and the camera rig; retuning should never require
# opening it.

const AIM_DISTANCE := 200.0

# Sprint is forward-only, stamina-priced, and mutually exclusive with aiming.
# That last rule is what keeps it from being a free movement upgrade: sprinting
# is how you cross ground, not how you fight, and dropping out of it to shoot is
# the cost. The numbers are in DelverDatabase.

# --- Camera rig -------------------------------------------------------------
# Over-the-shoulder framing: the pivot sits at chest height, the spring arm is
# pushed sideways so the body occupies one third of the frame, and aiming pulls
# the whole rig in tight while narrowing the FOV. R3 mirrors the lateral offset
# so you can peek either side of cover.
const CAM_HEIGHT_HIP := 1.75
const CAM_HEIGHT_ADS := 1.88
const CAM_DISTANCE_HIP := 3.60
const CAM_DISTANCE_ADS := 2.45
const SHOULDER_HIP := 1.05
const SHOULDER_ADS := 1.10
const AIM_BLEND_SPEED := 7.0
const SHOULDER_BLEND_SPEED := 8.0
const ADS_FOV_SCALE := 0.62
const ADS_MOVE_SCALE := 0.55
const PITCH_MIN := -1.15
const PITCH_MAX := 0.85

@export var max_health := DelverDatabase.BASE_HEALTH
@export var max_stamina := DelverDatabase.BASE_STAMINA
@export var move_speed := DelverDatabase.BASE_SPEED

var current_health := DelverDatabase.BASE_HEALTH
var current_stamina := DelverDatabase.BASE_STAMINA
var weapon_index := 0

# Loadout carried into this run. Seeded from the lobby roster in _ready() so
# every peer builds this Delver with the same stats, colour, and weapon without
# an RPC racing the scene load.
var equipment: Dictionary = {}
var equipment_stats: Dictionary = {}
var jump_velocity := DelverDatabase.BASE_JUMP_VELOCITY
var stamina_regen_scale := 1.0
var backpack_capacity := DelverDatabase.BASE_BACKPACK_SLOTS
var interaction_prompt := ""
var invulnerable := false
var fire_time := 0.0

# Committed-action state. `action` is "" when free; while it is set, input is
# suppressed until the cancel window opens. Timings all come from ActionTable
# so they cannot drift away from the animation.
var action := ""
var action_time := 0.0
var buffer := InputBuffer.new()
var sprinting := false

## Kept as a derived property rather than a flag: several places read it, and
## a second source of truth for "am I rolling" is exactly how this drifts.
var rolling: bool:
	get: return action == "roll" or action == "roll_heavy"
var look_pitch := -0.15
var move_direction := Vector3.ZERO
var hud: CanvasLayer
var menus: CanvasLayer

# Jump state
var coyote_timer := 0.0
var air_dash_available := true
var was_on_floor := true

# Charge state
var hold_time := 0.0
var charge := 0.0
var charge_announced := 0

# Camera state
var aiming := false
var aim_blend := 0.0
var shoulder := 1
var shoulder_blend := 1.0
var base_fov := 74.0
var mouse_sensitivity := 1.0
var stick_sensitivity := 1.0
var aim_sensitivity := 0.6
var invert_y := false
var hold_to_aim := true

# Items, buffs, and the run's unbanked currency. `inventory` is a mirror of the
# server-owned copy in Dungeon — the client spends nothing on its own, it asks
# and waits for the sync.
var inventory: Dictionary = {}
var stamina_boost := 0.0
var item_cooldown := 0.0
var run_credits := 0
## Salvage pulled from chests. Like credits, only real once extracted.
var run_parts := 0

## Set by the pause/inventory screens. Input is read as if the window lost
## focus, which is the behaviour those paths were already written for.
var input_locked := false

## Cached so the loot prompt does not re-format a binding name every tick.
var _interact_hint := "E"

@onready var pivot: Node3D = $CameraPivot
@onready var spring: SpringArm3D = $CameraPivot/SpringArm3D
@onready var camera: Camera3D = $CameraPivot/SpringArm3D/Camera3D
## The visual root. Purely cosmetic — the collision capsule is radially
## symmetric, so nothing here affects physics. That is what lets the rig turn to
## face the run direction while the body keeps facing the camera.
@onready var model: Node3D = $Model

# Deliberately NOT @onready. The rig is built inside _ready(), and @onready vars
# resolve before _ready()'s body runs — so a `$Model/Buster` lookup here would
# resolve against a Model that is still empty and hand back null, and the first
# thing to touch it would crash.
var rig: DelverRig.Rig
var animator: Node3D
var buster: MeshInstance3D
var muzzle: Marker3D
var charge_light: OmniLight3D

func _enter_tree() -> void:
	set_multiplayer_authority(name.to_int())

func _ready() -> void:
	_adopt_loadout()
	current_health = max_health
	current_stamina = max_stamina
	camera.current = is_multiplayer_authority()
	_build_rig()
	_apply_settings(true)
	shoulder_blend = float(shoulder)
	_refresh_interact_hint()
	InputSettings.bindings_changed.connect(_refresh_interact_hint)
	if is_multiplayer_authority():
		SaveManager.settings_changed.connect(_on_settings_changed)
		Input.mouse_mode = Input.MOUSE_MODE_CAPTURED
		hud = preload("res://scripts/player/PlayerHUD.gd").new()
		add_child(hud)
		hud.setup(self)
		menus = preload("res://scripts/ui/GameMenus.gd").new()
		add_child(menus)
		menus.setup(self)
	_update_camera_rig(1.0)
	_update_buster_color()

func _on_settings_changed(section: String) -> void:
	if section == "gameplay" or section == "graphics":
		_apply_settings()

## `adopt_shoulder` is only true on spawn. Re-reading it on every settings
## change would snap the camera back to the default side the moment the player
## nudged an unrelated slider mid-run.
func _apply_settings(adopt_shoulder := false) -> void:
	base_fov = float(SaveManager.get_setting("gameplay", "fov"))
	mouse_sensitivity = float(SaveManager.get_setting("gameplay", "mouse_sensitivity"))
	stick_sensitivity = float(SaveManager.get_setting("gameplay", "stick_sensitivity"))
	aim_sensitivity = float(SaveManager.get_setting("gameplay", "aim_sensitivity"))
	invert_y = bool(SaveManager.get_setting("gameplay", "invert_y"))
	hold_to_aim = bool(SaveManager.get_setting("gameplay", "hold_to_aim"))
	if adopt_shoulder:
		shoulder = 1 if int(SaveManager.get_setting("gameplay", "default_shoulder")) >= 0 else -1

## Reads this Delver's declared loadout off the lobby roster (every peer has
## it) and folds the equipment into the movement and resource stats. Runs
## before anything reads max_health or builds the rig.
func _adopt_loadout() -> void:
	var roster_entry: Dictionary = NetworkManager.players.get(name.to_int(), {})
	equipment = roster_entry.get("equipment", {})
	if equipment.is_empty() and is_multiplayer_authority():
		equipment = SaveManager.equipment()
	if not equipment.has("buster"):
		equipment["buster"] = ItemDatabase.BUSTER_STANDARD
	equipment_stats = ItemDatabase.aggregate_stats(equipment)
	max_health = DelverDatabase.max_health(equipment_stats)
	max_stamina = DelverDatabase.max_stamina(equipment_stats)
	move_speed = DelverDatabase.move_speed(equipment_stats)
	jump_velocity = DelverDatabase.jump_velocity(equipment_stats)
	stamina_regen_scale = DelverDatabase.stamina_regen_scale(equipment_stats)
	backpack_capacity = DelverDatabase.backpack_slots(equipment_stats)
	weapon_index = clampi(ItemDatabase.weapon_index(str(equipment["buster"])), 0, WeaponDatabase.count() - 1)

## The buster synergy mods active for the weapon currently held. Only the mods
## keyed to this weapon apply — swap weapons mid-run and the synergy sleeps.
func active_weapon_mod() -> Dictionary:
	var mods: Dictionary = equipment_stats.get("weapon_mods", {})
	return mods.get(weapon_index, {})

func armor_color() -> Color:
	var roster_entry: Dictionary = NetworkManager.players.get(name.to_int(), {})
	if roster_entry.has("color"):
		var index := clampi(int(roster_entry["color"]), 0, SaveManager.ARMOR_COLORS.size() - 1)
		return Color(str(SaveManager.ARMOR_COLORS[index]["color"]))
	if is_multiplayer_authority():
		return SaveManager.armor_color()
	return DelverRig.ARMOUR

## Builds the skeleton and its proxy geometry, and takes the handles the firing
## code needs from it. The muzzle rides the `Muzzle` bone rather than the weapon
## mesh, so swapping or reskinning the buster cannot move where shots come from.
func _build_rig() -> void:
	rig = DelverRig.build(model, armor_color())
	buster = rig.buster_mesh
	muzzle = rig.muzzle
	# The animator is its own node on purpose: _process and _physics_process
	# here both return early for non-authority peers, so an animator living
	# inside this script would never tick for anyone else's Delver.
	animator = preload("res://scripts/player/DelverAnimator.gd").new()
	animator.name = "Animator"
	add_child(animator)
	animator.setup(self)
	charge_light = OmniLight3D.new()
	charge_light.light_color = WeaponDatabase.color(weapon_index)
	charge_light.light_energy = 0.0
	charge_light.omni_range = 3.5
	rig.charge_fx.add_child(charge_light)

func _refresh_interact_hint() -> void:
	_interact_hint = InputSettings.describe_binding("interact", "kb")

func input_blocked() -> bool:
	return input_locked or not get_window().has_focus()

func _unhandled_input(event: InputEvent) -> void:
	if not is_multiplayer_authority() or input_blocked():
		return
	if event is InputEventMouseMotion and Input.mouse_mode == Input.MOUSE_MODE_CAPTURED:
		# Aiming slows the look so the tighter FOV stays controllable, matching
		# the way the zoom itself is a precision mode rather than a speed mode.
		var motion := event as InputEventMouseMotion
		var look_scale := 0.0025 * mouse_sensitivity * lerpf(1.0, aim_sensitivity, aim_blend)
		var pitch_delta := motion.relative.y * look_scale
		rotate_y(-motion.relative.x * look_scale)
		look_pitch = clamp(look_pitch - (-pitch_delta if invert_y else pitch_delta), PITCH_MIN, PITCH_MAX)
	if event.is_action_pressed("swap_shoulder"):
		swap_shoulder()

func swap_shoulder() -> void:
	shoulder = -shoulder
	SynthAudio.play("pickup", 1.9, -26.0)

## Camera rig runs on the render frame so the over-the-shoulder blend stays
## smooth regardless of the physics tick rate.
func _process(delta: float) -> void:
	if not is_multiplayer_authority():
		return
	_update_camera_rig(delta)

func _update_camera_rig(delta: float) -> void:
	var target_aim := 1.0 if aiming else 0.0
	aim_blend = move_toward(aim_blend, target_aim, AIM_BLEND_SPEED * delta)
	shoulder_blend = move_toward(shoulder_blend, float(shoulder), SHOULDER_BLEND_SPEED * delta)

	pivot.position.y = lerpf(CAM_HEIGHT_HIP, CAM_HEIGHT_ADS, aim_blend)
	pivot.rotation.x = look_pitch
	spring.spring_length = lerpf(CAM_DISTANCE_HIP, CAM_DISTANCE_ADS, aim_blend)
	# Offsetting the arm (not the camera) keeps the collision cast on the same
	# line as the final view, so the camera still pops in against walls when
	# you hug cover on either shoulder.
	spring.position.x = shoulder_blend * lerpf(SHOULDER_HIP, SHOULDER_ADS, aim_blend)
	camera.fov = lerpf(base_fov, base_fov * ADS_FOV_SCALE, aim_blend)

func _physics_process(delta: float) -> void:
	if not is_multiplayer_authority():
		return
	fire_time = maxf(0.0, fire_time - delta)
	item_cooldown = maxf(0.0, item_cooldown - delta)
	_tick_stamina(delta)
	if input_blocked():
		# Input actions poll device state and do not inherently respect window
		# focus, so explicitly idle this local player in background instances
		# and while a menu owns the screen.
		move_direction = Vector3.ZERO
		_end_action()
		aiming = false
		sprinting = false
		buffer.clear()
		_reset_charge()
		velocity.x = 0.0
		velocity.z = 0.0
		velocity.y = -0.5 if is_on_floor() else velocity.y - DelverDatabase.GRAVITY * delta
		interaction_prompt = ""
		move_and_slide()
		return

	var look_input := Input.get_vector("look_left", "look_right", "look_up", "look_down")
	var look_scale := stick_sensitivity * lerpf(1.0, aim_sensitivity, aim_blend)
	rotate_y(-look_input.x * 2.4 * look_scale * delta)
	var pitch_input := look_input.y * (-1.0 if invert_y else 1.0)
	look_pitch = clamp(look_pitch - pitch_input * 1.8 * look_scale * delta, PITCH_MIN, PITCH_MAX)

	var grounded := is_on_floor()
	if grounded:
		coyote_timer = DelverDatabase.COYOTE_TIME
		air_dash_available = true
	else:
		coyote_timer = maxf(0.0, coyote_timer - delta)

	# Polled unconditionally, before the committed-action gate. This is the
	# whole point of the buffer: a press made mid-roll has to survive until the
	# roll's cancel window opens instead of being thrown away.
	buffer.poll(delta)
	if not _tick_action(delta):
		_read_actions(delta)

	var speed := move_speed * (ActionTable.speed_scale(action) if rolling else 1.0)
	if sprinting and not rolling:
		speed *= DelverDatabase.SPRINT_SPEED_SCALE
	if equip_load() >= WeaponDatabase.HEAVY_LOAD_RATIO:
		speed *= DelverDatabase.HEAVY_LOAD_SPEED_SCALE
	# Aiming trades mobility for precision, the way it does in a modern
	# over-the-shoulder shooter — a dodge roll cancels out of it instantly.
	if not rolling:
		speed *= lerpf(1.0, ADS_MOVE_SCALE, aim_blend)

	var target_x := move_direction.x * speed
	var target_z := move_direction.z * speed
	if grounded or rolling:
		velocity.x = target_x
		velocity.z = target_z
	else:
		# Airborne: steer, don't teleport. Keeps jump arcs readable while
		# still allowing mid-air correction.
		velocity.x = lerpf(velocity.x, target_x, DelverDatabase.AIR_CONTROL * delta * 6.0)
		velocity.z = lerpf(velocity.z, target_z, DelverDatabase.AIR_CONTROL * delta * 6.0)

	_apply_jump(delta, grounded)
	move_and_slide()

	if not was_on_floor and is_on_floor():
		SynthAudio.play("roll", 1.35, -22.0)
	was_on_floor = is_on_floor()
	_update_interaction()
	_update_charge_visual()

## Advances a committed action. Returns true while input should stay suppressed.
##
## Invulnerability is written every tick from the table rather than being set
## once and cleared later, so the i-frame window can never outlive the action
## that granted it.
func _tick_action(delta: float) -> bool:
	if action.is_empty():
		invulnerable = false
		return false
	action_time += delta
	invulnerable = ActionTable.invulnerable_at(action, action_time)
	if action_time >= ActionTable.total(action):
		_end_action()
		return false
	return action_time < ActionTable.cancel_from(action)

func _end_action() -> void:
	action = ""
	action_time = 0.0
	invulnerable = false

## True when a new action may start: either nothing is running, or the current
## one has reached its cancel window. This is what lets the tail of a roll be
## cancelled into another roll, a jump, or a shot.
func can_act() -> bool:
	return action.is_empty() or action_time >= ActionTable.cancel_from(action)

func _begin_action(id: String) -> void:
	action = id
	action_time = 0.0
	invulnerable = ActionTable.invulnerable_at(id, 0.0)
	if bool(ActionTable.get_action(id).get("breaks_aim", false)):
		aiming = false

## Regeneration, plus the Overclock Cell buff that pins stamina to full.
func _tick_stamina(delta: float) -> void:
	if stamina_boost > 0.0:
		stamina_boost = maxf(0.0, stamina_boost - delta)
		current_stamina = max_stamina
		return
	if sprinting:
		current_stamina = maxf(0.0, current_stamina - DelverDatabase.SPRINT_DRAIN * delta)
		return
	current_stamina = minf(max_stamina,
		current_stamina + (DelverDatabase.STAMINA_REGEN_ROLLING if rolling
			else DelverDatabase.STAMINA_REGEN) * stamina_regen_scale * delta)

func stamina_boosted() -> bool:
	return stamina_boost > 0.0

func _can_spend(cost: float) -> bool:
	return stamina_boosted() or current_stamina >= cost

func _spend_stamina(cost: float) -> void:
	if not stamina_boosted():
		current_stamina = maxf(0.0, current_stamina - cost)

func _apply_jump(delta: float, grounded: bool) -> void:
	# `can_act()` gates the buffered jump so a roll cannot be cancelled from
	# frame zero — the press waits in the buffer until the cancel window opens.
	if can_act() and coyote_timer > 0.0 and buffer.consume(&"jump"):
		coyote_timer = 0.0
		_end_action()
		velocity.y = jump_velocity
		SynthAudio.play("roll", 1.6, -16.0)
		return
	if grounded and velocity.y <= 0.0:
		velocity.y = -0.5
		return
	# Variable jump height: releasing early clips the rise short.
	if velocity.y > 0.0 and not Input.is_action_pressed("jump"):
		velocity.y = move_toward(velocity.y, 0.0, DelverDatabase.GRAVITY * 2.2 * delta)
	velocity.y -= DelverDatabase.GRAVITY * delta

func _read_actions(delta: float) -> void:
	var input := Input.get_vector("move_left", "move_right", "move_forward", "move_backward")
	var forward := -global_basis.z
	var right := global_basis.x
	move_direction = (right * input.x + forward * -input.y).normalized()

	_read_aim()
	_read_sprint()

	if buffer.peek(&"roll") and _can_spend(DelverDatabase.ROLL_COST):
		buffer.consume(&"roll")
		if move_direction.is_zero_approx():
			move_direction = forward
		if is_on_floor():
			_begin_action(ActionTable.roll_for_load(equip_load()))
			_spend_stamina(DelverDatabase.ROLL_COST)
			SynthAudio.play("roll", 1.0 + randf_range(-0.08, 0.08), -13.0)
		elif air_dash_available and _can_spend(DelverDatabase.AIR_DASH_COST):
			# Mega Man X style air dash: one burst of horizontal speed per jump.
			air_dash_available = false
			_spend_stamina(DelverDatabase.AIR_DASH_COST)
			velocity.x = move_direction.x * move_speed * DelverDatabase.AIR_DASH_SPEED_SCALE
			velocity.z = move_direction.z * move_speed * DelverDatabase.AIR_DASH_SPEED_SCALE
			velocity.y = maxf(velocity.y, 1.2)
			SynthAudio.play("roll", 1.5, -12.0)

	_read_attack(delta)
	_read_items()

	if buffer.consume(&"interact"):
		_interact()

## Sprint is a *held* state re-evaluated every tick rather than a toggle, so it
## drops the instant any of its conditions stops being true — you run out of
## stamina, you turn sideways, you leave the ground, you raise the sight.
func _read_sprint() -> void:
	var held := Input.is_action_pressed("sprint")
	var forward_enough := move_direction.dot(-global_basis.z) > DelverDatabase.SPRINT_FORWARD_DOT
	var able := held and forward_enough and is_on_floor() and not aiming and not rolling
	if not able:
		sprinting = false
		return
	# Starting costs more than continuing, so a sprint cannot be re-tapped for
	# free once the bar is empty.
	sprinting = current_stamina > 0.5 if sprinting else _can_spend(DelverDatabase.SPRINT_MIN_STAMINA)

## Hold-to-aim is the default (trigger/right mouse held); toggle mode is a
## gameplay setting for players who prefer it.
func _read_aim() -> void:
	if hold_to_aim:
		aiming = Input.is_action_pressed("aim")
	elif Input.is_action_just_pressed("aim"):
		aiming = not aiming

## Tap = instant shot. Hold = charge, released as a heavy shot. Auto weapons
## skip charging entirely and just keep firing while held.
func _read_attack(delta: float) -> void:
	var weapon: Dictionary = WeaponDatabase.stats(weapon_index)
	if weapon.auto:
		if Input.is_action_pressed("attack"):
			_fire(0)
		return

	if Input.is_action_just_pressed("attack"):
		hold_time = 0.0
		charge = 0.0
		charge_announced = 0
		_fire(0)
	elif Input.is_action_pressed("attack") and weapon.chargeable:
		hold_time += delta
		charge = clampf((hold_time - WeaponDatabase.CHARGE_DELAY) / WeaponDatabase.CHARGE_TIME, 0.0, 1.0)
		var level := charge_level()
		if level > charge_announced:
			charge_announced = level
			SynthAudio.play("charge", 0.8 + 0.45 * level, -15.0)
	elif Input.is_action_just_released("attack"):
		if charge_level() > 0:
			_fire(charge_level())
		_reset_charge()

func charge_level() -> int:
	if charge >= 0.999:
		return 2
	if charge >= WeaponDatabase.CHARGE_MID:
		return 1
	return 0

func _reset_charge() -> void:
	hold_time = 0.0
	charge = 0.0
	charge_announced = 0

func _update_charge_visual() -> void:
	if not charge_light:
		return
	var level := charge_level()
	charge_light.light_energy = charge * (5.0 + 3.0 * level)
	var pulse := 1.0 + charge * 0.35 + (sin(Time.get_ticks_msec() * 0.02) * 0.12 * charge)
	buster.scale = Vector3.ONE * pulse

## Where the reticle is actually pointing. The camera sits behind and to one
## side of the player, so shots must converge on what the crosshair covers
## rather than fly parallel to the camera — that mismatch is what made the old
## body-relative aiming impossible to use, and the shoulder offset makes it
## matter even more.
func aim_point() -> Vector3:
	var from := camera.global_position
	var to := from - camera.global_basis.z * AIM_DISTANCE
	var query := PhysicsRayQueryParameters3D.create(from, to)
	query.exclude = [get_rid()]
	query.collide_with_areas = false
	var hit := get_world_3d().direct_space_state.intersect_ray(query)
	return hit.position if hit else to

func muzzle_position() -> Vector3:
	if not muzzle:
		return global_position + Vector3.UP * 1.2
	var point := muzzle.global_position
	# A BoneAttachment3D's transform is a frame behind on the tick the rig is
	# built, which would briefly report the muzzle at the Delver's feet. Fall
	# back to the skeleton's rest offset rather than firing from the floor.
	if point.distance_to(global_position) < 0.35:
		return global_transform * DelverRig.rest_muzzle_offset()
	return point

func aim_direction() -> Vector3:
	var origin := muzzle_position()
	var direction := (aim_point() - origin).normalized()
	return direction if not direction.is_zero_approx() else -global_basis.z

func _fire(level: int) -> void:
	var weapon: Dictionary = WeaponDatabase.stats(weapon_index)
	var mod := active_weapon_mod()
	var cost := float(weapon.stamina) * WeaponDatabase.CHARGE_STAMINA[clampi(level, 0, 2)] \
		* float(mod.get("stamina_cost", 1.0))
	if fire_time > 0.0 or not _can_spend(cost):
		return
	fire_time = float(weapon.cooldown) * (1.0 if level == 0 else 0.6) \
		* float(mod.get("fire_rate", 1.0))
	_spend_stamina(cost)
	sprinting = false
	if animator:
		animator.enter_combat_stance()

	var origin := muzzle_position()
	var direction := aim_direction()

	var dungeon := _dungeon()
	if not dungeon:
		return
	if multiplayer.is_server():
		dungeon.request_fire(multiplayer.get_unique_id(), weapon_index, origin, direction, level, aiming)
	else:
		dungeon.request_fire.rpc_id(1, multiplayer.get_unique_id(), weapon_index, origin, direction, level, aiming)

func _dungeon() -> Node:
	return get_tree().get_first_node_in_group("dungeon")

# ---------------------------------------------------------------- inventory

func item_count(item_id: String) -> int:
	return int(inventory.get(item_id, 0))

func _read_items() -> void:
	if buffer.consume(&"use_heal"):
		use_item(ItemDatabase.REPAIR_KIT)
	if buffer.consume(&"use_stim"):
		use_item(ItemDatabase.OVERCLOCK_CELL)
	if buffer.consume(&"throw_grenade"):
		use_item(ItemDatabase.FRAG_CHARGE)

## Asks the host to spend one of an item. The client predicts nothing except
## its own cooldown, so a rejected request just costs a moment of input.
func use_item(item_id: String) -> bool:
	if not is_multiplayer_authority() or item_cooldown > 0.0 or item_count(item_id) <= 0:
		return false
	if item_id == ItemDatabase.REPAIR_KIT and current_health >= max_health:
		return false
	var dungeon := _dungeon()
	if not dungeon:
		return false
	item_cooldown = ItemDatabase.value(item_id, "cooldown", 0.8)
	var origin := muzzle_position()
	var direction := aim_direction()
	if multiplayer.is_server():
		dungeon.request_use_item(multiplayer.get_unique_id(), item_id, origin, direction)
	else:
		dungeon.request_use_item.rpc_id(1, multiplayer.get_unique_id(), item_id, origin, direction)
	return true

## Asks the host to drop one of an item at this Delver's feet, where any party
## member can pick it up. The host owns the inventory, so the client only asks.
func drop_item(item_id: String) -> bool:
	if not is_multiplayer_authority() or item_count(item_id) <= 0:
		return false
	var dungeon := _dungeon()
	if not dungeon:
		return false
	if multiplayer.is_server():
		dungeon.request_drop_item(multiplayer.get_unique_id(), item_id)
	else:
		dungeon.request_drop_item.rpc_id(1, multiplayer.get_unique_id(), item_id)
	return true

@rpc("any_peer", "call_local", "reliable")
func sync_inventory(items: Dictionary) -> void:
	inventory = items.duplicate()

@rpc("any_peer", "call_local", "reliable")
func apply_item_effect(item_id: String) -> void:
	match item_id:
		ItemDatabase.REPAIR_KIT:
			current_health = minf(max_health, current_health + ItemDatabase.value(item_id, "heal", 45.0))
			SynthAudio.play("pickup", 1.35, -8.0)
		ItemDatabase.OVERCLOCK_CELL:
			stamina_boost = maxf(stamina_boost, ItemDatabase.value(item_id, "stamina_time", 12.0))
			current_stamina = max_stamina
			SynthAudio.play("charge", 1.6, -8.0)
		ItemDatabase.FRAG_CHARGE:
			SynthAudio.play("roll", 0.7, -12.0)

@rpc("any_peer", "call_local", "reliable")
func grant_credits(amount: int) -> void:
	run_credits += amount
	if is_multiplayer_authority() and amount > 0:
		SynthAudio.play("pickup", 1.6, -16.0)

@rpc("any_peer", "call_local", "reliable")
func grant_parts(amount: int) -> void:
	run_parts += amount
	if is_multiplayer_authority() and amount > 0:
		SynthAudio.play("pickup", 0.9, -14.0)

## Called on extraction. Unbanked credits are only worth something once they
## reach the profile, which is what makes forfeiting a real cost.
func bank_credits() -> int:
	var banked := run_credits
	if is_multiplayer_authority() and banked > 0:
		SaveManager.add_credits(banked)
	run_credits = 0
	return banked

## The other half of extraction: whatever is still in the pack, plus the
## salvage parts pulled out of chests, moves into the persistent stash.
## Returns {"items": {...}, "parts": int} for the results screen.
func bank_loadout() -> Dictionary:
	var report := {"items": {}, "parts": run_parts}
	if not is_multiplayer_authority():
		return report
	var carried := {}
	for item_id in inventory:
		# Credit shards are spent on pickup; only real stock is worth storing.
		if int(inventory[item_id]) > 0 and ItemDatabase.has(str(item_id)):
			carried[str(item_id)] = int(inventory[item_id])
	# A buster found in the sector comes home too: extract holding a weapon you
	# did not deploy with and it joins the stash as a real, equippable item.
	var deployed_index := ItemDatabase.weapon_index(str(equipment.get("buster", ItemDatabase.BUSTER_STANDARD)))
	if weapon_index != deployed_index and weapon_index != 0:
		var weapon_id := ItemDatabase.weapon_id_for_index(weapon_index)
		carried[weapon_id] = int(carried.get(weapon_id, 0)) + 1
	report["items"] = SaveManager.deposit_to_stash(carried, run_parts)
	# A full stash turns loot away at the door. Reported rather than swallowed,
	# so the results screen can say what the missing slots actually cost.
	report["lost"] = SaveManager.last_deposit_overflow.duplicate()
	run_parts = 0
	inventory = {}
	return report

func _interact() -> void:
	var closest := _closest_pickup()
	if closest:
		var dungeon := _dungeon()
		if not dungeon:
			return
		if multiplayer.is_server():
			dungeon.request_pickup(multiplayer.get_unique_id(), closest.name)
		else:
			dungeon.request_pickup.rpc_id(1, multiplayer.get_unique_id(), closest.name)

## Backpack slots are per distinct stack, so an item already carried always has
## somewhere to go and only a *new* kind can be turned away. Mirrors the host's
## rule in Dungeon._can_accept — the client predicts it purely to explain
## itself, the host still decides.
func backpack_full_for(item_id: String) -> bool:
	if item_id.is_empty() or not ItemDatabase.uses_backpack(item_id):
		return false
	if item_count(item_id) > 0:
		return false
	var stacks := 0
	for held_id in inventory:
		if int(inventory[held_id]) > 0 and ItemDatabase.uses_backpack(str(held_id)):
			stacks += 1
	return stacks >= backpack_capacity

func _update_interaction() -> void:
	var pickup := _closest_pickup()
	if not pickup:
		interaction_prompt = ""
		return
	var label: String = pickup.prompt_text() if pickup.has_method("prompt_text") else "EQUIP %s" % pickup.display_name
	# A full pack used to refuse the pickup in silence: the prompt still read
	# "[E] SCRAP ALLOY x1" and pressing E simply did nothing, which is what made
	# salvage look like it was never dropping at all.
	var carried_id: Variant = pickup.get("item_id")
	if backpack_full_for(str(carried_id) if carried_id != null else ""):
		interaction_prompt = "%s — BACKPACK FULL  [%s] TO DROP SOMETHING" % [
			label, InputSettings.describe_binding("character", "kb")]
		return
	interaction_prompt = "[%s] %s" % [_interact_hint, label]

func _closest_pickup() -> Node:
	var closest: Node
	var distance := 3.0
	for pickup in get_tree().get_nodes_in_group("pickups"):
		if not pickup.visible:
			continue
		var check := global_position.distance_to(pickup.global_position)
		if check < distance:
			distance = check
			closest = pickup
	return closest

@rpc("any_peer", "call_local", "reliable")
func equip_weapon(index: int) -> void:
	weapon_index = clampi(index, 0, WeaponDatabase.count() - 1)
	_reset_charge()
	_update_buster_color()
	if is_multiplayer_authority():
		SynthAudio.play("pickup", 1.0 + weapon_index * 0.12)

@rpc("any_peer", "call_local", "reliable")
func receive_damage(amount: float) -> void:
	if invulnerable or current_health <= 0.0:
		return
	current_health = maxf(0.0, current_health - amount)
	SynthAudio.play("hit", randf_range(0.85, 1.15), -9.0)
	if current_health <= 0.0:
		_respawn()

## Going down scatters the credits you were carrying — half of the unbanked
## run total is lost on the spot.
func _respawn() -> void:
	current_health = max_health
	current_stamina = max_stamina
	stamina_boost = 0.0
	run_credits = int(run_credits * 0.5)
	run_parts = int(run_parts * 0.5)
	_reset_charge()
	# A roll in progress and any press made during death must not carry into
	# the new life — you would respawn already dodging, or immediately throw the
	# grenade you were reaching for as you went down.
	_end_action()
	buffer.clear()
	velocity = Vector3.ZERO
	var dungeon := _dungeon()
	if dungeon and dungeon.has_method("spawn_position_for"):
		global_position = dungeon.spawn_position_for(multiplayer.get_unique_id())

func weapon_name() -> String:
	return WeaponDatabase.stats(weapon_index).name

func equip_load() -> float:
	return float(WeaponDatabase.stats(weapon_index).weight) / WeaponDatabase.LOAD_CAPACITY

func weight_class() -> String:
	return "HEAVY FRAME" if equip_load() >= WeaponDatabase.HEAVY_LOAD_RATIO else "MOBILE FRAME"

func _update_buster_color() -> void:
	if not is_node_ready():
		return
	var color := WeaponDatabase.color(weapon_index)
	var material := buster.get_active_material(0).duplicate() as StandardMaterial3D
	material.albedo_color = color
	material.emission_enabled = true
	material.emission = color
	# Tuned down from 2.2: the buster used to be a 0.95m cylinder held out at
	# arm's length. On the rig it is a 0.38m barrel at chest height, close to
	# the camera, and the old value plus the glow pass blew out the whole torso.
	material.emission_energy_multiplier = 0.85
	buster.material_override = material
	if charge_light:
		charge_light.light_color = color
