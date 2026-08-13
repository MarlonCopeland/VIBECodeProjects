extends Node

const TEST_PROFILE := "user://net_delver_smoketest.cfg"
## Pinned so failures are reproducible. Anything asserted about this specific
## sector is noted as seed-dependent where it matters.
const TEST_SEED := 20260810

var failures: Array[String] = []

func check(condition: bool, label: String) -> void:
	if not condition:
		failures.append(label)

func _ready() -> void:
	# Persistence is under test, so redirect the profile to a scratch file and
	# start from a known-empty one rather than mutating the player's save.
	DirAccess.remove_absolute(ProjectSettings.globalize_path(TEST_PROFILE))
	SaveManager.use_profile(TEST_PROFILE)
	InputSettings.apply_all()

	_test_generator()
	_test_lan_beacon()
	_test_stash()
	_test_bench()

	# ---- deploy ----------------------------------------------------------
	GameManager.delve_seed = TEST_SEED
	NetworkManager.players = {1: {"id": 1, "name": "SmokeTest", "host": true, "kit": {
		ItemDatabase.REPAIR_KIT: 2, ItemDatabase.OVERCLOCK_CELL: 1, ItemDatabase.FRAG_CHARGE: 2,
	}}}
	var dungeon := preload("res://scenes/Dungeon.tscn").instantiate()
	add_child(dungeon)
	await get_tree().process_frame
	await get_tree().physics_frame

	# ---- input map -------------------------------------------------------
	for action in ["move_forward", "move_backward", "move_left", "move_right",
			"look_left", "look_right", "look_up", "look_down",
			"attack", "aim", "swap_shoulder", "throw_grenade",
			"use_heal", "use_stim", "character",
			"roll", "jump", "interact", "pause"]:
		check(InputMap.has_action(action), "input action missing: %s" % action)

	# Actions must be installed exactly once. project.godot used to declare a
	# few of them too, which quietly doubled every binding.
	check(InputMap.action_get_events("jump").size() == 2, "jump has one key and one pad binding")

	# R3 is the shoulder swap on a controller, and it must survive the rebuild.
	var pad_swap := InputSettings.describe_binding("swap_shoulder", "pad")
	check(pad_swap == "R3", "shoulder swap bound to R3 (got %s)" % pad_swap)

	var player: Node = dungeon.get_node("Players/1")
	check(player != null, "player spawned")

	# The party must land inside the landing cell, not in the void beside it.
	check(DungeonGenerator.section_at(dungeon.layout, player.global_position) == SectionLibrary.START,
		"party spawns in the landing section")

	# ---- muzzle + aiming -------------------------------------------------
	# The muzzle must sit at the buster, not at the body origin: that offset is
	# what makes shots visually leave the weapon.
	var muzzle_pos: Vector3 = player.muzzle_position()
	check(muzzle_pos.distance_to(player.global_position) > 0.5, "muzzle offset from body")
	check(muzzle_pos.y > player.global_position.y + 0.5, "muzzle at weapon height")

	# Aim must follow camera pitch. Pitch the camera down and the aim vector's
	# Y component has to drop with it — the old code ignored pitch entirely.
	player.look_pitch = 0.0
	player.pivot.rotation.x = 0.0
	await get_tree().physics_frame
	var flat_dir: Vector3 = (player.aim_point() - muzzle_pos).normalized()
	player.look_pitch = -0.7
	player.pivot.rotation.x = -0.7
	await get_tree().physics_frame
	var down_dir: Vector3 = (player.aim_point() - player.muzzle_position()).normalized()
	check(down_dir.y < flat_dir.y - 0.2, "aim direction follows camera pitch")

	# ---- charge tiers ----------------------------------------------------
	player.charge = 0.0
	check(player.charge_level() == 0, "charge tier 0")
	player.charge = 0.6
	check(player.charge_level() == 1, "charge tier 1")
	player.charge = 1.0
	check(player.charge_level() == 2, "charge tier 2")
	player.charge = 0.0

	# ---- projectiles -----------------------------------------------------
	dungeon.request_fire(1, 0, player.muzzle_position(), Vector3(0, 0, -1), 0)
	await get_tree().physics_frame
	check(dungeon.shots_root.get_child_count() > 0, "projectile spawned")
	var shot: Node = dungeon.shots_root.get_child(0)
	var start_z: float = shot.global_position.z
	await get_tree().physics_frame
	await get_tree().physics_frame
	check(not is_instance_valid(shot) or shot.global_position.z < start_z, "projectile travels")

	# A charged shot must hit harder than a tap.
	var weapon: Dictionary = player.WEAPONS[0]
	var tap_damage := float(weapon.damage) * float(player.CHARGE_DAMAGE[0])
	var full_damage := float(weapon.damage) * float(player.CHARGE_DAMAGE[2])
	check(full_damage > tap_damage * 3.0, "charged shot out-damages tap")

	# ---- generated loot --------------------------------------------------
	var cache: Node = _find_pickup(dungeon, "weapon")
	check(cache != null, "sector contains a weapon cache")
	if cache:
		dungeon.request_pickup(1, cache.name)
		check(player.weapon_index == 0, "distant pickup rejected")
		player.global_position = cache.global_position
		await get_tree().physics_frame
		dungeon.request_pickup(1, cache.name)
		check(player.weapon_index != 0, "pickup equips weapon in range")

	# ---- over-the-shoulder camera ---------------------------------------
	# A delta of 1.0 is larger than every blend rate, so one call lands the rig
	# on its target instead of needing the test to sit through the animation.
	player.aiming = false
	player._update_camera_rig(1.0)
	var hip_length: float = player.spring.spring_length
	var hip_fov: float = player.camera.fov
	var hip_offset: float = player.spring.position.x
	check(absf(hip_offset) > 0.3, "camera sits off the player's shoulder")
	check(hip_fov > 60.0, "hip-fire field of view is wide")

	player.aiming = true
	player._update_camera_rig(1.0)
	check(player.spring.spring_length < hip_length - 1.0, "aiming pulls the camera in")
	check(player.camera.fov < hip_fov * 0.7, "aiming zooms the field of view")
	# Offset over distance is the angle the body subtends from the crosshair.
	# Aiming has to grow it, or the Delver's own head covers the shot.
	var hip_angle := absf(hip_offset) / hip_length
	var aim_angle: float = absf(player.spring.position.x) / player.spring.spring_length
	check(aim_angle > hip_angle, "aiming clears the body out of the sight line (%.2f -> %.2f)" % [hip_angle, aim_angle])

	# R3 mirrors the rig to the other shoulder.
	var aimed_offset: float = player.spring.position.x
	player.swap_shoulder()
	player._update_camera_rig(1.0)
	check(signf(player.spring.position.x) == -signf(aimed_offset), "shoulder swap mirrors the camera")
	player.swap_shoulder()
	player.aiming = false
	player._update_camera_rig(1.0)

	# ---- committed actions and input buffering ---------------------------
	_test_actions(player)
	await _test_sprint(dungeon, player)
	await _test_animator(dungeon, player)

	# ---- in-run menus ----------------------------------------------------
	# Opening each screen runs its refresh path, which is where the loadout,
	# inventory, status and controls lists are actually populated.
	var menus: Node = player.menus
	check(menus != null, "menu stack attached to the local player")
	menus.open_character()
	check(menus.is_open(), "loadout screen opens")
	check(player.input_locked, "an open menu locks player input")
	menus.close_top()
	check(not menus.is_open(), "loadout screen closes")
	check(not player.input_locked, "closing the menu hands control back")

	# The rebuilt stash + crafting screens: constructing and refreshing them is
	# what runs every tile, slot, and recipe row builder.
	var stash_screen: Control = preload("res://scripts/ui/StashMenu.gd").new()
	stash_screen.standalone_close = Callable()
	add_child(stash_screen)
	stash_screen.refresh()
	stash_screen._open_crafting()
	check(is_instance_valid(stash_screen._crafting_screen), "crafting bench opens from the stash screen")
	stash_screen._close_crafting()
	stash_screen.queue_free()
	await get_tree().process_frame

	menus.open_pause()
	menus.open_settings()
	check(menus.stack.size() == 2, "settings stacks on top of the pause menu")
	menus.close_top()
	check(menus.stack.size() == 1, "backing out of settings returns to pause")
	menus.close_all()
	check(not menus.is_open() and not get_tree().paused, "closing every screen resumes the run")

	# ---- consumables -----------------------------------------------------
	check(player.item_count(ItemDatabase.REPAIR_KIT) == 2, "deploys with the roster's kit")
	check(player.item_count(ItemDatabase.FRAG_CHARGE) == 2, "deploys with frag charges")

	player.current_health = 40.0
	dungeon.request_use_item(1, ItemDatabase.REPAIR_KIT, player.muzzle_position(), Vector3.FORWARD)
	check(is_equal_approx(player.current_health, 85.0), "repair kit heals (%.0f)" % player.current_health)
	check(player.item_count(ItemDatabase.REPAIR_KIT) == 1, "repair kit is spent")

	# Spamming the same item is rate limited by the host.
	dungeon.request_use_item(1, ItemDatabase.REPAIR_KIT, player.muzzle_position(), Vector3.FORWARD)
	check(player.item_count(ItemDatabase.REPAIR_KIT) == 1, "repair kit respects its cooldown")

	player.current_stamina = 0.0
	dungeon.request_use_item(1, ItemDatabase.OVERCLOCK_CELL, player.muzzle_position(), Vector3.FORWARD)
	check(player.stamina_boosted(), "overclock cell grants the stamina buff")
	check(player.item_count(ItemDatabase.OVERCLOCK_CELL) == 0, "overclock cell is spent")
	player._spend_stamina(90.0)
	player._tick_stamina(0.05)
	check(is_equal_approx(player.current_stamina, player.max_stamina), "overclock keeps stamina pinned full")
	check(player._can_spend(999.0), "overclock makes every action affordable")
	player.stamina_boost = 0.0

	# A thrown charge leaves the inventory and puts a live grenade in the world.
	var frags_before: int = player.item_count(ItemDatabase.FRAG_CHARGE)
	dungeon.request_use_item(1, ItemDatabase.FRAG_CHARGE, player.muzzle_position(), Vector3.FORWARD)
	await get_tree().physics_frame
	check(player.item_count(ItemDatabase.FRAG_CHARGE) == frags_before - 1, "frag charge is spent")
	var thrown := false
	for child in dungeon.shots_root.get_children():
		if child.name.begins_with("Grenade_"):
			thrown = true
			child.queue_free()   # don't let it drift into a later assertion
	check(thrown, "throwing a frag spawns a grenade")

	# ---- currency and chests --------------------------------------------
	check(player.run_credits == 0, "run starts with no credits")
	var shard: Node = _find_pickup(dungeon, "currency")
	check(shard != null, "sector contains credit shards")
	if shard:
		player.global_position = shard.global_position
		await get_tree().physics_frame
		dungeon.request_pickup(1, shard.name)
		check(player.run_credits == 45, "credit shard adds to the run total (%d)" % player.run_credits)
		check(not shard.visible, "looted shard is removed from the sector")
		dungeon.request_pickup(1, shard.name)
		check(player.run_credits == 45, "a shard cannot be looted twice")

	var chest: Node = _find_pickup(dungeon, "chest")
	check(chest != null, "sector contains a salvage cache")
	if chest:
		var credits_before_chest: int = player.run_credits
		player.global_position = chest.global_position
		await get_tree().physics_frame
		dungeon.request_pickup(1, chest.name)
		check(chest.opened, "chest opens")
		check(player.run_credits > credits_before_chest, "chest pays credits")
		check(player.run_parts > 0, "chest yields salvage parts (%d)" % player.run_parts)
		dungeon.request_pickup(1, chest.name)
		check(chest.opened, "a chest cannot be looted twice")

	# ---- traps -----------------------------------------------------------
	check(dungeon.layout["traps"].size() > 0, "sector places hazards")
	check(dungeon.traps_root.get_child_count() == dungeon.layout["traps"].size(),
		"every generated hazard is built")
	await _test_trap_damage(dungeon, player)

	# ---- enemy variants and wall turrets ---------------------------------
	check(dungeon.layout["turrets"].size() > 0, "sector mounts wall turrets")
	var turret: Node = null
	for enemy in dungeon.enemies_root.get_children():
		if enemy.name.begins_with("Turret"):
			turret = enemy
	check(turret != null, "turrets are built as enemies")
	check(dungeon.enemies_remaining == dungeon.layout["enemies"].size() + dungeon.layout["turrets"].size(),
		"turrets count toward the purge objective")

	var maverick: Node = dungeon.enemies_root.get_child(0)
	check(maverick.VARIANTS.has(str(maverick.get("variant"))), "maverick carries a variant")
	maverick.apply_slow(2.0, 0.5)
	check(maverick.slow_timer > 0.0, "cryo slow lands on a maverick")

	# A destroyed turret always sheds its cryo module as a world drop.
	var drops_before := _count_drops(dungeon)
	var remaining_before_turret: int = dungeon.enemies_remaining
	turret.take_damage(1000.0)
	await get_tree().physics_frame
	check(_count_drops(dungeon) > drops_before, "a destroyed turret drops its component")
	check(dungeon.enemies_remaining == remaining_before_turret - 1, "a turret kill advances the purge")

	# ---- dropping items for the party ------------------------------------
	var repair_held: int = player.item_count(ItemDatabase.REPAIR_KIT)
	check(repair_held > 0, "player still holds a repair kit to drop")
	player.drop_item(ItemDatabase.REPAIR_KIT)
	await get_tree().physics_frame
	check(player.item_count(ItemDatabase.REPAIR_KIT) == repair_held - 1, "dropping debits the backpack")
	var dropped: Node = null
	for pickup in dungeon.pickups_root.get_children():
		if pickup.name.begins_with("Drop") and str(pickup.get("item_id")) == ItemDatabase.REPAIR_KIT:
			dropped = pickup
	check(dropped != null, "a dropped item lands as a world pickup")
	if dropped:
		player.global_position = dropped.global_position
		await get_tree().physics_frame
		dungeon.request_pickup(1, dropped.name)
		check(player.item_count(ItemDatabase.REPAIR_KIT) == repair_held, "a dropped item can be reclaimed")

	# ---- backpack slot limit ---------------------------------------------
	var real_capacity: int = dungeon.backpack_by_peer[1]
	var stacks := 0
	for item_id in dungeon.inventories[1]:
		if int(dungeon.inventories[1][item_id]) > 0 and ItemDatabase.uses_backpack(str(item_id)):
			stacks += 1
	dungeon.backpack_by_peer[1] = stacks
	check(not dungeon._can_accept(1, ItemDatabase.SCRAP_ALLOY), "a full backpack refuses a new stack")
	check(dungeon._can_accept(1, ItemDatabase.REPAIR_KIT), "a held stack still accepts more")
	dungeon.backpack_by_peer[1] = real_capacity

	# ---- grenade blast ---------------------------------------------------
	var victim: Node = dungeon.enemies_root.get_child(0)
	var credits_before: int = player.run_credits
	dungeon.spawn_grenade(9001, victim.global_position + Vector3.UP, Vector3.ZERO)
	var live: Node = dungeon.shots_root.get_node_or_null("Grenade_9001")
	check(live != null, "grenade spawned for the blast test")
	if live:
		live.fuse = 0.01
	var remaining_before: int = dungeon.enemies_remaining
	for frame in 4:
		await get_tree().physics_frame
	check(not is_instance_valid(victim), "grenade blast destroys a maverick")
	check(dungeon.enemies_remaining == remaining_before - 1, "the kill counts against the objective")
	check(player.run_credits > credits_before, "a kill pays the party (%d -> %d)" % [credits_before, player.run_credits])

	# ---- boss wakes only after the sector is cleared ---------------------
	check(not dungeon.boss_active, "boss dormant while mavericks live")
	for enemy in dungeon.enemies_root.get_children():
		if enemy.has_method("take_damage"):
			enemy.take_damage(1000.0)
		await get_tree().physics_frame
	await get_tree().create_timer(0.3).timeout
	check(dungeon.boss_active, "boss spawned after clear")
	check(not dungeon.completed, "run not completed at boss spawn")

	var boss: Node = dungeon.boss
	check(boss != null, "boss instance exists")
	if boss:
		check(boss.weak_points.size() >= 3, "boss has weak points")
		# The guardian wakes in the deepest node, not back at the landing.
		check(DungeonGenerator.section_at(dungeon.layout, boss.global_position) == SectionLibrary.CORE,
			"boss wakes in the core section")

		# ---- the enlarged arena and its shutter gates --------------------
		var ext_cells := 0
		for coord in dungeon.layout["cells"]:
			if str(dungeon.layout["cells"][coord]["kind"]) == SectionLibrary.CORE_EXT:
				ext_cells += 1
		check(ext_cells >= 1, "arena annexes at least one extra cell (%d)" % ext_cells)
		check(maxf(boss.arena_extent.x, boss.arena_extent.z) > 20.0,
			"guardian roams the enlarged arena (%.0f x %.0f)" % [boss.arena_extent.x, boss.arena_extent.z])
		var gates := 0
		for child in dungeon.get_children():
			if child.name.ends_with("_Gate"):
				gates += 1
		check(gates >= 1, "every arena doorway wears a boss gate (%d)" % gates)

		# ---- weak points take multiplied damage --------------------------
		var armored_before: float = boss.health
		boss.take_damage(100.0, false)
		var armored_loss: float = armored_before - boss.health
		var weak_before: float = boss.health
		boss.take_damage(100.0, true)
		var weak_loss: float = weak_before - boss.health
		check(weak_loss > armored_loss * 2.0, "weak point beats armour (%.1f vs %.1f)" % [weak_loss, armored_loss])

		# Later phases must expose additional vents.
		var open_phase_one := 0
		for area in boss.weak_points:
			if int(area.get_meta("from_phase")) == 1:
				open_phase_one += 1
		check(open_phase_one >= 2, "phase 1 vents exposed")

		boss.take_damage(boss.max_health * 0.5, true)
		await get_tree().physics_frame
		check(boss.phase >= 2, "boss advances phase as health drops")

		# The boss must actually shoot back, and its fire must be hostile (i.e.
		# aimed at players) rather than reusing the player's friendly shots.
		boss.volley_timer = 0.02
		var hostile_seen := false
		for frame in 60:
			await get_tree().physics_frame
			for child in dungeon.shots_root.get_children():
				if child.get("hostile") == true:
					hostile_seen = true
					break
			if hostile_seen:
				break
		check(hostile_seen, "boss fires hostile volleys")

	# ---- killing the boss completes the delve ----------------------------
	var carried_before_extract: int = player.run_credits
	var pack_before: Dictionary = player.inventory.duplicate()
	var parts_before: int = player.run_parts
	var stash_before := SaveManager.stash_count(ItemDatabase.REPAIR_KIT)
	var banked_parts_before := SaveManager.parts()
	var found_weapon := ItemDatabase.weapon_id_for_index(player.weapon_index)
	if boss:
		boss.take_damage(boss.max_health * 2.0, true)
	await get_tree().create_timer(0.4).timeout
	check(dungeon.completed, "boss death completes the delve")
	check(SaveManager.stash_count(ItemDatabase.DRAGON_CORE) >= 1,
		"the guardian pays a dragon core to the stash")
	check(player.weapon_index != 0 and SaveManager.stash_count(found_weapon) >= 1,
		"a buster found in the sector banks as stash gear")

	# ---- extraction banks the run into the profile -----------------------
	check(player.run_credits == 0, "extraction empties the run wallet")
	check(SaveManager.credits() >= carried_before_extract + dungeon.EXTRACTION_BONUS,
		"credits banked to the profile (%d)" % SaveManager.credits())
	check(int(SaveManager.profile.get("delves_completed", 0)) == 1, "extraction recorded on the profile")
	check(SaveManager.stash_count(ItemDatabase.REPAIR_KIT) == stash_before + int(pack_before.get(ItemDatabase.REPAIR_KIT, 0)),
		"surviving consumables go to the stash")
	check(SaveManager.parts() == banked_parts_before + parts_before, "salvage parts bank on extraction")
	check(player.run_parts == 0, "extraction empties the parts wallet")

	var banked: int = SaveManager.credits()
	SaveManager.load_profile()
	check(SaveManager.credits() == banked, "banked credits survive a reload")
	check(SaveManager.stash_count(ItemDatabase.REPAIR_KIT) > 0, "the stash survives a reload")

	# ---- settings and rebinds persist ------------------------------------
	SaveManager.set_setting("gameplay", "fov", 91.0)
	SaveManager.set_setting("audio", "sfx", 0.35)
	# Rebinding captures live input, so the event has to look like a real press.
	var rebound := InputEventKey.new()
	rebound.physical_keycode = KEY_J
	rebound.pressed = true
	check(InputSettings.rebind("jump", "kb", rebound), "jump accepts a keyboard rebind")
	check(InputMap.event_is_action(rebound, "jump"), "rebound key drives the action")

	SaveManager.load_profile()
	InputSettings.apply_all()
	check(is_equal_approx(float(SaveManager.get_setting("gameplay", "fov")), 91.0), "field of view persists")
	check(is_equal_approx(float(SaveManager.get_setting("audio", "sfx")), 0.35), "volume persists")
	check(InputMap.event_is_action(rebound, "jump"), "rebind persists across a reload")
	var old_key := InputEventKey.new()
	old_key.physical_keycode = KEY_SPACE
	check(not InputMap.event_is_action(old_key, "jump"), "rebinding replaces the old key")

	InputSettings.reset_bindings()
	check(InputMap.event_is_action(old_key, "jump"), "reset restores the default binding")
	check(not InputMap.event_is_action(rebound, "jump"), "reset drops the custom binding")

	DirAccess.remove_absolute(ProjectSettings.globalize_path(TEST_PROFILE))

	if failures.is_empty():
		print("NET_DELVER_SMOKE_TEST_OK")
	else:
		for failure in failures:
			printerr("FAIL: %s" % failure)
		printerr("NET_DELVER_SMOKE_TEST_FAILED (%d)" % failures.size())
	get_tree().quit(0 if failures.is_empty() else 1)

