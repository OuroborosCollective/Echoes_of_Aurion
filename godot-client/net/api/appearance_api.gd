class_name AurionAppearanceApi
extends Node
## Read-only native-session API for the selected player GLB. This adapter
## neither selects/equips assets nor takes part in zone transport authority.
signal appearance_ready(response: Dictionary, connection_id: String, session_generation: int)
signal request_failed(reason: String, connection_id: String)

const RuntimeConfig = preload("res://config/runtime_config.gd")
const PATH := "/api/game/public-player-characters"
const MAX_RESPONSE_BYTES := 1048576

var _auth: Node
var _http: HTTPRequest
var _wire_bound := false
var _epoch := 0
var _active := false
var _waiting_refresh := false
var _retried := false
var _base_url := ""
var _connection_id := ""
var _generation := -1

func _init(auth: Node) -> void:
	_auth = auth

func _ready() -> void:
	_install_http()
	_auth.refresh_succeeded.connect(_on_refresh_succeeded)
	_auth.refresh_failed.connect(_on_refresh_failed)
	_auth.logout_succeeded.connect(_on_auth_terminal)
	_auth.logout_failed.connect(_on_auth_terminal)

func _install_http() -> void:
	_http = HTTPRequest.new()
	_http.body_size_limit = MAX_RESPONSE_BYTES
	_http.max_redirects = 0
	_http.timeout = 12.0
	add_child(_http)
	_wire_bound = false

func request_self(base_url: String, connection_id: String, allow_local: bool = false) -> bool:
	if _active or not is_inside_tree() or connection_id.is_empty():
		return false
	var server: String = RuntimeConfig.validated_server_url(base_url, allow_local)
	if server.is_empty() or not _auth.protected_response_allowed():
		return false
	_base_url = server
	_connection_id = connection_id
	_retried = false
	_waiting_refresh = false
	_active = true
	if _auth.access_token().is_empty():
		_retried = true
		return _begin_refresh()
	return _send()

func _send() -> bool:
	var bearer: String = _auth.access_token()
	if bearer.is_empty() or not _auth.protected_response_allowed():
		_fail("APPEARANCE_SESSION_UNAVAILABLE")
		return false
	_generation = _auth.session_generation()
	if _wire_bound:
		_http.cancel_request()
		_http.queue_free()
		_install_http()
	_epoch += 1
	var current_epoch: int = _epoch
	_http.request_completed.connect(_on_wire_completed.bind(current_epoch))
	_wire_bound = true
	var err := _http.request(_base_url + PATH,
		PackedStringArray(["Accept: application/json", "Authorization: Bearer " + bearer]),
		HTTPClient.METHOD_GET)
	if err != OK:
		_fail("APPEARANCE_REQUEST_FAILED")
		return false
	return true

func _on_wire_completed(result: int, code: int, headers: PackedStringArray, body: PackedByteArray, request_epoch: int) -> void:
	if not _active or request_epoch != _epoch:
		return
	if _auth.session_generation() != _generation or not _auth.protected_response_allowed():
		_fail("APPEARANCE_SESSION_CHANGED")
		return
	if result != HTTPRequest.RESULT_SUCCESS:
		_fail("APPEARANCE_REQUEST_FAILED")
		return
	if code == 401 and not _retried:
		_retried = true
		_begin_refresh()
		return
	if code != 200 or not _json_header(headers):
		_fail("APPEARANCE_RESPONSE_INVALID")
		return
	var response: Variant = JSON.parse_string(body.get_string_from_utf8())
	if typeof(response) != TYPE_DICTIONARY:
		_fail("APPEARANCE_RESPONSE_INVALID")
		return
	var id := _connection_id
	var generation := _generation
	_complete()
	emit_signal("appearance_ready", response, id, generation)

func _begin_refresh() -> bool:
	_waiting_refresh = true
	var started: bool = _auth.refresh()
	if started or _auth.refresh_in_flight():
		return true
	if _active:
		_fail("APPEARANCE_SESSION_UNAVAILABLE")
	return false

func _on_refresh_succeeded() -> void:
	if _active and _waiting_refresh:
		_waiting_refresh = false
		_send()

func _on_refresh_failed(_reason: String) -> void:
	if _active and _waiting_refresh:
		_fail("APPEARANCE_SESSION_UNAVAILABLE")

func _on_auth_terminal(_reason: String = "") -> void:
	if _active:
		_fail("APPEARANCE_SESSION_UNAVAILABLE")

static func _json_header(headers: PackedStringArray) -> bool:
	for header in headers:
		var h := header.to_lower()
		if h.begins_with("content-type:"):
			var mime := h.trim_prefix("content-type:").strip_edges()
			return mime == "application/json" or mime.begins_with("application/json;")
	return false

func _complete() -> void:
	_active = false
	_waiting_refresh = false
	_connection_id = ""
	_generation = -1

func _fail(reason: String) -> void:
	var id := _connection_id
	_complete()
	emit_signal("request_failed", reason, id)

func cancel() -> void:
	_epoch += 1
	if is_instance_valid(_http):
		_http.cancel_request()
	_complete()

func _exit_tree() -> void:
	cancel()
