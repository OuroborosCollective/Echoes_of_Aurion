extends SceneTree
## G19 real llvmpipe framebuffer test. The v5 Welcome and read-model below
## are synthetic protocol fixtures, NEVER evidence of live world or Tab A9.
const SAMPLE_STEP := 12
var failures: Array[String] = []

func require(ok: bool, message: String) -> void:
	if not ok:
		failures.append(message)

func _init() -> void:
	call_deferred("verify")

func fixture() -> Dictionary:
	var tiles: Array = []
	for z in range(16):
		for x in range(16):
			tiles.append({"x": x, "z": z, "heightMm": 1250,
				"surface": "ruin_path" if x < 4 else "grass"})
	return {"base": {
		"worldId": "echoes-of-aurion-global",
		"worldSeedDigest": "fnv1a-1234abcd",
		"worldGenerationRevision": "a".repeat(40),
		"ruleSetVersion": "aurion-world-chunk.v1",
		"coordinate": {"x": 0, "z": 0}, "baseRevision": 1,
		"biome": "plains", "tiles": tiles,
		"deterministicHash": "fnv1a-abcdef01"},
		"appliedDeltaIds": [], "visibleResources": [], "structures": [],
		"roads": [], "deterministicHash": "fnv1a-2345bcde"}

func welcome() -> Dictionary:
	var nodes: Array = []
	for id in load("res://net/zone_codec.gd").NODE_IDS:
		nodes.append({"nodeId": id, "remaining": 5, "depleted": false, "respawnAtTick": null})
	return {"type": "welcome", "protocolVersion": 5,
		"zoneId": "observatory_threshold",
		"connectionId": "zone_peer_g19_render_proof",
		"selfEntityId": "player:1", "snapshotSeq": 1, "tick": 1,
		"presences": [{"entityId": "player:1", "userId": 1,
			"position": {"x": 0, "z": 0}, "lastAcceptedClientSeq": 0}],
		"mobs": [], "combatants": [],
		"resources": {"contractVersion": 1,
			"contentSourceRevision": load("res://net/zone_codec.gd").FIXED_CONTENT,
			"revision": 1, "nodes": nodes}}

func take_frame(viewport: SubViewport) -> Image:
	for i in range(4):
		await process_frame
	await RenderingServer.frame_post_draw
	return viewport.get_texture().get_image()

func measure(before: Image, after: Image) -> Dictionary:
	var sampled := 0
	var changed := 0
	var lit := 0
	var palette: Dictionary = {}
	for y in range(0, after.get_height(), SAMPLE_STEP):
		for x in range(0, after.get_width(), SAMPLE_STEP):
			var a := before.get_pixel(x, y)
			var b := after.get_pixel(x, y)
			sampled += 1
			if absf(a.r - b.r) + absf(a.g - b.g) + absf(a.b - b.b) > 0.16:
				changed += 1
			if b.r + b.g + b.b > 0.40:
				lit += 1
			palette["%d:%d:%d" % [roundi(b.r * 6.0), roundi(b.g * 6.0), roundi(b.b * 6.0)]] = true
	return {"sampled": sampled, "changed": changed, "lit": lit, "colors": palette.size()}

func verify() -> void:
	if DisplayServer.get_name() == "headless":
		push_error("G19 requires actual OpenGL display, not headless")
		quit(1)
		return
	if not ClassDB.class_exists("Terrain3D"):
		push_error("G19 actual native Terrain3D library not loaded")
		quit(1)
		return
	var output := OS.get_environment("AURION_G19_CAPTURE_DIR")
	if output.is_empty():
		push_error("AURION_G19_CAPTURE_DIR required")
		quit(1)
		return
	DirAccess.make_dir_recursive_absolute(output)
	var packed := load("res://app/main.tscn") as PackedScene
	require(packed != null, "G19 active main scene missing")
	if packed == null:
		finish(null)
		return
	root.size = Vector2i(960, 600)
	DisplayServer.window_set_size(root.size)
	var scene := packed.instantiate() as Control
	require(scene != null, "G19 active scene unavailable")
	if scene == null:
		finish(null)
		return
	root.add_child(scene)
	var admitted := welcome()
	scene._on_zone_welcome(admitted)
	require(scene._confirmed_zone.has_state(), "G19 v5 fixture welcome rejected")
	if not scene._confirmed_zone.has_state():
		finish(scene)
		return
	scene._show_3d()
	var viewport := scene.get_node("WorldView/Live3D") as SubViewport
	var camera := scene.get_node("WorldView/Live3D/World/WorldCamera") as Camera3D
	var neutral := scene.get_node("WorldView/Live3D/World/UnassignedFloor") as MeshInstance3D
	var fallback := scene.get_node("WorldView/Live3D/World/ConfirmedTerrain") as Node3D
	camera.position = Vector3(0.0, 12.0, 20.0)
	camera.look_at(Vector3(0.0, 1.25, 0.0), Vector3.UP)
	var before := await take_frame(viewport)
	require(not before.is_empty(), "G19 native baseline image missing")
	if before.is_empty():
		finish(scene)
		return
	require(before.save_png(output.path_join("g19-neutral.png")) == OK, "G19 baseline PNG failed")
	require(scene._apply_chunk_surface(fixture(), admitted.connectionId), "G19 server-shaped chunk fixture rejected")
	var bridge: Node3D = scene._terrain3d_bridge()
	require(bridge != null, "G19 live scene lacks optional native bridge")
	if bridge == null:
		finish(scene)
		return
	var native_terrain: Node3D = bridge.terrain_node()
	require(native_terrain != null and native_terrain.get_class() == "Terrain3D", "G19 native Terrain3D node missing")
	require(not fallback.visible and not neutral.visible, "G19 fallback still visible or neutral floor not hidden")
	require(bridge.active_chunk_count() == 1, "G19 native center chunk not projected")
	var after := await take_frame(viewport)
	require(not after.is_empty() and after.get_size() == before.get_size(), "G19 rendered native frame invalid")
	if not after.is_empty() and after.get_size() == before.get_size():
		require(after.save_png(output.path_join("g19-native-terrain3d.png")) == OK, "G19 native PNG failed")
		var evidence := measure(before, after)
		print("G19_IMAGE_READBACK sampled=%d changed=%d lit=%d colors=%d" % [evidence.sampled, evidence.changed, evidence.lit, evidence.colors])
		require(evidence.changed >= maxi(20, int(evidence.sampled / 20)), "G19 Terrain3D made no meaningful visible pixel change")
		require(evidence.lit >= maxi(20, int(evidence.sampled / 10)), "G19 Terrain3D is dark or blank")
		require(evidence.colors >= 3, "G19 Terrain3D has no useful color variation")
	var invalid := fixture()
	invalid.base.tiles[0].surface = "unauthorized_surface"
	require(not scene._apply_chunk_surface(invalid, admitted.connectionId), "G19 invalid authenticated chunk accepted")
	require(bridge.active_chunk_count() == 0 and bridge.terrain_node() == null and neutral.visible, "G19 failed closed: stale native terrain after invalidation")
	finish(scene)

func finish(scene: Control) -> void:
	if scene != null:
		scene._reset_projection()
		scene.queue_free()
	for failure in failures:
		push_error(failure)
	if failures.is_empty():
		print("G19_NATIVE_TERRAIN3D_REAL_PIXELS_PASS (fixture only, not Android)")
	quit(0 if failures.is_empty() else 1)