# --------------------------------------------------------------------------

## The generator is pure data, so it can be checked without a scene. These are
## the invariants the whole run rests on: same seed means the same sector on
## every peer, and every placed cell is reachable.
func _test_generator() -> void:
	var first := DungeonGenerator.generate(TEST_SEED)
	var second := DungeonGenerator.generate(TEST_SEED)
	check(first["cells"].size() == second["cells"].size(), "same seed places the same rooms")
	check(first["core"] == second["core"], "same seed picks the same core")
	check(first["enemies"].size() == second["enemies"].size(), "same seed spawns the same enemies")
	var drift := false
	for index in first["enemies"].size():
		if not first["enemies"][index]["position"].is_equal_approx(second["enemies"][index]["position"]):
			drift = true
	check(not drift, "same seed places enemies at identical positions")
	var loot_drift := false
	for index in first["loot"].size():
		if str(first["loot"][index]["kind"]) != str(second["loot"][index]["kind"]):
			loot_drift = true
	check(not loot_drift, "same seed rolls identical loot")
	var variant_drift := false
	for index in first["enemies"].size():
		if str(first["enemies"][index].get("variant", "")) != str(second["enemies"][index].get("variant", "")):
			variant_drift = true
	check(not variant_drift, "same seed rolls identical enemy variants")
	check(first["turrets"].size() == second["turrets"].size(), "same seed mounts the same wall turrets")

	# The arena annex must never break the one-door contract: an ext cell's
	# only occupied neighbours are other arena cells.
	var annex_leak := false
	for coord in first["cells"]:
		if str(first["cells"][coord]["kind"]) != SectionLibrary.CORE_EXT:
			continue
		for direction in DungeonGenerator.DIRECTIONS:
			var neighbour: Vector2i = coord + direction
			if first["cells"].has(neighbour) \
					and not SectionLibrary.is_arena_kind(str(first["cells"][neighbour]["kind"])):
				annex_leak = true
	check(not annex_leak, "annexed arena cells touch only the arena")

	var other := DungeonGenerator.generate(TEST_SEED + 1)
	check(other["cells"].size() != first["cells"].size()
			or other["core"] != first["core"]
			or other["enemies"].size() != first["enemies"].size(),
		"a different seed builds a different sector")

	check(DungeonGenerator.fully_connected(first), "every room is reachable from the landing")
	check(first["cells"].size() >= DungeonGenerator.MIN_ROOMS, "sector meets the minimum room count")
	check(str(first["cells"][first["start"]]["kind"]) == SectionLibrary.START, "landing is the start section")
	check(str(first["cells"][first["core"]]["kind"]) == SectionLibrary.CORE, "deepest room becomes the core")
	check(int(first["depths"][first["core"]]) >= DungeonGenerator.MIN_CORE_DEPTH,
		"core is a real walk from the landing (%d)" % int(first["depths"][first["core"]]))

	var cores := 0
	var vaults := 0
	for coord in first["cells"]:
		var kind := str(first["cells"][coord]["kind"])
		cores += 1 if kind == SectionLibrary.CORE else 0
		vaults += 1 if kind == SectionLibrary.VAULT else 0
	check(cores == 1, "exactly one core")
	check(vaults >= 1, "every sector has an arms vault")

	# Doors are derived from adjacency; if that ever drifts, a room can be
	# walled off from a neighbour the generator placed next to it.
	var door_mismatch := false
	for coord in first["cells"]:
		var doors: Array = first["cells"][coord]["doors"]
		for direction in DungeonGenerator.DIRECTIONS:
			if first["cells"].has(coord + direction) != doors.has(direction):
				door_mismatch = true
	check(not door_mismatch, "doorways match cell adjacency")

	# Nothing may spawn where a wall is, or a Maverick starts inside geometry.
	var reach := SectionLibrary.CELL_SIZE * 0.5 - SectionLibrary.SPAWN_MARGIN
	var outside := false
	for entry in first["enemies"] + first["loot"]:
		var origin := DungeonGenerator.cell_origin(entry["cell"])
		var offset: Vector3 = entry["position"] - origin
		if absf(offset.x) > reach + 0.01 or absf(offset.z) > reach + 0.01:
			outside = true
	check(not outside, "spawns stay inside the walkable margin")

