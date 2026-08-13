class_name InputBuffer
extends RefCounted

# Short-lived memory of button presses.
#
# The problem this solves: `_read_actions()` is skipped entirely while the
# Delver is mid-roll, so a jump or a dodge pressed during those 0.46 seconds was
# not delayed — it was *discarded*. That is the difference between a controller
# that feels responsive and one that feels like it ignores you, and it is the
# single biggest feel win available in this codebase.
#
# So polling happens unconditionally, outside every committed-action branch, and
# the action fires on the first frame it becomes legal.
#
# Windows are per-action because they mean different things. Jump is tight (a
# late jump off a ledge you already left reads as a bug). Consumables are loose
# (nobody is frame-counting a heal).

const WINDOWS := {
	&"jump": 0.14,
	&"roll": 0.18,
	&"interact": 0.15,
	&"use_heal": 0.20,
	&"use_stim": 0.20,
	&"throw_grenade": 0.15,
}

## action -> seconds of life remaining
var _pending: Dictionary = {}

## Call once per physics tick, before anything reads the buffer, and crucially
## *not* inside a branch that a committed action can skip.
func poll(delta: float) -> void:
	for action in WINDOWS:
		var remaining := float(_pending.get(action, 0.0))
		if remaining > 0.0:
			_pending[action] = maxf(0.0, remaining - delta)
		if InputMap.has_action(action) and Input.is_action_just_pressed(action):
			_pending[action] = float(WINDOWS[action])

## Injects a press without going through the device. Used by the tests, and by
## any UI that wants to trigger a gameplay action (the inventory screen's USE
## buttons are the obvious future caller).
func press(action: StringName) -> void:
	_pending[action] = float(WINDOWS.get(action, 0.15))

## Takes the press if one is waiting. Returns false without side effects if not.
func consume(action: StringName) -> bool:
	if float(_pending.get(action, 0.0)) <= 0.0:
		return false
	_pending[action] = 0.0
	return true

## Reads without taking, for a gate that has to check several conditions before
## committing to spending the input.
func peek(action: StringName) -> bool:
	return float(_pending.get(action, 0.0)) > 0.0

## Dropped on death, on losing window focus, and on menu open — a press made
## before a respawn must not fire into the new life.
func clear() -> void:
	_pending.clear()
