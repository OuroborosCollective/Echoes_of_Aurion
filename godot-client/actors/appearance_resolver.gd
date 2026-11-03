extends RefCounted
## Pure presentation join: authenticated Aurion selection -> approved catalog
## entry -> byte-identical prepared Godot import. No selection or gameplay writes.

const CATALOG_VERSION := "aurion.glb-import.v1"
const PREPARED_VERSION := "aurion.godot-prepared-assets.v1"
const CatalogModels = preload("res://actors/catalog_model_cache.gd")

static func _blocked(reason: String) -> Dictionary:
	return {"status": "blocked", "reason": reason}

static func _lower_hex(value: Variant, length: int) -> bool:
	if typeof(value) != TYPE_STRING or value.length() != length:
		return false
	for i in range(length):
		if not "0123456789abcdef".contains(value.substr(i, 1)):
			return false
	return true

func resolve_self(world: Variant, response: Variant, prepared: Variant, cache: Variant = null) -> Dictionary:
	if world == null or not world.has_state():
		return _blocked("no_confirmed_self")
	var id: String = world.self_entity_id()
	var confirmed: Dictionary = world.current_state()
	var has_self := false
	for raw in confirmed.get("presences", []):
		# ZoneState has already validated the canonical v5 presence, including
		# its integer-valued userId regardless of Godot JSON int/float decoding.
		if typeof(raw) == TYPE_DICTIONARY and raw.get("entityId") == id:
			has_self = true
			break
	if id.is_empty() or not has_self:
		return _blocked("no_confirmed_self")
	if cache != null and not cache.admits(id):
		return _blocked("actor_capacity")
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
	var streamed: Dictionary = {}
	if cache != null and not CatalogModels.physical(entry).is_empty():
		streamed = cache.request(entry, id)
		if streamed.status == "resolved":
			return streamed
	if typeof(prepared) != TYPE_DICTIONARY or prepared.get("schemaVersion") != PREPARED_VERSION or prepared.get("outputMode") != "byte-exact-compatible-copy" or not _lower_hex(prepared.get("sourceRevision"), 40) or typeof(prepared.get("sources")) != TYPE_ARRAY or prepared.sources.size() > 128:
		return streamed if not streamed.is_empty() else _blocked("prepared_manifest_invalid")
	var source_matches: Array = []
	for raw in prepared.sources:
		if typeof(raw) != TYPE_DICTIONARY:
			return streamed if not streamed.is_empty() else _blocked("prepared_manifest_invalid")
		var expected_id: String = "glb_" + str(sha).substr(0, 48)
		if raw.get("role") == "character" and raw.get("sha256") == sha and raw.get("sourceSha256") == sha and raw.get("outputSha256") == sha and raw.get("assetId") == expected_id and raw.get("path") == "godot-client/assets/generated/" + expected_id + ".glb":
			source_matches.append(raw)
	if source_matches.size() != 1:
		return streamed if not streamed.is_empty() else _blocked("prepared_model_missing")
	var source_asset_id: String = source_matches[0].assetId
	var path := "res://assets/generated/" + source_asset_id + ".glb"
	if not ResourceLoader.exists(path, "PackedScene"):
		return streamed if not streamed.is_empty() else _blocked("prepared_model_missing")
	return {
		"status": "resolved",
		"entityId": id,
		"catalogAssetId": asset_id,
		"sourceAssetId": source_asset_id,
		"sha256": sha,
		"resourcePath": path,
		"normalization": entry.normalization if CatalogModels._normalization_valid(entry.get("normalization"),str(sha)) else {},
	}