## The beacon wire format, checked without opening a socket.
func _test_lan_beacon() -> void:
	var payload := JSON.stringify({
		"protocol": LanDiscovery.PROTOCOL, "version": LanDiscovery.PROTOCOL_VERSION,
		"name": "Deck One", "players": 2, "max": 3, "port": NetworkManager.PORT,
	})
	var session := LanDiscovery.decode_beacon(payload, "192.168.1.44")
	check(not session.is_empty(), "beacon decodes")
	check(str(session.get("name", "")) == "Deck One", "beacon carries the host callsign")
	check(int(session.get("players", 0)) == 2, "beacon carries the party size")
	check(str(session.get("address", "")) == "192.168.1.44", "session address comes from the packet, not the payload")
	check(not LanDiscovery.is_full(session), "a 2/3 session is joinable")
	session["players"] = 3
	check(LanDiscovery.is_full(session), "a full session is not joinable")

	check(LanDiscovery.decode_beacon("not json at all", "10.0.0.1").is_empty(), "garbage is ignored")
	check(LanDiscovery.decode_beacon(JSON.stringify({"protocol": "other_game"}), "10.0.0.1").is_empty(),
		"another game's broadcast is ignored")
	check(LanDiscovery.decode_beacon(JSON.stringify({
			"protocol": LanDiscovery.PROTOCOL, "version": LanDiscovery.PROTOCOL_VERSION + 99,
		}), "10.0.0.1").is_empty(), "an incompatible build is ignored")

