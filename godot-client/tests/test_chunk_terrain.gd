extends SceneTree
## G18: fixture-driven module test. The fixture is NOT a live Aurion receipt.
## The module must only display server-confirmed surfaces and may never generate
## gameplay data, world seeds, terrain colliders or authoritative heights.
var failures: Array[String] = []

func require(ok: bool, why: String) -> void:
	if not ok:
		failures.append(why)

func _init() -> void:
	call_deferred("verify")

func fixture() -> Dictionary:
	var tiles: Array = []
	for z in range(16):
		for x in range(16):
			tiles.append({"x":x,"z":z,"heightMm":1250,"surface":"ruin_path" if x < 4 else "grass"})
	return {"base":{
		"worldId":"echoes-of-aurion-global",
		"worldSeedDigest":"fnv1a-1234abcd",
		"worldGenerationRevision":"a".repeat(40),
		"ruleSetVersion":"aurion-world-chunk.v1",
		"coordinate":{"x":0,"z":0},
		"baseRevision":1,
		"biome":"plains",
		"tiles":tiles,
		"deterministicHash":"fnv1a-abcdef01",
		},"appliedDeltaIds":[],"visibleResources":[],"structures":[],"roads":[],"deterministicHash":"fnv1a-2345bcde"}

func verify() -> void:
	var script: Script = load("res://world/chunk_terrain.gd") as Script
	require(script != null, "G18 confirmed chunk terrain projection missing")
	if script == null:
		push_error("G18 confirmed chunk terrain projection missing")
		quit(1)
		return
	var region: Node3D = Node3D.new()
	root.add_child(region)
	var painter: Node3D = script.new()
	region.add_child(painter)
	var receipt := fixture()
	require(painter.apply_confirmed(receipt, "session-one"), "confirmed server-shaped chunk fixture rejected")
	require(painter.get_child_count() == 1, "confirmed chunk not rendered as exactly one bounded mesh")
	if painter.get_child_count() == 1:
		var tile_mesh: MeshInstance3D = painter.get_child(0) as MeshInstance3D
		require(tile_mesh != null and tile_mesh.mesh != null, "missing real generated surface geometry")
		if tile_mesh and tile_mesh.mesh:
			require(tile_mesh.mesh.get_surface_count() == 2, "paving and forest quadrants not separated")
			require(tile_mesh.mesh.get_aabb().size.x >= 63.9, "64m chunk surface collapsed")
			require(is_equal_approx(tile_mesh.mesh.get_aabb().position.y, 1.25), "server heightMm was not preserved")
			# Surface order is deterministic in chunk_terrain.gd. Verify that each
			# confirmed material actually samples its source atlas quadrant.
			var atlas: Texture2D = load("res://assets/world/aurion-surface-atlas.webp") as Texture2D
			require(atlas != null, "G17 source atlas missing from confirmed chunk projection")
			if atlas != null:
				var atlas_image: Image = atlas.get_image()
				var expected_offsets: Array[Vector2i] = [Vector2i(0, 0), Vector2i(512, 0)]
				for surface_index in range(mini(tile_mesh.mesh.get_surface_count(), expected_offsets.size())):
					var surface_material: StandardMaterial3D = tile_mesh.mesh.surface_get_material(surface_index) as StandardMaterial3D
					require(surface_material != null, "G18 chunk surface lacks its native atlas material")
					if surface_material == null:
						continue
					var projected_texture: Texture2D = surface_material.albedo_texture as Texture2D
					require(projected_texture != null, "G18 chunk surface has no projected atlas texture")
					if projected_texture == null:
						continue
					var projected_image: Image = projected_texture.get_image()
					require(projected_image.get_width() == 512 and projected_image.get_height() == 512,
						"G18 chunk surface texture is not an isolated 512px atlas tile")
					for point in [Vector2i(16, 16), Vector2i(256, 256), Vector2i(496, 496)]:
						var expected: Color = atlas_image.get_pixel(point.x + expected_offsets[surface_index].x, point.y + expected_offsets[surface_index].y)
						var actual: Color = projected_image.get_pixel(point.x, point.y)
						require(absf(actual.r - expected.r) < 0.025 and absf(actual.g - expected.g) < 0.025 and absf(actual.b - expected.b) < 0.025,
							"G18 confirmed surface is bound to the wrong atlas quadrant")
			# Godot's clockwise top-face rule differs from the cross-product
			# orientation used to infer normals: check both explicitly.
			for surface_index in range(tile_mesh.mesh.get_surface_count()):
				var arrays: Array = tile_mesh.mesh.surface_get_arrays(surface_index)
				var points: PackedVector3Array = arrays[Mesh.ARRAY_VERTEX]
				var expected_vertices: Array[int] = [384, 1152]
				if surface_index < expected_vertices.size():
					require(points.size() == expected_vertices[surface_index], "G18 confirmed surface IDs were assigned to the wrong tile group")
				var normals: PackedVector3Array = arrays[Mesh.ARRAY_NORMAL]
				require(points.size() >= 3 and normals.size() == points.size(), "G18 material surface lacks triangle vertices/normals")
				if points.size() >= 3 and normals.size() == points.size():
					var face_cross_y: float = (points[1] - points[0]).cross(points[2] - points[0]).y
					require(face_cross_y < -0.001, "G18 terrain faces use culled winding from above")
					require(normals[0].y > 0.99, "G18 terrain normals must point up for daylight")
	var stable_mesh: Node = painter.get_child(0) if painter.get_child_count() == 1 else null
	require(painter.apply_confirmed(receipt, "session-one"), "same validated chunk failed replay")
	require(painter.get_child_count() == 1 and painter.get_child(0) == stable_mesh, "unchanged readback rebuilt mesh")
	var stale := receipt.duplicate(true)
	stale.base.tiles.remove_at(0)
	require(not painter.apply_confirmed(stale, "session-one") and painter.get_child_count() == 0, "missing tile retained stale world")
	var bad := receipt.duplicate(true)
	bad.base.tiles[0].surface = "invented_surface"
	require(not painter.apply_confirmed(bad, "session-one") and painter.get_child_count() == 0, "unknown surface accepted as real")
	require(painter.apply_confirmed(receipt, "session-two"), "fresh confirmed session failed")
	require(painter.get_child_count() == 1 and painter.get_child(0) != stable_mesh, "old session retained 3D chunk mesh")
	painter.clear()
	require(painter.get_child_count() == 0, "chunk survived explicit session reset")
	await verify_active_chunk_scene(receipt)
	for failure in failures:
		push_error(failure)
	if failures.is_empty():
		print("G18 server-shaped chunk mesh projection verified")
	quit(0 if failures.is_empty() else 1)

