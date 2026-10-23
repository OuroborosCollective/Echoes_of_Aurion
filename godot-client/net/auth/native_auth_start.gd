class_name AurionNativeAuthStart
extends Node
## Active native auth browser handoff: strict start and exchange requests with
## ephemeral in-process credentials. Aurion remains the sole session authority.

signal browser_opening
signal start_succeeded
signal start_failed(error_code: String)
signal session_succeeded
signal session_failed(error_code: String)
signal refresh_succeeded
signal refresh_failed(error_code: String)
signal logout_succeeded
signal logout_failed(error_code: String)

const RuntimeConfig = preload("res://config/runtime_config.gd")
const Flow = preload("res://net/auth/native_auth_flow.gd")
const Callback = preload("res://platform/android/native_app_link_callback.gd")
const Tokens = preload("res://net/auth/native_auth_tokens.gd")
const START_PATH := "/api/native-auth/start"
const EXCHANGE_PATH := "/api/native-auth/exchange"
const REFRESH_PATH := "/api/native-auth/refresh"
const REVOKE_PATH := "/api/native-auth/revoke"
const FALLBACK_ERROR := "NATIVE_AUTH_CONFIGURATION_UNAVAILABLE"
const ERROR_CODES := [
	"NATIVE_AUTH_CONFIGURATION_UNAVAILABLE",
	"NATIVE_AUTH_REQUEST_INVALID",
	"NATIVE_AUTH_TRANSACTION_INVALID",
	"NATIVE_AUTH_STATE_MISMATCH",
	"NATIVE_AUTH_CODE_EXPIRED",
	"NATIVE_AUTH_CODE_CONSUMED",
	"NATIVE_AUTH_PKCE_FAILED",
	"NATIVE_AUTH_SESSION_EXPIRED",
	"NATIVE_AUTH_REFRESH_REUSED",
	"NATIVE_AUTH_REVOKED",
	"NATIVE_AUTH_BUILD_UNSUPPORTED",
	"NATIVE_AUTH_RATE_LIMITED",
]

var browser_opener: Callable
var _flow := Flow.new()
var _tokens := Tokens.new()
var _http: HTTPRequest
var _request_active := false
var _request_phase := ""
var _request_started_at_ms := -1
var _request_epoch := 0
var _wire_bound := false
var _server_base_url := ""
var _logout_after_exchange := false

func _ready() -> void:
	_install_http()
	if not browser_opener.is_valid():
		browser_opener = Callable(self, "_open_system_browser")

func begin(server_base_url: String, app_build: String, allow_local: bool = false) -> bool:
	if _request_active or not is_inside_tree():
		return false
	var server := RuntimeConfig.validated_server_url(server_base_url, allow_local)
	var request := _flow.prepare_start(app_build)
	if server.is_empty() or request.is_empty():
		_flow.clear()
		emit_signal("start_failed", FALLBACK_ERROR)
		return false
	_server_base_url = server
	return _send_json(START_PATH, request, "start")

## The platform adapter forwards the raw HTTPS App Link here. URL validation,
## state/PKCE consumption and the exchange request are one fail-closed boundary.
func complete_callback(raw_url: Variant) -> bool:
	if _request_active or _server_base_url.is_empty() or not is_inside_tree():
		return false
	var request: Dictionary = Callback.consume(raw_url, _flow)
	if request.is_empty():
		# A well-formed callback for an older browser attempt is consumed by the
		# parser without clearing the current flow. Keep waiting for its callback.
		if callback_pending():
			return false
		_fail_session(FALLBACK_ERROR)
		return false
	return _send_json(EXCHANGE_PATH, request, "exchange")

func callback_pending() -> bool:
	return not _request_active and not _flow.browser_url().is_empty()

func access_token(now_ms: int = -1) -> String:
	return _tokens.access_token(now_ms)

func session_generation() -> int:
	return _tokens.session_generation()

func protected_response_allowed(now_ms: int = -1) -> bool:
	return _tokens.protected_response_allowed(now_ms)

## Rotate the in-memory pair through Aurion. The token store rejects a second
## request while rotation is in flight, preventing server replay revocation.
func refresh(now_ms: int = -1) -> bool:
	if _request_active or _server_base_url.is_empty() or not is_inside_tree():
		return false
	var request := _tokens.begin_refresh(now_ms)
	if request.is_empty():
		return false
	return _send_json(REFRESH_PATH, request, "refresh", now_ms)

func request_in_flight() -> bool:
	return _request_active

func refresh_in_flight() -> bool:
	return _request_active and _request_phase == "refresh"

func logout_in_flight() -> bool:
	return _request_active and (_request_phase == "logout" or _logout_after_exchange)

## Revoke the current server session. begin_logout clears local authority before
## transport starts, so network failure or a hostile redirect cannot keep access.
func logout() -> bool:
	if _server_base_url.is_empty() or not is_inside_tree():
		_tokens.clear()
		_flow.clear()
		return false
	_flow.clear()
	if _request_active and (_request_phase == "logout" or _logout_after_exchange):
		return false
	if _request_active and _request_phase == "exchange":
		_logout_after_exchange = true
		_tokens.clear()
		return true
	if _request_active:
		_request_epoch += 1
		_http.cancel_request()
		_http.queue_free()
		_install_http()
		_request_active = false
		_request_phase = ""
		_request_started_at_ms = -1
	var request := _tokens.begin_logout()
	if request.is_empty():
		emit_signal("logout_succeeded")
		return true
	return _send_json(REVOKE_PATH, request, "logout")