func _test_stash() -> void:
	check(SaveManager.stash().is_empty(), "a new profile has an empty stash")
	check(SaveManager.planned_kit() == SaveManager.STARTER_KIT, "an empty stash deploys the free starter kit")

	SaveManager.deposit_to_stash({ItemDatabase.REPAIR_KIT: 3}, 7)
	check(SaveManager.stash_count(ItemDatabase.REPAIR_KIT) == 3, "deposit lands in the stash")
	check(SaveManager.parts() == 7, "salvage parts bank")

	# A loadout can never exceed what is actually stored, however the request
	# was written to the file.
	SaveManager.set_deploy_count(ItemDatabase.REPAIR_KIT, 10)
	check(int(SaveManager.deploy_kit().get(ItemDatabase.REPAIR_KIT, 0)) == 3, "loadout clamps to the stash")
	check(SaveManager.planned_kit() == {ItemDatabase.REPAIR_KIT: 3}, "a loaded kit replaces the starter kit")

	SaveManager.commit_deploy()
	check(SaveManager.stash_count(ItemDatabase.REPAIR_KIT) == 0, "deploying spends stash stock")
	check(SaveManager.planned_kit() == SaveManager.STARTER_KIT, "an emptied stash falls back to the starter kit")

	# The fallback must not quietly drain stock the player never loaded out.
	SaveManager.deposit_to_stash({ItemDatabase.FRAG_CHARGE: 2}, 0)
	SaveManager.commit_deploy()
	check(SaveManager.stash_count(ItemDatabase.FRAG_CHARGE) == 2, "the free starter kit spends nothing")

	# Reset so the run's own banking assertions start from a known state.
	SaveManager.profile["stash"] = {}
	SaveManager.profile["parts"] = 0
	SaveManager.profile["deploy_kit"] = {}
	SaveManager.save_profile()

