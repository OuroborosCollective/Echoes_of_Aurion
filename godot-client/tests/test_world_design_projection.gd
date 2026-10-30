extends SceneTree
## Isolated synthetic Aurion readbacks and one real CC0 GLB; not live evidence.
const ChunkTerrain = preload("res://world/chunk_terrain.gd")
const SHA := "dbec78ee8f51587db4247186a44b75bc0cd639f5e3f0ea54803deaba95e4a17d"
const SESSION := "zone_peer_world_design_test_1234"
var failures: Array[String] = []

func require(ok: bool, message: String) -> void:
	if not ok:
		failures.append(message)

func _init() -> void:
	call_deferred("verify")

func surface() -> Dictionary:
	var tiles: Array = []
	for z in range(16):
		for x in range(16):
			tiles.append({"x":x,"z":z,"heightMm":1250,"surface":"grass"})
	return {"base":{"worldId":"echoes-of-aurion-global","worldSeedDigest":"fnv1a-1234abcd",
		"worldGenerationRevision":"a".repeat(40),"ruleSetVersion":"aurion-world-chunk.v1",
		"coordinate":{"x":0,"z":0},"baseRevision":1,"biome":"plains","tiles":tiles,
		"deterministicHash":"fnv1a-abcdef01"},"appliedDeltaIds":[],"visibleResources":[],
		"structures":[],"roads":[],"deterministicHash":"fnv1a-2345bcde"}

func design() -> Dictionary:
	return {"schemaVersion":"aurion.world-design.v1","revision":"c".repeat(64),"designs":[{
		"designKey":"test-village","version":1,"title":"Synthetic test village",
		"designHash":"b".repeat(64),"expectedCatalogRevision":"a".repeat(64),"placements":[{
			"placementKey":"barrel-one","assetId":"glb_test_barrel","chunkX":0,"chunkZ":0,
			"xMm":0,"zMm":63999,"rotationQuarterTurns":1,"scalePermille":1000}]}]}

func catalog() -> Dictionary:
	return {"version":"aurion.glb-import.v1","revision":"a".repeat(64),"entries":[{
		"assetId":"glb_test_barrel","sha256":SHA,"storageUrl":"/api/assets/glb/"+SHA+".glb",
		"assetType":"arena","targetKey":null,"purpose":"world-environment","subcategory":"structure",
		"normalization":{"sourceSha256":SHA}}]}

func digest(bytes: PackedByteArray) -> String:
	var hash := HashingContext.new()
	hash.start(HashingContext.HASH_SHA256)
	hash.update(bytes)
	return hash.finish().hex_encode()

func with_external_buffer(bytes: PackedByteArray) -> PackedByteArray:
	var json_length := int(bytes.decode_u32(12))
	var original_binary := bytes.slice(20 + json_length)
	var json: Dictionary = JSON.parse_string(bytes.slice(20, 20 + json_length).get_string_from_utf8().strip_edges())
	json.buffers[0]["uri"] = "file:///etc/passwd"
	var encoded := JSON.stringify(json).to_utf8_buffer()
	while encoded.size() % 4 != 0: encoded.append(32)
	var result := PackedByteArray()
	result.resize(20)
	result.encode_u32(0, 0x46546c67)
	result.encode_u32(4, 2)
	result.encode_u32(8, 20 + encoded.size() + original_binary.size())
	result.encode_u32(12, encoded.size())
	result.encode_u32(16, 0x4e4f534a)
	result.append_array(encoded)
	result.append_array(original_binary)
	return result

func with_oversized_png(bytes: PackedByteArray) -> PackedByteArray:
	var result := bytes.duplicate()
	var json_length := int(result.decode_u32(12))
	var json: Dictionary = JSON.parse_string(result.slice(20, 20 + json_length).get_string_from_utf8().strip_edges())
	var view: Dictionary = json.bufferViews[int(json.images[0].bufferView)]
	var start := 20 + json_length + 8 + int(view.get("byteOffset", 0))
	# 4096 pixels exceeds the mobile presentation limit; no image decode needed.
	result[start+16] = 0
	result[start+17] = 0
	result[start+18] = 16
	result[start+19] = 0
	return result

