class_name AurionApi
extends Node
## Narrow authenticated HTTPS boundary for Aurion-owned gameplay requests.
## The client only retries transport after server-authenticated token rotation.

signal zone_ticket_succeeded(receipt: Dictionary)
signal request_failed(error_code: String)

const RuntimeConfig = preload("res://config/runtime_config.gd")
const ZONE_TICKET_PATH := "/api/trpc/gameplay.issueZoneTicket?batch=1"
const ZONE_ID := "observatory_threshold"
const AUTH_REQUIRED := "AURION_API_AUTH_REQUIRED"
const REQUEST_FAILED := "AURION_API_REQUEST_FAILED"
const RESPONSE_INVALID := "AURION_API_RESPONSE_INVALID"

var _auth: Node
var _http: HTTPRequest
var _server_base_url := ""
var _client_build := ""
var _active := false
var _retried_after_refresh := false

func _init(auth_client: Node) -> void:
	_auth = auth_client

func _ready() -> void:
	_http = HTTPRequest.new()
	_http.body_size_limit = 16384
	_http.max_redirects = 0
	_http.timeout = 15.0
	add_child(_http)
	_http.request_completed.connect(_on_request_completed)
	_auth.refresh_succeeded.connect(_on_refresh_succeeded)
	_auth.refresh_failed.connect(_on_refresh_failed)

func issue_zone_ticket(server_base_url: String, client_build: String, allow_local: bool = false) -> bool:
	if _active or not is_inside_tree():
		return false
	_server_base_url = RuntimeConfig.validated_server_url(server_base_url, allow_local)
	_client_build = RuntimeConfig.validated_build(client_build)
	if _server_base_url.is_empty() or _client_build.is_empty() or _auth.access_token().is_empty():
		_fail(AUTH_REQUIRED)
		return false
	_active = true
	_retried_after_refresh = false
	return _send_zone_ticket()

func cancel() -> void:
	if _active and is_instance_valid(_http):
		_http.cancel_request()
	_active = false
	_retried_after_refresh = false

func _exit_tree() -> void:
	cancel()

func _send_zone_ticket() -> bool:
	var access: String = _auth.access_token()
	if access.is_empty():
		_fail(AUTH_REQUIRED)
		return false
	var payload := {
		"0": {
			"json": {
				"zoneId": ZONE_ID,
				"clientBuild": _client_build,
			},
		},
	}
	var error := _http.request(
		_server_base_url + ZONE_TICKET_PATH,
		PackedStringArray([
			"Authorization: Bearer " + access,
			"Content-Type: application/json",
			"Accept: application/json",
		]),
		HTTPClient.METHOD_POST,
		JSON.stringify(payload)
	)
	if error != OK:
		_fail(REQUEST_FAILED)
		return false
	return true

func _on_request_completed(result: int, response_code: int, headers: PackedStringArray, body: PackedByteArray) -> void:
	if not _active:
		return
	if result != HTTPRequest.RESULT_SUCCESS:
		_fail(REQUEST_FAILED)
		return
	if response_code == 401:
		if _retried_after_refresh:
			_auth.logout()
			_fail(AUTH_REQUIRED)
			return
		_retried_after_refresh = true
		if not _auth.refresh():
			_auth.logout()
			_fail(AUTH_REQUIRED)
		return
		return
	if response_code != 200:
		_fail(REQUEST_FAILED)
		return
	if _auth.access_token().is_empty() or not _json_content_type(headers):
		_fail(RESPONSE_INVALID)
		return
	var receipt := _parse_zone_ticket(JSON.parse_string(body.get_string_from_utf8()))
	if receipt.is_empty():
		_fail(RESPONSE_INVALID)
		return
	_active = false
	_retried_after_refresh = false
	emit_signal("zone_ticket_succeeded", receipt)

func _on_refresh_succeeded() -> void:
	if _active and _retried_after_refresh:
		_send_zone_ticket()

func _on_refresh_failed(_error_code: String) -> void:
	if _active and _retried_after_refresh:
		_fail(AUTH_REQUIRED)

func _fail(error_code: String) -> void:
	_active = false
	_retried_after_refresh = false
	emit_signal("request_failed", error_code)

static func _parse_zone_ticket(raw: Variant) -> Dictionary:
	if typeof(raw) != TYPE_ARRAY:
		return {}
	var batch: Array = raw
	if batch.size() != 1 or typeof(batch[0]) != TYPE_DICTIONARY:
		return {}
	var entry: Dictionary = batch[0]
	var result: Variant = entry.get("result")
	if typeof(result) != TYPE_DICTIONARY:
		return {}
	var data: Variant = (result as Dictionary).get("data")
	if typeof(data) != TYPE_DICTIONARY:
		return {}
	var value: Variant = (data as Dictionary).get("json")
	if typeof(value) != TYPE_DICTIONARY:
		return {}
	var receipt: Dictionary = value
	if receipt.size() != 3 or receipt.get("zoneId") != ZONE_ID:
		return {}
	var ticket: Variant = receipt.get("ticket")
	var expires_at: Variant = receipt.get("expiresAt")
	if typeof(ticket) != TYPE_STRING or ticket.length() < 32 or ticket.length() > 128:
		return {}
	var ticket_pattern := RegEx.new()
	ticket_pattern.compile("^[A-Za-z0-9_-]+$")
	if ticket_pattern.search(ticket) == null:
		return {}
	if typeof(expires_at) != TYPE_STRING or expires_at.length() < 20 or expires_at.length() > 64:
		return {}
	return {
		"ticket": ticket,
		"zoneId": ZONE_ID,
		"expiresAt": expires_at,
	}

static func _json_content_type(headers: PackedStringArray) -> bool:
	for header in headers:
		var lower := header.to_lower()
		if lower.begins_with("content-type:"):
			var value := lower.trim_prefix("content-type:").strip_edges()
			return value == "application/json" or value.begins_with("application/json;")
	return false
