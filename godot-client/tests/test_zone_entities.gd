extends SceneTree
## G11 second slice: stable confirmed entity IDs, spawn/despawn and visual-only
## interpolation. Runs in actual Godot headless; fixtures are not a live-server proof.
const Codec = preload("res://net/zone_codec.gd")
const ZoneState = preload("res://projection/zone_state.gd")
var failures: Array[String] = []

func check(ok: bool, why: String) -> void:
	if not ok:
		failures.append(why)

func make_welcome() -> Dictionary:
	var resources: Array = []
	for id in Codec.NODE_IDS:
		resources.append({"nodeId": id, "remaining": 5, "depleted": false, "respawnAtTick": null})
	return {
		"type": "welcome", "protocolVersion": 5, "zoneId": "observatory_threshold",
		"connectionId": "zone_peer_g11entityregistry123", "selfEntityId": "player:1",
		"snapshotSeq": 2, "tick": 10,
		"presences": [
			{"entityId":"player:1", "userId":1, "position":{"x":1000, "z":-2000}, "lastAcceptedClientSeq":0},
			{"entityId":"player:2", "userId":2, "position":{"x":4000, "z":0}, "lastAcceptedClientSeq":0}
		],
		"mobs": [
			{"entityId":"mob_1", "archetype":"clockwork_stalker", "level":1, "state":"idle",
			 "position":{"x":3000,"z":0}, "targetEntityId":null, "isBoss":false,
			 "isElite":false, "health":10, "maxHealth":10}
		],
		"combatants": [
			{"entityId":"mob_1", "health":10, "maxHealth":10, "stamina":1, "maxStamina":10,
			 "alive":true, "combatLevel":1, "lastCombatSequence":0},
			{"entityId":"player:1", "health":20, "maxHealth":20, "stamina":10, "maxStamina":10,
			 "alive":true, "combatLevel":1, "lastCombatSequence":0},
			{"entityId":"player:2", "health":20, "maxHealth":20, "stamina":10, "maxStamina":10,
			 "alive":true, "combatLevel":1, "lastCombatSequence":0}
		],
		"resources":{"contractVersion":1, "contentSourceRevision":Codec.FIXED_CONTENT,
			"revision":1, "nodes":resources}
	}

func next_snapshot(welcome: Dictionary) -> Dictionary:
	var state: Dictionary = welcome.duplicate(true)
	state.erase("connectionId")
	state.erase("selfEntityId")
	state.erase("protocolVersion")
	state["type"] = "snapshot"
	state["snapshotSeq"] = 3
	state["tick"] = 11
	state["presences"].resize(1)
	state["presences"][0]["position"]["x"] = 2000
	state["mobs"].clear()
	state["combatants"] = [state["combatants"][1].duplicate(true)]
	state["resources"]["revision"] = 2
	return state

func _init() -> void:
	call_deferred("verify")

