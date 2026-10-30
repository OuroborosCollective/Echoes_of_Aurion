extends Node
## Aurion tRPC transport. Credentials remain in memory and are never sent to
## another origin. Apply is sent at most once per request; no automatic retry.
const RuntimeConfig = preload("res://config/runtime_config.gd")
signal completed(kind: String, data: Dictionary, connection_id: String, generation: int)
signal failed(kind: String, reason: String, connection_id: String, generation: int)

const ROOT := "/api/trpc/aurionAuthoring."
const MAX_SMALL := 1024 * 1024
const MAX_WORLD := 8 * 1024 * 1024
var _auth: Node
var _http: HTTPRequest
var _active := false
var _epoch := 0
var _generation := -1
var _kind := ""
var _connection := ""

func _init(auth: Node) -> void:
	_auth = auth

func busy() -> bool:
	return _active

static func unwrap_trpc(value: Variant) -> Dictionary:
	if typeof(value) != TYPE_DICTIONARY or typeof(value.get("result")) != TYPE_DICTIONARY or typeof(value.result.get("data")) != TYPE_DICTIONARY:
		return {}
	var json: Variant = value.result.data.get("json")
	return json if typeof(json) == TYPE_DICTIONARY else {}

func request(kind: String, base_url: String, connection: String, payload: Dictionary = {}, allow_local: bool = false) -> bool:
	if _active or not is_inside_tree() or connection.is_empty() or not _auth.protected_response_allowed():
		return false
	if kind not in ["identity", "catalog", "propose", "worldPlan", "worldApply", "readback"]:
		return false
	var server: String = RuntimeConfig.validated_server_url(base_url, allow_local)
	var token: String = _auth.access_token()
	if server.is_empty() or token.is_empty():
		return false
	var path := "/api/trpc/auth.me" if kind == "identity" else ("/api/game/world-design" if kind == "readback" else ROOT + kind)
	var method := HTTPClient.METHOD_GET if kind in ["identity", "catalog", "readback"] else HTTPClient.METHOD_POST
	var body := "" if method == HTTPClient.METHOD_GET else JSON.stringify({"json":payload})
	if body.to_utf8_buffer().size() > MAX_SMALL:
		return false
	_active = true
	_kind = kind
	_connection = connection
	_generation = _auth.session_generation()
	_epoch += 1
	var epoch := _epoch
	_http = HTTPRequest.new()
	_http.max_redirects = 0
	_http.body_size_limit = MAX_WORLD if kind in ["catalog", "worldApply", "readback"] else MAX_SMALL
	_http.timeout = 12.0
	add_child(_http)
	_http.request_completed.connect(_on_completed.bind(epoch))
	var headers := PackedStringArray(["Accept: application/json", "Cache-Control: no-cache"])
	if kind != "readback":
		headers.append("Authorization: Bearer " + token)
	if method == HTTPClient.METHOD_POST:
		headers.append("Content-Type: application/json")
	var error := _http.request(server + path, headers, method, body)
	if error != OK:
		_finish_failure("REQUEST_NOT_STARTED")
		return false
	return true

func _on_completed(result: int, code: int, headers: PackedStringArray, body: PackedByteArray, epoch: int) -> void:
	if not _active or epoch != _epoch:
		return
	if not _auth.protected_response_allowed() or _auth.session_generation() != _generation:
		_finish_failure("SESSION_CHANGED")
		return
	if result == HTTPRequest.RESULT_REDIRECT_LIMIT_REACHED:
		_finish_failure("REDIRECT_REJECTED")
		return
	if result != HTTPRequest.RESULT_SUCCESS:
		_finish_failure("TRANSPORT_UNCERTAIN")
		return
	if code != 200:
		_finish_failure("HTTP_%d" % code)
		return
	var json_type := false
	for header in headers:
		var h := header.to_lower()
		if h.begins_with("content-type:"):
			var mime := h.trim_prefix("content-type:").strip_edges().split(";", true, 1)[0].strip_edges()
			json_type = mime == "application/json"
			break
	if not json_type or body.is_empty():
		_finish_failure("INVALID_RESPONSE")
		return
	var raw: Variant = JSON.parse_string(body.get_string_from_utf8())
	var value: Dictionary = raw if _kind == "readback" and typeof(raw) == TYPE_DICTIONARY else unwrap_trpc(raw)
	if value.is_empty():
		_finish_failure("INVALID_RESPONSE")
		return
	var kind := _kind
	var connection := _connection
	var generation := _generation
	_finish()
	completed.emit(kind, value, connection, generation)

func _finish_failure(reason: String) -> void:
	var kind := _kind
	var connection := _connection
	var generation := _generation
	_finish()
	failed.emit(kind, reason, connection, generation)

func _finish() -> void:
	_active = false
	_kind = ""
	_connection = ""
	_generation = -1
	if is_instance_valid(_http):
		_http.queue_free()
	_http = null

func cancel() -> void:
	_epoch += 1
	if is_instance_valid(_http):
		_http.cancel_request()
	_finish()

func _exit_tree() -> void:
	cancel()
