extends Node
## Authenticated Aurion-only world authoring transport. No local authority.
const RuntimeConfig = preload("res://config/runtime_config.gd")
const ROOT := "/api/trpc/aurionAuthoring."
signal completed(kind: String, data: Dictionary)
signal failed(kind: String, reason: String)
var _auth: Node
var _http: HTTPRequest
var _active := false
var _epoch := 0
var _generation := -1
var _kind := ""
var _connection := ""
var _server := ""
func _init(auth: Node = null) -> void:
	_auth = auth
static func valid_plan_hash(value: Variant) -> bool:
	if typeof(value) != TYPE_STRING or value.length() != 64:
		return false
	var regex := RegEx.new()
	regex.compile("^[0-9a-f]{64}$")
	return regex.search(value) != null
static func unwrap_trpc(value: Variant) -> Dictionary:
	if typeof(value) != TYPE_DICTIONARY:
		return {}
	var result: Variant = value.get("result")
	if typeof(result) != TYPE_DICTIONARY:
		return {}
	var data: Variant = result.get("data")
	if typeof(data) != TYPE_DICTIONARY:
		return {}
	var json: Variant = data.get("json")
	return json if typeof(json) == TYPE_DICTIONARY else {}
func request(kind: String, server: String, connection: String, payload: Dictionary = {}, allow_local: bool = false) -> bool:
	if _active or _auth == null or not is_inside_tree() or connection.is_empty():
		return false
	if kind not in ["catalog", "propose", "worldPlan", "worldApply", "readback"]:
		return false
	var validated := RuntimeConfig.validated_server_url(server, allow_local)
	if validated.is_empty() or not _auth.protected_response_allowed():
		return false
	var token: String = _auth.access_token()
	if token.is_empty():
		return false
	_active = true
	_kind = kind
	_connection = connection
	_server = validated
	_generation = _auth.session_generation()
	_epoch += 1
	var epoch := _epoch
	_http = HTTPRequest.new()
	_http.max_redirects = 0
	_http.body_size_limit = 262144
	_http.timeout = 12.0
	add_child(_http)
	_http.request_completed.connect(_on_completed.bind(epoch))
	var path := "/api/game/world-design" if kind == "readback" else ROOT + kind
	var headers := PackedStringArray(["Authorization: Bearer " + token, "Accept: application/json", "Content-Type: application/json"])
	var method := HTTPClient.METHOD_GET if kind in ["readback", "catalog"] else HTTPClient.METHOD_POST
	var body := "" if method == HTTPClient.METHOD_GET else JSON.stringify({"json": payload})
	var error := _http.request(_server + path, headers, method, body)
	if error != OK:
		cancel()
		emit_signal("failed", kind, "WORLD_AUTHORING_REQUEST_FAILED")
		return false
	return true
func _on_completed(result: int, code: int, headers: PackedStringArray, body: PackedByteArray, epoch: int) -> void:
	if not _active or epoch != _epoch:
		return
	var kind := _kind
	var session_ok: bool = _auth != null and _auth.protected_response_allowed() and _auth.session_generation() == _generation
	cancel()
	if not session_ok:
		emit_signal("failed", kind, "WORLD_AUTHORING_SESSION_CHANGED")
		return
	if result != HTTPRequest.RESULT_SUCCESS or code != 200 or body.size() > 262144:
		emit_signal("failed", kind, "WORLD_AUTHORING_HTTP_REJECTED")
		return
	var json_type := false
	for h in headers:
		if h.to_lower().begins_with("content-type:"):
			var mime := h.to_lower().trim_prefix("content-type:").strip_edges()
			json_type = mime == "application/json" or mime.begins_with("application/json;")
	if not json_type:
		emit_signal("failed", kind, "WORLD_AUTHORING_NOT_JSON")
		return
	var parsed: Variant = JSON.parse_string(body.get_string_from_utf8())
	var value: Dictionary = parsed if kind == "readback" and typeof(parsed) == TYPE_DICTIONARY else unwrap_trpc(parsed)
	if value.is_empty():
		emit_signal("failed", kind, "WORLD_AUTHORING_INVALID_RESPONSE")
		return
	emit_signal("completed", kind, value)
func cancel() -> void:
	_epoch += 1
	_active = false
	if is_instance_valid(_http):
		_http.cancel_request()
		_http.queue_free()
	_http = null
func _exit_tree() -> void:
	cancel()
