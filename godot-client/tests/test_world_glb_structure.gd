extends SceneTree
## Native-parser safety checks use generated GLBs, not live Aurion evidence.
const WorldProjection = preload("res://world/world_design_projection.gd")
const SESSION := "zone_peer_glb_structure_test"
var failures: Array[String] = []

func _init() -> void:
	call_deferred("verify")

func require(ok: bool, message: String) -> void:
	if not ok:
		failures.append(message)

func fixture() -> Dictionary:
	return {"asset":{"version":"2.0"}, "buffers":[{"byteLength":36}],
		"bufferViews":[{"buffer":0,"byteLength":36}],
		"accessors":[{"bufferView":0,"componentType":5126,"count":3,"type":"VEC3","min":[-1,0,0],"max":[1,1,0]}],
		"meshes":[{"primitives":[{"attributes":{"POSITION":0}}]}],
		"nodes":[{"mesh":0}],"scenes":[{"nodes":[0]}],"scene":0}

func glb(data: Dictionary, binary_length: int = 36) -> PackedByteArray:
	var encoded := JSON.stringify(data).to_utf8_buffer()
	while encoded.size() % 4 != 0:
		encoded.append(32)
	var binary := PackedByteArray()
	binary.resize(binary_length)
	var points := [-1.0,0.0,0.0, 1.0,0.0,0.0, 0.0,1.0,0.0]
	for i in range(points.size()):
		binary.encode_float(i * 4, points[i])
	var result := PackedByteArray()
	result.resize(20)
	result.encode_u32(0, 0x46546c67)
	result.encode_u32(4, 2)
	result.encode_u32(8, 20 + encoded.size() + 8 + binary.size())
	result.encode_u32(12, encoded.size())
	result.encode_u32(16, 0x4e4f534a)
	result.append_array(encoded)
	var header := PackedByteArray()
	header.resize(8)
	header.encode_u32(0, binary.size())
	header.encode_u32(4, 0x004e4942)
	result.append_array(header)
	result.append_array(binary)
	return result

func reject(data: Dictionary, label: String, binary_length: int = 36) -> void:
	require(WorldProjection._inspect_glb(glb(data, binary_length)).is_empty(), label + " was accepted before native import")

func digest(bytes: PackedByteArray) -> String:
	var context := HashingContext.new()
	context.start(HashingContext.HASH_SHA256)
	context.update(bytes)
	return context.finish().hex_encode()

func design() -> Dictionary:
	return {"schemaVersion":"aurion.world-design.v1","revision":"c".repeat(64),"designs":[{
		"designKey":"test-village","version":1,"title":"Fixture","designHash":"b".repeat(64),
		"expectedCatalogRevision":"a".repeat(64),"placements":[{"placementKey":"barrel-one",
		"assetId":"glb_test_barrel","chunkX":0,"chunkZ":0,"xMm":32000,"zMm":32000,
		"rotationQuarterTurns":0,"scalePermille":1000}]}]}

func catalog(sha: String) -> Dictionary:
	return {"version":"aurion.glb-import.v1","revision":"a".repeat(64),"entries":[{
		"assetId":"glb_test_barrel","sha256":sha,"storageUrl":"/api/assets/glb/"+sha+".glb",
		"assetType":"arena","targetKey":null,"purpose":"world-environment","subcategory":"structure",
		"normalization":{"sourceSha256":sha}}]}

func surface() -> Dictionary:
	var tiles: Array = []
	for z in range(16):
		for x in range(16):
			tiles.append({"x":x,"z":z,"heightMm":0,"surface":"grass"})
	return {"base":{"worldId":"echoes-of-aurion-global","worldSeedDigest":"fnv1a-1234abcd",
		"worldGenerationRevision":"a".repeat(40),"ruleSetVersion":"aurion-world-chunk.v1",
		"coordinate":{"x":0,"z":0},"baseRevision":1,"biome":"plains","tiles":tiles,
		"deterministicHash":"fnv1a-abcdef01"},"appliedDeltaIds":[],"visibleResources":[],
		"structures":[],"roads":[],"deterministicHash":"fnv1a-2345bcde"}

