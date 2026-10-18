extends SceneTree

const NativeAuthStart = preload("res://net/auth/native_auth_start.gd")
const SERVER := "http://127.0.0.1:3000"
const BUILD := "aurion-godot-g09b-runtime"
const CANONICAL_BROWSER := "https://arelogic.space/api/native-auth/browser/ttttttttttttttttttttttttttttttttttttttttttt"

var failures: Array[String] = []
var opened_urls: Array[String] = []
var client: Node
var start_completed := false
var start_succeeded := false
var start_error := ""
var session_completed := false
var session_succeeded := false
var session_error := ""
var refresh_completed := false
var refresh_succeeded := false
var refresh_error := ""

func require(condition: bool, message: String) -> void:
	if not condition:
		failures.append(message)

func _init() -> void:
	call_deferred("verify")

func _opened(url: String) -> int:
	opened_urls.append(url)
	return OK

func _on_start_success() -> void:
	start_completed = true
	start_succeeded = true

func _on_start_failure(value: String) -> void:
	start_completed = true
	start_succeeded = false
	start_error = value

func _on_session_success() -> void:
	session_completed = true
	session_succeeded = true

func _on_session_failure(value: String) -> void:
	session_completed = true
	session_succeeded = false
	session_error = value

func _on_refresh_success() -> void:
	refresh_completed = true
	refresh_succeeded = true

func _on_refresh_failure(value: String) -> void:
	refresh_completed = true
	refresh_succeeded = false
	refresh_error = value

func run_start() -> void:
	start_completed = false
	start_succeeded = false
	start_error = ""
	require(client.begin(SERVER, BUILD, true), "start request did not begin")
	while not start_completed:
		await process_frame

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

func run_exchange() -> void:
	session_completed = false
	session_succeeded = false
	session_error = ""
	var callback := await callback_url()
	require(not callback.is_empty(), "test callback unavailable")
	require(client.complete_callback(callback), "callback exchange did not begin")
	while not session_completed:
		await process_frame

func run_refresh(assert_single_flight: bool = false) -> void:
	refresh_completed = false
	refresh_succeeded = false
	refresh_error = ""
	require(client.refresh(), "refresh request did not begin")
	if assert_single_flight:
		require(not client.refresh(), "parallel refresh request was allowed")
	while not refresh_completed:
		await process_frame

func verify() -> void:
	client = NativeAuthStart.new()
	client.browser_opener = Callable(self, "_opened")
	client.start_succeeded.connect(_on_start_success)
	client.start_failed.connect(_on_start_failure)
	client.session_succeeded.connect(_on_session_success)
	client.session_failed.connect(_on_session_failure)
	client.refresh_succeeded.connect(_on_refresh_success)
	client.refresh_failed.connect(_on_refresh_failure)
	root.add_child(client)
	await process_frame
	var request: HTTPRequest = client.get_child(0)
	require(request.timeout == 15.0, "native auth transport has no bounded timeout")
	require(request.max_redirects == 0, "native auth transport can follow redirects")

	await run_start()
	require(start_succeeded, "valid local HTTP start failed")
	require(opened_urls == [CANONICAL_BROWSER], "canonical browser URL was not opened exactly once")
	await run_exchange()
	require(session_succeeded, "valid callback exchange failed")
	require(client.access_token() == "a".repeat(43), "verified exchange did not install access in memory")
	await run_refresh(true)
	require(refresh_succeeded, "valid refresh rotation failed")
	require(client.access_token() == "b".repeat(43), "rotated access was not installed in memory")
	await run_refresh()
	require(not refresh_succeeded, "typed refresh failure succeeded")
	require(refresh_error == "NATIVE_AUTH_REFRESH_REUSED", "typed refresh error was not preserved")
	require(client.access_token().is_empty(), "typed refresh failure retained authority")

	await run_start()
	require(start_succeeded, "refresh redirect setup failed")
	await run_exchange()
	require(session_succeeded, "refresh redirect session setup failed")
	await run_refresh()
	require(not refresh_succeeded, "refresh redirect was accepted")
	require(refresh_error == "NATIVE_AUTH_CONFIGURATION_UNAVAILABLE", "refresh redirect was not sanitized")
	require(client.access_token().is_empty(), "refresh redirect retained authority")

	await run_start()
	require(start_succeeded, "invalid-callback setup failed")
	session_completed = false
	require(not client.complete_callback("https://evil.example/app/auth/callback?code=" + "c".repeat(43) + "&state=" + "s".repeat(43)),
		"foreign callback began an exchange")
	require(session_completed and not session_succeeded, "foreign callback did not fail closed")
	require(client.access_token().is_empty(), "foreign callback retained prior access authority")

	await run_start()
	require(start_succeeded, "exchange redirect setup failed")
	await run_exchange()
	require(not session_succeeded, "exchange redirect was accepted")
	require(session_error == "NATIVE_AUTH_CONFIGURATION_UNAVAILABLE", "exchange redirect was not sanitized")
	require(client.access_token().is_empty(), "exchange redirect retained authority")

	await run_start()
	require(start_succeeded, "typed exchange failure setup failed")
	await run_exchange()
	require(not session_succeeded, "typed exchange failure succeeded")
	require(session_error == "NATIVE_AUTH_STATE_MISMATCH", "typed exchange error was not preserved")
	require(client.access_token().is_empty(), "typed exchange failure retained authority")

	await run_start()
	require(start_succeeded, "malformed token setup failed")
	await run_exchange()
	require(not session_succeeded, "malformed token response succeeded")
	require(session_error == "NATIVE_AUTH_CONFIGURATION_UNAVAILABLE", "malformed token response was not sanitized")
	require(client.access_token().is_empty(), "malformed token response retained authority")

	await run_start()
	require(not start_succeeded, "noncanonical browser response was accepted")
	require(start_error == "NATIVE_AUTH_CONFIGURATION_UNAVAILABLE", "invalid start response was not sanitized")
	await run_start()
	require(not start_succeeded, "start redirect response was accepted")
	require(start_error == "NATIVE_AUTH_CONFIGURATION_UNAVAILABLE", "start redirect response was not sanitized")
	await run_start()
	require(not start_succeeded, "typed unavailable start response succeeded")
	require(start_error == "NATIVE_AUTH_CONFIGURATION_UNAVAILABLE", "typed start error was not preserved")

	client.queue_free()
	await process_frame
	if failures.is_empty():
		print("Godot native-auth start, exchange and refresh HTTP runtime verified")
		quit(0)
	else:
		for failure in failures:
			push_error(failure)
		quit(1)