## The server returns only active, public selections for requested user IDs.
## A second join against the independently confirmed v5 presence and prepared
## file hash prevents a catalog reply from inventing a world actor.
func resolve_public_presence(world: Variant, appearance: Variant, catalog: Variant, prepared: Variant, cache: Variant = null) -> Dictionary:
	if world == null or not world.has_state():
		return _blocked("no_confirmed_presence")
	if typeof(appearance) != TYPE_DICTIONARY or typeof(catalog) != TYPE_DICTIONARY:
		return _blocked("public_response_invalid")
	var raw_user: Variant = appearance.get("userId")
	if typeof(raw_user) not in [TYPE_INT, TYPE_FLOAT] or not is_finite(float(raw_user)) or float(raw_user) != floor(float(raw_user)) or raw_user < 1 or raw_user > 2147483647:
		return _blocked("public_response_invalid")
	var id := "player:" + str(int(raw_user))
	if id == world.self_entity_id():
		return _blocked("self_not_remote")
	var present := false
	for row in world.current_state().get("presences", []):
		if typeof(row) == TYPE_DICTIONARY and row.get("entityId") == id and int(row.get("userId", 0)) == int(raw_user):
			present = true
			break
	if not present:
		return _blocked("presence_absent")
	if cache != null and not cache.admits(id):
		return _blocked("actor_capacity")
	if catalog.get("version") != CATALOG_VERSION or not _lower_hex(catalog.get("revision"), 64) or typeof(catalog.get("entries")) != TYPE_ARRAY or catalog.entries.size() > 500:
		return _blocked("catalog_invalid")
	var asset_id: Variant = appearance.get("assetId")
	if typeof(asset_id) != TYPE_STRING or asset_id.is_empty() or asset_id.length() > 64:
		return _blocked("public_response_invalid")
	var matches: Array = []
	for item in catalog.entries:
		if typeof(item) != TYPE_DICTIONARY:
			return _blocked("catalog_invalid")
		if item.get("assetId") == asset_id:
			matches.append(item)
	if matches.size() != 1:
		return _blocked("catalog_ambiguous" if matches.size() > 1 else "public_asset_not_admitted")
	var entry: Dictionary = matches[0]
	var sha: Variant = entry.get("sha256")
	var url := "/api/assets/glb/" + str(sha) + ".glb"
	if not _lower_hex(sha, 64) or entry.get("purpose") != "player-public" or entry.get("assetType") != "character" or entry.get("targetKey") != null or entry.get("storageUrl") != url or appearance.get("storageUrl") != url:
		return _blocked("public_asset_not_admitted")
	var streamed: Dictionary = {}
	if cache != null and not CatalogModels.physical(entry).is_empty():
		streamed = cache.request(entry, id)
		if streamed.status == "resolved":
			return streamed
	if typeof(prepared) != TYPE_DICTIONARY or prepared.get("schemaVersion") != PREPARED_VERSION or prepared.get("outputMode") != "byte-exact-compatible-copy" or not _lower_hex(prepared.get("sourceRevision"), 40) or typeof(prepared.get("sources")) != TYPE_ARRAY or prepared.sources.size() > 128:
		return streamed if not streamed.is_empty() else _blocked("prepared_manifest_invalid")
	var matches_prepared: Array = []
	for source in prepared.sources:
		if typeof(source) != TYPE_DICTIONARY:
			return streamed if not streamed.is_empty() else _blocked("prepared_manifest_invalid")
		var source_id := "glb_" + str(sha).substr(0, 48)
		if source.get("role") == "character" and source.get("sha256") == sha and source.get("sourceSha256") == sha and source.get("outputSha256") == sha and source.get("assetId") == source_id and source.get("path") == "godot-client/assets/generated/" + source_id + ".glb":
			matches_prepared.append(source)
	if matches_prepared.size() != 1:
		return streamed if not streamed.is_empty() else _blocked("prepared_model_missing")
	var prepared_id: String = matches_prepared[0].assetId
	var path := "res://assets/generated/" + prepared_id + ".glb"
	if not ResourceLoader.exists(path, "PackedScene"):
		return streamed if not streamed.is_empty() else _blocked("prepared_model_missing")
	return {"status": "resolved", "entityId": id, "catalogAssetId": asset_id, "sourceAssetId": prepared_id, "sha256": sha, "resourcePath": path,"normalization":entry.normalization if CatalogModels._normalization_valid(entry.get("normalization"),str(sha)) else {}}