func small_glb(seed: int, mesh_instances: int = 1, morph: bool = false, unused_meshes: int = 0, primitive_count: int = 1) -> PackedByteArray:
	var primitive := {"attributes":{"POSITION":0}}
	if morph: primitive["targets"] = [{"POSITION":0}]
	var nodes: Array = []
	var roots: Array = []
	for i in range(mesh_instances):
		nodes.append({"mesh":0})
		roots.append(i)
	var data := {"asset":{"version":"2.0","generator":"fixture-%d" % seed},
		"buffers":[{"byteLength":36}], "bufferViews":[{"buffer":0,"byteLength":36}],
		"accessors":[{"bufferView":0,"componentType":5126,"count":3,"type":"VEC3","min":[-1,0,0],"max":[1,1,0]}],
		"meshes":[{"primitives":[primitive]}],"nodes":nodes,"scenes":[{"nodes":roots}],"scene":0}
	for i in range(1, primitive_count): data.meshes[0].primitives.append(primitive.duplicate(true))
	for i in range(unused_meshes): data.meshes.append({"primitives":[primitive.duplicate(true)]})
	var json := JSON.stringify(data).to_utf8_buffer()
	while json.size() % 4 != 0: json.append(32)
	var binary := PackedByteArray()
	binary.resize(36)
	var points := [-1.0,0.0,0.0, 1.0,0.0,0.0, 0.0,1.0,0.0]
	for i in range(points.size()): binary.encode_float(i*4, points[i])
	var result := PackedByteArray()
	result.resize(20)
	result.encode_u32(0, 0x46546c67)
	result.encode_u32(4, 2)
	result.encode_u32(8, 20 + json.size() + 8 + binary.size())
	result.encode_u32(12, json.size())
	result.encode_u32(16, 0x4e4f534a)
	result.append_array(json)
	var header := PackedByteArray()
	header.resize(8)
	header.encode_u32(0, binary.size())
	header.encode_u32(4, 0x004e4942)
	result.append_array(header)
	result.append_array(binary)
	return result

func catalog_for_bytes(bytes: PackedByteArray, asset_id: String) -> Dictionary:
	var result := catalog()
	var sha := digest(bytes)
	result.entries[0].assetId = asset_id
	result.entries[0].sha256 = sha
	result.entries[0].storageUrl = "/api/assets/glb/" + sha + ".glb"
	result.entries[0].normalization.sourceSha256 = sha
	return result

