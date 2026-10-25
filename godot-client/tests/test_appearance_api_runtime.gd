extends SceneTree
## Isolated local HTTP wire test with a labeled auth test double.
## This is not a live session, production catalog or Android device proof.
const Api = preload("res://net/api/appearance_api.gd")
const SERVER := "http://127.0.0.1:3000"
var errors: Array[String] = []
var completed := false
var succeeded := false
var callback_count := 0
var last_connection := ""
var last_generation := -1
var last_error := ""
var last_response: Dictionary = {}
var debug_http_callbacks := 0

class TestAuth:
	extends Node
	signal refresh_succeeded
	signal refresh_failed(error_code: String)
	signal logout_succeeded
	signal logout_failed(error_code: String)
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

func require(ok: bool, message: String) -> void:
	if not ok:
		errors.append(message)

func _ready_callback(value: Dictionary, connection: String, generation: int) -> void:
	completed = true
	succeeded = true
	print("G16_GET_CALLBACK=", connection)
	callback_count += 1
	last_connection = connection
	last_generation = generation
	last_response = value

func _failed_callback(code: String, connection: String) -> void:
	completed = true
	succeeded = false
	print("G16_GET_FAILURE=", connection, " code=", code)
	last_error = code
	last_connection = connection

func _init() -> void:
	call_deferred("verify")

func _on_raw_wire(result: int, code: int, _headers: PackedStringArray, _body: PackedByteArray) -> void:
	debug_http_callbacks += 1
	print("G16_RAW_HTTP_CALLBACK=", debug_http_callbacks, " result=", result, " code=", code)

func _request(api: Node, connection: String) -> void:
	completed = false
	succeeded = false
	last_error = ""

	var started: bool = api.request_self(SERVER, connection, true)
	print("G16_GET_BEGIN=", connection, " started=", started)
	require(started, "GET was not started: " + connection)
	if not started:
		return
	var started_at: int = Time.get_ticks_msec()
	while not completed and Time.get_ticks_msec() - started_at < 2500:
		await process_frame
	print("G16_GET_END=", connection, " completed=", completed, " success=", succeeded, " error=", last_error, " http_state=", (api.get_child(0) as HTTPRequest).get_http_client_status(), " callbacks=", debug_http_callbacks)
	require(completed, "GET timeout for " + connection)
	if not completed:
		api.cancel()

func verify() -> void:
	var auth := TestAuth.new()
	root.add_child(auth)
	var api := Api.new(auth)
	api.appearance_ready.connect(_ready_callback)
	api.request_failed.connect(_failed_callback)
	root.add_child(api)
	await process_frame
	var http: HTTPRequest = api.get_child(0)
	http.request_completed.connect(_on_raw_wire)
	require(http.max_redirects == 0 and http.timeout == 12.0 and http.body_size_limit == 1048576,
		"GET allows redirect or unbounded response")

	await _request(api, "zone_peer_one")
	require(succeeded and last_connection == "zone_peer_one" and last_generation == 1,
		"validated GET result lost session binding")
	require(last_response.get("version") == "aurion.glb-import.v1", "native GET payload changed")
	await _request(api, "zone_peer_two")
	require(not succeeded and last_error == "APPEARANCE_REQUEST_FAILED", "zero-redirect policy failed to terminate rejected redirect")
	await _request(api, "zone_peer_three")
	require(succeeded and auth.refresh_calls == 1 and last_generation == 2,
		"401 did not retry with rotated session generation")
	await _request(api, "zone_peer_four")
	require(not succeeded and last_error == "APPEARANCE_REQUEST_FAILED", "oversize body accepted")
	var count_before := callback_count
	require(api.request_self(SERVER, "zone_peer_old", true), "delayed request did not start")
	await create_timer(0.05).timeout
	api.cancel()
	await _request(api, "zone_peer_new")
	require(succeeded and last_connection == "zone_peer_new", "cancelled epoch replaced new connection")
	await create_timer(0.3).timeout
	require(callback_count == count_before + 1, "late stale HTTP response projected into replacement")
	completed = false
	succeeded = false
	last_error = ""
	require(api.request_self(SERVER, "zone_peer_rotated", true), "rotation test request did not begin")
	await create_timer(0.05).timeout
	auth.allowed = false
	await create_timer(0.25).timeout
	require(completed and not succeeded and last_error == "APPEARANCE_SESSION_CHANGED",
		"revoked generation accepted a protected appearance response")
	api.cancel()
	api.queue_free()
	auth.queue_free()
	if errors.is_empty():
		print("G16 appearance GET wire boundary verified (isolated HTTP; test auth only)")
		quit(0)
	else:
		for error in errors:
			push_error(error)
		quit(1)
