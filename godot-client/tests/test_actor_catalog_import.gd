extends SceneTree
## Actual byte-exact shipped rigs, plus malformed metadata negative controls.
const Inspector = preload("res://world/world_design_projection.gd")
const Cache = preload("res://actors/catalog_model_cache.gd")
const Clips = preload("res://actors/animation_clips.gd")
const Codec = preload("res://net/zone_codec.gd")
var failures: Array[String] = []

func require(ok: bool, why: String) -> void:
	if not ok:
		failures.append(why)

func _init() -> void:
	call_deferred("verify")

func changed(bytes: PackedByteArray, mutate: Callable) -> PackedByteArray:
	var length := int(bytes.decode_u32(12))
	var data: Dictionary = JSON.parse_string(bytes.slice(20, 20 + length).get_string_from_utf8())
	mutate.call(data)
	var encoded := JSON.stringify(data).to_utf8_buffer()
	while encoded.size() % 4 != 0:
		encoded.append(32)
	var binary := bytes.slice(20 + length)
	var result := bytes.slice(0, 20)
	result.encode_u32(8, 20 + encoded.size() + binary.size())
	result.encode_u32(12, encoded.size())
	result.append_array(encoded)
	result.append_array(binary)
	return result

func verify() -> void:
	var path := "res://assets/generated/manifest.json"
	if not FileAccess.file_exists(path):
		push_error("ACTOR_CATALOG_PREPARED_MANIFEST_MISSING")
		quit(1)
		return
	var decoded = JSON.parse_string(FileAccess.get_file_as_string(path))
	if not decoded is Dictionary or not decoded.get("sources") is Array:
		push_error("ACTOR_CATALOG_PREPARED_MANIFEST_INVALID")
		quit(1)
		return
	var manifest: Dictionary = decoded
	var count := 0
	for source: Dictionary in manifest.sources:
		if source.role not in ["character", "monster"] or source.animations.is_empty():
			continue
		var bytes := FileAccess.get_file_as_bytes("res://assets/generated/" + str(source.assetId) + ".glb")
		require(not bytes.is_empty(), "actual rig bytes missing")
		require(Inspector._inspect_glb(bytes).is_empty(), "static world profile admitted a rig")
		# The new profile is intentionally separate from static world admission.
		var inspected: Dictionary = Inspector.inspect_actor_glb(bytes)
		require(not inspected.is_empty(), "approved real rig cannot pass animated admission: " + str(source.assetId))
		var bad_joint := changed(bytes, func(data: Dictionary): data.skins[0].joints[0] = data.nodes.size())
		require(Inspector.inspect_actor_glb(bad_joint).is_empty(), "out-of-range joint admitted")
		var bad_sampler := changed(bytes, func(data: Dictionary): data.animations[0].samplers[0].input = data.accessors.size())
		require(Inspector.inspect_actor_glb(bad_sampler).is_empty(), "out-of-range animation accessor admitted")
		var external := changed(bytes, func(data: Dictionary): data.buffers[0].uri = "https://invalid.example/asset.bin")
		require(Inspector.inspect_actor_glb(external).is_empty(), "external URI admitted")
		var overflow := changed(bytes, func(data: Dictionary): data.skins[0].joints.resize(129))
		require(Inspector.inspect_actor_glb(overflow).is_empty(), "unbounded skin admitted")
		var extra_uv := changed(bytes, func(data: Dictionary):
			for mesh in data.meshes:
				for primitive in mesh.primitives:
					if primitive.attributes.has("TEXCOORD_0"): primitive.attributes["TEXCOORD_4"] = primitive.attributes.TEXCOORD_0)
		require(not Inspector.inspect_actor_glb(extra_uv).is_empty(), "bounded additional UV set rejected")
		var unpaired_skin := changed(bytes, func(data: Dictionary):
			for mesh in data.meshes:
				for primitive in mesh.primitives: primitive.attributes.erase("WEIGHTS_0"))
		require(Inspector.inspect_actor_glb(unpaired_skin).is_empty(), "skin without weights admitted")
		require(await verify_cache(source, bytes), "cache case did not finish")
		count += 1
	require(count == 2, "expected real player and monster byte fixtures")
	await verify_scene(manifest)
	if failures.is_empty():
		print("GODOT_ACTOR_CATALOG_IMPORT_PASS (actual source bytes; no live world)")
	else:
		for reason in failures:
			push_error(reason)
	quit(0 if failures.is_empty() else 1)

