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
	scene._on_zone_closed("client_close")
	require(terrain.get_child_count() == 0 and floor.visible, "G18 retained terrain across logout/session reset")
	scene.queue_free()
