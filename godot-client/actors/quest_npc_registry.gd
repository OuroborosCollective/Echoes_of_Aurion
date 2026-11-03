extends RefCounted
## Static Aurion quest NPC readmodel only: no v5 presence or gameplay authority.
const STANDARD_SHA := "2f447361e6ba5e6e38d8b38c19b78773a0d62fcf80e771d34f3d94a0e64765cc"
const STANDARD_ASSET := "glb_2f447361e6ba5e6e38d8b38c19b78773a0d62fcf80e771d3"
const VERSION := "aurion.quest-npc-visuals.v1"
const PREPARED_VERSION := "aurion.godot-prepared-assets.v1"
const ModularVisual = preload("res://actors/modular_npc_visual.gd")
const CatalogModels = preload("res://actors/catalog_model_cache.gd")
const Clips = preload("res://actors/animation_clips.gd")
var diagnostic := "npc_not_loaded"
var contract_rejected := false
var _actors: Dictionary = {}
var _identities: Dictionary = {}

static func _hex(value: Variant, count: int) -> bool:
	if typeof(value) != TYPE_STRING or value.length() != count:
		return false
	for i in range(count):
		if not "0123456789abcdef".contains(value.substr(i, 1)):
			return false
	return true

static func _mm(value: Variant) -> bool:
	return typeof(value) in [TYPE_INT, TYPE_FLOAT] and is_finite(float(value)) and floor(float(value)) == float(value) and absf(float(value)) <= 2147483647.0

static func _npc_id(value: Variant) -> bool:
	if typeof(value) != TYPE_STRING or value.length() < 2 or value.length() > 64:
		return false
	var expr := RegEx.new()
	if expr.compile("^[a-z][a-z0-9_]{1,63}$") != OK:
		return false
	return expr.search(value) != null

static func _local_path(manifest: Variant, sha: String) -> String:
	if typeof(manifest) != TYPE_DICTIONARY or manifest.get("schemaVersion") != PREPARED_VERSION or manifest.get("outputMode") != "byte-exact-compatible-copy" or not _hex(manifest.get("sourceRevision"), 40) or typeof(manifest.get("sources")) != TYPE_ARRAY or manifest.sources.size() > 128:
		return ""
	var id := "glb_" + sha.substr(0, 48)
	var expected_path := "godot-client/assets/generated/" + id + ".glb"
	var matches := 0
	for raw in manifest.sources:
		if typeof(raw) != TYPE_DICTIONARY:
			return ""
		if raw.get("assetId") == id and raw.get("role") == "character" and raw.get("sha256") == sha and raw.get("sourceSha256") == sha and raw.get("outputSha256") == sha and raw.get("path") == expected_path:
			matches += 1
	if matches != 1:
		return ""
	var resource := "res://assets/generated/" + id + ".glb"
	return resource if ResourceLoader.exists(resource, "PackedScene") else ""

func clear(root: Node3D) -> void:
	for id in _actors.keys():
		var actor: Variant = _actors[id]
		if is_instance_valid(actor):
			actor.visible = false
			if actor.get_parent() == root:
				root.remove_child(actor)
			actor.queue_free()
	_actors.clear()
	_identities.clear()

func _reject(root: Node3D, reason: String) -> bool:
	clear(root)
	contract_rejected = true
	diagnostic = reason
	return false

