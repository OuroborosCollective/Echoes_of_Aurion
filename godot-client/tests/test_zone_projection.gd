extends SceneTree
## G11 phase A: only validated Aurion welcome/snapshot state can be displayed.
## Static fixture tests here are headless contract evidence, not live server proof.
const Codec = preload("res://net/zone_codec.gd")
var errors: Array[String] = []

func require(ok: bool, description: String) -> void:
	if not ok:
		errors.append(description)

func welcome_fixture() -> Dictionary:
	var nodes: Array = []
	for id in Codec.NODE_IDS:
		nodes.append({"nodeId": id, "remaining": 5, "depleted": false, "respawnAtTick": null})
	return {
		"type": "welcome", "protocolVersion": 5, "zoneId": "observatory_threshold",
		"connectionId": "zone_peer_abcdefghijklmnop", "selfEntityId": "player:1",
		"snapshotSeq": 8, "tick": 12,
		"presences": [{"entityId": "player:1", "userId": 1,
			"position": {"x": 1000, "z": -2000}, "lastAcceptedClientSeq": 0}],
		"mobs": [], "combatants": [],
		"resources": {"contractVersion": 1,
			"contentSourceRevision": Codec.FIXED_CONTENT, "revision": 1, "nodes": nodes},
	}

func snapshot_from(welcome: Dictionary) -> Dictionary:
	var snapshot: Dictionary = welcome.duplicate(true)
	for key in ["protocolVersion", "connectionId", "selfEntityId"]:
		snapshot.erase(key)
	snapshot["type"] = "snapshot"
	return snapshot

func _init() -> void:
	call_deferred("verify")

func verify() -> void:
	var target := "res://projection/zone_state.gd"
	if not ResourceLoader.exists(target):
		require(false, "G11 zone_state projection does not exist")
		finish()
		return
	var state_source: Script = load(target) as Script
	require(state_source != null, "G11 zone_state is not a script")
	if state_source == null:
		finish()
		return
	var projection: Variant = state_source.new()
	require(not projection.has_state(), "G11 unexpectedly has an authenticated world before welcome")
	var welcome: Dictionary = welcome_fixture()
	require(Codec.is_valid_welcome(welcome), "G11 welcome fixture violates Aurion v5")
	var first_snapshot := snapshot_from(welcome)
	first_snapshot["snapshotSeq"] = 9
	first_snapshot["tick"] = 13
	require(not projection.apply_snapshot(first_snapshot), "unauthenticated snapshot bootstrapped projection")
	require(not projection.has_state(), "unauthenticated snapshot created a readmodel")
	require(not projection.apply_welcome({"type": "welcome"}), "malformed welcome was accepted")
	require(projection.apply_welcome(welcome), "valid server welcome did not bootstrap projection")
	require(projection.has_state(), "welcome did not activate world readmodel")
	require(projection.last_seq() == 8 and projection.last_tick() == 12, "welcome snapshot watermark missing")
	require(projection.self_entity_id() == "player:1", "player identity was not derived from welcome")
	require(projection.connection_id() == "zone_peer_abcdefghijklmnop", "session identity was not derived from welcome")
	require(not projection.apply_welcome(welcome), "duplicate welcome overwrote an active authenticated session")
	welcome["presences"][0]["position"]["x"] = 99999
	require(projection.current_state()["presences"][0]["position"]["x"] == 1000, "input mutation contaminated stored server state")
	var displayed: Dictionary = projection.current_state()
	displayed["presences"][0]["position"]["x"] = 77777
	require(projection.current_state()["presences"][0]["position"]["x"] == 1000, "display mutation contaminated stored server state")

	var newer: Dictionary = first_snapshot.duplicate(true)
	newer["presences"][0]["position"]["x"] = 2000
	require(Codec.is_valid_snapshot(newer), "new snapshot fixture violates Aurion v5")
	require(projection.apply_snapshot(newer), "fresh authoritative snapshot rejected")
	require(projection.last_seq() == 9 and projection.last_tick() == 13, "fresh snapshot watermark missing")
	require(projection.current_state()["presences"][0]["position"]["x"] == 2000, "confirmed integer position not preserved")
	require(not projection.apply_snapshot(newer), "duplicate snapshot applied twice")
	var stale_sequence: Dictionary = newer.duplicate(true)
	stale_sequence["snapshotSeq"] = 8
	require(not projection.apply_snapshot(stale_sequence), "old snapshot sequence replayed")
	var backwards_tick: Dictionary = newer.duplicate(true)
	backwards_tick["snapshotSeq"] = 10
	backwards_tick["tick"] = 12
	require(not projection.apply_snapshot(backwards_tick), "server tick rolled backward")
	var invalid_zone: Dictionary = newer.duplicate(true)
	invalid_zone["snapshotSeq"] = 10
	invalid_zone["zoneId"] = "forged_zone"
	require(not projection.apply_snapshot(invalid_zone), "foreign zone state crossed projection boundary")
	var invalid_resources: Dictionary = newer.duplicate(true)
	invalid_resources["snapshotSeq"] = 10
	invalid_resources["resources"]["revision"] = 0
	require(not projection.apply_snapshot(invalid_resources), "invalid resource revision crossed projection boundary")
	require(projection.last_seq() == 9 and projection.current_state()["presences"][0]["position"]["x"] == 2000, "rejected snapshots altered confirmed state")

	projection.reset()
	require(not projection.has_state(), "logout/reset retained authenticated world")
	require(projection.connection_id().is_empty() and projection.self_entity_id().is_empty(), "logout/reset retained player identity")
	require(not projection.apply_snapshot(newer), "old connection snapshot crossed logout boundary")
	var replacement := welcome_fixture()
	replacement["connectionId"] = "zone_peer_replacementabcdefgh"
	replacement["selfEntityId"] = "player:2"
	replacement["presences"][0]["entityId"] = "player:2"
	replacement["presences"][0]["userId"] = 2
	replacement["snapshotSeq"] = 0
	replacement["tick"] = 0
	require(projection.apply_welcome(replacement), "new authenticated session did not establish independent baseline")
	require(projection.self_entity_id() == "player:2" and projection.last_seq() == 0, "new session inherited prior identity or sequence")
	finish()

func finish() -> void:
	if errors.is_empty():
		print("Godot G11 confirmed zone state projection contract verified (headless)")
		quit(0)
	else:
		for issue in errors:
			push_error(issue)
		quit(1)
