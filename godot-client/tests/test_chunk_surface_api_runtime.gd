extends SceneTree
## G18 real loopback HTTP transport with explicit synthetic TEST AUTH and DATA.
## Does not prove real login, server DB content or live terrain.
const Api = preload("res://net/api/chunk_surface_api.gd")
const SERVER := "http://127.0.0.1:3000"
var failures: Array[String] = []
var completed := false
var success := false
var last_error := ""
var last_id := ""
var last_generation := -1
var last_coordinate := Vector2i.ZERO
var callbacks := 0
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

func require(ok: bool, why: String) -> void:
	if not ok:
		failures.append(why)

func _ready_event(data: Dictionary, id: String, generation: int, coords: Vector2i) -> void:
	completed = true
	success = true
	last_response = data
	last_id = id
	last_generation = generation
	last_coordinate = coords
	callbacks += 1

func _failed_event(reason: String, id: String) -> void:
	completed = true
	success = false
	last_error = reason
	last_id = id

func _init() -> void:
	call_deferred("verify")

func _request(api: Node, id: String) -> void:
	completed = false
	success = false
	last_error = ""
	var started: bool = api.request_surface(SERVER, id, Vector2i(0, 0), true)
	require(started, "chunk GET did not start: " + id)
	if not started:
		return
	var began := Time.get_ticks_msec()
	while not completed and Time.get_ticks_msec() - began < 3500:
		await process_frame
	require(completed, "chunk GET callback timeout: " + id)
	if not completed:
		api.cancel()

func verify() -> void:
	var auth := TestAuth.new()
	root.add_child(auth)
	var api := Api.new(auth)
	api.surface_ready.connect(_ready_event)
	api.request_failed.connect(_failed_event)
	root.add_child(api)
	await process_frame
	require(not api.request_surface(SERVER, "zone_bad", Vector2i(1000001, 0), true), "out-of-range HTTP query was allowed")
	await _request(api, "zone_first")
	require(success and last_id == "zone_first" and last_generation == 1 and last_coordinate == Vector2i.ZERO, "chunk GET lost exact session or requested coord")
	require(last_response.get("base") is Dictionary, "chunk GET lost readmodel payload")
	var first: HTTPRequest = api.get_child(0) as HTTPRequest if api.get_child_count() > 0 else null
	require(first != null, "chunk GET did not open a real HTTPRequest")
	if first:
		require(first.max_redirects == 0 and first.body_size_limit == 262144 and first.timeout == 12.0, "unbounded/redirectable chunk GET")
	await _request(api, "zone_redirect")
	require(not success and last_error == "CHUNK_REQUEST_FAILED", "redirect followed or accepted")
	await _request(api, "zone_refresh")
	require(success and auth.refresh_calls == 1 and last_generation == 2, "401 refresh did not use renewed session")
	await _request(api, "zone_html")
	require(not success and last_error == "CHUNK_RESPONSE_INVALID", "HTML accepted as chunk JSON")
	var previous := callbacks
	require(api.request_surface(SERVER, "zone_old", Vector2i.ZERO, true), "old chunk request did not start")
	await create_timer(0.05).timeout
	api.cancel()
	await _request(api, "zone_new")
	require(success and callbacks == previous + 1 and last_id == "zone_new", "cancelled chunk replay contaminated new response")
	await create_timer(0.3).timeout
	require(callbacks == previous + 1, "late cancelled chunk emitted a second callback")
	completed = false
	success = false
	require(api.request_surface(SERVER, "zone_revoked", Vector2i.ZERO, true), "revoked test did not start")
	await create_timer(0.05).timeout
	auth.allowed = false
	await create_timer(0.28).timeout
	require(completed and not success and last_error == "CHUNK_SESSION_CHANGED", "revoked token accepted chunk payload")
	api.cancel()
	api.queue_free()
	auth.queue_free()
	if failures.is_empty():
		print("G18 protected chunk surface GET wire boundary verified")
		quit(0)
	else:
		for msg in failures:
			push_error(msg)
		quit(1)
