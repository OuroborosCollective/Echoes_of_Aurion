extends SceneTree
## Real active scene with synthetic Aurion protocol/readmodels and a local GLB.
const Codec = preload("res://net/zone_codec.gd")
const SESSION := "zone_peer_scene_world_design_123"
const SHA := "dbec78ee8f51587db4247186a44b75bc0cd639f5e3f0ea54803deaba95e4a17d"
var failures: Array[String] = []

func require(ok: bool, message: String) -> void:
	if not ok: failures.append(message)
func _init() -> void: call_deferred("verify")

func welcome() -> Dictionary:
	var nodes: Array = []
	for id in Codec.NODE_IDS: nodes.append({"nodeId":id,"remaining":5,"depleted":false,"respawnAtTick":null})
	return {"type":"welcome","protocolVersion":5,"zoneId":"observatory_threshold","connectionId":SESSION,
		"selfEntityId":"player:1","snapshotSeq":1,"tick":1,
		"presences":[{"entityId":"player:1","userId":1,"position":{"x":0,"z":0},"lastAcceptedClientSeq":0}],
		"mobs":[],"combatants":[],"resources":{"contractVersion":1,"contentSourceRevision":Codec.FIXED_CONTENT,"revision":1,"nodes":nodes}}

func surface() -> Dictionary:
	var tiles: Array = []
	for z in range(16):
		for x in range(16): tiles.append({"x":x,"z":z,"heightMm":1250,"surface":"grass"})
	return {"base":{"worldId":"echoes-of-aurion-global","worldSeedDigest":"fnv1a-1234abcd",
		"worldGenerationRevision":"a".repeat(40),"ruleSetVersion":"aurion-world-chunk.v1",
		"coordinate":{"x":0,"z":0},"baseRevision":1,"biome":"plains","tiles":tiles,
		"deterministicHash":"fnv1a-abcdef01"},"appliedDeltaIds":[],"visibleResources":[],
		"structures":[],"roads":[],"deterministicHash":"fnv1a-2345bcde"}

func design() -> Dictionary:
	return {"schemaVersion":"aurion.world-design.v1","revision":"c".repeat(64),"designs":[{
		"designKey":"test-village","version":1,"title":"Synthetic test village","designHash":"b".repeat(64),
		"expectedCatalogRevision":"a".repeat(64),"placements":[{"placementKey":"barrel-one",
			"assetId":"glb_test_barrel","chunkX":0,"chunkZ":0,"xMm":32000,"zMm":32000,
			"rotationQuarterTurns":0,"scalePermille":1000}]}]}

func catalog() -> Dictionary:
	return {"version":"aurion.glb-import.v1","revision":"a".repeat(64),"entries":[{
		"assetId":"glb_test_barrel","sha256":SHA,"storageUrl":"/api/assets/glb/"+SHA+".glb",
		"assetType":"arena","targetKey":null,"purpose":"world-environment","subcategory":"structure",
		"normalization":{"sourceSha256":SHA}}]}

