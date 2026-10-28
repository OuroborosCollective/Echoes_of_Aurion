extends Node3D
## Presentation-only 3D markers, NOT downloaded GLB geometry or canonical state.
var revision := ""
static func _digest(v: Variant) -> bool:
	if typeof(v) != TYPE_STRING or v.length() != 64:
		return false
	var pattern := RegEx.new()
	pattern.compile("^[a-f0-9]{64}$")
	return pattern.search(v) != null
static func _canonical(v: Variant) -> bool:
	if typeof(v) != TYPE_STRING or v.length() < 3 or v.length() > 96:
		return false
	var pattern := RegEx.new()
	pattern.compile("^[a-z][a-z0-9._:-]{2,95}$")
	return pattern.search(v) != null
static func _asset(v: Variant) -> bool:
	if typeof(v) != TYPE_STRING or v.length() < 8 or v.length() > 95:
		return false
	var pattern := RegEx.new()
	pattern.compile("^glb_[a-z0-9._:-]{4,91}$")
	return pattern.search(v) != null
static func _integer(v: Variant, low: int, high: int) -> bool:
	return typeof(v) in [TYPE_INT, TYPE_FLOAT] and is_finite(float(v)) and float(v) == floor(float(v)) and v >= low and v <= high
static func validate_readback(value: Variant) -> bool:
	if typeof(value) != TYPE_DICTIONARY or value.size() != 3:
		return false
	if value.get("schemaVersion") != "aurion.world-design.v1" or not _digest(value.get("revision")):
		return false
	var designs: Variant = value.get("designs")
	if typeof(designs) != TYPE_ARRAY or designs.size() > 64:
		return false
	var keys := {}
	for design in designs:
		if typeof(design) != TYPE_DICTIONARY or design.size() != 6:
			return false
		if not _canonical(design.get("designKey")) or not _integer(design.get("version"), 1, 1000000) or not _digest(design.get("designHash")) or not _digest(design.get("expectedCatalogRevision")):
			return false
		if typeof(design.get("title")) != TYPE_STRING or design.title.length() > 160:
			return false
		var placements: Variant = design.get("placements")
		if typeof(placements) != TYPE_ARRAY or placements.size() > 256:
			return false
		for p in placements:
			if typeof(p) != TYPE_DICTIONARY or p.size() != 8:
				return false
			if not _canonical(p.get("placementKey")) or not _asset(p.get("assetId")):
				return false
			if not _integer(p.get("chunkX"), -100000, 100000) or not _integer(p.get("chunkZ"), -100000, 100000):
				return false
			if not _integer(p.get("xMm"), 0, 63999) or not _integer(p.get("zMm"), 0, 63999):
				return false
			if not _integer(p.get("rotationQuarterTurns"), 0, 3) or not _integer(p.get("scalePermille"), 250, 4000):
				return false
			var key := str(design.designKey) + ":" + str(p.placementKey)
			if keys.has(key):
				return false
			keys[key] = true
	return true
func clear() -> void:
	revision = ""
	for n in get_children():
		remove_child(n)
		n.queue_free()
func apply_confirmed(value: Variant) -> bool:
	if not validate_readback(value):
		clear()
		return false
	if revision == value.revision:
		return true
	clear()
	for design in value.designs:
		for placement in design.placements:
			var marker := MeshInstance3D.new()
			marker.name = "ConfirmedProxy_" + str(placement.placementKey).replace(".", "_")
			marker.mesh = BoxMesh.new()
			marker.position = Vector3(float(placement.chunkX) * 64.0 + float(placement.xMm) / 1000.0, 0.75, float(placement.chunkZ) * 64.0 + float(placement.zMm) / 1000.0)
			marker.rotation.y = float(placement.rotationQuarterTurns) * PI / 2.0
			marker.set_meta("aurion_confirmed_design", str(design.designKey))
			marker.set_meta("aurion_confirmed_asset_id", str(placement.assetId))
			marker.set_meta("aurion_placeholder_not_glb", true)
			add_child(marker)
	revision = value.revision
	return true