func apply(root: Node3D, response: Variant, manifest: Variant, cache: Variant = null, catalog: Dictionary = {}) -> bool:
	contract_rejected = false
	if typeof(response) != TYPE_DICTIONARY or response.get("version") != VERSION or response.get("zoneId") != "observatory_threshold" or response.get("stateSource") != "aurion-canonical-quest-anchors" or not _hex(response.get("catalogRevision"), 64):
		return _reject(root, "npc_contract_invalid")
	var rows: Variant = response.get("npcs")
	if typeof(rows) != TYPE_ARRAY or rows.is_empty() or rows.size() > 32:
		return _reject(root, "npc_rows_invalid")
	var planned: Dictionary = {}
	var seen: Dictionary = {}
	var waiting := false
	for raw in rows:
		if typeof(raw) != TYPE_DICTIONARY or not _npc_id(raw.get("npcId")) or raw.get("entityId") != "npc:" + str(raw.get("npcId")) or typeof(raw.get("displayName")) != TYPE_STRING:
			return _reject(root, "npc_identity_invalid")
		var id: String = raw.entityId
		if seen.has(id):
			return _reject(root, "npc_duplicate_identity")
		seen[id] = true
		var coords: Variant = raw.get("position")
		var model: Variant = raw.get("model")
		if typeof(coords) != TYPE_DICTIONARY or not _mm(coords.get("x")) or not _mm(coords.get("z")) or typeof(model) != TYPE_DICTIONARY:
			return _reject(root, "npc_position_or_model_invalid")
		var sha: Variant = model.get("sha256")
		var catalog_asset_id: Variant = model.get("catalogAssetId")
		var source: Variant = model.get("source")
		if not _hex(sha, 64) or typeof(catalog_asset_id) != TYPE_STRING or catalog_asset_id.length() < 8 or catalog_asset_id.length() > 64:
			return _reject(root, "npc_asset_invalid")
		if source == "audited-standard":
			if sha != STANDARD_SHA or catalog_asset_id != STANDARD_ASSET:
				return _reject(root, "npc_standard_identity_invalid")
		elif source != "approved-assignment":
			return _reject(root, "npc_asset_source_invalid")
		if cache != null and not cache.admits(id):
			continue
		var local: String = _local_path(manifest, str(sha))
		var streamed: Dictionary = {}
		var selected: Dictionary = model
		var fallback: Variant = raw.get("fallbackModel")
		if source == "audited-standard" and fallback != null:
			if typeof(fallback) != TYPE_DICTIONARY or fallback.get("source") != "approved-fallback" or not _hex(fallback.get("sha256"), 64) or typeof(fallback.get("catalogAssetId")) != TYPE_STRING:
				return _reject(root, "npc_fallback_invalid")
			selected = fallback
		if cache != null and catalog.get("revision") == response.catalogRevision:
			var matches: Array = []
			for entry in catalog.get("entries", []):
				if typeof(entry) == TYPE_DICTIONARY and entry.get("assetId") == selected.catalogAssetId and entry.get("sha256") == selected.sha256 and entry.get("assetType") == "character" and entry.get("purpose") == "npc-fallback" and entry.get("targetKey") == (null if selected.get("source") == "approved-fallback" else "npc_" + str(raw.npcId)):
					matches.append(entry)
			if matches.size() > 1:
				return _reject(root, "npc_catalog_ambiguous")
			if matches.size() == 1:
				streamed = cache.request(matches[0], id, "Idle")
		var normalization: Dictionary = {}
		var packed: PackedScene
		if streamed.get("status") == "resolved":
			packed = streamed.packedScene
			local = streamed.resourcePath
			sha = streamed.sha256
			catalog_asset_id = streamed.catalogAssetId
			normalization = streamed.normalization
		elif local.is_empty():
			# A failed download must not erase all other confirmed quest anchors.
			# The shipped standard rig is already the server's audited fallback.
			local = _local_path(manifest, STANDARD_SHA)
			sha = STANDARD_SHA
			waiting = true
			if local.is_empty():
				continue
		var position := Vector3(float(coords.x) / 1000.0, 0.0, float(coords.z) / 1000.0)
		planned[id] = {"resource": local, "packedScene":packed,"normalization":normalization,"assetId": catalog_asset_id, "sha": sha,
			"npcId": raw.npcId, "position": position, "displayName": raw.displayName,
			"allowModular": source == "audited-standard" and packed == null,
			"identityBase": local + ":" + str(normalization.get("manifestSha256", "")) + ":" + str(source) + ":" + str(catalog_asset_id) + ":" + str(sha) + ":" + str(coords.x) + ":" + str(coords.z) + ":" + str(raw.displayName)}
	# Validate every server row before mounting optional content. One snapshot
	# suffices for identity; create() rechecks at each actual instantiation.
	var has_modular_candidate := false
	for item in planned.values():
		has_modular_candidate = has_modular_candidate or item.allowModular
	var modular_available: bool = ModularVisual.available() if has_modular_candidate else false
	for item in planned.values():
		item.identity = item.identityBase + ":" + str(item.allowModular and modular_available)
	var unchanged := _actors.size() == planned.size()
	if unchanged:
		for id in planned.keys():
			if not _actors.has(id) or not is_instance_valid(_actors[id]) or _identities.get(id) != planned[id].identity:
				unchanged = false
				break
	if unchanged:
		diagnostic = "NPC-GLB wird geladen; Standardmodell sichtbar" if waiting else ""
		return true
	clear(root)
	for id in planned.keys():
		var item: Dictionary = planned[id]
		var packed: PackedScene = item.packedScene if item.packedScene != null else load(item.resource) as PackedScene
		if packed == null:
			return _reject(root, "npc_packed_scene_missing")
		var modular: Node3D = ModularVisual.create(str(id), str(item.displayName)) if item.allowModular and modular_available else null
		# Optional vendor presentation must never erase canonical quest NPCs.
		# Try MCS in an isolated temporary host before installing the final actor.
		if modular != null:
			var probe := Node3D.new()
			probe.add_child(modular)
			root.add_child(probe)
			var valid_rig: bool = modular.has_method("is_character_valid") and bool(modular.call("is_character_valid"))
			var players := modular.find_children("*", "AnimationPlayer", true, false)
			var meshes := modular.find_children("*", "MeshInstance3D", true, false)
			valid_rig = valid_rig and players.size() == 1 and not meshes.is_empty()
			if valid_rig:
				var ap: AnimationPlayer = players[0]
				valid_rig = ap.has_animation("Idle") and bool(modular.call("play_animation", &"Idle", 0.0))
			root.remove_child(probe)
			probe.remove_child(modular)
			probe.free()
			if not valid_rig:
				modular.free()
				modular = null
		var model_instance: Variant = modular if modular != null else packed.instantiate()
		if not model_instance is Node3D:
			if is_instance_valid(model_instance):
				model_instance.free()
			return _reject(root, "npc_model_not_3d")
		var actor := Node3D.new()
		actor.name = "QuestNPC_" + str(item.npcId)
		actor.position = item.position
		actor.set_meta("aurion_entity_id", id)
		actor.set_meta("aurion_model_sha256", item.sha)
		actor.set_meta("aurion_visual_source", "private-mcs-1.0" if modular != null else "catalog-glb")
		actor.set_meta("aurion_catalog_asset_id", item.assetId)
		root.add_child(actor)
		_actors[id] = actor
		model_instance = CatalogModels.normalize_model(model_instance, item.normalization)
		actor.add_child(model_instance)
		var clips := actor.find_children("*", "AnimationPlayer", true, false)
		var meshes := actor.find_children("*", "MeshInstance3D", true, false)
		# The rig can change when re-entering the final scene tree. Repeat the
		# checks here and fall back per NPC rather than clearing every actor.
		var modular_valid := true
		if modular != null:
			modular_valid = modular.has_method("is_character_valid") and bool(modular.call("is_character_valid"))
			modular_valid = modular_valid and clips.size() == 1 and not meshes.is_empty()
			if modular_valid:
				var modular_player: AnimationPlayer = clips[0]
				modular_valid = modular_player.has_animation("Idle") and modular.has_method("play_animation") and bool(modular.call("play_animation", &"Idle", 0.0))
			if not modular_valid:
				actor.remove_child(modular)
				modular.free()
				modular = null
				model_instance = packed.instantiate()
				if not model_instance is Node3D:
					if is_instance_valid(model_instance):
						model_instance.free()
					return _reject(root, "npc_model_not_3d")
				actor.add_child(model_instance)
				actor.set_meta("aurion_visual_source", "catalog-glb")
				clips = actor.find_children("*", "AnimationPlayer", true, false)
				meshes = actor.find_children("*", "MeshInstance3D", true, false)
		if clips.size() != 1 or meshes.is_empty():
			return _reject(root, "npc_model_rig_invalid")
		var player: AnimationPlayer = clips[0]
		var idle: String = Clips.resolve(player, "Idle")
		if idle.is_empty() and item.packedScene != null:
			# A valid catalog rig need not have a recognizable idle clip. Keep
			# this confirmed NPC on the audited standard without erasing peers.
			cache.reject_pose(str(item.sha), "Idle")
			actor.remove_child(model_instance)
			model_instance.free()
			var standard_path := _local_path(manifest, STANDARD_SHA)
			var standard: PackedScene = load(standard_path) as PackedScene if not standard_path.is_empty() else null
			if standard == null:
				return _reject(root, "npc_standard_model_missing")
			model_instance = standard.instantiate()
			actor.add_child(model_instance)
			clips = actor.find_children("*", "AnimationPlayer", true, false)
			if clips.size() != 1:
				return _reject(root, "npc_standard_rig_invalid")
			player = clips[0]
			idle = Clips.resolve(player, "Idle")
			actor.set_meta("aurion_model_sha256", STANDARD_SHA)
			actor.set_meta("aurion_catalog_asset_id", STANDARD_ASSET)
			waiting = true
		if idle.is_empty():
			return _reject(root, "npc_idle_missing")
		if modular == null:
			for name in player.get_animation_library_list():
				var library := player.get_animation_library(name).duplicate(true) as AnimationLibrary
				player.remove_animation_library(name)
				player.add_animation_library(name, library)
				for clip_name in library.get_animation_list():
					var qualified: String = str(name) + "/" + str(clip_name) if not str(name).is_empty() else str(clip_name)
					if qualified == idle:
						library.get_animation(clip_name).loop_mode = Animation.LOOP_LINEAR
			player.play(idle)
			player.advance(0.0)
		actor.visible = true
		_identities[id] = item.identity
	diagnostic = "NPC-GLB wird geladen; Standardmodell sichtbar" if waiting else ""
	return not planned.is_empty()

func visible_count() -> int:
	var count := 0
	for actor in _actors.values():
		if is_instance_valid(actor) and actor.visible:
			count += 1
	return count
