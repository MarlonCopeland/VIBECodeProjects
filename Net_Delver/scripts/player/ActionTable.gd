class_name ActionTable
extends RefCounted

# Committed actions, as data.
#
# A dodge roll has four separate timings that all have to agree: how long it
# takes, when the invulnerability starts and stops, when you regain control, and
# how long the animation runs. Scattered across the controller and an animation
# clip, those four numbers drift — and when they do, the bug is "the roll
# sometimes doesn't dodge", which is miserable to track down.
#
# So they live here, and `tests/RigCheck.gd` asserts that every animation clip's
# length matches its `total`. That turns a convention into a guarantee.
#
# This is the Elden Ring half of the feel: locomotion stays code-driven and
# instantly responsive, but a dodge is a *commitment* with a real recovery you
# can be punished during.

const ACTIONS := {
	"roll": {
		"anim": "roll",
		"total": 0.46,
		## Start/end of invulnerability, in seconds from the action's start.
		## Note the gap at each end: rolling on reaction to a hit that has
		## already landed should not save you, and the recovery is exposed.
		"iframes": Vector2(0.06, 0.34),
		## Input is read again from here on, so the tail of a roll can be
		## cancelled into another action instead of being dead time.
		"cancel_from": 0.34,
		"speed_scale": 1.65,
		"stamina": 20.0,
		"breaks_aim": true,
	},
	"roll_heavy": {
		"anim": "roll_heavy",
		"total": 0.62,
		"iframes": Vector2(0.08, 0.44),
		"cancel_from": 0.46,
		"speed_scale": 1.5,
		"stamina": 20.0,
		"breaks_aim": true,
	},
}

## The air dash is deliberately NOT in the table. It is an impulse, not a
## committed state: it sets velocity once and hands control straight back, which
## is what makes chaining it into a shot feel good. It still gets an animation
## one-shot, but it never suppresses input, so it needs no windows.

static func has(action: String) -> bool:
	return ACTIONS.has(action)

static func get_action(action: String) -> Dictionary:
	return ACTIONS.get(action, {})

static func total(action: String) -> float:
	return float(get_action(action).get("total", 0.0))

static func cancel_from(action: String) -> float:
	return float(get_action(action).get("cancel_from", total(action)))

static func speed_scale(action: String) -> float:
	return float(get_action(action).get("speed_scale", 1.0))

## True while the action's i-frame window is open at `elapsed`.
static func invulnerable_at(action: String, elapsed: float) -> bool:
	var window: Vector2 = get_action(action).get("iframes", Vector2.ZERO)
	return elapsed >= window.x and elapsed < window.y

## Which roll a Delver gets, by equip load. Heavy frames roll slower and take
## longer to recover, which is the cost the weight system already charges
## elsewhere in movement speed.
static func roll_for_load(equip_load: float) -> String:
	return "roll" if equip_load < 0.7 else "roll_heavy"
