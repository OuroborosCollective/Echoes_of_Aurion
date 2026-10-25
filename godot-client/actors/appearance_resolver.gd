extends RefCounted
## Pure presentation join: authenticated Aurion selection -> approved catalog
## entry -> byte-identical prepared Godot import. No selection or gameplay writes.

const CATALOG_VERSION := "aurion.glb-import.v1"
const PREPARED_VERSION := "aurion.godot-prepared-assets.v1"

static func _blocked(reason: String) -> Dictionary:
	return {"status": "blocked", "reason": reason}

static func _lower_hex(value: Variant, length: int) -> bool:
	if typeof(value) != TYPE_STRING or value.length() != length:
		return false
	for i in range(length):
		if not "0123456789abcdef".contains(value.substr(i, 1)):
			return false
	return true

func resolve_self(world: Variant, response: Variant, prepared: Variant) -> Dictionary:
	if world == null or not world.has_state():
		return _blocked("no_confirmed_self")
	var id: String = world.self_entity_id()
	var confirmed: Dictionary = world.current_state()
	var has_self := false
	for raw in confirmed.get("presences", []):
		if typeof(raw) == TYPE_DICTIONARY and raw.get("entityId") == id and typeof(raw.get("userId")) == TYPE_INT and raw.get("userId") > 0:
			has_self = true
			break
	if id.is_empty() or not has_self:
		return _blocked("no_confirmed_self")
	if typeof(response) != TYPE_DICTIONARY or response.get("version") != CATALOG_VERSION or not _lower_hex(response.get("revision"), 64) or typeof(response.get("entries")) != TYPE_ARRAY or response.entries.size() > 500:
		return _blocked("catalog_invalid")
	var selected: Variant = response.get("selected")
	if selected == null:
		return _blocked("selection_missing")
	if typeof(selected) != TYPE_DICTIONARY or response.get("immutable") != true or typeof(selected.get("assetId")) != TYPE_STRING:
		return _blocked("selection_not_admitted")
	var asset_id: String = selected.assetId
	if asset_id.is_empty() or asset_id.length() > 64:
		return _blocked("selection_not_admitted")
	var matching: Array = []
	for raw in response.entries:
		if typeof(raw) != TYPE_DICTIONARY:
			return _blocked("catalog_invalid")
		if raw.get("assetId") == asset_id:
			matching.append(raw)
	if matching.size() > 1:
		return _blocked("catalog_ambiguous")
	if matching.size() != 1:
		return _blocked("selection_not_admitted")
	var entry: Dictionary = matching[0]
	var sha: Variant = entry.get("sha256")
	if entry.get("purpose") != "player-public" or entry.get("assetType") != "character" or entry.get("targetKey") != null or not _lower_hex(sha, 64):
		return _blocked("selection_not_admitted")
	var url: String = "/api/assets/glb/" + sha + ".glb"
	if entry.get("storageUrl") != url or selected.get("storageUrl") != url:
		return _blocked("selection_not_admitted")
	if typeof(prepared) != TYPE_DICTIONARY or prepared.get("schemaVersion") != PREPARED_VERSION or prepared.get("outputMode") != "byte-exact-compatible-copy" or not _lower_hex(prepared.get("sourceRevision"), 40) or typeof(prepared.get("sources")) != TYPE_ARRAY or prepared.sources.size() > 128:
		return _blocked("prepared_manifest_invalid")
	var source_matches: Array = []
	for raw in prepared.sources:
		if typeof(raw) != TYPE_DICTIONARY:
			return _blocked("prepared_manifest_invalid")
		var expected_id: String = "glb_" + str(sha).substr(0, 48)
		if raw.get("role") == "character" and raw.get("sha256") == sha and raw.get("sourceSha256") == sha and raw.get("outputSha256") == sha and raw.get("assetId") == expected_id and raw.get("path") == "godot-client/assets/generated/" + expected_id + ".glb":
			source_matches.append(raw)
	if source_matches.size() != 1:
		return _blocked("prepared_model_missing")
	var source_asset_id: String = source_matches[0].assetId
	var path := "res://assets/generated/" + source_asset_id + ".glb"
	if not ResourceLoader.exists(path, "PackedScene"):
		return _blocked("prepared_model_missing")
	return {
		"status": "resolved",
		"entityId": id,
		"catalogAssetId": asset_id,
		"sourceAssetId": source_asset_id,
		"sha256": sha,
		"resourcePath": path,
	}
