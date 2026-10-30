@tool
extends RefCounted
## Converts editor markers into an untrusted server-shaped draft; never writes
## to Aurion and never exports child scripts, materials or scene resources.
const Marker = preload("res://addons/aurion_world_bridge/world_marker.gd")
const State = preload("res://authoring/world_authoring_state.gd")
const MAX_LOCAL_METERS := 8192.0
const EPSILON := 0.0001

static func build(root: Node, design_key: String, version: int, title: String, catalog_revision: String) -> Dictionary:
	if root == null or not root.is_inside_tree():
		return {"error":"Keine geöffnete Szene."}
	var pending: Array[Node] = [root]
	var placements: Array = []
	var visited := 0
	while not pending.is_empty():
		var node: Node = pending.pop_back()
		visited += 1
		if visited > 100000:
			return {"error":"Die Szene ist für diesen Export zu groß."}
		if node.get_script() == Marker:
			var result := _placement(node)
			if result.has("error"):
				return result
			placements.append(result)
			if placements.size() > 256:
				return {"error":"Ein Entwurf darf höchstens 256 Platzierungen enthalten."}
		for child in node.get_children():
			pending.append(child)
	placements.sort_custom(func(a: Dictionary, b: Dictionary) -> bool: return str(a.placementKey) < str(b.placementKey))
	var draft := {"schemaVersion":"aurion.world-design.v1", "designKey":design_key, "version":version,
		"title":title, "expectedCatalogRevision":catalog_revision, "placements":placements}
	if not State._draft_valid(draft):
		return {"error":"Entwurf, Schlüssel, Asset-IDs oder Katalogrevision sind ungültig oder doppelt."}
	return {"draft":draft}

static func _placement(node: Node3D) -> Dictionary:
	var transform := node.global_transform
	var point := transform.origin
	if not point.is_finite() or absf(point.x) > MAX_LOCAL_METERS or absf(point.z) > MAX_LOCAL_METERS:
		return {"error":"Marker liegt außerhalb des präzisen Editorbereichs von ±8192 m."}
	var basis := transform.basis
	var scale := basis.get_scale()
	if not scale.is_finite() or basis.determinant() <= 0.0 or scale.x < 0.25 or scale.x > 4.0 or absf(scale.x - scale.y) > EPSILON or absf(scale.x - scale.z) > EPSILON:
		return {"error":"Marker benötigt eine positive, gleichmäßige Skalierung von 0,25 bis 4."}
	var axis_x := basis.x / scale.x
	var axis_y := basis.y / scale.y
	var axis_z := basis.z / scale.z
	if absf(axis_x.dot(axis_y)) > EPSILON or absf(axis_x.dot(axis_z)) > EPSILON or absf(axis_y.dot(axis_z)) > EPSILON:
		return {"error":"Geschertes Marker-Koordinatensystem kann nicht exportiert werden."}
	var unit := basis.orthonormalized()
	var angle := atan2(unit.z.x, unit.z.z)
	var turns := posmod(roundi(angle / (PI / 2.0)), 4)
	var expected := Basis(Vector3.UP, float(turns) * PI / 2.0)
	if not unit.x.is_equal_approx(expected.x) or not unit.y.is_equal_approx(expected.y) or not unit.z.is_equal_approx(expected.z):
		return {"error":"Marker darf nur in 90-Grad-Schritten um die Y-Achse gedreht sein."}
	var x_mm := roundi(point.x * 1000.0)
	var z_mm := roundi(point.z * 1000.0)
	var chunk_x := floori(float(x_mm + 32000) / 64000.0)
	var chunk_z := floori(float(z_mm + 32000) / 64000.0)
	return {"placementKey":node.placement_key, "assetId":node.asset_id,
		"chunkX":chunk_x, "chunkZ":chunk_z, "xMm":x_mm - chunk_x * 64000 + 32000,
		"zMm":z_mm - chunk_z * 64000 + 32000, "rotationQuarterTurns":turns,
		"scalePermille":roundi(scale.x * 1000.0)}
