class_name DelverDatabase
extends RefCounted

# ============================================================================
# DELVER TUNING TABLE — the base numbers every Delver starts from.
# ============================================================================
#
# Equipment modifies these rather than replacing them: a piece of gear adds a
# flat bonus (health, stamina, backpack) or a fractional one (speed, jump,
# regen). See ItemDatabase for the gear itself, and its `stats` blocks for what
# each piece moves.
#
# These are the *base* values, before any gear. Changing one here retunes every
# Delver in the game, including the ones drawn in the lobby preview.

# --- Resources --------------------------------------------------------------
const BASE_HEALTH := 100.0
const BASE_STAMINA := 100.0
## Distinct item stacks the backpack holds during a run. One stack per slot.
const BASE_BACKPACK_SLOTS := 6

# --- Movement ---------------------------------------------------------------
const BASE_SPEED := 6.5
const GRAVITY := 20.0
## Upward velocity on jump. Jump HEIGHT scales with the square of this, which
## is why gear bonuses are applied as a square root.
const BASE_JUMP_VELOCITY := 8.4
## Grace period after walking off a ledge during which a jump still counts.
const COYOTE_TIME := 0.12
## How much of the target velocity airborne steering can reach.
const AIR_CONTROL := 0.72

# --- Stamina ----------------------------------------------------------------
const STAMINA_REGEN := 21.0
## Reduced regeneration during a committed dodge, so rolling is not free.
const STAMINA_REGEN_ROLLING := 9.0
const ROLL_COST := 20.0
const AIR_DASH_COST := 22.0
## Horizontal burst of an air dash, as a multiple of move speed.
const AIR_DASH_SPEED_SCALE := 2.1

# --- Sprint -----------------------------------------------------------------
const SPRINT_SPEED_SCALE := 1.55
const SPRINT_DRAIN := 14.0
## Stamina needed to *start* a sprint. Higher than the drain rate so a sprint
## cannot be re-tapped for free once the bar is empty.
const SPRINT_MIN_STAMINA := 12.0
## How forward the stick has to point before a sprint engages. Sprinting
## sideways reads as a bug and would make the strafe animation unreachable.
const SPRINT_FORWARD_DOT := 0.4

# --- Equip load -------------------------------------------------------------
## Speed multiplier once carried weight crosses WeaponDatabase.HEAVY_LOAD_RATIO
## of WeaponDatabase.LOAD_CAPACITY.
const HEAVY_LOAD_SPEED_SCALE := 0.78

## Maximum health for a given aggregate equipment stat block.
static func max_health(stats: Dictionary) -> float:
	return BASE_HEALTH + float(stats.get("health", 0.0))

static func max_stamina(stats: Dictionary) -> float:
	return BASE_STAMINA + float(stats.get("stamina", 0.0))

static func move_speed(stats: Dictionary) -> float:
	return BASE_SPEED * (1.0 + float(stats.get("speed", 0.0)))

## Jump height scales with velocity squared, so a "+30% height" bonus becomes a
## square-root multiplier on the launch velocity.
static func jump_velocity(stats: Dictionary) -> float:
	return BASE_JUMP_VELOCITY * sqrt(1.0 + float(stats.get("jump", 0.0)))

static func stamina_regen_scale(stats: Dictionary) -> float:
	return 1.0 + float(stats.get("regen", 0.0))

static func backpack_slots(stats: Dictionary) -> int:
	return BASE_BACKPACK_SLOTS + int(stats.get("backpack", 0))
