extends SceneTree

const NativeAuthStart = preload("res://net/auth/native_auth_start.gd")
const SERVER := "http://127.0.0.1:3000"
const BUILD := "aurion-godot-g09b-runtime"
const CANONICAL_BROWSER := "https://arelogic.space/api/native-auth/browser/ttttttttttttttttttttttttttttttttttttttttttt"

var failures: Array[String] = []
var opened_urls: Array[String] = []
var client: Node
var completed := false
var succeeded := false
var error_code := ""

func require(condition: bool, message: String) -> void:
	if not condition:
		failures.append(message)

func _init() -> void:
	call_deferred("verify")

func _opened(url: String) -> int:
	opened_urls.append(url)
	return OK

func _on_success() -> void:
	completed = true
	succeeded = true

func _on_failure(value: String) -> void:
	completed = true
	succeeded = false
	error_code = value

func run_start() -> void:
	completed = false
	succeeded = false
	error_code = ""
	require(client.begin(SERVER, BUILD, true), "start request did not begin")
	while not completed:
		await process_frame

func verify() -> void:
	client = NativeAuthStart.new()
	client.browser_opener = Callable(self, "_opened")
	client.start_succeeded.connect(_on_success)
	client.start_failed.connect(_on_failure)
	root.add_child(client)
	await process_frame
	var request: HTTPRequest = client.get_child(0)
	require(request.timeout == 15.0, "native auth start has no bounded timeout")
	require(request.max_redirects == 0, "native auth start can follow redirects")

	await run_start()
	require(succeeded, "valid local HTTP start failed")
	require(opened_urls == [CANONICAL_BROWSER], "canonical browser URL was not opened exactly once")

	await run_start()
	require(not succeeded, "noncanonical browser response was accepted")
	require(error_code == "NATIVE_AUTH_CONFIGURATION_UNAVAILABLE", "invalid response was not sanitized")
	require(opened_urls.size() == 1, "invalid response opened a browser")

	await run_start()
	require(not succeeded, "redirect response was accepted")
	require(error_code == "NATIVE_AUTH_CONFIGURATION_UNAVAILABLE", "redirect response was not sanitized")
	require(opened_urls.size() == 1, "redirect response opened a browser")

	await run_start()
	require(not succeeded, "typed unavailable response succeeded")
	require(error_code == "NATIVE_AUTH_CONFIGURATION_UNAVAILABLE", "typed server error was not preserved")
	require(opened_urls.size() == 1, "server error opened a browser")

	client.queue_free()
	await process_frame
	if failures.is_empty():
		print("Godot native-auth start HTTP runtime verified")
		quit(0)
	else:
		for failure in failures:
			push_error(failure)
		quit(1)