## The crafting bench and the gear loadout, exercised against a scratch
## profile before the deploy so none of it leaks into the run assertions.
func _test_bench() -> void:
	# Aggregation is what prices every equipped Delver, on the client and on
	# the host alike, so its arithmetic is asserted directly.
	var stats := ItemDatabase.aggregate_stats(
		{"head": "cryo_visor", "body": "cargo_harness", "legs": "servo_actuators"})
	check(int(stats["backpack"]) == 3, "cargo harness aggregates +3 slots")
	check(is_equal_approx(float(stats["speed"]), 0.15), "servo actuators aggregate +15%% speed")
	var mod: Dictionary = stats["weapon_mods"].get(0, {})
	check(is_equal_approx(float(mod.get("slow_time", 0.0)), 2.5), "cryo visor mods the standard buster")

	check(not SaveManager.can_craft("aegis_helm"), "an empty stash cannot craft")
	SaveManager.deposit_to_stash({ItemDatabase.SCRAP_ALLOY: 3, ItemDatabase.POWER_CELL: 1}, 2)
	check(SaveManager.can_craft("aegis_helm"), "components plus parts unlock a recipe")
	check(SaveManager.craft("aegis_helm"), "crafting succeeds when affordable")
	check(SaveManager.stash_count("aegis_helm") == 1, "crafted gear lands in the stash")
	check(SaveManager.stash_count(ItemDatabase.SCRAP_ALLOY) == 0, "crafting consumes components")
	check(SaveManager.parts() == 0, "crafting consumes salvage parts")

	check(SaveManager.equip("aegis_helm"), "crafted gear can be equipped")
	check(SaveManager.equipped("head") == "aegis_helm", "the helm occupies the head slot")
	check(SaveManager.stash_count("aegis_helm") == 0, "equipping moves gear out of the stash")
	check(is_equal_approx(float(SaveManager.equipment_stats().get("health", 0.0)), 25.0),
		"an equipped helm raises max integrity")

	check(SaveManager.backpack_capacity() == SaveManager.BASE_BACKPACK_SLOTS, "base backpack is six slots")
	SaveManager.deposit_to_stash({"cargo_harness": 1}, 0)
	SaveManager.equip("cargo_harness")
	check(SaveManager.backpack_capacity() == SaveManager.BASE_BACKPACK_SLOTS + 3,
		"a cargo harness widens the backpack")

	SaveManager.unequip("head")
	check(SaveManager.equipped("head").is_empty(), "unequipping empties the slot")
	check(SaveManager.stash_count("aegis_helm") == 1, "unequipped gear returns to the stash")

	check(SaveManager.equipped("buster") == ItemDatabase.BUSTER_STANDARD,
		"the buster slot defaults to the standard buster")
	SaveManager.deposit_to_stash({ItemDatabase.BUSTER_RAPID: 1}, 0)
	check(SaveManager.equip(ItemDatabase.BUSTER_RAPID), "a stashed weapon equips into the buster slot")
	check(SaveManager.equipped("buster") == ItemDatabase.BUSTER_RAPID, "the rapid buster is held")
	SaveManager.unequip("buster")
	check(SaveManager.equipped("buster") == ItemDatabase.BUSTER_STANDARD,
		"unequipping the buster falls back to standard")
	check(SaveManager.stash_count(ItemDatabase.BUSTER_RAPID) == 1, "the weapon returns to the stash")

	# Reset so the run's own banking assertions start from a known state.
	SaveManager.profile["stash"] = {}
	SaveManager.profile["parts"] = 0
	SaveManager.profile["deploy_kit"] = {}
	SaveManager.profile["equipment"] = {}
	SaveManager.save_profile()

