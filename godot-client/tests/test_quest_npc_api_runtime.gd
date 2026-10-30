extends SceneTree
## Isolated HTTP wire regression. Auth is a TEST DOUBLE, not production data.
const Api = preload("res://net/api/quest_npc_api.gd")
const SERVER := "http://127.0.0.1:3000"
var catalog_mode := OS.get_environment("AURION_TEST_GLB_CATALOG") == "1"
var world_design_mode := OS.get_environment("AURION_TEST_WORLD_DESIGN") == "1"
var failures: Array[String] = []
var completed := false
var success := false
var last_error := ""
var last_connection := ""
var last_generation := -1
var callback_count := 0
var last_response: Dictionary = {}

class TestAuth:
	extends Node
	signal refresh_succeeded
	signal refresh_failed(reason: String)
	signal logout_succeeded
	signal logout_failed(reason: String)
	var token := "a".repeat(43)
	var generation := 1
	var allowed := true
	var refresh_calls := 0
	func access_token() -> String:
		return token
	func session_generation() -> int:
		return generation
	func protected_response_allowed() -> bool:
		return allowed
	func refresh() -> bool:
		refresh_calls += 1
		token = "b".repeat(43)
		generation += 1
		emit_signal("refresh_succeeded")
		return true
	func refresh_in_flight() -> bool:
		return false

func require(ok: bool, reason: String) -> void:
	if not ok:
		failures.append(reason)

func _good(body: Dictionary, connection: String, generation: int) -> void:
	completed = true
	success = true
	last_response = body
	last_connection = connection
	last_generation = generation
	callback_count += 1

func _bad(reason: String, connection: String) -> void:
	completed = true
	success = false
	last_error = reason
	last_connection = connection

func _init() -> void:
	call_deferred("verify")

func _request(api: Node, connection: String) -> void:
	completed = false
	success = false
	last_error = ""
	var started: bool = api.request_npcs(SERVER, connection, true)
	require(started, "NPC GET did not start: " + connection)
	if not started:
		return
	var began := Time.get_ticks_msec()
	while not completed and Time.get_ticks_msec() - began < 3500:
		await process_frame
	require(completed, "NPC GET callback timeout: " + connection)
	if not completed:
		api.cancel()

func verify() -> void:
	var auth := TestAuth.new()
	root.add_child(auth)
	var api := Api.new(auth, "/api/game/world-design") if world_design_mode else (Api.new(auth, "/api/game/glb-catalog") if catalog_mode else Api.new(auth))
	api.npcs_ready.connect(_good)
	api.request_failed.connect(_bad)
	root.add_child(api)
	await process_frame
	require(api.get_child_count() == 0, "NPC API created an HTTP client without a request")
	await _request(api, "zone_npc_one")
	require(success and last_connection == "zone_npc_one" and last_generation == 1, "protected NPC GET lost connection/generation")
	if world_design_mode:
		require(last_response.get("schemaVersion") == "aurion.world-design.v1", "world-design GET lost server schema")
	else:
		require(last_response.get("version") == ("aurion.glb-import.v1" if catalog_mode else "aurion.quest-npc-visuals.v1"), "NPC GET lost server version")
	var first_http := api.get_child(0) as HTTPRequest if api.get_child_count() > 0 else null
	require(first_http != null, "NPC GET did not construct any HTTPRequest")
	if first_http != null:
		require(first_http.max_redirects == 0 and first_http.body_size_limit == (4194304 if world_design_mode else (1048576 if catalog_mode else 65536)) and first_http.timeout == 12.0,
			"NPC GET allows redirects or unbounded responses")
	await _request(api, "zone_npc_redirect")
	require(not success and last_error == "NPC_REQUEST_FAILED", "NPC redirect followed or accepted")
	await _request(api, "zone_npc_refresh")
	require(success and auth.refresh_calls == 1 and last_generation == 2, "NPC 401 refresh did not use new session")
	await _request(api, "zone_npc_html")
	require(not success and last_error == "NPC_RESPONSE_INVALID", "NPC invalid MIME accepted")
	var count_before := callback_count
	require(api.request_npcs(SERVER, "zone_npc_old", true), "NPC cancelled GET failed to start")
	await create_timer(0.05).timeout
	api.cancel()
	await _request(api, "zone_npc_new")
	require(success and last_connection == "zone_npc_new" and callback_count == count_before + 1,
		"old NPC response contaminated replacement")
	await create_timer(0.3).timeout
	require(callback_count == count_before + 1, "stale cancelled NPC response emitted success")
	completed = false
	success = false
	last_error = ""
	require(api.request_npcs(SERVER, "zone_npc_revoked", true), "NPC revoked test did not start")
	await create_timer(0.05).timeout
	auth.allowed = false
	await create_timer(0.28).timeout
	require(completed and not success and last_error == "NPC_SESSION_CHANGED",
		"NPC response passed after protected session was revoked")
	api.cancel()
	api.queue_free()
	auth.queue_free()
	if failures.is_empty():
		print("GODOT_WORLD_DESIGN_HTTP_PASS (isolated HTTP; test auth only)" if world_design_mode else ("G16 GLB catalog protected GET boundary verified (isolated HTTP; test auth only)" if catalog_mode else "G16 quest NPC protected GET boundary verified (isolated HTTP; test auth only)"))
		quit(0)
	else:
		for message in failures:
			push_error(message)
		quit(1)
