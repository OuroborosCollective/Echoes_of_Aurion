extends SceneTree

const NativeAuthStart = preload("res://net/auth/native_auth_start.gd")
const AurionApi = preload("res://net/api/aurion_api.gd")
const SERVER := "http://127.0.0.1:3000"
const BUILD := "aurion-godot-g09b-api-runtime"

var failures: Array[String] = []
var auth: Node
var api: Node
var auth_completed := false
var auth_succeeded := false
var request_completed := false
var request_succeeded := false
var request_error := ""
var request_failure_count := 0
var receipt: Dictionary = {}
var logout_completed := false

class FakeAuth:
	extends Node
	signal refresh_succeeded
	signal refresh_failed(error_code: String)
	signal logout_succeeded
	signal logout_failed(error_code: String)
	var current_access := "new-session-access"
	var logout_calls := 0
	var refresh_calls := 0
	var refresh_behavior := "reject"
	var refresh_pending := false
	var generation := 1
	var response_allowed := true

	func access_token(_now_ms: int = -1) -> String:
		return current_access

	func session_generation() -> int:
		return generation

	func protected_response_allowed(_now_ms: int = -1) -> bool:
		return response_allowed

	func refresh(_now_ms: int = -1) -> bool:
		refresh_calls += 1
		if refresh_behavior == "sync_fail":
			emit_signal("refresh_failed", "NATIVE_AUTH_CONFIGURATION_UNAVAILABLE")
			return false
		if refresh_pending:
			return false
		if refresh_behavior == "start":
			refresh_pending = true
			return true
		return false

	func refresh_in_flight() -> bool:
		return refresh_pending

	func logout() -> bool:
		logout_calls += 1
		current_access = ""
		refresh_pending = false
		generation += 1
		emit_signal("logout_succeeded")
		return true

func require(condition: bool, message: String) -> void:
	if not condition:
		failures.append(message)

func _init() -> void:
	call_deferred("verify")

func _opened(_url: String) -> int:
	return OK

func _on_start_success() -> void:
	auth_completed = true
	auth_succeeded = true

func _on_start_failure(_error_code: String) -> void:
	auth_completed = true
	auth_succeeded = false

func _on_session_success() -> void:
	auth_completed = true
	auth_succeeded = true

func _on_session_failure(_error_code: String) -> void:
	auth_completed = true
	auth_succeeded = false

func _on_zone_ticket(value: Dictionary) -> void:
	request_completed = true
	request_succeeded = true
	receipt = value

func _on_request_failure(value: String) -> void:
	request_completed = true
	request_succeeded = false
	request_error = value
	request_failure_count += 1

func _on_logout_terminal(_error_code: String = "") -> void:
	logout_completed = true

func callback_url() -> String:
	var fetch := HTTPRequest.new()
	fetch.timeout = 5.0
	fetch.max_redirects = 0
	root.add_child(fetch)
	var error := fetch.request(SERVER + "/test-callback")
	if error != OK:
		fetch.queue_free()
		return ""
	var response: Array = await fetch.request_completed
	var value := ""
	if response[0] == HTTPRequest.RESULT_SUCCESS and response[1] == 200:
		value = response[3].get_string_from_utf8()
	fetch.queue_free()
	return value

func login() -> void:
	auth_completed = false
	auth_succeeded = false
	require(auth.begin(SERVER, BUILD, true), "native start did not begin")
	while not auth_completed:
		await process_frame
	require(auth_succeeded, "native start failed")
	auth_completed = false
	auth_succeeded = false
	var callback := await callback_url()
	require(not callback.is_empty(), "callback URL unavailable")
	require(auth.complete_callback(callback), "native exchange did not begin")
	while not auth_completed:
		await process_frame
	require(auth_succeeded, "native exchange failed")

func request_ticket(assert_single_flight: bool = false) -> void:
	request_completed = false
	request_succeeded = false
	request_error = ""
	receipt = {}
	require(api.issue_zone_ticket(SERVER, BUILD, true), "zone ticket request did not begin")
	if assert_single_flight:
		require(not api.issue_zone_ticket(SERVER, BUILD, true), "parallel protected request was allowed")
	while not request_completed:
		await process_frame