## Built by hand rather than fished out of the layout: a laser that is always
## armed makes the damage assertion independent of what this seed rolled.
func _test_trap_damage(dungeon: Node, player: Node) -> void:
	var trap := Area3D.new()
	trap.set_script(preload("res://scripts/system/Trap.gd"))
	trap.kind = "laser"
	trap.period = 10.0
	trap.duty = 1.0
	trap.phase = 0.0
	trap.span = 8.0
	dungeon.traps_root.add_child(trap)
	trap.global_position = player.global_position
	dungeon.dungeon_time = 0.0

	player.current_health = player.max_health
	player.invulnerable = false
	await get_tree().physics_frame
	await get_tree().physics_frame
	check(trap.is_armed(), "a laser inside its duty window is armed")
	check(player.current_health < player.max_health,
		"an armed hazard damages a player standing in it (%.0f)" % player.current_health)

	# And the cycle really is a function of the clock, not of wall time.
	dungeon.dungeon_time = 0.0
	trap.duty = 0.0
	await get_tree().physics_frame
	check(not trap.is_armed(), "a laser outside its duty window is inert")
	var health_after: float = player.current_health
	await get_tree().physics_frame
	await get_tree().physics_frame
	check(is_equal_approx(player.current_health, health_after), "an inert hazard does no damage")

	trap.queue_free()
	player.current_health = player.max_health

