extends SceneTree
## Isolated, rendered G18 projection test: synthetic protocol fixture, never live
## Aurion/DB/device evidence. Both PNGs come from a real Godot SubViewport.
const ROOT_SCENE := "res://app/main.tscn"
const SAMPLE_STEP := 12
var failures: Array[String] = []

func _init() -> void:
	call_deferred("verify")

func require(ok: bool, reason: String) -> void:
	if not ok:
		failures.append(reason)

func fixture() -> Dictionary:
	var tiles: Array = []
	for z in range(16):
		for x in range(16):
			tiles.append({"x": x, "z": z, "heightMm": 1250, "surface": "ruin_path" if x < 4 else "grass"})
	return {"base": {
		"worldId": "echoes-of-aurion-global", "worldSeedDigest": "fnv1a-1234abcd",
		"worldGenerationRevision": "a".repeat(40), "ruleSetVersion": "aurion-world-chunk.v1",
		"coordinate": {"x": 0, "z": 0}, "baseRevision": 1,
		"biome": "plains", "tiles": tiles, "deterministicHash": "fnv1a-abcdef01"
	}, "appliedDeltaIds": [], "visibleResources": [], "structures": [],
	"roads": [], "deterministicHash": "fnv1a-2345bcde"}

func welcome() -> Dictionary:
	var nodes: Array = []
	for id in load("res://net/zone_codec.gd").NODE_IDS:
		nodes.append({"nodeId": id, "remaining": 5, "depleted": false, "respawnAtTick": null})
	return {"type": "welcome", "protocolVersion": 5, "zoneId": "observatory_threshold",
		"connectionId": "zone_peer_g18_render_proof", "selfEntityId": "player:1",
		"snapshotSeq": 1, "tick": 1,
		"presences": [{"entityId": "player:1", "userId": 1,
			"position": {"x": 0, "z": 0}, "lastAcceptedClientSeq": 0}],
		"mobs": [], "combatants": [], "resources": {"contractVersion": 1,
			"contentSourceRevision": load("res://net/zone_codec.gd").FIXED_CONTENT,
			"revision": 1, "nodes": nodes}}

func take_frame(viewport: SubViewport) -> Image:
	await process_frame
	await process_frame
	await RenderingServer.frame_post_draw
	return viewport.get_texture().get_image()

func compare_frames(before: Image, after: Image) -> Dictionary:
	var sampled := 0
	var changed := 0
	var lit := 0
	var palette: Dictionary = {}
	for y in range(0, after.get_height(), SAMPLE_STEP):
		for x in range(0, after.get_width(), SAMPLE_STEP):
			var a: Color = before.get_pixel(x, y)
			var b: Color = after.get_pixel(x, y)
			sampled += 1
			if absf(a.r - b.r) + absf(a.g - b.g) + absf(a.b - b.b) > 0.16:
				changed += 1
			if b.r + b.g + b.b > 0.40:
				lit += 1
			palette["%d:%d:%d" % [roundi(b.r * 6.0), roundi(b.g * 6.0), roundi(b.b * 6.0)]] = true
	return {"sampled": sampled, "changed": changed, "lit": lit, "colors": palette.size()}

func verify() -> void:
	if DisplayServer.get_name() == "headless":
		push_error("G18 rendered-world test needs a real display backend, not headless")
		quit(1)
		return
	var output: String = OS.get_environment("AURION_CAPTURE_DIR")
	if output.is_empty():
		push_error("AURION_CAPTURE_DIR missing for G18 render evidence")
		quit(1)
		return
	DirAccess.make_dir_recursive_absolute(output)
	var packed: PackedScene = load(ROOT_SCENE) as PackedScene
	if packed == null:
		push_error("G18 native world scene unavailable")
		quit(1)
		return
	root.size = Vector2i(960, 600)
	DisplayServer.window_set_size(root.size)
	var scene: Control = packed.instantiate() as Control
	if scene == null:
		push_error("G18 native world scene failed to instantiate")
		quit(1)
		return
	root.add_child(scene)
	var admitted: Dictionary = welcome()
	scene._on_zone_welcome(admitted)
	require(scene._confirmed_zone.has_state(), "G18 fixture welcome rejected")
	if not scene._confirmed_zone.has_state():
		finish(scene)
		return
	scene._show_3d()
	var viewport: SubViewport = scene.get_node("WorldView/Live3D") as SubViewport
	var camera: Camera3D = scene.get_node("WorldView/Live3D/World/WorldCamera") as Camera3D
	var terrain: Node3D = scene.get_node("WorldView/Live3D/World/ConfirmedTerrain") as Node3D
	var floor: MeshInstance3D = scene.get_node("WorldView/Live3D/World/UnassignedFloor") as MeshInstance3D
	camera.position = Vector3(0.0, 12.0, 20.0)
	camera.look_at(Vector3(0.0, 1.25, 0.0), Vector3.UP)
	var baseline: Image = await take_frame(viewport)
	require(not baseline.is_empty(), "G18 no baseline framebuffer pixels")
	if baseline.is_empty():
		finish(scene)
		return
	require(baseline.save_png(output.path_join("g18-unassigned.png")) == OK, "G18 baseline PNG write failed")
	require(floor.visible and terrain.get_child_count() == 0, "G18 baseline must contain neutral presentation only")
	require(scene._apply_chunk_surface(fixture(), admitted.connectionId), "G18 confirmed readback fixture not applied")
	require(not floor.visible and terrain.get_child_count() == 1, "G18 confirmed readback did not replace neutral floor")
	var confirmed: Image = await take_frame(viewport)
	require(not confirmed.is_empty() and confirmed.get_size() == baseline.get_size(), "G18 confirmed framebuffer missing or resized")
	if not confirmed.is_empty() and confirmed.get_size() == baseline.get_size():
		require(confirmed.save_png(output.path_join("g18-confirmed.png")) == OK, "G18 confirmed PNG write failed")
		var evidence: Dictionary = compare_frames(baseline, confirmed)
		print("G18_IMAGE_READBACK sampled=%d changed=%d lit=%d colors=%d" % [evidence.sampled, evidence.changed, evidence.lit, evidence.colors])
		require(evidence.changed >= maxi(20, int(evidence.sampled / 20)), "G18 confirmed geometry made no meaningful visible pixel change")
		require(evidence.lit >= maxi(20, int(evidence.sampled / 10)), "G18 rendered surface is dark/blank")
		require(evidence.colors >= 3, "G18 rendered surface has no useful color variation")
	var invalid: Dictionary = fixture()
	invalid.base.tiles[0].surface = "not_authorized"
	require(not scene._apply_chunk_surface(invalid, admitted.connectionId), "G18 invalid refresh accepted as terrain")
	require(terrain.get_child_count() == 0 and floor.visible, "G18 stale confirmed mesh remained visible after rejection")
	finish(scene)

func finish(scene: Control) -> void:
	scene.queue_free()
	for failure in failures:
		push_error(failure)
	if failures.is_empty():
		print("G18_REAL_SOFTWARE_RENDER_CONFIRMED_CHUNK_PASS (fixture only, no live world)")
	quit(0 if failures.is_empty() else 1)