func verify() -> void:
	var entity_path := "res://projection/entity_registry.gd"
	var visual_path := "res://projection/snapshot_interpolator.gd"
	check(ResourceLoader.exists(entity_path), "G11 entity registry script missing")
	check(ResourceLoader.exists(visual_path), "G11 snapshot interpolator script missing")
	if not failures.is_empty():
		finish()
		return
	var registry_script: Script = load(entity_path) as Script
	var visual_script: Script = load(visual_path) as Script
	check(registry_script != null and visual_script != null, "G11 scripts unavailable as GDScript")
	if not failures.is_empty():
		finish()
		return
	var registry = registry_script.new()
	var visual = visual_script.new()
	var world = ZoneState.new()
	check(not registry.sync(world), "entity registry accepted unauthenticated world")
	check(not visual.capture(world, 1000), "interpolator accepted unauthenticated world")
	var welcome := make_welcome()
	check(Codec.is_valid_welcome(welcome), "G11 entity fixture violates server welcome contract")
	check(world.apply_welcome(welcome), "G11 failed to accept server welcome")
	check(registry.sync(world), "entity registry rejected confirmed welcome")
	check(visual.capture(world, 1000), "interpolator rejected confirmed welcome")
	check(registry.ids("presences") == ["player:1","player:2"], "confirmed player IDs not stable")
	check(registry.ids("mobs") == ["mob_1"], "confirmed mob ID missing")
	check(registry.ids("combatants") == ["mob_1","player:1","player:2"], "combatant lookup differs from server")
	check(registry.ids("resources").size() == 5, "resource IDs not projected")
	check(registry.spawned("presences") == ["player:1","player:2"], "initial players not marked as new")
	check(registry.despawned("presences").is_empty(), "new session invented despawns")
	check(registry.record("presences","player:2")["position"]["x"] == 4000, "confirmed player lookup lost mm coordinates")
	var render_copy: Dictionary = registry.record("presences","player:1")
	render_copy["position"]["x"] = -9999
	check(registry.record("presences","player:1")["position"]["x"] == 1000, "renderer altered confirmed registry state")
	check(visual.confirmed_mm("player:1")["x"] == 1000, "interpolator altered authoritative mm position")
	check(visual.visual_mm("player:1", 1000) == Vector2(1000, -2000), "first snapshot invented presentation movement")
	check(not registry.sync(world), "registry replayed same snapshot")
	check(not visual.capture(world, 1050), "interpolator replayed same snapshot")

	var next := next_snapshot(welcome)
	check(Codec.is_valid_snapshot(next), "G11 despawn fixture violates server snapshot contract")
	check(world.apply_snapshot(next), "G11 failed to accept fresh server snapshot")
	check(registry.sync(world), "registry rejected confirmed despawn snapshot")
	check(visual.capture(world, 1100), "interpolator rejected fresh confirmed snapshot")
	check(registry.ids("presences") == ["player:1"], "player despawn not applied")
	check(registry.ids("mobs").is_empty(), "mob despawn not applied")
	check(registry.ids("combatants") == ["player:1"], "combatant despawn not applied")
	check(registry.despawned("presences") == ["player:2"], "despawned player ID missing")
	check(registry.despawned("mobs") == ["mob_1"], "despawned mob ID missing")
	check(registry.spawned("mobs").is_empty(), "despawn generated a new mob")
	check(registry.record("presences","player:2").is_empty(), "removed player remains queryable")
	check(registry.record("resources","node_copper_1")["remaining"] == 5, "resource readmodel lost server count")
	check(visual.confirmed_mm("player:1") == {"x":2000,"z":-2000}, "latest confirmed mm was interpolated")
	check(visual.visual_mm("player:1", 1100) == Vector2(1000,-2000), "visual jumped before interpolation window")
	check(visual.visual_mm("player:1", 1150) == Vector2(1500,-2000), "visual interpolation midpoint drifted")
	check(visual.visual_mm("player:1", 1200) == Vector2(2000,-2000), "visual endpoint not server confirmed")
	check(visual.visual_mm("player:1", 5000) == Vector2(2000,-2000), "stale rendering predicted new movement")
	check(visual.visual_mm("player:2", 1150) == null, "despawned player reappeared during interpolation")
	check(not visual.capture(world, 1200), "visual replay accepted duplicate sequence")

	# Network bursts can deliver a new confirmed tick while the last visual
	# transition is only halfway rendered. The next transition must start at
	# the currently displayed point, never jump to the old confirmed endpoint.
	var burst: Dictionary = next.duplicate(true)
	burst["snapshotSeq"] = 4
	burst["tick"] = 12
	burst["resources"]["revision"] = 3
	burst["presences"][0]["position"]["x"] = 3000
	check(Codec.is_valid_snapshot(burst), "G11 burst fixture violates zone contract")
	check(world.apply_snapshot(burst), "new confirmed burst snapshot rejected")
	check(registry.sync(world), "registry dropped confirmed burst")
	check(visual.capture(world, 1150), "visual dropped confirmed burst")
	check(visual.confirmed_mm("player:1") == {"x":3000,"z":-2000}, "burst changed canonical position")
	check(visual.visual_mm("player:1", 1150) == Vector2(1500,-2000), "new visual snapshot jumped during an unfinished transition")
	check(visual.visual_mm("player:1", 1200) == Vector2(2250,-2000), "bursty interpolation midpoint ignored prior visual position")
	check(visual.visual_mm("player:1", 1250) == Vector2(3000,-2000), "bursty interpolation did not converge to server-confirmed endpoint")
	check(visual.visual_mm("player:1", 8000) == Vector2(3000,-2000), "burst caused extrapolated position after confirmation")

	world.reset()
	registry.reset()
	visual.reset()
	check(registry.ids("presences").is_empty() and registry.record("mobs","mob_1").is_empty(), "logout left prior identity or entities")
	check(visual.visual_mm("player:1", 5100) == null, "logout left a visual ghost")
	check(not registry.sync(world) and not visual.capture(world, 5100), "old world recreated after logout")
	var second := make_welcome()
	second["connectionId"] = "zone_peer_secondconnection123"
	second["selfEntityId"] = "player:3"
	second["presences"] = [{"entityId":"player:3", "userId":3, "position":{"x":9000,"z":3000}, "lastAcceptedClientSeq":0}]
	second["combatants"] = [{"entityId":"player:3", "health":20, "maxHealth":20, "stamina":10,"maxStamina":10,"alive":true,"combatLevel":1,"lastCombatSequence":0}]
	second["mobs"] = []
	second["snapshotSeq"] = 0
	second["tick"] = 0
	check(Codec.is_valid_welcome(second), "new session fixture invalid")
	check(world.apply_welcome(second), "new session welcome rejected")
	check(registry.sync(world), "registry rejected new connection")
	check(visual.capture(world, 5200), "visual rejected new connection")
	check(registry.ids("presences") == ["player:3"], "registry inherited prior session identities")
	check(visual.visual_mm("player:1", 5250) == null, "visual inherited last session's positions")
	check(visual.visual_mm("player:3", 5250) == Vector2(9000,3000), "new connection interpolated from prior identity")
	finish()

func finish() -> void:
	if failures.is_empty():
		print("Godot G11 confirmed entity registry and visual interpolation verified (headless)")
		quit(0)
	else:
		for why in failures:
			push_error(why)
		quit(1)
