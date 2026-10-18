class_name AurionNativeAuthStart
extends Node
## Active native auth browser handoff: strict start and exchange requests with
## ephemeral in-process credentials. Aurion remains the sole session authority.

signal start_succeeded
signal start_failed(error_code: String)
signal session_succeeded
signal session_failed(error_code: String)

const RuntimeConfig = preload("res://config/runtime_config.gd")
const Flow = preload("res://net/auth/native_auth_flow.gd")
const Callback = preload("res://platform/android/native_app_link_callback.gd")
const Tokens = preload("res://net/auth/native_auth_tokens.gd")
const START_PATH := "/api/native-auth/start"
const EXCHANGE_PATH := "/api/native-auth/exchange"
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
var _server_base_url := ""

func _ready() -> void:
	_http = HTTPRequest.new()
	_http.body_size_limit = 16384
	_http.max_redirects = 0
	_http.timeout = 15.0
	add_child(_http)
	_http.request_completed.connect(_on_request_completed)
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
	return _send_json(START_PATH, request, "start", false)

## The platform adapter forwards the raw HTTPS App Link here. URL validation,
## state/PKCE consumption and the exchange request are one fail-closed boundary.
func complete_callback(raw_url: Variant) -> bool:
	if _request_active or _server_base_url.is_empty() or not is_inside_tree():
		return false
	var request: Dictionary = Callback.consume(raw_url, _flow)
	if request.is_empty():
		_fail_session(FALLBACK_ERROR)
		return false
	return _send_json(EXCHANGE_PATH, request, "exchange", true)

func access_token(now_ms: int = -1) -> String:
	return _tokens.access_token(now_ms)

func cancel() -> void:
	if _request_active and is_instance_valid(_http):
		_http.cancel_request()
	_request_active = false
	_request_phase = ""
	_flow.clear()

func _exit_tree() -> void:
	cancel()
	_tokens.clear()

func _send_json(path: String, payload: Dictionary, phase: String, session_phase: bool) -> bool:
	_request_active = true
	_request_phase = phase
	var error := _http.request(
		_server_base_url + path,
		PackedStringArray(["Content-Type: application/json", "Accept: application/json"]),
		HTTPClient.METHOD_POST,
		JSON.stringify(payload)
	)
	if error != OK:
		if session_phase:
			_fail_session(FALLBACK_ERROR)
		else:
			_fail_start(FALLBACK_ERROR)
		return false
	return true

func _on_request_completed(result: int, response_code: int, headers: PackedStringArray, body: PackedByteArray) -> void:
	if not _request_active:
		return
	var phase := _request_phase
	_request_active = false
	_request_phase = ""
	if result != HTTPRequest.RESULT_SUCCESS or not _json_content_type(headers):
		if phase == "exchange":
			_fail_session(FALLBACK_ERROR)
		else:
			_fail_start(FALLBACK_ERROR)
		return
	var payload: Variant = JSON.parse_string(body.get_string_from_utf8())
	if response_code != 200:
		if phase == "exchange":
			_fail_session(_validated_error(payload))
		else:
			_fail_start(_validated_error(payload))
		return
	if phase == "exchange":
		if not _tokens.accept_token_response(payload):
			_fail_session(FALLBACK_ERROR)
			return
		emit_signal("session_succeeded")
		return
	if phase != "start" or not _flow.accept_start_response(payload):
		_fail_start(FALLBACK_ERROR)
		return
	var url := _flow.browser_url()
	var opened: Variant = browser_opener.call(url)
	if typeof(opened) != TYPE_INT or opened != OK:
		_fail_start(FALLBACK_ERROR)
		return
	emit_signal("start_succeeded")

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