func verify_cache(source: Dictionary, bytes: PackedByteArray) -> bool:
	var cache := Cache.new()
	var connection := "zone_peer_catalog_import_fixture"
	var sha: String = source.sha256
	var normalization := {"revision":"aurion.glb-normalization.v1","sourceSha256":sha,
		"unitConvention":"gltf-rh-y-up-meter","unitToMm":1000,"axisConvention":"aurion-rh-y-up-forward-z",
		"axisTransform3x3":[1,0,0,0,1,0,0,0,1],"scaleE8":100000000,"translationMm":[0,0,0],"manifestSha256":"b".repeat(64)}
	var entry := {"assetId":source.assetId,"sha256":sha,"storageUrl":"/api/assets/glb/" + sha + ".glb",
		"assetType":"character" if source.role == "character" else "enemy","normalization":normalization,"bytes":bytes.size()}
	cache.set_owners(connection, ["player:1"])
	require(cache.request(entry,"absent").get("reason") == "actor_capacity", "unconfirmed cache owner admitted")
	require(cache.request(entry,"player:1").status == "pending", "missing bytes appeared as a loaded model")
	require(cache.needed_assets().size() == 1, "approved bytes not requested")
	require(not cache.supply_asset(sha,bytes,"zone_peer_other"), "foreign session accepted bytes")
	var corrupt := bytes.duplicate()
	corrupt[corrupt.size() - 1] ^= 1
	require(not cache.supply_asset(sha,corrupt,connection), "corrupted model accepted")
	require(cache.supply_asset(sha,bytes,connection), "real GLTFDocument import did not reach cache")
	var result := cache.request(entry,"player:1")
	require(result.status == "resolved" and result.sha256 == sha and result.catalogAssetId == source.assetId, "cache lost approved identity")
	if result.get("packedScene") == null:
		return false
	var model: Node3D = result.packedScene.instantiate()
	root.add_child(model)
	await process_frame
	var players := model.find_children("*","AnimationPlayer",true,false)
	var skeletons := model.find_children("*","Skeleton3D",true,false)
	var meshes := model.find_children("*","MeshInstance3D",true,false)
	require(players.size() == 1 and not skeletons.is_empty() and not meshes.is_empty(), "decoded packed scene lost real rig/geometry")
	var textured := false
	for mesh: MeshInstance3D in meshes:
		for surface in range(mesh.mesh.get_surface_count()):
			var material := mesh.get_active_material(surface) as BaseMaterial3D
			textured = textured or (material != null and material.albedo_texture != null)
	require(textured, "decoded actor lost its embedded texture")
	var player: AnimationPlayer = players[0]
	var walk := Clips.resolve(player,"Walk")
	require(not walk.is_empty(), "real walking clip not resolved")
	player.play(walk)
	player.advance(0.0)
	var before: Array = []
	for skeleton: Skeleton3D in skeletons:
		for bone in range(skeleton.get_bone_count()): before.append(skeleton.get_bone_pose(bone))
	player.advance(0.25)
	var i := 0
	var moved := false
	for skeleton: Skeleton3D in skeletons:
		for bone in range(skeleton.get_bone_count()):
			moved = moved or not before[i].is_equal_approx(skeleton.get_bone_pose(bone))
			i += 1
	require(moved, "runtime-decoded packed rig lost real animation")
	root.remove_child(model)
	model.free()
	# Purpose-specific rejection must release NPC costs without evicting a
	# different confirmed actor that still uses the same shared source.
	cache.set_owners(connection, ["player:1", "npc:fixture"])
	cache.request(entry, "npc:fixture", "Idle")
	cache.reject_pose(sha, "Idle")
	require(cache.request(entry, "npc:fixture", "Idle").get("reason") == "actor_clip_missing", "unsupported pose was requested again")
	require(cache.request(entry, "player:1").status == "resolved" and cache.evidence().models == 1, "NPC pose rejection evicted another actor's shared model")
	cache.forget("player:1")
	require(cache.evidence().models == 0 and cache.needed_assets().is_empty(), "unused pose-rejected model retained costs or requests")
	var bad := entry.duplicate(true)
	bad.normalization.sourceSha256 = "a".repeat(64)
	require(Cache.physical(bad).is_empty(), "different source normalization admitted")
	cache.set_owners(connection, [])
	require(cache.evidence().models == 0 and cache.needed_assets().is_empty(), "despawn retained model/cache work")
	require(not cache.supply_asset(sha,bytes,connection), "late bytes resurrected a despawned actor")
	var owners: Array = []
	for index in range(13): owners.append("player:" + str(index + 1))
	cache.set_owners(connection,owners)
	require(cache.evidence().actors == 12 and not cache.admits("player:13"), "native actor ceiling exceeded")
	cache.clear()
	require(cache.evidence().models == 0 and cache.evidence().actors == 0, "session reset leaked cache ownership")
	var oversized := changed(bytes, func(data: Dictionary): data.skins[0].joints.resize(129))
	var digest := HashingContext.new()
	digest.start(HashingContext.HASH_SHA256)
	digest.update(oversized)
	var rejected_sha := digest.finish().hex_encode()
	var rejected_entry := entry.duplicate(true)
	rejected_entry.sha256 = rejected_sha
	rejected_entry.storageUrl = "/api/assets/glb/" + rejected_sha + ".glb"
	rejected_entry.normalization.sourceSha256 = rejected_sha
	rejected_entry.bytes = oversized.size()
	cache.set_owners(connection,["player:1"])
	cache.request(rejected_entry,"player:1")
	require(not cache.supply_asset(rejected_sha,oversized,connection), "inadmissible source reached cache")
	require(cache.needed_assets().is_empty(), "deterministically rejected bytes remain in download loop")
	cache.clear()
	# Imported libraries often namespace or suffix clip names. Keep real clips.
	var aliases := AnimationPlayer.new()
	var library := AnimationLibrary.new()
	library.add_animation("Standing Idle", Animation.new())
	library.add_animation("RunForward", Animation.new())
	library.add_animation("Dying", Animation.new())
	aliases.add_animation_library("creature",library)
	require(Clips.resolve(aliases,"Idle") == "creature/Standing Idle", "namespaced idle alias unresolved")
	require(Clips.resolve(aliases,"Walk") == "creature/RunForward", "run fallback for walk unresolved")
	require(Clips.resolve(aliases,"Death") == "creature/Dying", "death alias unresolved")
	aliases.free()
	return true