func cancel() -> void:
	_request_epoch += 1
	if _request_active and is_instance_valid(_http):
		_http.cancel_request()
	if _request_phase == "refresh":
		_tokens.clear()
	_request_active = false
	_request_phase = ""
	_request_started_at_ms = -1
	_logout_after_exchange = false
	_flow.clear()

func _exit_tree() -> void:
	cancel()
	_tokens.clear()

func _install_http() -> void:
	_http = HTTPRequest.new()
	_http.body_size_limit = 16384
	_http.max_redirects = 0
	_http.timeout = 15.0
	add_child(_http)
	_wire_bound = false

func _send_json(path: String, payload: Dictionary, phase: String, started_at_ms: int = -1) -> bool:
	# A cancelled HTTPRequest may still deliver its completion after a successor
	# starts. Give every send a fresh node and an epoch-bound callback.
	if _wire_bound:
		_http.cancel_request()
		_http.queue_free()
		_install_http()
	_request_epoch += 1
	var wire_epoch: int = _request_epoch
	_http.request_completed.connect(_on_wire_request_completed.bind(wire_epoch))
	_wire_bound = true
	_request_active = true
	_request_phase = phase
	_request_started_at_ms = started_at_ms if started_at_ms >= 0 else Time.get_ticks_msec()
	var error := _http.request(
		_server_base_url + path,
		PackedStringArray(["Content-Type: application/json", "Accept: application/json"]),
		HTTPClient.METHOD_POST,
		JSON.stringify(payload)
	)
	if error != OK:
		_fail_request(phase, FALLBACK_ERROR)
		return false
	return true

func _on_wire_request_completed(result: int, response_code: int, headers: PackedStringArray, body: PackedByteArray, epoch: int) -> void:
	if epoch != _request_epoch or not _request_active:
		return
	_on_request_completed(result, response_code, headers, body)

func _on_request_completed(result: int, response_code: int, headers: PackedStringArray, body: PackedByteArray) -> void:
	if not _request_active:
		return
	var phase := _request_phase
	var request_started_at_ms := _request_started_at_ms
	_request_active = false
	_request_phase = ""
	_request_started_at_ms = -1
	if result != HTTPRequest.RESULT_SUCCESS:
		_fail_request(phase, FALLBACK_ERROR)
		return
	if phase == "logout" and response_code == 204:
		emit_signal("logout_succeeded")
		return
	if not _json_content_type(headers):
		_fail_request(phase, FALLBACK_ERROR)
		return
	var payload: Variant = JSON.parse_string(body.get_string_from_utf8())
	if response_code != 200:
		_fail_request(phase, _validated_error(payload))
		return
	if phase == "logout":
		_fail_logout(FALLBACK_ERROR)
		return
	if phase == "exchange" or phase == "refresh":
		if not _tokens.accept_token_response(payload, request_started_at_ms, Time.get_ticks_msec()):
			_fail_request(phase, FALLBACK_ERROR)
			return
		if phase == "exchange" and _logout_after_exchange:
			_logout_after_exchange = false
			var revoke := _tokens.begin_logout()
			if revoke.is_empty():
				_fail_logout(FALLBACK_ERROR)
				return
			_send_json(REVOKE_PATH, revoke, "logout")
			return
		emit_signal("session_succeeded" if phase == "exchange" else "refresh_succeeded")
		return
	if phase != "start" or not _flow.accept_start_response(payload):
		_fail_start(FALLBACK_ERROR)
		return
	var url := _flow.browser_url()
	# Give the Activity owner one synchronous pre-launch boundary to discard a
	# callback left by an older browser before this attempt can return.
	emit_signal("browser_opening")
	var opened: Variant = browser_opener.call(url)
	if typeof(opened) != TYPE_INT or opened != OK:
		_fail_start(FALLBACK_ERROR)
		return
	emit_signal("start_succeeded")

func _fail_request(phase: String, error_code: String) -> void:
	if phase == "exchange" and _logout_after_exchange:
		_logout_after_exchange = false
		_fail_logout(error_code)
	elif phase == "logout":
		_fail_logout(error_code)
	elif phase == "refresh":
		_fail_refresh(error_code)
	elif phase == "exchange":
		_fail_session(error_code)
	else:
		_fail_start(error_code)

func _fail_start(error_code: String) -> void:
	_request_active = false
	_request_phase = ""
	_flow.clear()
	emit_signal("start_failed", error_code)

func _fail_session(error_code: String) -> void:
	_request_active = false
	_request_phase = ""
	_flow.clear()
	_tokens.clear()
	emit_signal("session_failed", error_code)

func _fail_refresh(error_code: String) -> void:
	_request_active = false
	_request_phase = ""
	_tokens.clear()
	emit_signal("refresh_failed", error_code)

func _fail_logout(error_code: String) -> void:
	_request_active = false
	_request_phase = ""
	_tokens.clear()
	emit_signal("logout_failed", error_code)

static func _validated_error(payload: Variant) -> String:
	if typeof(payload) != TYPE_DICTIONARY:
		return FALLBACK_ERROR
	var data: Dictionary = payload
	if data.size() != 2 or data.get("version") != Flow.VERSION:
		return FALLBACK_ERROR
	var error: Variant = data.get("error")
	return str(error) if typeof(error) == TYPE_STRING and error in ERROR_CODES else FALLBACK_ERROR

static func _json_content_type(headers: PackedStringArray) -> bool:
	for header in headers:
		var lower := header.to_lower()
		if lower.begins_with("content-type:"):
			var value := lower.trim_prefix("content-type:").strip_edges()
			return value == "application/json" or value.begins_with("application/json;")
	return false

func _open_system_browser(url: String) -> int:
	return OS.shell_open(url)
