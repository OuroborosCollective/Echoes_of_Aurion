class_name AurionPlayerUiApi
extends Node
## Strict player.ui / player.saveControls adapter.
## Aurion owns persistence; this client only sends revision-bound preferences and
## emits values after a server response plus an independent player.ui readback.

signal player_ui_ready(readback: Dictionary)
signal controls_saved(readback: Dictionary)
signal request_failed(reason: String)

const RuntimeConfig = preload("res://config/runtime_config.gd")
const READ_PATH := "/api/trpc/player.ui?batch=1&input="
const SAVE_PATH := "/api/trpc/player.saveControls?batch=1"
const MAX_RESPONSE_BYTES := 1048576
const AUTH_REQUIRED := "PLAYER_UI_AUTH_REQUIRED"
const REQUEST_FAILED := "PLAYER_UI_REQUEST_FAILED"
const RESPONSE_INVALID := "PLAYER_UI_RESPONSE_INVALID"
const SESSION_CHANGED := "PLAYER_UI_SESSION_CHANGED"
const SAVE_UNCONFIRMED := "PLAYER_UI_SAVE_NOT_CONFIRMED"
const SETTINGS_STALE := "PLAYER_UI_SETTINGS_STALE"
const SETTINGS_INVALID := "PLAYER_UI_SETTINGS_INVALID"
const HOTBAR_COMMANDS := ["1", "2", "3", "4", "5", "6", "7", "8", "9"]

var _auth: Node
var _http: HTTPRequest
var _wire_bound := false
var _epoch := 0
var _active := false
var _waiting_refresh := false
var _retried := false
var _base_url := ""
var _operation := ""
var _generation := -1
var _expected_user_id := -1
var _last_user_id := -1
var _last_settings: Dictionary = {}
var _pending_settings: Dictionary = {}
var _saved_settings: Dictionary = {}

func _init(auth: Node) -> void:
	_auth = auth

func _ready() -> void:
	_install_http()
	_auth.refresh_succeeded.connect(_on_refresh_succeeded)
	_auth.refresh_failed.connect(_on_refresh_failed)
	_auth.session_succeeded.connect(_on_new_session)
	_auth.logout_succeeded.connect(_on_auth_terminal)
	_auth.logout_failed.connect(_on_auth_terminal)

func _install_http() -> void:
	_http = HTTPRequest.new()
	_http.body_size_limit = MAX_RESPONSE_BYTES
	_http.max_redirects = 0
	_http.timeout = 15.0
	add_child(_http)
	_wire_bound = false

func request_player_ui(base_url: String, allow_local: bool = false) -> bool:
	if _active or not is_inside_tree():
		return false
	var server: String = RuntimeConfig.validated_server_url(base_url, allow_local)
	if server.is_empty() or not _auth.protected_response_allowed():
		return false
	_base_url = server
	_operation = "read"
	_expected_user_id = _last_user_id
	_pending_settings.clear()
	_saved_settings.clear()
	_retried = false
	_waiting_refresh = false
	_active = true
	if _auth.access_token().is_empty():
		_retried = true
		return _begin_refresh()
	return _send()

func save_controls(base_url: String, user_id: int, settings: Dictionary, allow_local: bool = false) -> bool:
	if _active or not is_inside_tree() or user_id <= 0:
		return false
	var server: String = RuntimeConfig.validated_server_url(base_url, allow_local)
	if server.is_empty() or not _auth.protected_response_allowed():
		return false
	if user_id != _last_user_id or not valid_control_settings(settings) or int(settings.get("revision", -1)) >= 2000000000:
		_fail_immediately(SETTINGS_INVALID)
		return false
	if _last_settings.is_empty() or int(settings.get("revision", -1)) != int(_last_settings.get("revision", -2)):
		_fail_immediately(SETTINGS_STALE)
		return false
	_base_url = server
	_operation = "save"
	_expected_user_id = user_id
	_pending_settings = settings.duplicate(true)
	_saved_settings.clear()
	_retried = false
	_waiting_refresh = false
	_active = true
	if _auth.access_token().is_empty():
		_retried = true
		return _begin_refresh()
	return _send()