func verify() -> void:
	auth = NativeAuthStart.new()
	auth.browser_opener = Callable(self, "_opened")
	auth.start_succeeded.connect(_on_start_success)
	auth.start_failed.connect(_on_start_failure)
	auth.session_succeeded.connect(_on_session_success)
	auth.session_failed.connect(_on_session_failure)
	auth.logout_succeeded.connect(_on_logout_terminal)
	auth.logout_failed.connect(_on_logout_terminal)
	root.add_child(auth)
	await process_frame
	api = AurionApi.new(auth)
	api.zone_ticket_succeeded.connect(_on_zone_ticket)
	api.request_failed.connect(_on_request_failure)
	root.add_child(api)
	await process_frame
	var transport: HTTPRequest = api.get_child(0)
	require(transport.timeout == 15.0, "protected API transport has no bounded timeout")
	require(transport.max_redirects == 0, "protected API transport can follow redirects")

	await login()
	require(auth.access_token() == "a".repeat(43), "first exchange access missing")
	require(auth.refresh(), "external refresh did not begin")
	await request_ticket(true)
	require(request_succeeded, "401 refresh retry did not recover")
	require(auth.access_token() == "b".repeat(43), "rotated access was not installed")
	require(receipt.get("ticket") == "z".repeat(48), "confirmed zone ticket missing")
	require(receipt.get("zoneId") == "observatory_threshold", "confirmed zone identity missing")

	logout_completed = false
	await request_ticket()
	require(not request_succeeded, "second 401 retry was accepted")
	require(request_error == "AURION_API_AUTH_REQUIRED", "second 401 did not require auth")
	require(auth.access_token().is_empty(), "second 401 retained local authority")
	while not logout_completed:
		await process_frame

	await login()
	require(auth.access_token() == "d".repeat(43), "second exchange access missing")
	await request_ticket()
	require(not request_succeeded, "failed refresh recovered protected request")
	require(request_error == "AURION_API_AUTH_REQUIRED", "refresh failure did not require auth")
	require(auth.access_token().is_empty(), "refresh failure retained local authority")

	var replacement_auth := FakeAuth.new()
	root.add_child(replacement_auth)
	var stale_api := AurionApi.new(replacement_auth)
	stale_api.request_failed.connect(_on_request_failure)
	root.add_child(stale_api)
	await process_frame
	request_completed = false
	request_error = ""
	stale_api._active = true
	stale_api._retried_after_refresh = true
	stale_api._sent_access_token = "old-session-access"
	stale_api._on_request_completed(
		HTTPRequest.RESULT_SUCCESS,
		401,
		PackedStringArray(),
		PackedByteArray()
	)
	require(request_completed, "stale 401 did not terminate its request")
	require(request_error == "AURION_API_RESPONSE_INVALID", "stale 401 was not rejected")
	require(replacement_auth.logout_calls == 0, "stale 401 logged out the replacement session")
	require(replacement_auth.refresh_calls == 0, "stale 401 refreshed the replacement session")
	require(replacement_auth.access_token() == "new-session-access", "stale 401 changed replacement authority")
	stale_api.queue_free()
	replacement_auth.queue_free()

	var expired_auth := FakeAuth.new()
	expired_auth.current_access = ""
	expired_auth.refresh_behavior = "start"
	root.add_child(expired_auth)
	var expired_api := AurionApi.new(expired_auth)
	expired_api.request_failed.connect(_on_request_failure)
	root.add_child(expired_api)
	await process_frame
	request_failure_count = 0
	require(expired_api.issue_zone_ticket(SERVER, BUILD, true), "expired access did not begin refresh")
	require(expired_auth.refresh_calls == 1, "expired access did not call refresh exactly once")
	require(expired_auth.refresh_in_flight(), "expired access did not retain refresh authority")
	require(expired_api._active, "expired access did not keep protected request active")
	expired_api.cancel()
	expired_api.queue_free()
	expired_auth.queue_free()

	var joined_auth := FakeAuth.new()
	joined_auth.current_access = ""
	joined_auth.refresh_behavior = "start"
	joined_auth.refresh_pending = true
	root.add_child(joined_auth)
	var joined_api := AurionApi.new(joined_auth)
	joined_api.request_failed.connect(_on_request_failure)
	root.add_child(joined_api)
	await process_frame
	require(joined_api.issue_zone_ticket(SERVER, BUILD, true), "expired access did not join in-flight refresh")
	require(joined_auth.refresh_calls == 1, "refresh join did not consult auth lifecycle exactly once")
	require(joined_api._active, "refresh join did not keep protected request active")
	request_completed = false
	request_error = ""
	request_failure_count = 0
	joined_auth.logout()
	require(request_completed, "logout did not terminate refresh waiter")
	require(request_error == "AURION_API_AUTH_REQUIRED", "logout waiter did not require auth")
	require(request_failure_count == 1, "logout waiter emitted more than one failure")
	require(not joined_api._active, "logout left protected request active")
	joined_api.queue_free()
	joined_auth.queue_free()

	var failing_auth := FakeAuth.new()
	failing_auth.current_access = ""
	failing_auth.refresh_behavior = "sync_fail"
	root.add_child(failing_auth)
	var failing_api := AurionApi.new(failing_auth)
	failing_api.request_failed.connect(_on_request_failure)
	root.add_child(failing_api)
	await process_frame
	request_completed = false
	request_error = ""
	request_failure_count = 0
	require(not failing_api.issue_zone_ticket(SERVER, BUILD, true), "synchronous refresh failure reported request start")
	require(request_completed, "synchronous refresh failure did not terminate request")
	require(request_error == "AURION_API_AUTH_REQUIRED", "synchronous refresh failure did not require auth")
	require(request_failure_count == 1, "synchronous refresh failure emitted more than once")
	require(failing_auth.logout_calls == 0, "synchronous refresh failure triggered duplicate logout")
	failing_api.queue_free()
	failing_auth.queue_free()

	var boundary_auth := FakeAuth.new()
	boundary_auth.current_access = ""
	boundary_auth.refresh_behavior = "start"
	root.add_child(boundary_auth)
	var boundary_api := AurionApi.new(boundary_auth)
	boundary_api.request_failed.connect(_on_request_failure)
	root.add_child(boundary_api)
	await process_frame
	request_completed = false
	request_error = ""
	request_failure_count = 0
	boundary_api._active = true
	boundary_api._sent_access_token = "expired-session-access"
	boundary_api._sent_session_generation = boundary_auth.session_generation()
	boundary_api._on_request_completed(
		HTTPRequest.RESULT_SUCCESS,
		401,
		PackedStringArray(),
		PackedByteArray()
	)
	require(boundary_auth.refresh_calls == 1, "deadline-crossing 401 did not start refresh")
	require(boundary_auth.refresh_in_flight(), "deadline-crossing 401 lost refresh authority")
	require(boundary_api._active, "deadline-crossing 401 terminated a refreshable request")
	require(request_failure_count == 0, "deadline-crossing 401 emitted premature failure")
	boundary_api.cancel()
	boundary_api.queue_free()
	boundary_auth.queue_free()

	var logout_auth := FakeAuth.new()
	root.add_child(logout_auth)
	var logout_api := AurionApi.new(logout_auth)
	logout_api.request_failed.connect(_on_request_failure)
	root.add_child(logout_api)
	await process_frame
	request_completed = false
	request_error = ""
	request_failure_count = 0
	logout_api._active = true
	logout_api._sent_access_token = logout_auth.current_access
	logout_api._sent_session_generation = logout_auth.session_generation()
	logout_auth.logout()
	require(request_completed, "logout did not terminate initial protected request")
	require(request_error == "AURION_API_AUTH_REQUIRED", "initial logout did not require auth")
	require(request_failure_count == 1, "initial logout emitted more than one failure")
	require(not logout_api._active, "initial logout left protected request active")
	logout_api.queue_free()
	logout_auth.queue_free()

	var absolute_auth := FakeAuth.new()
	absolute_auth.current_access = ""
	absolute_auth.refresh_pending = true
	absolute_auth.response_allowed = false
	root.add_child(absolute_auth)
	var absolute_api := AurionApi.new(absolute_auth)
	absolute_api.zone_ticket_succeeded.connect(_on_zone_ticket)
	absolute_api.request_failed.connect(_on_request_failure)
	root.add_child(absolute_api)
	await process_frame
	request_completed = false
	request_succeeded = false
	request_error = ""
	request_failure_count = 0
	absolute_api._active = true
	absolute_api._sent_access_token = "expired-session-access"
	absolute_api._sent_session_generation = absolute_auth.session_generation()
	var expired_body := JSON.stringify([{
		"result": {"data": {"json": {
			"ticket": "x".repeat(48),
			"zoneId": "observatory_threshold",
			"expiresAt": "2026-10-18T11:00:00.000Z",
		}}},
	}]).to_utf8_buffer()
	absolute_api._on_request_completed(
		HTTPRequest.RESULT_SUCCESS,
		200,
		PackedStringArray(["Content-Type: application/json"]),
		expired_body
	)
	require(request_completed and not request_succeeded, "absolute-expired 200 was accepted")
	require(request_error == "AURION_API_AUTH_REQUIRED", "absolute-expired 200 did not require auth")
	require(request_failure_count == 1, "absolute-expired 200 emitted more than one failure")
	absolute_api.queue_free()
	absolute_auth.queue_free()

	var success_auth := FakeAuth.new()
	success_auth.current_access = ""
	root.add_child(success_auth)
	var success_api := AurionApi.new(success_auth)
	success_api.zone_ticket_succeeded.connect(_on_zone_ticket)
	success_api.request_failed.connect(_on_request_failure)
	root.add_child(success_api)
	await process_frame
	request_completed = false
	request_succeeded = false
	request_error = ""
	request_failure_count = 0
	receipt = {}
	success_api._active = true
	success_api._sent_access_token = "expired-session-access"
	success_api._sent_session_generation = success_auth.session_generation()
	var success_body := JSON.stringify([{
		"result": {"data": {"json": {
			"ticket": "q".repeat(48),
			"zoneId": "observatory_threshold",
			"expiresAt": "2026-10-18T11:00:00.000Z",
		}}},
	}]).to_utf8_buffer()
	success_api._on_request_completed(
		HTTPRequest.RESULT_SUCCESS,
		200,
		PackedStringArray(["Content-Type: application/json"]),
		success_body
	)
	require(request_completed and request_succeeded, "deadline-crossing 200 was rejected")
	require(receipt.get("ticket") == "q".repeat(48), "deadline-crossing 200 lost confirmed ticket")
	require(request_failure_count == 0, "deadline-crossing 200 emitted failure")
	success_api.queue_free()
	success_auth.queue_free()

	api.queue_free()
	auth.queue_free()
	await process_frame
	if failures.is_empty():
		print("Godot protected zone ticket client regression verified")
		quit(0)
	else:
		for failure in failures:
			push_error(failure)
		quit(1)