## Sprint is a held state re-evaluated every tick, so each of its conditions is
## asserted separately — any one of them silently failing gives you either a
## sprint you cannot start or one you cannot stop.
func _test_sprint(dungeon: Node, player: Node) -> void:
	check(InputMap.has_action("sprint"), "sprint action is registered")

	# Settle on the floor first: sprinting requires ground contact, and the
	# harness has been teleporting this Delver around.
	player.global_position = dungeon.spawn_position_for(1)
	player.velocity = Vector3.ZERO
	for frame in 12:
		await get_tree().physics_frame
	check(player.is_on_floor(), "Delver is grounded for the sprint test")

	player._end_action()
	player.aiming = false
	player.current_stamina = player.max_stamina
	player.move_direction = -player.global_basis.z
	Input.action_press("sprint")

	player._read_sprint()
	check(player.sprinting, "sprint starts when running forward with stamina")

	player.aiming = true
	player._read_sprint()
	check(not player.sprinting, "raising the sight drops the sprint")
	player.aiming = false
	player._read_sprint()
	check(player.sprinting, "sprint resumes once the sight is lowered")

	player.move_direction = player.global_basis.x
	player._read_sprint()
	check(not player.sprinting, "sprinting sideways is not allowed")
	player.move_direction = -player.global_basis.z
	player._read_sprint()

	# Draining is what prices it. No regen while the bar is being spent.
	var before: float = player.current_stamina
	player._tick_stamina(0.5)
	check(player.current_stamina < before, "sprinting drains stamina (%.1f -> %.1f)"
		% [before, player.current_stamina])

	player.sprinting = false
	player.current_stamina = 2.0
	player._read_sprint()
	check(not player.sprinting, "an empty bar cannot start a sprint")

	player.current_stamina = player.max_stamina
	player._read_sprint()
	Input.action_release("sprint")
	player._read_sprint()
	check(not player.sprinting, "releasing the button stops the sprint")

	# The animator has to commit to the run direction while sprinting, or a
	# sprint reads as nothing more than the same run played faster.
	player.sprinting = true
	player.aim_blend = 1.0
	check(is_zero_approx(player.animator.stance()), "a sprint overrides the aim stance")
	player.aim_blend = 0.0
	player.sprinting = false
	player.current_stamina = player.max_stamina

