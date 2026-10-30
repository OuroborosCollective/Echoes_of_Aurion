extends SceneTree
## Synthetic local HTTP and test bearer only; no live Aurion writes.
const Api = preload("res://net/api/world_authoring_api.gd")
const SERVER := "http://127.0.0.1:3000"
const SESSION := "zone_peer_authoring_http_fixture"
var failures: Array[String] = []
var done := false
var last_kind := ""
var last_value: Dictionary = {}
var last_error := ""

class TestAuth:
	extends Node
	var generation := 7
	var allowed := true
	func session_generation() -> int: return generation
	func protected_response_allowed() -> bool: return allowed
	func access_token() -> String: return "fixture-access-token"

func _init() -> void:
	call_deferred("verify")

func require(ok: bool, reason: String) -> void:
	if not ok: failures.append(reason)

func success(kind: String, value: Dictionary, connection: String, generation: int) -> void:
	done = true
	last_kind = kind
	last_value = value
	require(connection == SESSION and generation == 7, "response lost session binding")

func failure(kind: String, reason: String, connection: String, _generation: int) -> void:
	done = true
	last_kind = kind
	last_error = reason
	require(connection == SESSION, "failure lost session binding")

func send(api: Node, kind: String, payload: Dictionary = {}) -> void:
	done = false
	last_value = {}
	last_error = ""
	require(api.request(kind, SERVER, SESSION, payload, true), "request did not start: " + kind)
	var started := Time.get_ticks_msec()
	while not done and Time.get_ticks_msec() - started < 3500:
		await process_frame
	require(done, "request timed out in fixture: " + kind)

func verify() -> void:
	var auth := TestAuth.new()
	root.add_child(auth)
	var api := Api.new(auth)
	root.add_child(api)
	api.completed.connect(success)
	api.failed.connect(failure)
	await send(api, "identity")
	require(last_value.get("id") == 42 and last_value.get("role") == "admin", "identity envelope was not decoded")
	await send(api, "worldPlan", {"fixture":"draft"})
	require(last_value.get("planHash") == "a".repeat(64), "plan envelope was not decoded")
	await send(api, "worldApply", {"fixture":"one-shot"})
	require(last_error == "HTTP_503", "failed apply was not surfaced")
	await send(api, "readback")
	require(last_value.get("schemaVersion") == "aurion.world-design.v1", "independent readback failed")
	await send(api, "catalog")
	require(last_error == "REDIRECT_REJECTED", "redirect was followed or accepted")
	done = false
	last_error = ""
	require(api.request("identity", SERVER, SESSION, {}, true), "delayed identity did not start")
	await create_timer(0.05).timeout
	auth.generation = 8
	var started := Time.get_ticks_msec()
	while not done and Time.get_ticks_msec() - started < 3500:
		await process_frame
	require(done and last_error == "SESSION_CHANGED", "stale session response was accepted")
	api.queue_free()
	auth.queue_free()
	await process_frame
	if failures.is_empty(): print("GODOT_WORLD_AUTHORING_HTTP_PASS (isolated HTTP; fixture auth only)")
	else:
		for reason in failures: push_error(reason)
	quit(0 if failures.is_empty() else 1)
