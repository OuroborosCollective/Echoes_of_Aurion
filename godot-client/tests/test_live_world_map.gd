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

func snapshot_from(source: Dictionary, seq: int) -> Dictionary:
	var result: Dictionary = source.duplicate(true)
	result.erase("connectionId")
	result.erase("selfEntityId")
	result.erase("protocolVersion")
	result["type"] = "snapshot"
	result["snapshotSeq"] = seq
	result["tick"] = seq
	result["resources"]["revision"] = seq
	return result

func mouse_event(point: Vector2, pressed: bool) -> InputEventMouseButton:
	var event := InputEventMouseButton.new()
	event.button_index = MOUSE_BUTTON_LEFT
	event.pressed = pressed
	event.position = point
	return event

func tap(map: Control, point: Vector2) -> void:
	map._gui_input(mouse_event(point, true))
	map._gui_input(mouse_event(point, false))

func drag(map: Control, start: Vector2, finish: Vector2) -> void:
	map._gui_input(mouse_event(start, true))
	var motion := InputEventMouseMotion.new()
	motion.position = finish
	motion.relative = finish - start
	map._gui_input(motion)
	map._gui_input(mouse_event(finish, false))

func touch_event(point: Vector2, pressed: bool) -> InputEventScreenTouch:
	var event := InputEventScreenTouch.new()
	event.index = 0
	event.position = point
	event.pressed = pressed
	return event

func touch_drag(point: Vector2, relative: Vector2) -> InputEventScreenDrag:
	var event := InputEventScreenDrag.new()
	event.index = 0
	event.position = point
	event.relative = relative
	return event

func mob_record(index: int, position: Dictionary) -> Dictionary:
	return {
		"entityId":"mob_%d" % index, "archetype":"clockwork_stalker", "level":1, "state":"idle",
		"position":position, "targetEntityId":null, "isBoss":false, "isElite":false,
		"health":10, "maxHealth":10,
	}

func _init() -> void:
	call_deferred("verify")

