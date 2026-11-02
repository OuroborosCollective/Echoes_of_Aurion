extends SceneTree
## Synthetic contract checks; this is not a live-world capture or DB evidence.
const Projection = preload("res://world/living_history_projection.gd")
const Codec = preload("res://net/zone_codec.gd")
const SESSION := "zone_peer_history_fixture_123456"
var failures: Array[String] = []

func require(value: bool, message: String) -> void:
	if not value:
		failures.append(message)

func _init() -> void:
	call_deferred("verify")

func welcome() -> Dictionary:
	var nodes: Array = []
	for id in Codec.NODE_IDS:
		nodes.append({"nodeId":id,"remaining":5,"depleted":false,"respawnAtTick":null})
	return {"type":"welcome","protocolVersion":5,"zoneId":"observatory_threshold", "connectionId":SESSION,
		"selfEntityId":"player:1","snapshotSeq":1,"tick":1,
		"presences":[{"entityId":"player:1","userId":1,"position":{"x":0,"z":0},"lastAcceptedClientSeq":0}],
		"mobs":[],"combatants":[],"resources":{"contractVersion":1,"contentSourceRevision":Codec.FIXED_CONTENT,"revision":1,"nodes":nodes}}

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

func verify() -> void:
	var world := "echoes-of-aurion-global"
	var event := {"eventId":"event-1", "civilizationId":"civ-1", "worldId":world,
		"worldEpoch":3, "eventType":"CIVILIZATION_COLLAPSE", "sourceReceiptId":"receipt-1",
		"sourceRevision":"aurion:civ:v1", "eventPayloadHash":"a".repeat(64), "occurredSequence":7,
		"ruinId":"ruin-1", "ruinState":"DISCOVERED", "historyDigest":"b".repeat(64),
		"sourceEpoch":4, "sourceReactionHash":"c".repeat(64)}
	var response := {"schema":"aurion.discovered-ruin-history.v1", "worldId":world,
		"disclosureScope":"globally-discovered", "events":[event]}
	var presented: Dictionary = Projection.present(response, world)
	require(presented.get("ok") == true and presented.get("count") == 1, "valid disclosed event rejected")
	require(str(presented.get("text", "")).contains("receipt-1") and str(presented.get("text", "")).contains("ruin-1"), "provenance missing from presentation")
	var wrong_world: Dictionary = response.duplicate(true)
	wrong_world.events[0].worldId = "another-world"
	require(Projection.present(wrong_world, world).get("ok") == false, "foreign world accepted")
	var undisclosed: Dictionary = response.duplicate(true)
	undisclosed.events[0].ruinState = "ELIGIBLE"
	require(Projection.present(undisclosed, world).get("ok") == false, "undiscovered ruin accepted")
	var missing_proof: Dictionary = response.duplicate(true)
	missing_proof.events[0].sourceReactionHash = "invalid"
	require(Projection.present(missing_proof, world).get("ok") == false, "unbound source accepted")
	var duplicate: Dictionary = response.duplicate(true)
	duplicate.events.append(event.duplicate(true))
	require(Projection.present(duplicate, world).get("ok") == false, "duplicate event accepted")
	var empty: Dictionary = response.duplicate(true)
	empty.events = []
	require(Projection.present(empty, world).get("ok") == true, "empty readback was treated as an error")
	var scene := (load("res://app/main.tscn") as PackedScene).instantiate()
	root.add_child(scene)
	await process_frame
	var label := scene.get_node_or_null("%HistoryStatus") as Label
	require(label != null and not label.visible, "offline scene exposes history before an authenticated readback")
	if label != null:
		scene._on_zone_welcome(welcome())
		require(scene._apply_chunk_surface(surface(), SESSION), "confirmed test chunk rejected")
		var token_pair := {"version":"aurion.native-auth.v1", "tokenType":"Bearer", "accessToken":"a".repeat(43),
			"refreshToken":"r".repeat(43), "accessExpiresInSeconds":900,
			"refreshIdleExpiresInSeconds":604800, "refreshAbsoluteRemainingSeconds":2592000}
		require(scene._auth_start._tokens.accept_token_response(token_pair, Time.get_ticks_msec()), "test session rejected")
		scene._zone_socket._state = "connected"
		var generation: int = scene._auth_start.session_generation()
		scene._on_history_ready(response, "old-session", generation)
		require(not label.visible, "foreign session response accepted")
		scene._on_history_ready(response, SESSION, generation + 1)
		require(not label.visible, "stale credential generation accepted")
		scene._on_history_ready(response, SESSION, generation)
		require(label.visible and label.text.contains("receipt-1"), "valid scene readback was not shown")
		scene._update_world_freshness(scene._last_world_update_ms + 1000)
		require(not label.visible, "stale world retained visible history")
		scene._reset_projection()
		require(not label.visible and scene._history_world_id.is_empty(), "disconnect retained history")
	scene.queue_free()
	await process_frame
	if failures.is_empty():
		print("GODOT_LIVING_HISTORY_PROJECTION_PASS")
		quit(0)
	else:
		for failure in failures:
			printerr(failure)
		quit(1)