## Explicit protocol-shape fixture in a real active PackedScene, not actual HTTP.
func verify_active_chunk_scene(receipt: Dictionary) -> void:
	var scene: Control = load("res://app/main.tscn").instantiate()
	root.add_child(scene)
	var floor: MeshInstance3D = scene.get_node("WorldView/Live3D/World/UnassignedFloor") as MeshInstance3D
	var terrain: Node3D = scene.get_node_or_null("WorldView/Live3D/World/ConfirmedTerrain") as Node3D
	require(terrain != null, "G18 active world lacks a separate confirmed terrain root")
	require(scene.has_method("_apply_chunk_surface"), "G18 active scene cannot apply an authenticated chunk readback")
	if terrain == null or not scene.has_method("_apply_chunk_surface"):
		scene.queue_free()
		return
	var nodes: Array = []
	for id in load("res://net/zone_codec.gd").NODE_IDS:
		nodes.append({"nodeId":id,"remaining":5,"depleted":false,"respawnAtTick":null})
	var welcome := {"type":"welcome","protocolVersion":5,"zoneId":"observatory_threshold",
		"connectionId":"zone_peer_g18_chunk_12345","selfEntityId":"player:1","snapshotSeq":1,"tick":1,
		"presences":[{"entityId":"player:1","userId":1,"position":{"x":0,"z":0},"lastAcceptedClientSeq":0}],
		"mobs":[],"combatants":[],"resources":{"contractVersion":1,
		"contentSourceRevision":load("res://net/zone_codec.gd").FIXED_CONTENT,"revision":1,"nodes":nodes}}
	scene._on_zone_welcome(welcome)
	require(scene._apply_chunk_surface(receipt, welcome.connectionId), "G18 active scene rejected server-shaped fixture")
	require(terrain.get_child_count() == 1 and not floor.visible, "G18 failed to replace the preview floor after confirmed geometry")
	# RED: neighboring readbacks need a bounded, independent presentation cache.
	var neighbors: Node3D = scene.get_node_or_null("WorldView/Live3D/World/ConfirmedNeighbors") as Node3D
	require(neighbors != null, "G18 missing bounded adjacent chunk presentation")
	require(scene.has_method("_apply_neighbor_chunk_surface"), "G18 missing adjacent readback projection")
	if neighbors != null and scene.has_method("_apply_neighbor_chunk_surface"):
		for dx in range(-1, 2):
			for dz in range(-1, 2):
				if dx == 0 and dz == 0:
					continue
				var adjacent := receipt.duplicate(true)
				adjacent.base.coordinate = {"x": dx, "z": dz}
				require(scene._apply_neighbor_chunk_surface(adjacent, welcome.connectionId), "G18 rejected allowed adjacent server-shaped chunk")
		require(neighbors.get_child_count() == 8, "G18 must render exactly eight bounded adjacent chunks")
		var duplicate := receipt.duplicate(true)
		duplicate.base.coordinate = {"x": 1, "z": 0}
		require(scene._apply_neighbor_chunk_surface(duplicate, welcome.connectionId) and neighbors.get_child_count() == 8,
			"G18 replay duplicated adjacent terrain")
		var foreign := receipt.duplicate(true)
		foreign.base.coordinate = {"x": 2, "z": 0}
		require(not scene._apply_neighbor_chunk_surface(foreign, welcome.connectionId), "G18 accepted a chunk beyond server-authorized neighborhood")
		require(not scene._apply_neighbor_chunk_surface(duplicate, "foreign-session"), "G18 accepted foreign session chunk")
		require(neighbors.get_child_count() == 8, "G18 invalid neighbor changed authenticated scene")
		# RED: an invalid refreshed surface must evict only that cached neighbor.
		# These are explicit synthetic protocol fixtures, not live Aurion evidence.
		var invalid_refresh := duplicate.duplicate(true)
		invalid_refresh.base.tiles[0].surface = "unrecognized_surface"
		require(not scene._apply_neighbor_chunk_surface(invalid_refresh, welcome.connectionId), "G18 accepted invalid refreshed neighbor")
		require(neighbors.get_node_or_null("Chunk_1_0") == null and neighbors.get_child_count() == 7,
			"G18 kept a stale mesh after an invalid refreshed neighbor")
		require(scene._apply_neighbor_chunk_surface(duplicate, welcome.connectionId) and neighbors.get_child_count() == 8,
			"G18 failed to recover a cleared neighbor from a fresh validated readback")
		# A protected HTTP failure must likewise never retain the last stale surface.
		scene._chunk_requested = Vector2i(1, 0)
		scene._on_chunk_surface_failed("CHUNK_RESPONSE_INVALID", welcome.connectionId)
		require(neighbors.get_node_or_null("Chunk_1_0") == null and neighbors.get_child_count() == 7,
			"G18 retained a stale neighboring mesh after an authenticated HTTP failure")
		require(scene._apply_neighbor_chunk_surface(duplicate, welcome.connectionId) and neighbors.get_child_count() == 8,
			"G18 failed to refill a failed neighbor with a valid readback")
	scene._on_zone_closed("client_close")
	require(terrain.get_child_count() == 0 and floor.visible, "G18 retained terrain across logout/session reset")
	if neighbors != null:
		require(neighbors.get_child_count() == 0, "G18 retained adjacent chunk meshes across logout")
	scene.queue_free()