func verify() -> void:
	var packed := load("res://app/main.tscn") as PackedScene
	require(packed != null, "native launch scene missing")
	if packed == null:
		finish()
		return
	root.size = Vector2i(480, 480)
	var scene: Control = packed.instantiate()
	root.add_child(scene)
	await process_frame
	var panel := scene.get_node_or_null("%MapPanel") as Control
	var map := scene.get_node_or_null("%ZoneMap") as Control
	var detail := scene.get_node_or_null("%MapSelection") as Label
	var scroll := scene.get_node_or_null("SafeMargin/Scroll") as ScrollContainer
	var card := scene.get_node_or_null("%LaunchCard") as Control
	require(panel != null and map != null and detail != null and scroll != null and card != null, "active Godot scene lacks interactive confirmed world map")
	require(map == null or map.mouse_filter == Control.MOUSE_FILTER_PASS, "confirmed map blocks parent touch scrolling")
	require(card == null or card.mouse_filter == Control.MOUSE_FILTER_PASS, "launch card blocks map drags before parent scroll")
	if map == null or panel == null or detail == null or scroll == null or card == null:
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
	await process_frame
	var ancestor := map.get_parent_control()
	while ancestor != null and ancestor != scroll:
		require(ancestor.mouse_filter != Control.MOUSE_FILTER_STOP, "map drag path stops before ScrollContainer at " + str(ancestor.name))
		ancestor = ancestor.get_parent_control()
	require(ancestor == scroll, "confirmed map is not inside the launch-card ScrollContainer")
	require(scroll.get_v_scroll_bar().max_value > scroll.get_v_scroll_bar().page, "mobile launch card fixture is not scrollable")
	scroll.scroll_vertical = 0
	var drag_start := map.get_global_rect().get_center()
	Input.parse_input_event(touch_event(drag_start, true))
	await process_frame
	Input.parse_input_event(touch_drag(drag_start - Vector2(0, 70), Vector2(0, -70)))
	await process_frame
	Input.parse_input_event(touch_drag(drag_start - Vector2(0, 140), Vector2(0, -70)))
	await process_frame
	Input.parse_input_event(touch_event(drag_start - Vector2(0, 140), false))
	await process_frame
	require(scroll.scroll_vertical > 0, "map-origin touch drag did not change active parent ScrollContainer offset")
	require(map.marker_record("player:1").get("position") == {"x":1000,"z":-2000}, "own confirmed position absent")
	require(map.marker_record("player:2").get("position") == {"x":3000,"z":1000}, "other player not displayed")
	require(map.marker_record("mob_1").get("archetype") == "clockwork_stalker", "server monster model/archetype lost")
	require(map.marker_record("node_copper_1").is_empty(), "unpositioned resource was given an invented world coordinate")
	var source_before: String = JSON.stringify(scene._confirmed_zone.current_state())
	require(map.arm_plan("A"), "A design point unavailable after confirmed welcome")
	drag(map, map.world_to_screen({"x":1000, "z":-2000}), map.world_to_screen({"x":1000, "z":1000}))
	require(map.plan_points().is_empty(), "scroll drag created a local design point")
	tap(map, map.world_to_screen({"x":1000, "z":-2000}))
	require(map.plan_points().get("A") == {"x":1000,"z":-2000}, "local A marker did not preserve exact confirmed location")
	require(map.arm_plan("B"), "B design point unavailable")
	tap(map, map.world_to_screen({"x":5000, "z":1000}))
	require(map.plan_points().get("B") == {"x":5000,"z":1000}, "local B marker converted wrong mm coordinates")
	require(map.arm_plan("Haus"), "house design sketch unavailable")
	tap(map, map.world_to_screen({"x":-1000,"z":-3000}))
	require(map.plan_points().get("Haus") == {"x":-1000,"z":-3000}, "house sketch misplaced")
	require(source_before == JSON.stringify(scene._confirmed_zone.current_state()), "design placement modified canonical server state")
	require(not detail.text.is_empty(), "touch planning lacks user-visible feedback")
	tap(map, map.world_to_screen({"x":4000,"z":0}))
	require(map.selected_record().get("archetype") == "clockwork_stalker", "tap could not inspect a server-confirmed enemy")
	require(detail.text.contains("clockwork_stalker"), "inspector hides server-reported model/archetype")

	var moved := snapshot_from(confirmed, 2)
	moved["mobs"][0]["position"] = {"x":5000,"z":0}
	scene._on_zone_snapshot(moved)
	require(detail.text.contains("X 5.00 m"), "accepted movement left stale inspector coordinates")

	var old := snapshot_from(confirmed, 1)
	old["mobs"] = []
	scene._on_zone_snapshot(old)
	require(not map.marker_record("mob_1").is_empty(), "replayed stale snapshot removed a confirmed enemy")

	var far := snapshot_from(moved, 3)
	far["presences"][0]["position"] = {"x":64000000000,"z":64000000000}
	far["presences"][1]["position"] = {"x":64000001000,"z":64000000000}
	far["mobs"][0]["position"] = {"x":64000001000,"z":64000000000}
	scene._on_zone_snapshot(far)
	var self_screen: Vector2 = map.world_to_screen(far["presences"][0]["position"])
	var shared_screen: Vector2 = map.world_to_screen(far["mobs"][0]["position"])
	require(is_equal_approx(self_screen.distance_to(shared_screen), 18.0), "large valid coordinates lost relative marker precision")
	require(map.arm_plan("A"), "far-world local point could not be armed")
	tap(map, self_screen)
	require(map.plan_points().get("A") == {"x":64000000000,"z":64000000000}, "far-world plan point lost integer millimetres")
	tap(map, shared_screen)
	require(map.selected_record().get("entityId") == "mob_1", "overlapping visible mob lost hit-test priority")

	var crowded := snapshot_from(far, 4)
	crowded["presences"] = []
	for index in range(1, 129):
		crowded["presences"].append({
			"entityId":"player:%d" % index, "userId":index,
			"position":{"x":64000000000 + index,"z":64000000000},
			"lastAcceptedClientSeq":0,
		})
	crowded["mobs"] = []
	var mob_ids: Array[String] = []
	for index in range(1, 33):
		mob_ids.append("mob_%d" % index)
	mob_ids.sort()
	for id in mob_ids:
		var index := int(id.trim_prefix("mob_"))
		crowded["mobs"].append(mob_record(index, {"x":64000001000 + index,"z":64000000000}))
	require(Codec.is_valid_snapshot(crowded), "crowded marker fixture violates Aurion wire order")
	scene._on_zone_snapshot(crowded)
	require(not map.marker_record("player:1").is_empty(), "crowded map omitted authenticated self")
	require(not map.marker_record("mob_32").is_empty(), "presence cap displaced valid mob markers")
	require(map.marker_record("player:99").is_empty(), "bounded map exceeded reserved presence capacity")

	var despawn := crowded.duplicate(true)
	despawn["snapshotSeq"] = 5
	despawn["tick"] = 5
	despawn["resources"]["revision"] = 5
	despawn["mobs"] = []
	scene._on_zone_snapshot(despawn)
	require(map.marker_record("mob_1").is_empty(), "despawned monster remained selectable")
	require(map.selected_record().is_empty(), "despawned monster remained inspected")
	scene._update_world_freshness(Time.get_ticks_msec() + 5000)
	require(not map.arm_plan("A"), "stale snapshot accepted new design points")
	var plan_before: Dictionary = map.plan_points()
	tap(map, map.world_to_screen(despawn["presences"][0]["position"]))
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
