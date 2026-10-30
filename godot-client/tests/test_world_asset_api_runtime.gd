extends SceneTree
## Local HTTP and test authentication only, never live Aurion evidence.
const SHA := "dbec78ee8f51587db4247186a44b75bc0cd639f5e3f0ea54803deaba95e4a17d"
const SERVER := "http://127.0.0.1:3000"
var failures: Array[String] = []
var done := false
var ok := false
var message := ""
var callbacks := 0
var last_body := PackedByteArray()

class TestAuth:
	extends Node
	var generation := 1
	var allowed := true
	func session_generation() -> int: return generation
	func protected_response_allowed() -> bool: return allowed

func require(result: bool, why: String) -> void:
	if not result: failures.append(why)

func _init() -> void: call_deferred("verify")
func _ready_asset(sha: String, body: PackedByteArray, connection: String, generation: int) -> void:
	done = true
	ok = sha == SHA and connection == "zone_peer_asset_test" and generation == 1
	last_body = body
	callbacks += 1
func _failed(reason: String, _connection: String) -> void:
	done = true
	ok = false
	message = reason

func request_and_wait(api: Node, request: Dictionary) -> void:
	done = false
	ok = false
	message = ""
	require(api.request_asset(SERVER, request, "zone_peer_asset_test", true), "valid request did not start")
	var started := Time.get_ticks_msec()
	while not done and Time.get_ticks_msec() - started < 3500:
		await process_frame
	require(done, "asset request timed out")

func verify() -> void:
	var script := load("res://net/api/world_asset_api.gd") as Script
	require(script != null, "server catalog asset wire client is missing")
	if script == null:
		finish()
		return
	var auth := TestAuth.new()
	root.add_child(auth)
	var api: Node = script.new(auth)
	root.add_child(api)
	api.asset_ready.connect(_ready_asset)
	api.request_failed.connect(_failed)
	var request := {"sha256":SHA,"storageUrl":"/api/assets/glb/"+SHA+".glb"}
	var invalid := request.duplicate()
	invalid.storageUrl = "https://evil.invalid/asset.glb"
	require(not api.request_asset(SERVER, invalid, "zone_peer_asset_test", true), "foreign URL was accepted")
	await request_and_wait(api, request)
	require(ok and last_body.size() > 0, "valid same-origin GLB failed")
	await request_and_wait(api, request)
	require(not ok, "redirect was accepted")
	await request_and_wait(api, request)
	require(not ok and message == "WORLD_ASSET_RESPONSE_INVALID", "HTML response was accepted")
	done = false
	require(api.request_asset(SERVER, request, "zone_peer_asset_test", true), "session-revocation request did not start")
	await create_timer(0.05).timeout
	auth.generation = 2
	await create_timer(0.3).timeout
	require(done and not ok and message == "WORLD_ASSET_SESSION_CHANGED", "stale generation reached the active scene")
	auth.generation = 1
	await request_and_wait(api, request)
	require(not ok and message == "WORLD_ASSET_RESPONSE_INVALID", "empty MIME header was accepted")
	require(callbacks == 1, "stale, HTML, or redirect response emitted asset bytes")
	api.queue_free()
	auth.queue_free()
	await process_frame
	finish()

func finish() -> void:
	if failures.is_empty(): print("GODOT_WORLD_ASSET_HTTP_PASS (isolated local HTTP; test auth only)")
	else:
		for failure in failures: push_error(failure)
	quit(0 if failures.is_empty() else 1)
