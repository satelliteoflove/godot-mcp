extends SceneTree
## Headless check for #387: tilemap/gridmap used-cell reads are grouped by tile.
##   godot --headless --path <project> --script res://addons/godot_mcp/test/tilemap_grouped_cells_test.gd

var _n := 0
var _fail := 0
var _ran := false


func _check(label: String, got, want) -> void:
	_n += 1
	if got == want:
		print("ok %d - %s" % [_n, label])
	else:
		_fail += 1
		print("not ok %d - %s (got %s, want %s)" % [_n, label, got, want])


func _process(_delta: float) -> bool:
	if _ran:
		return false
	_ran = true
	print("===================== TILEMAP GROUPED CELLS TEST =====================")
	var cmds = load("res://addons/godot_mcp/commands/tilemap_commands.gd").new()

	var tileset := TileSet.new()
	var src := TileSetAtlasSource.new()
	var tex := PlaceholderTexture2D.new()
	tex.size = Vector2(64, 64)
	src.texture = tex
	src.texture_region_size = Vector2i(16, 16)
	src.create_tile(Vector2i(0, 0))
	src.create_tile(Vector2i(2, 0))
	tileset.add_source(src, 0)
	var layer := TileMapLayer.new()
	layer.tile_set = tileset
	root.add_child(layer)
	# 4x3 floor of tile (0,0) with two hazards (2,0) at (1,1) and (3,2).
	for y in 3:
		for x in 4:
			var is_hazard := (x == 1 and y == 1) or (x == 3 and y == 2)
			layer.set_cell(Vector2i(x, y), 0, Vector2i(2, 0) if is_hazard else Vector2i(0, 0))

	var res: Dictionary = cmds._group_cells_by_tile(layer, layer.get_used_cells())
	_check("count is the total cell count", res.get("count"), 12)
	var tiles: Array = res.get("tiles", [])
	_check("one group per distinct tile", tiles.size(), 2)
	var by_atlas := {}
	for t in tiles:
		by_atlas["%d,%d" % [t.atlas_coords.x, t.atlas_coords.y]] = t
	_check("floor group has 10 cells", by_atlas["0,0"].count, 10)
	_check("hazard group has 2 cells", by_atlas["2,0"].count, 2)
	_check("hazard cells are [x, y] pairs", by_atlas["2,0"].cells, [[1, 1], [3, 2]])
	_check("group carries source_id", by_atlas["2,0"].source_id, 0)
	_check("group carries alternative_tile", by_atlas["2,0"].alternative_tile, 0)
	_check("group cells sum to count", by_atlas["0,0"].cells.size() + by_atlas["2,0"].cells.size(), 12)

	var region: Array = []
	for c in layer.get_used_cells():
		if c.x >= 2 and c.y >= 1:
			region.append(c)
	var reg: Dictionary = cmds._group_cells_by_tile(layer, region)
	_check("region subset: count", reg.get("count"), 4)
	var reg_hazard := 0
	for t in reg.get("tiles", []):
		if t.atlas_coords.x == 2:
			reg_hazard = t.count
	_check("region subset: hazard inside region", reg_hazard, 1)

	var empty: Dictionary = cmds._group_cells_by_tile(layer, [])
	_check("empty: count 0 and no groups", empty.get("count") == 0 and (empty.get("tiles") as Array).is_empty(), true)

	print("1..%d" % _n)
	print("ALL PASS - %d checks" % _n if _fail == 0 else "FAILED - %d of %d" % [_fail, _n])
	quit(0 if _fail == 0 else 1)
	return true
