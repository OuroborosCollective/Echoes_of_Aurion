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
var receipt: Dictionary = {}

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

	api.queue_free()
	auth.queue_free()
	await process_frame
	if failures.is_empty():
		print("Godot protected zone ticket refresh runtime verified")
		quit(0)
	else:
		for failure in failures:
			push_error(failure)
		quit(1)

