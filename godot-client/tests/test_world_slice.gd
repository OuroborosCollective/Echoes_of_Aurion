extends SceneTree
## Explicit DTO fixtures: real Godot validation/rendering, no live receipts/device.
var failures: Array[String] = []
func require(ok: bool, why: String) -> void:
	if not ok: failures.append(why)
func _init() -> void:
	call_deferred("verify")
func fixture() -> Dictionary:
	var tiles: Array = []
	for z in range(16):
		for x in range(16): tiles.append({"x":x,"z":z,"heightMm":1250,"surface":"grass"})
	return {"status":"VERIFIED","connectionId":"zone_tabletop_fixture","mutationAuthority":"none","fingerprint":"sha256:" + "f".repeat(64),"slice":{
		"schema":"aurion.world-slice.v1","policy":"actor-observed-current-epoch.v1","worldId":"echoes-of-aurion-global","zoneId":"observatory_threshold","actorId":"player:1","epoch":1,"worldRoot":"sha256:" + "a".repeat(64),"sourceRevision":"b".repeat(40),"observedAtTick":1,"coordinate":{"x":0,"z":0},"radius":1,"lod":"full","knowledgeHash":"sha256:" + "c".repeat(64),
		"chunks":[{"coordinate":{"x":0,"z":0},"authorityReceiptHash":"sha256:" + "d".repeat(64),"tiles":tiles,"structures":[{"id":"known-house","assetKey":"approved_fixture","positionMm":{"x":32000,"z":32000}}],"roads":[]}],"entities":[{"entityId":"player:1","position":{"x":0,"z":0}}]}}
func verify() -> void:
	var codec: Script = load("res://projection/world_slice.gd")
	require(codec != null, "WorldSlice projection validator missing")
	if codec != null:
		var input := fixture()
		var frozen := JSON.stringify(input)
		require(codec.validate(input, "zone_tabletop_fixture", "player:1", Vector2i.ZERO).get("ok", false), "known scoped DTO rejected")
		require(not codec.validate(input, "foreign", "player:1", Vector2i.ZERO).get("ok", false), "foreign connection accepted")
		require(not codec.validate(input, "zone_tabletop_fixture", "player:2", Vector2i.ZERO).get("ok", false), "foreign actor accepted")
		require(not codec.validate(input, "zone_tabletop_fixture", "player:1", Vector2i.ONE).get("ok", false), "camera can request unobserved coordinate")
		for mutation in ["extra", "duplicate", "neighbor", "private", "entity", "hash"]:
			var bad := input.duplicate(true)
			match mutation:
				"extra": bad.slice.worldSeed = "secret"
				"duplicate": bad.slice.chunks[0].tiles[1] = bad.slice.chunks[0].tiles[0]
				"neighbor": bad.slice.chunks.append(bad.slice.chunks[0])
				"private": bad.slice.chunks[0].resources = []
				"entity": bad.slice.entities[0].entityId = "player:2"
				"hash": bad.slice.worldRoot = "unbound"
			require(not codec.validate(bad, "zone_tabletop_fixture", "player:1", Vector2i.ZERO).get("ok", false), "invalid DTO accepted: " + mutation)
		var fogged := input.duplicate(true)
		fogged.status = "FOGGED"
		fogged.slice.knowledgeHash = null
		fogged.slice.chunks = []
		require(codec.validate(fogged, "zone_tabletop_fixture", "player:1", Vector2i.ZERO).get("ok", false), "fogged own position rejected")
		require(JSON.stringify(input) == frozen, "validation changed server DTO")
	var layer_script: Script = load("res://world/tabletop_projection.gd")
	require(layer_script != null, "Tabletop projection missing")
	if layer_script != null:
		var layer: Node3D = layer_script.new()
		root.add_child(layer)
		var input := fixture()
		var before := JSON.stringify(input)
		require(layer.apply_readback(input, "zone_tabletop_fixture", "player:1", Vector2i.ZERO), "tabletop rejected scoped readback")
		require(layer.terrain.get_child_count() == 1 and layer.structures.get_child_count() == 1, "bounded terrain and disclosed structure marker missing")
		var mesh: Node = layer.terrain.get_child(0)
		require(layer.apply_readback(input, "zone_tabletop_fixture", "player:1", Vector2i.ZERO) and layer.terrain.get_child(0) == mesh, "unchanged read rebuilt mesh")
		layer.set_category("structures", false)
		require(not layer.structures.visible and layer.terrain.visible, "category crossed visual boundary")
		layer.set_ceiling(0.0)
		require(layer.terrain.get_child_count() == 0, "visual cut retained above-plane terrain")
		layer.set_ceiling(INF)
		require(layer.terrain.get_child_count() == 1, "cut reset lost confirmed terrain")
		layer.set_transparency(true)
		require(layer.structures.get_child(0).material_override.albedo_color.a < 1.0, "structure transparency not visual")
		require(JSON.stringify(input) == before and layer.readback_fingerprint() == input.fingerprint, "visual controls changed slice")
		var stale := input.duplicate(true)
		stale.slice.epoch = 0
		require(not layer.apply_readback(stale, "zone_tabletop_fixture", "player:1", Vector2i.ZERO) and layer.terrain.get_child_count() == 0, "invalidated read retained geometry")
		layer.clear()
		require(layer.readback_fingerprint().is_empty() and layer.structures.get_child_count() == 0, "reset retained world knowledge")
		layer.queue_free()
		var camera: Camera3D = load("res://world/camera_rig.tscn").instantiate()
		root.add_child(camera)
		camera.follow_confirmed(Vector3(7, 1, 4))
		var original: Transform3D = camera.transform
		camera.set_tabletop(true, Vector3.ZERO)
		camera.zoom_visual(0.001)
		require(is_equal_approx(camera.orbit_distance, 160.0), "strategic zoom unbounded")
		camera.zoom_visual(1000)
		require(is_equal_approx(camera.orbit_distance, 48.0), "strategic zoom bypassed near bound")
		camera.set_tabletop(false)
		require(camera.transform.is_equal_approx(original), "mode switch failed to preserve player camera")
		camera.queue_free()
	var ui: Control = load("res://ui/screens/tabletop_controls.gd").new()
	root.add_child(ui)
	for screen_size in [Vector2(1340, 800), Vector2(640, 360), Vector2(360, 640)]:
		root.size = Vector2i(screen_size)
		var safe := Rect2(Vector2(16, 20), screen_size - Vector2(32, 40))
		ui.fit_layout(safe)
		await process_frame
		for button in ui._buttons:
			require(button.custom_minimum_size.y >= 48.0 and button.focus_mode != Control.FOCUS_NONE, "tabletop touch/focus accessibility lost")
		for excluded in ui.exclusions(): require(safe.encloses(excluded), "tabletop UI outside safe area: " + str(screen_size) + " / " + str(excluded))
	ui.queue_free()
	for failure in failures: push_error(failure)
	if failures.is_empty(): print("GODOT_WORLD_SLICE_PASS (DTO fixtures; no live receipt/device)")
	quit(0 if failures.is_empty() else 1)