func cancel() -> void:
	_epoch += 1
	if is_instance_valid(_http):
		_http.cancel_request()
	_active = false
	_waiting_refresh = false
	_retried = false
	_operation = ""
	_generation = -1
	_expected_user_id = -1
	_pending_settings.clear()
	_saved_settings.clear()

func _exit_tree() -> void:
	cancel()

func _send() -> bool:
	var bearer: String = _auth.access_token()
	if bearer.is_empty() or not _auth.protected_response_allowed():
		_fail(AUTH_REQUIRED)
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
	var method := HTTPClient.METHOD_GET
	var body := ""
	var url := _base_url + READ_PATH + JSON.stringify({"0": {"json": null}}).uri_encode()
	if _operation == "save":
		method = HTTPClient.METHOD_POST
		url = _base_url + SAVE_PATH
		body = JSON.stringify({"0": {"json": _pending_settings}})
	elif _operation == "verify":
		method = HTTPClient.METHOD_GET
		url = _base_url + READ_PATH + JSON.stringify({"0": {"json": null}}).uri_encode()
	var headers := PackedStringArray([
		"Accept: application/json",
		"Authorization: Bearer " + bearer,
	])
	if method == HTTPClient.METHOD_POST:
		headers.append("Content-Type: application/json")
	var err := _http.request(url, headers, method, body)
	if err != OK:
		_fail(SAVE_UNCONFIRMED if _operation in ["save", "verify"] else REQUEST_FAILED)
		return false
	return true

func _on_wire_completed(result: int, code: int, headers: PackedStringArray, body: PackedByteArray, request_epoch: int) -> void:
	if not _active or request_epoch != _epoch:
		return
	if _auth.session_generation() != _generation or not _auth.protected_response_allowed():
		_fail(SAVE_UNCONFIRMED if _operation in ["save", "verify"] else SESSION_CHANGED)
		return
	if result != HTTPRequest.RESULT_SUCCESS:
		_fail(SAVE_UNCONFIRMED if _operation in ["save", "verify"] else REQUEST_FAILED)
		return
	if code == 401 and not _retried:
		_retried = true
		_begin_refresh()
		return
	if code == 401:
		_fail(AUTH_REQUIRED)
		return
	if code != 200 or not _json_header(headers):
		_fail(SAVE_UNCONFIRMED if _operation in ["save", "verify"] else RESPONSE_INVALID)
		return
	var readback := parse_player_ui_wire(body)
	if readback.is_empty():
		_fail(SAVE_UNCONFIRMED if _operation in ["save", "verify"] else RESPONSE_INVALID)
		return
	if _expected_user_id > 0 and readback.get("userId") != _expected_user_id:
		_fail(SAVE_UNCONFIRMED if _operation in ["save", "verify"] else SESSION_CHANGED)
		return
	var settings: Dictionary = readback["settings"]
	if _operation == "save":
		_saved_settings = _pending_settings.duplicate(true)
		_saved_settings["revision"] = int(_pending_settings["revision"]) + 1
		if settings != _saved_settings:
			_fail(SAVE_UNCONFIRMED)
			return
		_operation = "verify"
		_retried = false
		if not _send():
			if _active:
				_fail(SAVE_UNCONFIRMED)
			return
		return
	if _operation == "verify" and settings != _saved_settings:
		_fail(SAVE_UNCONFIRMED)
		return
	_last_user_id = int(readback["userId"])
	_last_settings = settings.duplicate(true)
	var completed_operation := _operation
	_active = false
	_waiting_refresh = false
	_operation = ""
	_generation = -1
	_expected_user_id = -1
	_pending_settings.clear()
	_saved_settings.clear()
	if completed_operation == "verify":
		emit_signal("controls_saved", readback)
	else:
		emit_signal("player_ui_ready", readback)

func _begin_refresh() -> bool:
	_waiting_refresh = true
	var started: bool = _auth.refresh()
	if started or _auth.refresh_in_flight():
		return true
	if _active:
		_fail(AUTH_REQUIRED if _operation != "verify" else SAVE_UNCONFIRMED)
	return false

func _on_refresh_succeeded() -> void:
	if _active and _waiting_refresh:
		_waiting_refresh = false
		if _operation == "verify":
			_retried = false
		_send()