## The animation graph fails SILENTLY when it is wrong: a mistyped parameter
## path, an unbuilt tree, or a rejected transition all leave the game running
## perfectly while the character never moves a limb. So every one of those is
## asserted rather than eyeballed.
func _test_animator(dungeon: Node, player: Node) -> void:
	var anim: Node = player.animator
	check(anim != null, "animator attached to the player")
	if not anim:
		return
	check(anim._tree != null and anim._tree.active, "animation tree is active")
	check(anim._player != null, "animation player built")
	check(anim._playback != null, "state machine playback resolved")

	# `tree.get()` returns null for a path that does not exist, which is the
	# only signal Godot gives that a parameter name is wrong.
	check(anim._tree.get(DelverAnimGraph.PARAM_BLEND) != null,
		"blend-space parameter path resolves (%s)" % DelverAnimGraph.PARAM_BLEND)
	check(anim._tree.get(DelverAnimGraph.PARAM_TIME_SCALE) != null,
		"time-scale parameter path resolves (%s)" % DelverAnimGraph.PARAM_TIME_SCALE)
	check(anim.current_state() in DelverAnimGraph.STATES,
		"reports a state the graph actually contains (%s)" % anim.current_state())

	# Drive the controller and check the animator follows. Asserting the state
	# at spawn would only be asserting how far the Delver had fallen by then.
	player._end_action()
	player._begin_action("roll")
	await get_tree().physics_frame
	await get_tree().physics_frame
	check(anim.current_state() == DelverAnimGraph.ROLL, "a roll drives the roll state")
	player._end_action()
	player._begin_action("roll_heavy")
	await get_tree().physics_frame
	await get_tree().physics_frame
	check(anim.current_state() == DelverAnimGraph.ROLL_HEAVY,
		"a heavy roll drives its own state, not the light one")
	player._end_action()
	await get_tree().physics_frame
	await get_tree().physics_frame
	check(anim.current_state() != DelverAnimGraph.ROLL_HEAVY, "the roll state ends with the action")

	# Every clip the graph names has to exist in the library, or the state
	# silently plays nothing.
	for clip in ["idle", "run_fwd", "run_back", "strafe_left", "strafe_right",
			"jump", "fall", "land", "roll", "roll_heavy", "air_dash"]:
		check(anim._player.has_animation(clip), "animation library contains '%s'" % clip)

	# The anti-drift guarantee: a committed action's clip must be exactly as
	# long as the gameplay window that grants its i-frames.
	for id in ActionTable.ACTIONS:
		var entry: Dictionary = ActionTable.ACTIONS[id]
		var clip_name := str(entry.get("anim", ""))
		if clip_name.is_empty() or not anim._player.has_animation(clip_name):
			continue
		var clip: Animation = anim._player.get_animation(clip_name)
		check(absf(clip.length - float(entry["total"])) < 0.02,
			"%s: clip is %.3fs, gameplay says %.3fs" % [id, clip.length, float(entry["total"])])

	# Measured displacement, not intended velocity: a Delver shoved against a
	# wall has full velocity and covers no ground, and the legs must stop.
	anim.planar_velocity = Vector3.ZERO
	anim._raw_planar = Vector3.ZERO
	check(is_zero_approx(anim.planar_speed()), "a still Delver reports no speed")

	# A teleport must not spike the derived speed — the harness itself moves the
	# player across the sector several times, and the respawn path does too.
	var origin: Vector3 = player.global_position
	player.global_position = origin + Vector3(60.0, 0.0, 0.0)
	await get_tree().physics_frame
	await get_tree().physics_frame
	check(anim.planar_speed() < player.move_speed * 2.0,
		"a teleport is rejected rather than read as speed (%.1f m/s)" % anim.planar_speed())
	player.global_position = origin
	await get_tree().physics_frame

	# The reason the animator is its own node: a remote Delver's controller runs
	# no physics at all, so an animator living inside it would never tick.
	var remote: Node = preload("res://scenes/Player.tscn").instantiate()
	remote.name = "2"
	dungeon.players_root.add_child(remote)
	remote.global_position = player.global_position + Vector3(4.0, 0.0, 0.0)
	await get_tree().physics_frame
	check(not remote.is_multiplayer_authority(), "the second Delver is a remote peer")
	check(remote.animator != null and remote.animator._tree != null,
		"a remote Delver still builds its animation tree")
	var before: Vector3 = remote.global_position
	for step in 6:
		remote.global_position = before + Vector3(0.06 * float(step + 1), 0.0, 0.0)
		await get_tree().physics_frame
	check(remote.animator.planar_speed() > 0.5,
		"a remote Delver's animator derives speed from replicated movement (%.2f m/s)"
			% remote.animator.planar_speed())
	dungeon.players_root.remove_child(remote)
	remote.queue_free()

## A dodge is a commitment: i-frames open after a startup gap, close before the
## animation ends, and the exposed tail can be cancelled. Every one of those
## numbers comes from ActionTable, so this is really asserting that the table
## and the controller agree.
func _test_actions(player: Node) -> void:
	player._end_action()
	player._begin_action("roll")
	check(player.rolling, "a roll begins a committed action")
	check(not player.invulnerable, "i-frames do not open instantly (startup gap)")

	player._tick_action(0.15)
	check(player.invulnerable, "i-frames open during the roll")
	check(not player.can_act(), "input is suppressed before the cancel window")

	player._tick_action(0.25)          # t = 0.40, past the 0.34 i-frame end
	check(not player.invulnerable, "i-frames close before the roll does")
	check(player.can_act(), "the roll's recovery tail can be cancelled")

	player._tick_action(0.10)          # t = 0.50, past the 0.46 total
	check(player.action.is_empty(), "the roll ends on schedule")
	check(not player.rolling, "rolling clears with the action")

	# Heavy frames commit for longer — the equip-load cost the weight system
	# already charges in movement speed, applied to the dodge as well.
	check(ActionTable.roll_for_load(0.9) == "roll_heavy", "a heavy load selects the heavy roll")
	check(ActionTable.total("roll_heavy") > ActionTable.total("roll"), "the heavy roll commits longer")
	for id in ActionTable.ACTIONS:
		var entry: Dictionary = ActionTable.ACTIONS[id]
		var window: Vector2 = entry["iframes"]
		check(window.y <= float(entry["total"]), "%s: i-frames end inside the action" % id)
		check(float(entry["cancel_from"]) <= float(entry["total"]), "%s: cancel window opens before the end" % id)

	# The buffer is the reason a press made mid-roll is honoured rather than
	# thrown away, which is the whole point of the refactor.
	var pad := InputBuffer.new()
	pad.press(&"jump")
	pad.poll(0.05)
	check(pad.peek(&"jump"), "a press survives across ticks")
	check(pad.consume(&"jump"), "a buffered press can be spent")
	check(not pad.peek(&"jump"), "spending a press clears it")
	check(not pad.consume(&"jump"), "a spent press cannot be spent twice")

	pad.press(&"roll")
	pad.poll(0.30)                     # the roll window is 0.18
	check(not pad.peek(&"roll"), "a stale press expires instead of firing late")

	pad.press(&"use_heal")
	pad.clear()
	check(not pad.peek(&"use_heal"), "clear drops everything pending")

func _count_drops(dungeon: Node) -> int:
	var count := 0
	for pickup in dungeon.pickups_root.get_children():
		if pickup.name.begins_with("Drop"):
			count += 1
	return count

func _find_pickup(dungeon: Node, kind: String) -> Node:
	for pickup in dungeon.pickups_root.get_children():
		if pickup.has_method("pickup_kind") and str(pickup.pickup_kind()) == kind:
			return pickup
	return null