## Approved visual fallback selection never changes a mob's archetype or state.
## Stream catalog GLBs when available; a real prepared enemy may bridge loading.
func resolve_monster(world: Variant, mob: Variant, catalog: Variant, prepared: Variant, cache: Variant = null) -> Dictionary:
	if world == null or not world.has_state() or typeof(mob) != TYPE_DICTIONARY:
		return _blocked("monster_not_confirmed")
	if not world.current_state().get("mobs", []).has(mob):
		return _blocked("monster_not_confirmed")
	if typeof(catalog) != TYPE_DICTIONARY or catalog.get("version") != CATALOG_VERSION or not _lower_hex(catalog.get("revision"), 64) or typeof(catalog.get("entries")) != TYPE_ARRAY or catalog.entries.size() > 500:
		return _blocked("monster_catalog_invalid")
	if typeof(prepared) != TYPE_DICTIONARY or prepared.get("schemaVersion") != PREPARED_VERSION or prepared.get("outputMode") != "byte-exact-compatible-copy" or not _lower_hex(prepared.get("sourceRevision"), 40) or typeof(prepared.get("sources")) != TYPE_ARRAY or prepared.sources.size() > 128:
		return _blocked("prepared_manifest_invalid")
	for source in prepared.sources:
		if typeof(source) != TYPE_DICTIONARY:
			return _blocked("prepared_manifest_invalid")
	var entries: Array = []
	var ids: Dictionary = {}
	for entry in catalog.entries:
		if typeof(entry) != TYPE_DICTIONARY:
			return _blocked("monster_catalog_invalid")
		if entry.get("assetType") != "enemy" or entry.get("purpose") not in ["auto", "enemy-fallback"] or entry.get("targetKey") != null:
			continue
		var sha: Variant = entry.get("sha256")
		if not _lower_hex(sha, 64) or entry.get("storageUrl") != "/api/assets/glb/" + str(sha) + ".glb" or typeof(entry.get("assetId")) != TYPE_STRING or entry.assetId.length() < 8 or entry.assetId.length() > 64:
			return _blocked("monster_asset_invalid")
		if ids.has(entry.assetId):
			return _blocked("monster_asset_ambiguous")
		ids[entry.assetId] = true
		entries.append(entry)
	entries.sort_custom(func(a: Dictionary, b: Dictionary): return a.sha256 < b.sha256 if a.sha256 != b.sha256 else a.assetId < b.assetId)
	if cache != null and not cache.admits(str(mob.entityId)):
		return _blocked("actor_capacity")
	var candidates: Array = []
	for entry in entries:
		if not CatalogModels.physical(entry).is_empty():
			candidates.append(entry)
	var loading := false
	if cache != null and not candidates.is_empty():
		var index := _visual_index(str(mob.entityId), candidates.size())
		var streamed: Dictionary = cache.request(candidates[index], str(mob.entityId))
		if streamed.status == "resolved":
			return streamed
		loading = streamed.status == "pending"
	var local: Array = []
	for entry in entries:
		var sha: String = entry.sha256
		var source_id := "glb_" + sha.substr(0, 48)
		var matches: Array = []
		for source in prepared.sources:
			var mapping: Variant = source.get("canonicalMapping")
			if source.get("role") == "monster" and source.get("assetId") == source_id and source.get("sha256") == sha and source.get("sourceSha256") == sha and source.get("outputSha256") == sha and source.get("path") == "godot-client/assets/generated/" + source_id + ".glb" and typeof(mapping) == TYPE_DICTIONARY and mapping.get("kind") == "monster-source":
				matches.append(source)
		if matches.size() > 1:
			return _blocked("monster_source_ambiguous")
		if matches.size() != 1:
			continue
		var path := "res://assets/generated/" + source_id + ".glb"
		if not ResourceLoader.exists(path, "PackedScene"):
			continue
		local.append({"status":"resolved","entityId":mob.entityId,"catalogAssetId":entry.assetId,"sourceAssetId":source_id,"sha256":sha,"resourcePath":path,
			"fallback":matches[0].canonicalMapping.get("archetype") != mob.get("archetype"),"archetype":mob.archetype})
	if local.is_empty():
		return _blocked("actor_model_loading" if loading else "monster_model_missing")
	for candidate in local:
		if not candidate.fallback:
			return candidate
	return local[_visual_index(str(mob.entityId), local.size())]

static func _visual_index(identity: String, count: int) -> int:
	# Ordinal confirmed mobs walk the sorted catalog instead of collapsing into
	# one generic model. This is only a stable presentation choice.
	var suffix := identity.get_slice(":", identity.get_slice_count(":") - 1)
	if suffix.begins_with("mob_") and suffix.trim_prefix("mob_").is_valid_int():
		return maxi(0, int(suffix.trim_prefix("mob_")) - 1) % count
	var hash_value: int = 2166136261
	for i in range(identity.length()):
		hash_value = ((hash_value ^ identity.unicode_at(i)) * 16777619) & 0xffffffff
	return hash_value % count
