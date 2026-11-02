extends SceneTree
## Synthetic presentation tests, or an explicit isolated MariaDB/HTTP readback.
## Neither mode certifies production accounts or a physical Tab A9.
const Slice = preload("res://projection/world_slice.gd")
const HudFixture = preload("res://tests/fixtures/hud_fixture.gd")
const Table = preload("res://ui/screens/world_table.gd")
var failures: Array[String] = []

class TestAuth:
	extends Node
	signal refresh_succeeded
	signal refresh_failed(reason: String)
	signal logout_succeeded
	signal logout_failed(reason: String)
	var generation := 1
	var allowed := true
	func session_generation() -> int: return generation
	func protected_response_allowed() -> bool: return allowed
	func access_token() -> String: return "synthetic-local-test-only"
	func refresh() -> bool: return false
	func refresh_in_flight() -> bool: return false

func require(ok: bool, why: String) -> void:
	if not ok:
		failures.append(why)

func fixture() -> Dictionary:
	var tiles: Array = []
	for i in 256:
		tiles.append({"x":i%16,"z":int(i/16),"heightMm":0,"surface":"grass"})
	return {"status":"VERIFIED", "connectionId":"zone_peer_world_table_fixture", "mutationAuthority":"none", "fingerprint":"sha256:"+"e".repeat(64), "slice":{
		"schema":"aurion.world-slice.v1", "policy":"actor-observed-current-epoch.v1", "worldId":"echoes-of-aurion-global", "zoneId":"observatory_threshold", "actorId":"player:1", "epoch":1, "observedAtTick":12,
		"worldRoot":"sha256:"+"a".repeat(64), "sourceRevision":"b".repeat(40), "coordinate":{"x":0,"z":0}, "radius":0, "lod":"full", "knowledgeHash":"sha256:"+"c".repeat(64),
		"chunks":[{"coordinate":{"x":0,"z":0},"authorityReceiptHash":"sha256:"+"d".repeat(64),"tiles":tiles,"structures":[],"roads":[]}], "entities":[{"entityId":"player:1","position":{"x":0,"z":0}}]}}

func _init() -> void:
	call_deferred("verify")

