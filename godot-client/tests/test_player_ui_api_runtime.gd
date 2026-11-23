extends SceneTree

const PlayerUiApi = preload("res://net/api/player_ui_api.gd")
const SERVER := "http://127.0.0.1:3000"

var failures: Array[String] = []
var auth: Node
var api: Node
var completed := false
var last_readback: Dictionary = {}
var last_error := ""
var readback_count := 0
var saved_count := 0

class TestAuth:
	extends Node
	signal refresh_succeeded
	signal refresh_failed(error_code: String)
	signal session_succeeded
	signal logout_succeeded
	signal logout_failed(error_code: String)
	var token := "a".repeat(43)
	var generation := 1
	var allowed := true
	func access_token() -> String:
		return token
	func session_generation() -> int:
		return generation
	func protected_response_allowed(_now_ms: int = -1) -> bool:
		return allowed
	func refresh() -> bool:
		return false
	func refresh_in_flight() -> bool:
		return false

func require(condition: bool, message: String) -> void:
	if not condition:
		failures.append(message)

func _init() -> void:
	call_deferred("verify")

func _on_readback(value: Dictionary) -> void:
	completed = true
	last_readback = value
	readback_count += 1

func _on_saved(value: Dictionary) -> void:
	completed = true
	last_readback = value
	saved_count += 1

func _on_failed(reason: String) -> void:
	completed = true
	last_error = reason

func _wait_for_completion() -> void:
	var started := Time.get_ticks_msec()
	while not completed and Time.get_ticks_msec() - started < 5000:
		await process_frame
	require(completed, "player.ui HTTP operation timed out")

func verify() -> void:
	auth = TestAuth.new()
	root.add_child(auth)
	api = PlayerUiApi.new(auth)
	api.player_ui_ready.connect(_on_readback)
	api.controls_saved.connect(_on_saved)
	api.request_failed.connect(_on_failed)
	root.add_child(api)
	await process_frame
	var http: HTTPRequest = api.get_child(0)
	require(http.timeout == 15.0 and http.max_redirects == 0 and http.body_size_limit == 1048576, "player.ui transport lacks timeout, redirect or response-size boundary")

	completed = false
	require(api.request_player_ui(SERVER, true), "player.ui read did not start")
	await _wait_for_completion()
	require(last_error.is_empty() and readback_count == 1 and last_readback.get("userId") == 42, "initial player.ui readback failed")
	require(last_readback.get("settings", {}).get("revision") == 7, "initial server revision missing")

	var invalid: Dictionary = last_readback["settings"].duplicate(true)
	invalid["hotbar"] = ["1", "2", "3", "4", "4"]
	completed = false
	last_error = ""
	require(not api.save_controls(SERVER, 42, invalid, true), "duplicate skill binding started a mutation")
	require(completed and last_error == "PLAYER_UI_SETTINGS_INVALID", "invalid binding was not rejected locally")

	var stale: Dictionary = last_readback["settings"].duplicate(true)
	stale["revision"] = 6
	completed = false
	last_error = ""
	require(not api.save_controls(SERVER, 42, stale, true), "stale server revision started a mutation")
	require(completed and last_error == "PLAYER_UI_SETTINGS_STALE", "stale revision was not rejected locally")

	var updated: Dictionary = last_readback["settings"].duplicate(true)
	updated["autoLoot"] = false
	updated["analyticsConsent"] = true
	updated["movementMode"] = "touch_to_move"
	updated["hotbar"] = ["2", "3", "4", "5", "6"]
	completed = false
	last_error = ""
	require(api.save_controls(SERVER, 42, updated, true), "valid server settings mutation did not start")
	await _wait_for_completion()
	require(last_error.is_empty() and saved_count == 1, "save was not confirmed after independent readback")
	require(last_readback.get("settings", {}).get("revision") == 8, "server revision did not advance exactly once")
	require(last_readback.get("settings", {}).get("autoLoot") == false, "confirmed value differs from requested value")
	require(readback_count == 1, "independent save verification was emitted as an unrelated initial read")
	auth.generation = 2
	auth.session_succeeded.emit()
	completed = false
	last_error = ""
	require(api.request_player_ui(SERVER, true), "fresh player.ui read did not start after a new authenticated session")
	await _wait_for_completion()
	require(last_error.is_empty() and last_readback.get("userId") == 84, "re-login readback retained the prior account identity")
	require(last_readback.get("settings", {}).get("revision") == 0 and last_readback.get("settings", {}).get("autoLoot") == true, "new account did not receive its own confirmed default settings")
	api.queue_free()
	auth.queue_free()
	await process_frame
	if failures.is_empty():
		print("Godot player.ui GET, revision-bound save, independent readback and re-login identity verified (isolated HTTP fixture)")
		quit(0)
	else:
		for failure in failures:
			push_error(failure)
		quit(1)