func verify() -> void:
	var scene: Control = load("res://app/main.tscn").instantiate()
	root.add_child(scene)
	await process_frame
	var visuals := scene.get_node_or_null("WorldView/Live3D/World/WorldDesignVisuals") as Node3D
	require(visuals != null and visuals.get_child_count() == 0, "active scene has no empty world-design visual node")
	if visuals == null:
		scene.queue_free()
		finish()
		return
	require(Codec.is_valid_welcome(welcome()), "invalid fixture welcome")
	scene._on_zone_welcome(welcome())
	require(scene._apply_chunk_surface(surface(), SESSION), "fixture confirmed terrain could not enter active scene")
	scene._world_design_readback = design()
	scene._monster_catalog = catalog()
	scene._sync_world_design()
	require(visuals.needed_assets().size() == 1, "active scene did not join the previously confirmed chunk and design")
	var bytes := FileAccess.get_file_as_bytes("res://assets/starter_village/Barrel.glb")
	require(visuals.supply_asset(SHA, bytes, SESSION), "active scene rejected byte-identical model")
	require(visuals.get_child_count() == 1, "confirmed model missing from active 3D scene")
	if visuals.get_child_count() == 1:
		var model := visuals.get_child(0) as Node3D
		require(model.position.is_equal_approx(Vector3(0, 1.25, 0)), "active scene misplaced model relative to confirmed terrain")
		require(not model.find_children("*", "MeshInstance3D", true, false).is_empty(), "active scene lacks real model geometry")
	scene._world_design_readback = {}
	scene._sync_world_design()
	require(visuals.get_child_count() == 0, "empty current design response retained stale visuals")
	scene._world_design_readback = design()
	scene._sync_world_design()
	require(visuals.supply_asset(SHA, bytes, SESSION), "model could not recover after invalid design response")
	scene._monster_catalog = {}
	scene._sync_world_design()
	require(visuals.get_child_count() == 0, "empty current catalog response retained stale visuals")
	scene._monster_catalog = catalog()
	scene._sync_world_design()
	var neighbor_design := design()
	neighbor_design.designs[0].placements[0].chunkX = 1
	scene._world_design_readback = neighbor_design
	scene._sync_world_design()
	var neighbor := surface()
	neighbor.base.coordinate.x = 1
	require(scene._apply_neighbor_chunk_surface(neighbor, SESSION), "confirmed neighboring terrain rejected")
	require(visuals.supply_asset(SHA, bytes, SESSION), "neighbor model could not be loaded")
	require(visuals.get_child_count() == 1, "neighbor model missing before refresh")
	require(scene._apply_neighbor_chunk_surface(neighbor, SESSION), "unchanged neighbor refresh rejected")
	require(visuals.get_child_count() == 1 and visuals.needed_assets().is_empty(), "unchanged neighbor refresh discarded and requested the same model again")
	var neighbor_from_json: Variant = JSON.parse_string(JSON.stringify(neighbor))
	require(scene._apply_neighbor_chunk_surface(neighbor_from_json, SESSION), "JSON-decoded integer coordinates rejected for neighbor chunk")
	require(visuals.get_child_count() == 1, "JSON neighbor refresh lost the confirmed model")
	scene._update_world_freshness(scene._last_world_update_ms + 1000)
	require(not visuals.visible, "stale world continued displaying the design as fresh")
	var token_pair := {"version":"aurion.native-auth.v1", "tokenType":"Bearer", "accessToken":"a".repeat(43),
		"refreshToken":"r".repeat(43), "accessExpiresInSeconds":900,
		"refreshIdleExpiresInSeconds":604800, "refreshAbsoluteRemainingSeconds":2592000}
	require(scene._auth_start._tokens.accept_token_response(token_pair, Time.get_ticks_msec()), "auth-failure fixture session rejected")
	scene._auth_start._fail_refresh("NATIVE_AUTH_SESSION_EXPIRED")
	require(not scene._confirmed_zone.has_state() and visuals.get_child_count() == 0 and scene._world_design_readback.is_empty(), "failed refresh retained a confirmed world or its visuals")
	scene._on_zone_welcome(welcome())
	require(scene._apply_chunk_surface(surface(), SESSION), "expiry fixture terrain rejected")
	scene._world_design_readback = design()
	scene._monster_catalog = catalog()
	scene._sync_world_design()
	require(visuals.supply_asset(SHA, bytes, SESSION), "expiry fixture model rejected")
	require(scene._auth_start._tokens.accept_token_response(token_pair, Time.get_ticks_msec()), "expiry fixture session rejected")
	scene._auth_start._tokens._absolute_deadline_ms = Time.get_ticks_msec() - 1
	scene._zone_socket._state = "connected"
	scene._process(0.0)
	require(not scene._confirmed_zone.has_state() and visuals.get_child_count() == 0, "expired session retained a confirmed world without a refresh signal")
	scene._on_zone_closed("client_close")
	require(visuals.get_child_count() == 0 and visuals.needed_assets().is_empty(), "logout retained world-design models")
	scene.queue_free()
	await process_frame
	finish()

func finish() -> void:
	if failures.is_empty(): print("GODOT_WORLD_DESIGN_ACTIVE_SCENE_PASS (synthetic fixtures and local CC0 GLB only)")
	else:
		for failure in failures: push_error(failure)
	quit(0 if failures.is_empty() else 1)
