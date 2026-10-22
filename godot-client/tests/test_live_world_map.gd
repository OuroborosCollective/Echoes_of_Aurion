extends SceneTree
## First interactive native world map: server-confirmed positions only;
## A/B/house design marks are local, non-canonical, and never gameplay effects.
const Codec = preload("res://net/zone_codec.gd")
var failures: Array[String] = []

func require(ok: bool, why: String) -> void:
	if not ok:
		failures.append(why)

func welcome(seq: int = 1) -> Dictionary:
	var nodes: Array = []
	for id in Codec.NODE_IDS:
		nodes.append({"nodeId": id, "remaining": 5, "depleted": false, "respawnAtTick": null})
	return {
		"type":"welcome", "protocolVersion":5, "zoneId":"observatory_threshold",
		"connectionId":"zone_peer_live_map_1234567890", "selfEntityId":"player:1",
		"snapshotSeq":seq, "tick":seq,
		"presences":[
			{"entityId":"player:1","userId":1,"position":{"x":1000,"z":-2000},"lastAcceptedClientSeq":0},
			{"entityId":"player:2","userId":2,"position":{"x":3000,"z":1000},"lastAcceptedClientSeq":0},
		],
		"mobs":[{"entityId":"mob_1","archetype":"clockwork_stalker","level":1,"state":"idle",
			"position":{"x":4000,"z":0},"targetEntityId":null,
			"isBoss":false,"isElite":false,"health":10,"maxHealth":10}],
		"combatants":[],
		"resources":{"contractVersion":1,"contentSourceRevision":Codec.FIXED_CONTENT,
			"revision":seq,"nodes":nodes}
	}

func tap(map: Control, point: Vector2) -> void:
	var event := InputEventMouseButton.new()
	event.button_index = MOUSE_BUTTON_LEFT
	event.pressed = true
	event.position = point
	map._gui_input(event)

func _init() -> void:
	call_deferred("verify")

func verify() -> void:
	var packed := load("res://app/main.tscn") as PackedScene
	require(packed != null, "native launch scene missing")
	if packed == null:
		finish()
		return
	var scene: Control = packed.instantiate()
	root.add_child(scene)
	await process_frame
	var panel := scene.get_node_or_null("%MapPanel") as Control
	var map := scene.get_node_or_null("%ZoneMap") as Control
	var detail := scene.get_node_or_null("%MapSelection") as Label
	require(panel != null and map != null and detail != null, "active Godot scene lacks interactive confirmed world map")
	if map == null or panel == null or detail == null:
		scene.queue_free()
		await process_frame
		finish()
		return
	require(not panel.visible, "offline map invented a playable world")
	require(map.plan_points().is_empty(), "offline map already contains design placements")
	var confirmed := welcome()
	require(Codec.is_valid_welcome(confirmed), "world map source violates Aurion wire contract")
	scene._on_zone_welcome(confirmed)
	await process_frame
	require(panel.visible, "server welcome did not reveal map")
	require(map.marker_record("player:1").get("position") == {"x":1000,"z":-2000}, "own confirmed position absent")
	require(map.marker_record("player:2").get("position") == {"x":3000,"z":1000}, "other player not displayed")
	require(map.marker_record("mob_1").get("archetype") == "clockwork_stalker", "server monster model/archetype lost")
	require(map.marker_record("node_copper_1").is_empty(), "unpositioned resource was given an invented world coordinate")
	var source_before: String = JSON.stringify(scene._confirmed_zone.current_state())
	require(map.arm_plan("A"), "A design point unavailable after confirmed welcome")
	tap(map, map.world_to_screen({"x":1000, "z":-2000}))
	require(map.plan_points().get("A") == {"x":1000,"z":-2000}, "local A marker did not preserve exact confirmed location")
	require(map.arm_plan("B"), "B design point unavailable")
	tap(map, map.world_to_screen({"x":5000, "z":1000}))
	require(map.plan_points().get("B") == {"x":5000,"z":1000}, "local B marker converted wrong mm coordinates")
	require(map.arm_plan("Haus"), "house design sketch unavailable")
	tap(map, map.world_to_screen({"x":-1000, "z":-3000}))
	require(map.plan_points().get("Haus") == {"x":-1000,"z":-3000}, "house sketch misplaced")
	require(source_before == JSON.stringify(scene._confirmed_zone.current_state()), "design placement modified canonical server state")
	require(not detail.text.is_empty(), "touch planning lacks user-visible feedback")
	tap(map, map.world_to_screen({"x":4000,"z":0}))
	require(map.selected_record().get("archetype") == "clockwork_stalker", "tap could not inspect a server-confirmed enemy")
	require(detail.text.contains("clockwork_stalker"), "inspector hides server-reported model/archetype")
	var old: Dictionary = confirmed.duplicate(true)
	old.erase("connectionId")
	old.erase("selfEntityId")
	old.erase("protocolVersion")
	old["type"] = "snapshot"
	old["snapshotSeq"] = 1
	old["tick"] = 1
	old["mobs"] = []
	scene._on_zone_snapshot(old)
	require(not map.marker_record("mob_1").is_empty(), "replayed stale snapshot removed a confirmed enemy")
	var next: Dictionary = old.duplicate(true)
	next["snapshotSeq"] = 2
	next["tick"] = 2
	next["resources"]["revision"] = 2
	scene._on_zone_snapshot(next)
	require(map.marker_record("mob_1").is_empty(), "despawned monster remained selectable")
	require(map.selected_record().is_empty(), "despawned monster remained inspected")
	scene._update_world_freshness(Time.get_ticks_msec() + 5000)
	require(not map.arm_plan("A"), "stale snapshot accepted new design points")
	var plan_before: Dictionary = map.plan_points()
	tap(map, map.world_to_screen({"x":1000,"z":-2000}))
	require(map.plan_points() == plan_before, "stale map mutated local design")
	scene._reset_projection()
	require(not panel.visible, "logout left ghost world map visible")
	require(map.plan_points().is_empty(), "logout retained previous session plans")
	require(map.selected_record().is_empty(), "logout retained previous session target")
	scene.queue_free()
	await process_frame
	finish()

func finish() -> void:
	if failures.is_empty():
		print("Godot first live-world map, model inspection and local A/B/house sketches verified (headless)")
		quit(0)
	else:
		for issue in failures:
			push_error(issue)
		quit(1)
