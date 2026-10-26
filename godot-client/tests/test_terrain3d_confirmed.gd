extends SceneTree
## Real Godot + native Terrain3D GDExtension regression. All world readbacks below
## are deterministic synthetic protocol fixtures; NEVER production-world proof.
var failures: Array[String] = []

func require(ok: bool, why: String) -> void:
	if not ok:
		failures.append(why)

func _init() -> void:
	call_deferred("verify")

func fixture(x_chunk: int = 0, z_chunk: int = 0, elevation_mm: int = 1250) -> Dictionary:
	var tiles: Array = []
	for z in range(16):
		for x in range(16):
			var surface := "ruin_path" if x < 4 else "grass"
			tiles.append({"x":x, "z":z, "heightMm":elevation_mm, "surface":surface})
	return {"base":{
		"worldId":"echoes-of-aurion-global",
		"worldSeedDigest":"fnv1a-1234abcd",
		"worldGenerationRevision":"a".repeat(40),
		"ruleSetVersion":"aurion-world-chunk.v1",
		"coordinate":{"x":x_chunk, "z":z_chunk},
		"baseRevision":1,
		"biome":"plains",
		"tiles":tiles,
		"deterministicHash":"fnv1a-abcdef01",
		},"appliedDeltaIds":[],"visibleResources":[],"structures":[],"roads":[],"deterministicHash":"fnv1a-2345bcde"}

func verify() -> void:
	require(ClassDB.class_exists("Terrain3D"), "Pinned Terrain3D native GDExtension not installed or failed to load")
	var implementation: Script = load("res://world/terrain3d_confirmed.gd") as Script
	require(implementation != null, "G19 native Terrain3D confirmed-chunk bridge missing")
	if implementation == null or not ClassDB.class_exists("Terrain3D"):
		for failure in failures:
			push_error(failure)
		quit(1)
		return
	var bridge: Node3D = implementation.new()
	root.add_child(bridge)
	var center := fixture()
	require(bridge.apply_confirmed(center, "zone_session_1"), "G19 refused a valid center fixture")
	require(bridge.active_chunk_count() == 1, "G19 native bridge failed to remember exactly one confirmed chunk")
	var terrain: Node3D = bridge.terrain_node()
	require(terrain != null and terrain.get_class() == "Terrain3D", "G19 must instantiate the real native Terrain3D class")
	if terrain:
		require(terrain.data.get_region_count() > 0 and terrain.data.get_region_count() <= 4, "G19 exceeded 4 native regions for center chunk")
		require(is_equal_approx(terrain.data.get_height(Vector3(-31, 0, -31)), 1.25), "G19 lost authenticated source height in 3D native terrain")
		require(terrain.data.get_control_base_id(Vector3(-31, 0, -31)) == 2, "G19 failed to map original paving surface")
		require(terrain.data.get_control_base_id(Vector3(1, 0, -31)) == 0, "G19 failed to map original forest surface")
		require(terrain.data.get_control_hole(Vector3(-100, 0, -100)), "G19 rendered unauthenticated area outside confirmed chunks")
		require(terrain.collision.mode == 0, "G19 illegally created client gameplay collision")
	require(bridge.apply_confirmed(center, "zone_session_1"), "G19 exact replay should be idempotent")
	require(bridge.active_chunk_count() == 1, "G19 duplicated a replayed chunk")
	var neighbor := fixture(1, 0, 2500)
	require(bridge.apply_confirmed(neighbor, "zone_session_1"), "G19 refused authenticated right-hand neighbor")
	require(bridge.active_chunk_count() == 2, "G19 lost/duplicated adjacent chunk")
	terrain = bridge.terrain_node()
	if terrain:
		require(is_equal_approx(terrain.data.get_height(Vector3(33, 0, -31)), 2.5), "G19 failed to preserve adjacent 2.5m server height")
		require(is_equal_approx(terrain.data.get_height(Vector3(-31, 0, -31)), 1.25), "G19 overwrote first chunk while importing adjacent")
	require(bridge.remove_chunk(Vector2i(1, 0)), "G19 failed to remove invalidated neighboring projection")
	require(bridge.active_chunk_count() == 1, "G19 left a stale adjacent native chunk after failed readback")
	terrain = bridge.terrain_node()
	if terrain:
		require(terrain.data.get_control_hole(Vector3(33, 0, -31)), "G19 leaked invalidated adjacent native height")
	var invalid := center.duplicate(true)
	invalid.base.tiles[0].surface = "unknown"
	require(not bridge.apply_confirmed(invalid, "zone_session_1"), "G19 accepted unknown/unconfirmed surface ID")
	require(bridge.active_chunk_count() == 0, "G19 retained invalidated center native surface")
	require(bridge.apply_confirmed(center, "zone_session_2"), "G19 failed to rebuild after new session")
	bridge.clear()
	require(bridge.active_chunk_count() == 0 and bridge.terrain_node() == null, "G19 native terrain survived logout")
	# Real active scene can accept the same confirmed fixture using the optional
	# GPU bridge, with the legacy G18 mesh still available as fallback.
	var scene: Control = load("res://app/main.tscn").instantiate()
	root.add_child(scene)
	require(scene.get_node_or_null("WorldView/Live3D/World/ConfirmedTerrain3D") != null, "G19 active world missing Terrain3D host")
	require(scene._terrain3d_bridge() != null, "G19 active world failed to create native Terrain3D bridge")
	scene._reset_projection()
	require(scene._terrain3d_bridge().active_chunk_count() == 0, "G19 scene leaked native chunks after reset")
	scene.queue_free()

	for failure in failures:
		push_error(failure)
	if failures.is_empty():
		print("G19_NATIVE_TERRAIN3D_CONFIRMED_FIXTURE_PASS")
	quit(0 if failures.is_empty() else 1)