func verify() -> void:
	var good := fixture()
	var baseline := glb(good)
	require(not WorldProjection._inspect_glb(baseline).is_empty(), "valid exact-boundary GLB rejected")
	# JSON parsing turns these integers into floats in Godot; valid values must survive.
	var decoded: Variant = JSON.parse_string('{"index":0,"count":3}')
	require(typeof(decoded.count) == TYPE_FLOAT and WorldProjection._whole(decoded.count, 3, 3), "JSON integer-valued floats were rejected")

	for value in [99999999, 0, 5124, true, "5126", 5126.5]:
		var bad := fixture()
		bad.accessors[0].componentType = value
		reject(bad, "invalid component type %s" % value)
	var bad := fixture()
	bad.accessors.append({"bufferView":0,"componentType":99999999,"count":1,"type":"SCALAR"})
	reject(bad, "invalid unreferenced accessor")
	for value in [-1, 1, 0.5, null, "0", 99999999]:
		bad = fixture()
		bad.accessors[0].bufferView = value
		reject(bad, "invalid accessor buffer view %s" % value)
	for value in [-1, 0.5, 1, 4, 99999999]:
		bad = fixture()
		bad.accessors[0].byteOffset = value
		reject(bad, "invalid accessor offset %s" % value)
	for value in [0, 1000001, 3.5, true]:
		bad = fixture()
		bad.accessors[0].count = value
		reject(bad, "invalid accessor count %s" % value)
	for value in [null, {}, {"count":1}, false]:
		bad = fixture()
		bad.accessors[0].sparse = value
		reject(bad, "unsupported sparse accessor %s" % value)
	bad = fixture()
	bad.accessors[0].type = "INVALID"
	reject(bad, "invalid accessor type")
	bad = fixture()
	bad.accessors[0].normalized = 1
	reject(bad, "invalid normalized flag")
	bad = fixture()
	bad.accessors[0].min = [0, 0]
	reject(bad, "invalid accessor minimum width")
	bad = fixture()
	bad.accessors[0].max = [0, 0, "bad"]
	reject(bad, "invalid accessor maximum component")
	bad = fixture()
	bad.accessors[0].max = [1e100, 1, 0]
	reject(bad, "float component maximum outside float32")
	bad = fixture()
	bad.accessors[0].min = [2, 0, 0]
	reject(bad, "inverted accessor bounds")
	var byte_accessor := fixture()
	byte_accessor.accessors[0].componentType = 5121
	byte_accessor.accessors[0].min = [0, 0, 0]
	byte_accessor.accessors[0].max = [255, 1, 1]
	require(not WorldProjection._inspect_glb(glb(byte_accessor)).is_empty(), "valid byte accessor range rejected")
	for value in [256, -1, 0.5]:
		bad = byte_accessor.duplicate(true)
		bad.accessors[0].max[0] = value
		reject(bad, "byte accessor out-of-range maximum %s" % value)

	for value in [-1, 0.5, 1, null, 99999999]:
		bad = fixture()
		bad.bufferViews[0].buffer = value
		reject(bad, "invalid view buffer %s" % value)
	for value in [-1, 0.5, 1, 99999999]:
		bad = fixture()
		bad.bufferViews[0].byteOffset = value
		reject(bad, "invalid view offset %s" % value)
	for value in [0, -1, 35, 37, 99999999]:
		bad = fixture()
		bad.bufferViews[0].byteLength = value
		reject(bad, "invalid view length %s" % value)
	for value in [0, 1, 6, 8, 256, 1.5, true]:
		bad = fixture()
		bad.bufferViews[0].byteStride = value
		reject(bad, "invalid view stride %s" % value)
	bad = fixture()
	bad.buffers[0].byteLength = 37
	reject(bad, "declared buffer exceeds BIN chunk")
	bad = fixture()
	reject(bad, "excess BIN padding", 40)
	var padded := fixture()
	padded.buffers[0].byteLength = 37
	require(not WorldProjection._inspect_glb(glb(padded, 40)).is_empty(), "three bytes of BIN padding rejected")
	var interleaved := fixture()
	interleaved.buffers[0].byteLength = 44
	interleaved.bufferViews[0].byteLength = 44
	interleaved.bufferViews[0].byteStride = 16
	require(not WorldProjection._inspect_glb(glb(interleaved, 44)).is_empty(), "valid exact-boundary interleaved stride rejected")
	bad = fixture()
	bad.accessors.append({"bufferView":0,"componentType":5121,"count":1,"type":"MAT3","byteOffset":25})
	reject(bad, "unpadded byte matrix")
	for field in ["materials", "textures", "samplers", "cameras"]:
		var limit := 32 if field == "cameras" else 256
		bad = fixture()
		bad[field] = []
		for i in range(limit + 1):
			bad[field].append({})
		reject(bad, "too many %s" % field)
		bad = fixture()
		bad[field] = [null]
		reject(bad, "invalid %s descriptor" % field)
	var max_materials := fixture()
	max_materials["materials"] = []
	for i in range(256):
		max_materials.materials.append({})
	require(WorldProjection._inspect_glb(glb(max_materials)).get("materials") == 256, "material budget rejected its exact limit")
	var material_bomb := fixture()
	material_bomb["materials"] = []
	for i in range(5000):
		material_bomb.materials.append({})
	reject(material_bomb, "5000-material importer allocation")

	var malformed := fixture()
	malformed.accessors[0].componentType = 99999999
	var crash_bytes := glb(malformed)
	var crash_sha := digest(crash_bytes)
	var projection := WorldProjection.new()
	root.add_child(projection)
	require(projection.bind_confirmed(design(), catalog(crash_sha), SESSION), "fixture catalog not bound")
	require(projection.accept_surface(surface(), SESSION, Vector2i.ZERO), "fixture surface not bound")
	require(projection.needed_assets().size() == 1, "fixture asset not requested")
	require(not projection.supply_asset(crash_sha, crash_bytes, SESSION), "malformed hash-matching GLB reached native import")
	require(projection.get_child_count() == 0, "malformed GLB produced a visual")
	var good_sha := digest(baseline)
	require(projection.bind_confirmed(design(), catalog(good_sha), SESSION), "valid fixture catalog not bound")
	require(projection.supply_asset(good_sha, baseline, SESSION), "valid exact-boundary fixture failed native import")
	require(projection.get_child_count() == 1, "valid fixture did not produce an actual model")
	var real_asset := FileAccess.get_file_as_bytes("res://assets/starter_village/Barrel.glb")
	require(not WorldProjection._inspect_glb(real_asset).is_empty(), "real CC0 barrel GLB rejected")
	projection.queue_free()
	# Each model is individually legal, but the fifth must not push the cached
	# family of models past the aggregate importer-material budget.
	var family_design := design()
	family_design.designs[0].placements.clear()
	var family_catalog := catalog("a".repeat(64))
	family_catalog.entries.clear()
	var models: Array = []
	for i in range(5):
		var member := max_materials.duplicate(true)
		member.asset["generator"] = "material-budget-%d" % i
		var bytes := glb(member)
		var sha := digest(bytes)
		var entry: Dictionary = catalog(sha).entries[0]
		entry.assetId = "glb_bounded_%d" % i
		family_catalog.entries.append(entry)
		var placement: Dictionary = design().designs[0].placements[0]
		placement.assetId = entry.assetId
		placement.placementKey = "fixture-%d" % i
		family_design.designs[0].placements.append(placement)
		models.append({"sha":sha,"bytes":bytes})
	var family := WorldProjection.new()
	root.add_child(family)
	require(family.bind_confirmed(family_design, family_catalog, SESSION), "material-budget family not bound")
	require(family.accept_surface(surface(), SESSION, Vector2i.ZERO), "material-budget surface not bound")
	for i in range(models.size()):
		var accepted: bool = family.supply_asset(models[i].sha, models[i].bytes, SESSION)
		require(accepted == (i < 4), "aggregate material budget failed at model %d" % i)
	require(family.get_child_count() == 4, "aggregate material budget drew the wrong number of models")
	family.queue_free()
	await process_frame
	if failures.is_empty():
		print("GODOT_WORLD_GLB_STRUCTURE_PASS (synthetic malformed GLBs and local CC0 GLB only)")
	else:
		for failure in failures:
			push_error(failure)
	quit(0 if failures.is_empty() else 1)