func _on_refresh_failed(_reason: String) -> void:
	if _active and _waiting_refresh:
		_fail(AUTH_REQUIRED if _operation != "verify" else SAVE_UNCONFIRMED)

func _on_auth_terminal(_reason: String = "") -> void:
	_last_user_id = -1
	_last_settings.clear()
	if _active:
		_fail(AUTH_REQUIRED if _operation != "verify" else SAVE_UNCONFIRMED)

func _on_new_session() -> void:
	_last_user_id = -1
	_last_settings.clear()

func _fail_immediately(reason: String) -> void:
	emit_signal("request_failed", reason)

func _fail(reason: String) -> void:
	_active = false
	_waiting_refresh = false
	_operation = ""
	_generation = -1
	_expected_user_id = -1
	_pending_settings.clear()
	_saved_settings.clear()
	emit_signal("request_failed", reason)

static func valid_control_settings(value: Variant) -> bool:
	if typeof(value) != TYPE_DICTIONARY:
		return false
	var settings: Dictionary = value
	if settings.size() != 5 or not settings.has_all(["revision", "autoLoot", "analyticsConsent", "hotbar", "movementMode"]):
		return false
	if not _exact_json_integer(settings["revision"], 0, 2000000000):
		return false
	if typeof(settings["autoLoot"]) != TYPE_BOOL or typeof(settings["analyticsConsent"]) != TYPE_BOOL:
		return false
	if typeof(settings["movementMode"]) != TYPE_STRING or not ["joystick", "touch_to_move"].has(settings["movementMode"]):
		return false
	if typeof(settings["hotbar"]) != TYPE_ARRAY or settings["hotbar"].size() != 5:
		return false
	var seen: Dictionary = {}
	for command in settings["hotbar"]:
		if typeof(command) != TYPE_STRING or not HOTBAR_COMMANDS.has(command) or seen.has(command):
			return false
		seen[command] = true
	return true

static func parse_player_ui_wire(body: PackedByteArray) -> Dictionary:
	var raw: Variant = JSON.parse_string(body.get_string_from_utf8())
	if typeof(raw) != TYPE_ARRAY or raw.size() != 1 or typeof(raw[0]) != TYPE_DICTIONARY:
		return {}
	var result: Variant = raw[0].get("result")
	if typeof(result) != TYPE_DICTIONARY:
		return {}
	var data: Variant = result.get("data")
	if typeof(data) != TYPE_DICTIONARY:
		return {}
	var value: Variant = data.get("json")
	return parse_player_ui_readback(value)

static func parse_player_ui_readback(value: Variant) -> Dictionary:
	if typeof(value) != TYPE_DICTIONARY:
		return {}
	var readback: Dictionary = value
	if readback.size() != 5 or not readback.has_all(["version", "userId", "settings", "items", "equipment"]):
		return {}
	if readback["version"] != "aurion-ax1-ui.v1" or not _exact_json_integer(readback["userId"], 1, 2147483647):
		return {}
	if typeof(readback["items"]) != TYPE_ARRAY or readback["items"].size() > 500:
		return {}
	if typeof(readback["equipment"]) != TYPE_ARRAY or readback["equipment"].size() > 12:
		return {}
	if not valid_control_settings(readback["settings"]):
		return {}
	var normalized := readback.duplicate(true)
	normalized["userId"] = int(readback["userId"])
	var normalized_settings: Dictionary = normalized["settings"]
	normalized_settings["revision"] = int(normalized_settings["revision"])
	normalized["settings"] = normalized_settings
	return normalized

static func _exact_json_integer(value: Variant, minimum: int, maximum: int) -> bool:
	if typeof(value) != TYPE_INT and typeof(value) != TYPE_FLOAT:
		return false
	var numeric := float(value)
	return is_finite(numeric) and numeric >= float(minimum) and numeric <= float(maximum) and floor(numeric) == numeric

static func _json_header(headers: PackedStringArray) -> bool:
	for header in headers:
		var lower := header.to_lower()
		if lower.begins_with("content-type:"):
			var mime := lower.trim_prefix("content-type:").strip_edges()
			return mime == "application/json" or mime.begins_with("application/json;")
	return false
