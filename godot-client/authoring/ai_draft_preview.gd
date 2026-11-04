extends "res://world/world_design_projection.gd"
## Separate preview node. It cannot bind confirmed state, surfaces or receipts.
## Reuses the production GLB hash/parser/LOD/render budgets, never fabricates a
## WorldDesignReadback to persuade the confirmed projection to display a draft.
const DraftState = preload("res://authoring/world_authoring_state.gd")

func bind_confirmed(_design_value: Variant, _catalog_value: Variant, _connection_id: String) -> bool:
	return false

func accept_surface(_readback: Variant, _connection_id: String, _center_value: Vector2i) -> bool:
	return false

func stage(draft: Variant, assets: Dictionary, revision: String, connection: String) -> bool:
	clear()
	if not DraftState._draft_valid(draft) or draft.expectedCatalogRevision != revision or not connection.begins_with("zone_peer_"):
		return false
	var prepared: Array = []
	for p in draft.placements:
		var entry: Variant = assets.get(p.assetId)
		if typeof(entry) != TYPE_DICTIONARY or entry.get("assetType") != "arena" or entry.get("targetKey") != null or entry.get("purpose") not in ["world-environment", "world-nature"]:
			clear()
			return false
		var physical := _physical_assets(entry)
		if physical.is_empty():
			clear()
			return false
		var alternatives: Array = []
		for candidate in physical:
			_assets[candidate.sha256] = candidate
			alternatives.append(candidate.sha256)
		prepared.append({"designKey":draft.designKey,"placementKey":p.placementKey,"sha256":alternatives[0],"alternatives":alternatives,
			"chunk":Vector2i(int(p.chunkX),int(p.chunkZ)),"xMm":int(p.xMm),"zMm":int(p.zMm),
			"rotation":int(p.rotationQuarterTurns),"scale":int(p.scalePermille),"subcategory":entry.get("subcategory")})
	_connection = connection
	_placements = prepared
	_center = prepared[0].chunk
	_has_center = true
	position = Vector3(-float(_center.x * CHUNK_MM) / 1000.0, 0, -float(_center.y * CHUNK_MM) / 1000.0)
	_refresh()
	return true

func _desired() -> Array:
	var candidates: Array = _placements.filter(func(item: Dictionary): return item.chunk == _center)
	candidates.sort_custom(_placement_less)
	return candidates.slice(0, MAX_VISUALS)

func _placement_height(_item: Dictionary) -> float:
	return 0.0 # Explicit flat preview plane, never claimed as terrain elevation.

func _refresh() -> void:
	super._refresh()
	for holder in get_children():
		holder.set_meta("aurion_status", "PREVIEW_ONLY")
		for mesh in holder.find_children("*", "MeshInstance3D", true, false):
			var tint := StandardMaterial3D.new()
			tint.albedo_color = Color(0.15, 0.85, 0.95, 0.65)
			tint.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
			mesh.material_overlay = tint
	diagnostic = "PREVIEW_ONLY · %d/%d Modelle · flache Vorschau, keine Kollisionsbestätigung" % [get_child_count(), _placements.size()]
