extends SceneTree
## Actual isolated Aurion HTTP/native session/MariaDB -> Godot. Verified browser
## identity issuance is a fixture; this is not production login or a Tab A9 test.
const Auth = preload("res://net/auth/native_auth_start.gd")
const Api = preload("res://net/api/chunk_surface_api.gd")
const TabletopDisplay = preload("res://world/tabletop_projection.gd")
var _done := false
var _response: Dictionary = {}
var _failure := ""
func _init() -> void:
	call_deferred("verify")
func stop(reason: String) -> void:
	push_error(reason)
	quit(1)
func verify() -> void:
	var input: Variant = JSON.parse_string(OS.get_environment("AURION_WORLD_SLICE_GODOT_INPUT"))
	if typeof(input) != TYPE_DICTIONARY or not str(input.get("server", "")).begins_with("http://127.0.0.1:") or not input.get("accounts") is Array:
		stop("ISOLATED_WORLD_SLICE_INPUT_REQUIRED")
		return
	var measurements: Array = []
	for account in input.accounts:
		var auth := Auth.new()
		root.add_child(auth)
		if not auth._tokens.accept_token_response(account.tokens, Time.get_ticks_msec()):
			stop("ACTUAL_NATIVE_TOKEN_PAIR_REJECTED")
			return
		var api := Api.new(auth, "/api/game/world-slice")
		root.add_child(api)
		_done = false
		_response = {}
		_failure = ""
		api.surface_ready.connect(func(data: Dictionary, connection: String, generation: int, coordinate: Vector2i):
			if connection != account.connectionId or generation != auth.session_generation() or coordinate != Vector2i.ZERO:
				_failure = "ACTUAL_NATIVE_RESPONSE_SCOPE_MISMATCH"
			_response = data
			_done = true)
		api.request_failed.connect(func(_reason: String, _connection: String):
			_failure = "ACTUAL_NATIVE_HTTP_READ_FAILED"
			_done = true)
		if not api.request_surface(input.server, account.connectionId, Vector2i.ZERO, true):
			stop("ACTUAL_NATIVE_HTTP_READ_NOT_STARTED")
			return
		var began := Time.get_ticks_msec()
		while not _done and Time.get_ticks_msec() - began < 15000: await process_frame
		if not _done or not _failure.is_empty() or _response.get("fingerprint") != account.fingerprint or _response.get("status") != account.status:
			stop("ACTUAL_NATIVE_HTTP_READBACK_MISMATCH")
			return
		var layer := TabletopDisplay.new()
		root.add_child(layer)
		if not layer.apply_readback(_response, account.connectionId, account.actorId, Vector2i.ZERO):
			stop("ACTUAL_NATIVE_GODOT_PROJECTION_REJECTED")
			return
		var expected_chunks := 1 if account.status == "VERIFIED" else 0
		if layer.terrain.get_child_count() != expected_chunks:
			stop("ACTUAL_NATIVE_GODOT_FOG_MISMATCH")
			return
		var before := JSON.stringify(_response)
		layer.set_ceiling(0)
		layer.set_category("structures", false)
		layer.set_transparency(true)
		if JSON.stringify(_response) != before or layer.readback_fingerprint() != account.fingerprint:
			stop("GODOT_VISUAL_CHANGED_ACTUAL_SLICE")
			return
		measurements.append({"status":account.status,"chunks":expected_chunks,"fingerprint":account.fingerprint,"payloadBytes":JSON.stringify(_response).to_utf8_buffer().size()})
		api.cancel()
		api.queue_free()
		auth.queue_free()
		layer.queue_free()
		await process_frame
	print("WORLD_SLICE_ACTUAL_GODOT=" + JSON.stringify({"sourceRevision":OS.get_environment("AURION_RELEASE_SHA"),"accounts":measurements,"authority":"Aurion isolated MariaDB","physicalDevice":false}))
	quit(0)