func verify_scene(manifest: Dictionary) -> void:
	var scene: Control = load("res://app/main.tscn").instantiate()
	root.add_child(scene)
	var nodes: Array = []
	for id in Codec.NODE_IDS:
		nodes.append({"nodeId":id,"remaining":5,"depleted":false,"respawnAtTick":null})
	var mobs: Array = []
	for index in range(10):
		mobs.append({"entityId":"mob_" + str(index + 1),"archetype":"clockwork_stalker","level":1,"state":"idle","position":{"x":3000 + index * 1000,"z":0},"targetEntityId":null,"isBoss":false,"isElite":false,"health":10,"maxHealth":10})
	mobs.sort_custom(func(a: Dictionary, b: Dictionary): return a.entityId < b.entityId)
	var welcome := {"type":"welcome","protocolVersion":5,"zoneId":"observatory_threshold",
		"connectionId":"zone_peer_catalogscene1234","selfEntityId":"player:1","snapshotSeq":1,"tick":1,
		"presences":[{"entityId":"player:1","userId":1,"position":{"x":0,"z":0},"lastAcceptedClientSeq":0},
			{"entityId":"player:2","userId":2,"position":{"x":1000,"z":0},"lastAcceptedClientSeq":0}],
		"mobs":mobs,"combatants":[],"resources":{"contractVersion":1,"contentSourceRevision":Codec.FIXED_CONTENT,"revision":1,"nodes":nodes}}
	scene._on_zone_welcome(welcome)
	scene._on_zone_connected()
	require(scene._confirmed_zone.has_state(), "streamed scene fixture violates canonical contract")
	if not scene._confirmed_zone.has_state():
		scene.queue_free()
		return
	var entries: Array = []
	var byte_map: Dictionary = {}
	var character: Dictionary = {}
	for source: Dictionary in manifest.sources:
		if source.role not in ["character","monster"] or source.animations.is_empty(): continue
		var sha: String = source.sha256
		byte_map[sha] = FileAccess.get_file_as_bytes("res://assets/generated/" + str(source.assetId) + ".glb")
		var entry := {"assetId":source.assetId,"sha256":sha,"storageUrl":"/api/assets/glb/" + sha + ".glb",
			"assetType":"character" if source.role == "character" else "enemy","purpose":"player-public" if source.role == "character" else "enemy-fallback","targetKey":null,
			"normalization":{"revision":"aurion.glb-normalization.v1","sourceSha256":sha,"unitConvention":"gltf-rh-y-up-meter","unitToMm":1000,"axisConvention":"aurion-rh-y-up-forward-z","axisTransform3x3":[1,0,0,0,1,0,0,0,1],"scaleE8":50000000,"translationMm":[100,0,200],"manifestSha256":"b".repeat(64)}}
		entries.append(entry)
		if source.role == "character": character = entry
	var npc_entry := character.duplicate(true)
	npc_entry.assetId = "approved_npc_pool_variant"
	npc_entry.purpose = "npc-fallback"
	entries.append(npc_entry)
	var catalog := {"version":"aurion.glb-import.v1","revision":"a".repeat(64),"entries":entries,
		"selected":{"assetId":character.assetId,"storageUrl":character.storageUrl},"immutable":true}
	var npcs: Array = []
	for index in range(3):
		npcs.append({"npcId":"quest_" + str(index),"entityId":"npc:quest_" + str(index),"displayName":"Fixture NPC",
			"position":{"x":6000 + index * 1000,"z":0},"model":{"source":"audited-standard","catalogAssetId":character.assetId,"sha256":character.sha256},
			"fallbackModel":{"source":"approved-fallback","catalogAssetId":npc_entry.assetId,"sha256":npc_entry.sha256}})
	# Fixture injection is below the authenticated HTTP boundary. No live claim.
	scene._remote_manifest = manifest
	scene._monster_manifest = manifest
	scene._remote_catalog = catalog
	scene._monster_catalog = catalog
	scene._self_appearance_response = catalog
	scene._remote_appearance_response = {"appearances":[{"userId":2,"assetId":character.assetId,"storageUrl":character.storageUrl}]}
	scene._quest_npc_response = {"version":"aurion.quest-npc-visuals.v1","zoneId":"observatory_threshold","stateSource":"aurion-canonical-quest-anchors","catalogRevision":catalog.revision,"npcs":npcs}
	var before := JSON.stringify(scene._confirmed_zone.current_state())
	scene._refresh_catalog_actors()
	require(scene.world_actors.get_child_count() == 9, "prepared exact self/remote models vanished while their catalog bytes load")
	var exact: Dictionary = load("res://actors/appearance_resolver.gd").new().resolve_monster(scene._confirmed_zone,welcome.mobs[0],catalog,manifest,scene._actor_models)
	require(exact.get("status") == "resolved" and not exact.get("fallback",true), "pending download hid the exact prepared monster match")
	for request in scene._actor_models.needed_assets():
		require(scene._actor_models.supply_asset(request.sha256,byte_map[request.sha256],welcome.connectionId),"scene failed to decode requested approved bytes")
	scene._refresh_catalog_actors()
	var actors: Array = scene.world_actors.get_children() + scene.quest_npc_root.get_children()
	require(actors.size() == 12, "active scene did not fill its twelve real model slots")
	var active := 0
	for actor: Node3D in actors:
		require(actor.visible and not actor.find_children("*","Skeleton3D",true,false).is_empty(), "active actor invisible or model-less")
		for mesh: MeshInstance3D in actor.find_children("*","MeshInstance3D",true,false):
			require(not mesh.mesh is PrimitiveMesh, "geometric placeholder became an active actor")
		for player: AnimationPlayer in actor.find_children("*","AnimationPlayer",true,false):
			if player.active: active += 1
		var wrappers := actor.find_children("CatalogNormalization","Node3D",true,false)
		require(wrappers.size() == 1, "streamed physical normalization was not mounted")
		if wrappers.size() == 1:
			require(wrappers[0].scale == Vector3.ONE * 0.5 and wrappers[0].position == Vector3(0.1,0,0.2), "catalog normalization changed")
	for npc in scene.quest_npc_root.get_children():
		require(npc.get_meta("aurion_catalog_asset_id") == npc_entry.assetId, "approved NPC fallback pool ignored")
	require(active == 8, "native animation budget did not preserve eight active mixers")
	require(scene._actor_models.evidence().models == 2, "shared catalog bytes were decoded more than once")
	require(JSON.stringify(scene._confirmed_zone.current_state()) == before, "catalog presentation changed canonical state")
	# Public callbacks still reject bytes without the authenticated session.
	var known_sha: String = character.sha256
	scene._on_actor_asset_ready(known_sha,byte_map[known_sha],welcome.connectionId,0)
	require(scene._actor_models.evidence().models == 2, "unauthorized callback changed the cache")
	# One approved rig with unrecognized clips must not erase other quest NPCs.
	var no_idle := changed(byte_map[known_sha], func(data: Dictionary):
		for index in range(data.animations.size()): data.animations[index].name = "Gesture" + str(index))
	var hash := HashingContext.new()
	hash.start(HashingContext.HASH_SHA256)
	hash.update(no_idle)
	var no_idle_sha := hash.finish().hex_encode()
	var no_idle_entry := npc_entry.duplicate(true)
	no_idle_entry.assetId = "approved_no_idle_fixture"
	no_idle_entry.sha256 = no_idle_sha
	no_idle_entry.storageUrl = "/api/assets/glb/" + no_idle_sha + ".glb"
	no_idle_entry.normalization.sourceSha256 = no_idle_sha
	catalog.entries.append(no_idle_entry)
	scene._quest_npc_response.npcs[0].fallbackModel = {"source":"approved-fallback","catalogAssetId":no_idle_entry.assetId,"sha256":no_idle_sha}
	scene._refresh_catalog_actors()
	require(scene._actor_models.supply_asset(no_idle_sha,no_idle,welcome.connectionId), "approved missing-idle fixture was not decoded")
	scene._refresh_catalog_actors()
	require(scene._quest_npc_actors.visible_count() == 3, "one unknown idle clip erased the other quest NPCs")
	require(scene._actor_models.evidence().models == 2, "unused missing-idle rig retained shared model budget")
	scene._refresh_catalog_actors()
	for asset in scene._actor_models.needed_assets():
		require(asset.sha256 != no_idle_sha, "missing-idle NPC rig was requested again after fallback")
	var malformed: Dictionary = scene._quest_npc_response.duplicate(true)
	malformed.npcs = []
	for index in range(11):
		malformed.npcs.append({"entityId":"npc:ghost_" + str(index),"npcId":"INVALID"})
	require(not scene._apply_quest_npc_visuals(malformed,manifest), "malformed NPC contract accepted")
	scene._refresh_catalog_actors()
	require(scene._quest_npc_response.is_empty() and scene.world_actors.get_child_count() == 12, "rejected NPC rows retained slots ahead of confirmed actors")
	var snapshot := welcome.duplicate(true)
	for key in ["protocolVersion","connectionId","selfEntityId"]: snapshot.erase(key)
	snapshot.type = "snapshot"
	snapshot.snapshotSeq = 2
	snapshot.tick = 2
	snapshot.presences.resize(1)
	snapshot.mobs.clear()
	scene._on_zone_snapshot(snapshot)
	scene._refresh_catalog_actors()
	require(scene.world_actors.get_child_count() == 1 and scene._actor_models.evidence().models == 1, "despawn retained streamed actors/bytes")
	scene._self_appearance_response.selected = null
	scene._refresh_catalog_actors()
	require(scene.world_actors.get_child_count() == 0, "revoked appearance kept a stale player model")
	scene._reset_projection()
	require(scene._actor_models.evidence().models == 0 and scene.quest_npc_root.get_child_count() == 0, "session reset retained downloaded actors")
	scene.queue_free()
	await process_frame
