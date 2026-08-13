extends Node

# Sector inspection harness. Prints the generated layout as ASCII and renders a
# top-down orthographic view plus an eye-level shot, so wall/doorway placement
# can be checked by looking at it. Not part of the smoke test — run it with a
# renderer:
#
#   godot --path "<project>" res://tests/SectorShot.tscn
#
# Pass a seed with `--seed=N` to inspect a specific sector.

const GLYPHS := {
	SectionLibrary.START: "S", SectionLibrary.CORRIDOR: "|",
	SectionLibrary.ARENA: "A", SectionLibrary.JUNCTION: "+",
	SectionLibrary.GALLERY: "T", SectionLibrary.VAULT: "V",
	SectionLibrary.CORE: "X",
}

func _ready() -> void:
	SaveManager.use_profile("user://net_delver_sectorshot.cfg")
	var seed_value := 20260810
	for argument in OS.get_cmdline_user_args():
		if argument.begins_with("--seed="):
			seed_value = int(argument.trim_prefix("--seed="))

	_print_map(DungeonGenerator.generate(seed_value))

	GameManager.delve_seed = seed_value
	NetworkManager.players = {1: {"id": 1, "name": "Shot", "host": true, "kit": SaveManager.planned_kit()}}
	var dungeon := preload("res://scenes/Dungeon.tscn").instantiate()
	add_child(dungeon)
	await get_tree().process_frame
	var player: Node = dungeon.get_node("Players/1")
	player.set_physics_process(false)
	player.set_process(false)
	if player.hud:
		player.hud.visible = false

	await _snap("sector_eye")
	await _overhead(dungeon)
	get_tree().quit()

func _print_map(layout: Dictionary) -> void:
	var cells: Dictionary = layout["cells"]
	var low := Vector2i(9999, 9999)
	var high := Vector2i(-9999, -9999)
	for coord in cells:
		low = Vector2i(mini(low.x, coord.x), mini(low.y, coord.y))
		high = Vector2i(maxi(high.x, coord.x), maxi(high.y, coord.y))
	print("SEED %d  ROOMS %d  CORE DEPTH %d" % [
		layout["seed"], cells.size(), int(layout["depths"][layout["core"]])])
	for y in range(low.y, high.y + 1):
		var row := ""
		for x in range(low.x, high.x + 1):
			var coord := Vector2i(x, y)
			row += (" %s " % GLYPHS.get(str(cells[coord]["kind"]), "?")) if cells.has(coord) else "   "
		print(row)
	print("ENEMIES %d  LOOT %d  TRAPS %d  OBSTACLES %d" % [
		layout["enemies"].size(), layout["loot"].size(),
		layout["traps"].size(), layout["obstacles"].size()])

## Orthographic top-down, framed to the whole sector, so the shape of the layout
## and every doorway is visible in one image.
func _overhead(dungeon: Node) -> void:
	var cells: Dictionary = dungeon.layout["cells"]
	var low := Vector2i(9999, 9999)
	var high := Vector2i(-9999, -9999)
	for coord in cells:
		low = Vector2i(mini(low.x, coord.x), mini(low.y, coord.y))
		high = Vector2i(maxi(high.x, coord.x), maxi(high.y, coord.y))
	var centre := (DungeonGenerator.cell_origin(low) + DungeonGenerator.cell_origin(high)) * 0.5
	var extent := maxi(high.x - low.x, high.y - low.y) + 1

	var camera := Camera3D.new()
	camera.projection = Camera3D.PROJECTION_ORTHOGONAL
	camera.size = float(extent + 1) * SectionLibrary.CELL_SIZE
	camera.far = 400.0
	dungeon.add_child(camera)
	camera.global_position = centre + Vector3(0, 120, 0)
	camera.rotation_degrees = Vector3(-90, 0, 0)
	camera.current = true
	await _snap("sector_map")

func _snap(label: String) -> void:
	for frame in 8:
		await get_tree().process_frame
	await RenderingServer.frame_post_draw
	get_viewport().get_texture().get_image().save_png("user://%s.png" % label)
	print("SNAP %s" % label)
