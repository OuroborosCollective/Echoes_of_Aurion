extends SceneTree
## Contract tests for the Godot HTTPS native-auth start adapter.
## HTTP completions are injected only at the test boundary, never claimed as live server proof.
const Client = preload("res://net/auth/native_auth_client.gd")
const BUILD := "aurion-godot-g09b"
const VERSION := "aurion.native-auth.v1"
const TRANSACTION_ID := "t".repeat(43)
const CODE := "c".repeat(43)
const CALLBACK := "https://arelogic.space/app/auth/callback?"
var failures: Array[String] = []

func require(value: bool, label: String) -> void:
	if not value:
		failures.append(label)

func _init() -> void:
	call_deferred("verify")

func approved() -> Dictionary:
	return {
		"version": VERSION,
		"transactionId": TRANSACTION_ID,
		"browserUrl": "https://arelogic.space/api/native-auth/browser/" + TRANSACTION_ID,
		"expiresInSeconds": 600,
	}

func arm(client: Node) -> Dictionary:
	client.cancel()
	var start: Dictionary = client._flow.prepare_start(BUILD)
	client._pending = true
	return start

func deliver(client: Node, status: int, text: String, transport: int = HTTPRequest.RESULT_SUCCESS,
		mime: String = "Content-Type: application/json; charset=utf-8") -> void:
	var headers := PackedStringArray()
	if not mime.is_empty():
		headers.append(mime)
	client._on_start_completed(transport, status, headers, text.to_utf8_buffer())

func verify() -> void:
	var client = Client.new()
	root.add_child(client)
	await process_frame
	var errors: Array[String] = []
	var urls: Array[String] = []
	client.start_failed.connect(func(code: String) -> void: errors.append(code))
	client.browser_start_ready.connect(func(url: String) -> void: urls.append(url))
	var previous_server: Variant = ProjectSettings.get_setting("aurion/server_base_url", "")

	ProjectSettings.set_setting("aurion/server_base_url", "https://attacker.example")
	require(not client.begin(BUILD), "foreign server configuration must fail before any HTTP")
	require(errors.size() == 1 and errors.back() == "NATIVE_AUTH_CONFIGURATION_UNAVAILABLE", "wrong-host error class")
	ProjectSettings.set_setting("aurion/server_base_url", previous_server)
	require(not client.begin("bad/build"), "invalid build must fail before any HTTP")
	require(errors.size() == 2 and errors.back() == "NATIVE_AUTH_REQUEST_INVALID", "invalid-build error class")
	require(client.consume_android_callback(CALLBACK + "code=" + CODE + "&state=" + "s".repeat(43)).is_empty(),
		"unsolicited Android callback accepted")

	arm(client)
	require(not client.begin(BUILD), "parallel start must be refused")
	deliver(client, 302, "")
	require(urls.is_empty(), "HTTP redirect must not open a browser")
	require(errors.back() == "NATIVE_AUTH_TRANSACTION_INVALID", "redirect error class")
	arm(client)
	deliver(client, 200, JSON.stringify(approved()), HTTPRequest.RESULT_SUCCESS, "Content-Type: text/html")
	require(urls.is_empty(), "HTML 200 accepted as native auth JSON")
	arm(client)
	deliver(client, 200, JSON.stringify(approved()), HTTPRequest.RESULT_SUCCESS, "")
	require(urls.is_empty(), "missing JSON content type accepted")
	arm(client)
	deliver(client, 200, JSON.stringify(approved()), HTTPRequest.RESULT_CANT_CONNECT)
	require(errors.back() == "NATIVE_AUTH_CONFIGURATION_UNAVAILABLE", "transport failure class")
	arm(client)
	deliver(client, 503, "")
	require(errors.back() == "NATIVE_AUTH_CONFIGURATION_UNAVAILABLE", "server unavailability class")
	arm(client)
	deliver(client, 429, "")
	require(errors.back() == "NATIVE_AUTH_RATE_LIMITED", "rate limit class")
	arm(client)
	deliver(client, 200, "not json")
	require(urls.is_empty(), "malformed JSON was accepted")
	arm(client)
	var unsafe: Dictionary = approved()
	unsafe["browserUrl"] += "?accessToken=secret"
	deliver(client, 200, JSON.stringify(unsafe))
	require(urls.is_empty(), "credential-bearing browser URL accepted")
	arm(client)
	deliver(client, 200, " ".repeat(4097))
	require(urls.is_empty(), "oversized HTTP body was accepted")

	var start: Dictionary = arm(client)
	deliver(client, 200, JSON.stringify(approved()))
	require(urls.size() == 1 and urls.back() == approved()["browserUrl"], "verified HTTPS browser URL missing")
	require(not client.begin(BUILD), "pending browser transaction was overwritten")
	var exchange: Dictionary = client.consume_android_callback(
		CALLBACK + "code=" + CODE + "&state=" + str(start["requestState"]))
	require(exchange.size() == 5, "one-time callback did not produce exact exchange request")
	require(exchange.get("transactionId") == TRANSACTION_ID, "callback transaction mismatch")
	require(exchange.get("code") == CODE, "callback one-time code mismatch")
	require(str(exchange.get("codeVerifier", "")).length() == 43, "PKCE verifier absent")
	require(client.consume_android_callback(CALLBACK + "code=" + CODE + "&state=" + str(start["requestState"])).is_empty(),
		"callback replay was accepted")

	var wrong_state: Dictionary = arm(client)
	deliver(client, 200, JSON.stringify(approved()))
	require(client.consume_android_callback(CALLBACK + "code=" + CODE + "&state=" + "x".repeat(43)).is_empty(),
		"mismatched callback state accepted")
	require(client.consume_android_callback(CALLBACK + "code=" + CODE + "&state=" + str(wrong_state["requestState"])).is_empty(),
		"state mismatch did not destroy transaction")
	arm(client)
	client.cancel()
	require(client.consume_android_callback(CALLBACK + "code=" + CODE + "&state=" + str(start["requestState"])).is_empty(),
		"cancelled flow retained exchange authority")
	ProjectSettings.set_setting("aurion/server_base_url", previous_server)
	client.queue_free()
	await process_frame
	if failures.is_empty():
		print("Godot native-auth HTTPS start adapter verified")
		quit(0)
	else:
		for failure in failures:
			push_error(failure)
		quit(1)