func verify() -> void:
	var reply := fixture()
	var fogged: Dictionary = {}
	var input := OS.get_environment("AURION_WORLD_TABLE_READBACK")
	if not input.is_empty():
		var data: Variant = JSON.parse_string(FileAccess.get_file_as_string(input))
		require(typeof(data) == TYPE_DICTIONARY and data.has("known") and data.has("fogged"), "isolated DB readback missing")
		if typeof(data) != TYPE_DICTIONARY or not data.has("known") or not data.has("fogged"):
			finish(false)
			return
		reply = data.known
		fogged = data.fogged
	var actor: String = reply.slice.actorId
	var connection: String = reply.connectionId
	var coordinate := Vector2i(int(reply.slice.coordinate.x), int(reply.slice.coordinate.z))
	require(Slice.valid(reply, actor, connection, coordinate), "public server DTO rejected")
	require(not Slice.valid(reply, "player:9876", connection, coordinate), "cross-actor DTO admitted")
	require(not Slice.valid(reply, actor, "different-session", coordinate), "cross-session DTO admitted")
	require(not Slice.valid(reply, actor, connection, coordinate+Vector2i(1,0)), "camera expanded knowledge window")
	for field in ["privateState", "worldSeed", "collision"]:
		var altered := reply.duplicate(true)
		altered.slice[field] = "hidden"
		require(not Slice.valid(altered, actor, connection, coordinate), "unallowlisted field admitted")
	var duplicate := reply.duplicate(true)
	duplicate.slice.chunks[0].tiles[1] = duplicate.slice.chunks[0].tiles[0]
	require(not Slice.valid(duplicate, actor, connection, coordinate), "duplicate tile admitted")
	var auth := TestAuth.new()
	root.add_child(auth)
	var table := Table.new()
	root.add_child(table)
	await process_frame
	table.open_table(auth, "http://127.0.0.1:3000", connection, actor, coordinate, true)
	table._api.cancel()
	table._on_slice(reply, connection, 1, coordinate)
	require(not table._reply.is_empty(), "valid response did not enter table")
	var stock := {"schema":"aurion.worldtable-owned-stock.v1", "actorId":actor, "revisionExact":"9007199254740993", "stockHash":"sha256:"+"f".repeat(64), "mutationAuthority":"none", "stacks":[{"id":"stock1", "version":"aurion_v2", "definitionId":"oakwood", "quantityExact":"9007199254740993"}]}
	table._on_stock("ownedStock", stock, connection, 1)
	require(table._stock_label.text.contains("9007199254740993 × oakwood"), "exact quantity rounded or stock missing")
	var stock_text: String = table._stock_label.text
	table._on_stock("ownedStock", stock, "old-connection", 1)
	require(table._stock_label.text == stock_text, "late stock response replaced current stock")
	var bad_stock := stock.duplicate(true)
	bad_stock.actorId = "player:999"
	table._on_stock("ownedStock", bad_stock, connection, 1)
	require(table._stock_received_at == -1 and not table._stock_label.text.contains("oakwood"), "foreign stock admitted or prior stock retained")
	bad_stock = stock.duplicate(true)
	bad_stock.stacks.append(bad_stock.stacks[0])
	require(not preload("res://projection/world_table_inventory.gd").valid(bad_stock, actor), "duplicate stock identity admitted")
	bad_stock = stock.duplicate(true)
	bad_stock.stacks[0].quantityExact = 17
	require(not preload("res://projection/world_table_inventory.gd").valid(bad_stock, actor), "floating quantity admitted")
	table._on_stock("ownedStock", stock, connection, 1)
	table._expire_view(table._stock_received_at + Table.VIEW_TTL_MS + 1)
	require(not table._stock_label.text.contains("oakwood"), "expired stock retained")
	table._on_slice(reply, connection, 1, coordinate)

	require(table._projection.get_child_count() > 0 and table._projection.get_child_count() <= 67, "projection missing or unbounded")
	table._on_slice(reply, "old-connection", 1, coordinate)
	require(table._reply == reply, "late previous connection erased the current projection")
	var touch := InputEventScreenTouch.new()
	touch.index = 0
	touch.position = Vector2(80,80)
	touch.pressed = true
	table._view_input(touch)
	touch = touch.duplicate()
	touch.index = 1
	touch.position = Vector2(180,80)
	table._view_input(touch)
	var before_pinch: float = table._distance
	var drag := InputEventScreenDrag.new()
	drag.index = 1
	drag.position = Vector2(230,80)
	drag.relative = Vector2(50,0)
	table._view_input(drag)
	require(table._distance < before_pinch, "two-finger pinch not routed")
	touch = touch.duplicate()
	touch.index = 2
	table._view_input(touch)
	require(table._fingers.size() == 2, "third finger expanded capture budget")
	var original := JSON.stringify(reply)
	var original_transform := table._camera.transform
	table.orbit(Vector2(120,40))
	table.zoom(0.85)
	require(table._camera.transform != original_transform, "orbit/zoom did not move presentation camera")
	table.zoom(0.000001)
	require(table._distance >= 25, "camera escaped minimum zoom")
	table._projection.flat = true
	table._projection.rebuild()
	table._update_camera()
	require(table._camera.projection == Camera3D.PROJECTION_ORTHOGONAL, "flat fallback missing")
	require(table._reply == reply, "fallback changed authorized slice")
	table.sketch()
	require(table._ghost != null, "local sketch missing")
	require(JSON.stringify(reply) == original and table._reply == reply, "sketch mutated canonical readback")
	require(not _has_collision(table._projection), "worldtable registered gameplay collision")
	table._expire_view(table._received_at + Table.VIEW_TTL_MS + 1)
	require(table._reply.is_empty() and table._projection.get_child_count() == 0 and table._ghost == null, "expired projection or sketch retained")
	table._on_slice(reply, connection, 1, coordinate)
	table.reconcile(connection, actor, coordinate+Vector2i(1,0), false)
	require(not table.visible and table._reply.is_empty(), "chunk change retained geometry")
	table.open_table(auth, "http://127.0.0.1:3000", connection, actor, coordinate, true)
	table._api.cancel()
	auth.generation = 2
	table._on_slice(reply, connection, 1, coordinate)
	require(table._reply.is_empty(), "old session adopted after reauthentication")
	table._process(0)
	require(not table.visible, "expired session retained table")
	if not fogged.is_empty():
		auth.generation = 1
		var other_actor: String = fogged.slice.actorId
		var other_connection: String = fogged.connectionId
		require(other_actor != actor and fogged.status == "FOGGED", "second actor lacks independent knowledge scope")
		require(fogged.slice.worldRoot == reply.slice.worldRoot, "two actors not bound to same world root")
		table.open_table(auth, "http://127.0.0.1:3000", other_connection, other_actor, coordinate, true)
		table._api.cancel()
		table._on_slice(fogged, other_connection, 1, coordinate)
		require(not table._reply.is_empty() and table._projection.get_child_count() == 0, "fogged actor received geometry")
		table.sketch()
		require(table._ghost == null, "fogged actor created sketch")
	table.close_session()
	require(table._fingers.is_empty(), "close retained captured fingers")
	var scene := (load("res://app/main.tscn") as PackedScene).instantiate() as Control
	root.add_child(scene)
	await process_frame
	scene.set_process(false)
	scene._zone_socket.set_process(false)
	scene._on_zone_welcome(HudFixture.welcome())
	scene._zone_socket._state = "connected" # Presentation fixture only.
	scene._show_3d()
	require(scene._world_input_permitted(), "baseline avatar input unavailable")
	var canonical_before: Dictionary = scene._confirmed_zone.current_state().duplicate(true)
	var seq_before: int = scene._zone_socket._next_client_seq
	scene._world_table.show()
	require(not scene._world_input_permitted(), "worldtable did not suspend avatar input")
	scene._poll_move_intent(Time.get_ticks_msec())
	scene._on_world_action_pressed()
	require(scene._zone_socket._next_client_seq == seq_before, "table camera/sketch emitted gameplay intent")
	require(scene._confirmed_zone.current_state() == canonical_before, "table changed canonical avatar state")
	scene._world_table.close_session()
	require(scene._world_input_permitted(), "return from table did not restore avatar input")
	scene._reset_projection()
	require(scene._world_table._reply.is_empty() and not scene._world_table.visible, "reset retained table")
	scene.queue_free()
	table.queue_free()
	auth.queue_free()
	await process_frame
	finish(not input.is_empty())

func _has_collision(node: Node) -> bool:
	if node is CollisionObject3D:
		return true
	for child in node.get_children():
		if _has_collision(child):
			return true
	return false

func finish(db: bool) -> void:
	if failures.is_empty():
		print("WORLD_TABLE_DB_READBACK_PASS" if db else "WORLD_TABLE_PRESENTATION_PASS (synthetic fixture only)")
	else:
		for failure in failures:
			push_error(failure)
	quit(0 if failures.is_empty() else 1)