func verify() -> void:
	var script: Script = load("res://world/world_design_projection.gd") as Script
	require(script != null, "authored Aurion world-design projection is missing")
	if script == null:
		finish()
		return
	var projection: Node3D = script.new()
	root.add_child(projection)
	require(projection.bind_confirmed(design(), catalog(), SESSION), "valid server-shaped design and catalog were rejected")
	require(projection.get_child_count() == 0 and projection.needed_assets().is_empty(), "unconfirmed terrain produced a model request or visual")
	var chunk := surface()
	require(ChunkTerrain._validate(chunk).get("status") == "validated", "fixture is not a valid confirmed terrain readmodel")
	require(projection.accept_surface(chunk, SESSION, Vector2i.ZERO), "confirmed center surface rejected")
	var requests: Array = projection.needed_assets()
	require(requests.size() == 1 and requests[0].get("sha256") == SHA, "confirmed design did not request exactly the matching asset")
	var bytes := FileAccess.get_file_as_bytes("res://assets/starter_village/Barrel.glb")
	require(not projection.supply_asset(SHA, bytes, "zone_peer_foreign"), "foreign session supplied an asset")
	var altered := bytes.duplicate()
	altered[altered.size()-1] ^= 1
	require(not projection.supply_asset(SHA, altered, SESSION), "wrong asset hash accepted")
	require(projection.get_child_count() == 0, "wrong bytes produced a visual")
	require(projection.supply_asset(SHA, bytes, SESSION), "exact approved CC0 GLB was not imported")
	require(projection.get_child_count() == 1, "confirmed placement did not create one actual Godot model")
	if projection.get_child_count() == 1:
		var holder := projection.get_child(0) as Node3D
		require(holder.position.is_equal_approx(Vector3(-32.0, 1.25, 31.999)), "centered chunk coordinate or confirmed terrain height is incorrect")
		require(is_equal_approx(holder.rotation.y, PI / 2.0), "server quarter-turn was not projected")
		require(not holder.find_children("*", "MeshInstance3D", true, false).is_empty(), "approved GLB has no visible mesh")
		require(holder.find_children("*", "CollisionObject3D", true, false).is_empty(), "visual projection created gameplay collision")
	var empty := design()
	empty.designs.clear()
	require(projection.bind_confirmed(empty, catalog(), SESSION), "valid empty readback rejected")
	require(projection.get_child_count() == 0, "removed server design remained visible")
	var negative := design()
	negative.designs[0].placements[0].chunkX = -1
	negative.designs[0].placements[0].xMm = 63999
	negative.designs[0].placements[0].zMm = 32000
	var western_chunk := surface()
	western_chunk.base.coordinate.x = -1
	require(projection.bind_confirmed(negative, catalog(), SESSION), "negative-chunk design rejected")
	require(projection.accept_surface(western_chunk, SESSION, Vector2i(-1, 0)), "negative confirmed chunk rejected")
	require(projection.supply_asset(SHA, bytes, SESSION), "negative-chunk model did not load")
	if projection.get_child_count() == 1:
		require((projection.get_child(0) as Node3D).position.is_equal_approx(Vector3(-32.001, 1.25, 0)), "negative chunk boundary was rounded or shifted incorrectly")
	else:
		require(false, "negative-chunk placement not rendered")
	projection.remove_surface(Vector2i(-1, 0), SESSION)
	require(projection.get_child_count() == 0, "removed chunk retained its world model")
	var external := with_external_buffer(bytes)
	var bad_sha := digest(external)
	var bad_catalog := catalog()
	bad_catalog.entries[0].sha256 = bad_sha
	bad_catalog.entries[0].storageUrl = "/api/assets/glb/" + bad_sha + ".glb"
	bad_catalog.entries[0].normalization.sourceSha256 = bad_sha
	require(projection.bind_confirmed(design(), bad_catalog, SESSION), "external-resource test fixture rejected before asset check")
	require(projection.accept_surface(chunk, SESSION, Vector2i.ZERO), "external-resource test surface rejected")
	require(not projection.supply_asset(bad_sha, external, SESSION), "hash-matching GLB with an external URI was accepted")
	require(projection.get_child_count() == 0, "external-resource GLB created a world visual")
	var oversized := with_oversized_png(bytes)
	var oversized_sha := digest(oversized)
	var oversized_catalog := catalog()
	oversized_catalog.entries[0].sha256 = oversized_sha
	oversized_catalog.entries[0].storageUrl = "/api/assets/glb/" + oversized_sha + ".glb"
	oversized_catalog.entries[0].normalization.sourceSha256 = oversized_sha
	require(projection.bind_confirmed(design(), oversized_catalog, SESSION), "oversized image test fixture rejected too early")
	require(projection.accept_surface(chunk, SESSION, Vector2i.ZERO), "oversized image test surface rejected")
	require(not projection.supply_asset(oversized_sha, oversized, SESSION), "oversized embedded image was accepted")
	require(projection.get_child_count() == 0, "oversized embedded image produced a visual")
	var instances := small_glb(11, 300)
	var instanced_catalog := catalog_for_bytes(instances, "glb_test_barrel")
	require(projection.bind_confirmed(design(), instanced_catalog, SESSION), "instancing test design rejected too early")
	require(projection.accept_surface(chunk, SESSION, Vector2i.ZERO), "instancing test surface rejected")
	require(not projection.supply_asset(digest(instances), instances, SESSION), "hundreds of mesh instances bypassed geometry budget")
	var morph := small_glb(12, 1, true)
	var morph_catalog := catalog_for_bytes(morph, "glb_test_barrel")
	require(projection.bind_confirmed(design(), morph_catalog, SESSION), "morph test design rejected too early")
	require(projection.accept_surface(chunk, SESSION, Vector2i.ZERO), "morph test surface rejected")
	require(not projection.supply_asset(digest(morph), morph, SESSION), "unbudgeted morph targets were accepted")
	var unused := small_glb(13, 1, false, 2)
	var unused_catalog := catalog_for_bytes(unused, "glb_test_barrel")
	require(projection.bind_confirmed(design(), unused_catalog, SESSION), "unused mesh test design rejected too early")
	require(projection.accept_surface(chunk, SESSION, Vector2i.ZERO), "unused mesh test surface rejected")
	require(not projection.supply_asset(digest(unused), unused, SESSION), "unbudgeted unused mesh definitions were accepted")
	var dense := small_glb(14, 256)
	var dense_catalog := catalog_for_bytes(dense, "glb_test_barrel")
	var dense_design := design()
	for i in range(2):
		var more: Dictionary = dense_design.designs[0].placements[0].duplicate(true)
		more.placementKey = "dense-%d" % i
		dense_design.designs[0].placements.append(more)
	require(projection.bind_confirmed(dense_design, dense_catalog, SESSION), "dense model test design rejected")
	require(projection.accept_surface(chunk, SESSION, Vector2i.ZERO), "dense model test surface rejected")
	require(projection.supply_asset(digest(dense), dense, SESSION), "bounded dense model rejected")
	require(projection.get_child_count() == 2 and projection.find_children("*", "MeshInstance3D", true, false).size() == 512, "aggregate mesh-instance budget was bypassed")
	var many_surfaces := small_glb(15, 1, false, 0, 256)
	var surface_catalog := catalog_for_bytes(many_surfaces, "glb_test_barrel")
	require(projection.bind_confirmed(dense_design, surface_catalog, SESSION), "many-surface model test design rejected")
	require(projection.accept_surface(chunk, SESSION, Vector2i.ZERO), "many-surface model test surface rejected")
	require(projection.supply_asset(digest(many_surfaces), many_surfaces, SESSION), "bounded many-surface model rejected")
	require(projection.get_child_count() == 2, "aggregate primitive/surface budget was bypassed")
	var many_design := design()
	many_design.designs[0].placements.clear()
	var many_catalog := catalog()
	many_catalog.entries.clear()
	var many_bytes: Array = []
	for i in range(5):
		var model := small_glb(i)
		var asset_id := "glb_test_small%d" % i
		many_bytes.append(model)
		many_catalog.entries.append(catalog_for_bytes(model, asset_id).entries[0])
		var placement: Dictionary = design().designs[0].placements[0].duplicate(true)
		placement.assetId = asset_id
		placement.placementKey = "placement-%d" % i
		many_design.designs[0].placements.append(placement)
	require(projection.bind_confirmed(many_design, many_catalog, SESSION), "five-model test design rejected")
	require(projection.accept_surface(chunk, SESSION, Vector2i.ZERO), "five-model test surface rejected")
	for model in many_bytes:
		require(projection.supply_asset(digest(model), model, SESSION), "one of five small approved models was refused")
	require(projection.get_child_count() == 5, "five confirmed small models did not all appear")
	var primary := small_glb(100)
	var lightweight := small_glb(101)
	var primary_sha := digest(primary)
	var lightweight_sha := digest(lightweight)
	var lod_catalog := catalog_for_bytes(primary, "glb_test_barrel")
	lod_catalog.entries[0].normalization = {"sourceSha256":primary_sha,"lod":{"level":0,"triangleCount":300001}}
	lod_catalog.entries[0].lods = [
		{"level":0,"assetId":"glb_primary_test","sha256":primary_sha,"storageUrl":"/api/assets/glb/"+primary_sha+".glb","targetKey":null,"normalization":{"sourceSha256":primary_sha,"lod":{"level":0,"triangleCount":300001}}},
		{"level":2,"assetId":"glb_lightweight_test","sha256":lightweight_sha,"storageUrl":"/api/assets/glb/"+lightweight_sha+".glb","targetKey":null,"normalization":{"sourceSha256":lightweight_sha,"lod":{"level":2,"triangleCount":1}}},
	]
	require(projection.bind_confirmed(design(), lod_catalog, SESSION), "LOD-family test design rejected")
	require(projection.accept_surface(chunk, SESSION, Vector2i.ZERO), "LOD-family test surface rejected")
	var lod_requests: Array = projection.needed_assets()
	require(lod_requests.size() == 1 and lod_requests[0].get("sha256") == lightweight_sha, "approved lightweight LOD was not selected")
	require(projection.supply_asset(lightweight_sha, lightweight, SESSION), "approved lightweight LOD did not render")
	var fallback_catalog := lod_catalog.duplicate(true)
	fallback_catalog.entries[0].normalization.lod.triangleCount = 1
	fallback_catalog.entries[0].lods[0].normalization.lod.triangleCount = 1
	require(projection.bind_confirmed(design(), fallback_catalog, SESSION), "fallback LOD family rejected")
	require(projection.try_next_asset(lightweight_sha, SESSION), "failed physical LOD had no fallback")
	var fallback_requests: Array = projection.needed_assets()
	require(fallback_requests.size() == 1 and fallback_requests[0].get("sha256") == primary_sha, "fallback escaped its approved LOD family")
	require(projection.supply_asset(primary_sha, primary, SESSION), "approved fallback LOD did not render")
	require(projection.try_next_asset(primary_sha, SESSION), "exhausted LOD family could not retry its preferred variant")
	var retry_requests: Array = projection.needed_assets()
	require(retry_requests.size() == 1 and retry_requests[0].get("sha256") == lightweight_sha, "LOD retry did not return to the permitted preferred variant")
	var bad_lods := fallback_catalog.duplicate(true)
	bad_lods.entries[0].lods[1].level = 0
	require(projection.bind_confirmed(design(), bad_lods, SESSION), "invalid-family catalog rejected as malformed response")
	require(projection.get_child_count() == 0 and projection.needed_assets().is_empty(), "duplicate LOD levels produced a visual or asset request")
	var duplicate := design()
	duplicate.designs[0].placements.append(duplicate.designs[0].placements[0].duplicate(true))
	require(not projection.bind_confirmed(duplicate, catalog(), SESSION), "duplicate placement key accepted")
	require(projection.get_child_count() == 0, "invalid current design kept stale world visuals")
	require(projection.bind_confirmed(design(), catalog(), SESSION), "valid design did not recover")
	require(projection.accept_surface(chunk, SESSION, Vector2i.ZERO), "surface rejected after recovery")
	var unapproved := catalog()
	unapproved.entries[0].purpose = "player-public"
	require(projection.bind_confirmed(design(), unapproved, SESSION), "valid catalog with non-world asset caused structural rejection")
	require(projection.needed_assets().is_empty() and projection.get_child_count() == 0, "unapproved character asset became a world model")
	projection.clear()
	require(projection.get_child_count() == 0 and projection.needed_assets().is_empty(), "logout left world-design visuals or requests")
	projection.queue_free()
	await process_frame
	finish()

func finish() -> void:
	if failures.is_empty():
		print("GODOT_WORLD_DESIGN_PROJECTION_PASS (synthetic server data and local CC0 GLB only)")
	else:
		for failure in failures:
			push_error(failure)
	quit(0 if failures.is_empty() else 1)
