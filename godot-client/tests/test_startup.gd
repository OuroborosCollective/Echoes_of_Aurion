extends SceneTree

const Config = preload("res://config/runtime_config.gd")
var failures: Array[String] = []

class FakeApi:
	extends Node
	var calls := 0
	var server := ""
	var build := ""

	func issue_zone_ticket(server_base_url: String, client_build: String, _allow_local: bool = false) -> bool:
		calls += 1
		server = server_base_url
		build = client_build
		return true

func require(condition: bool, message: String) -> void:
	if not condition:
		failures.append(message)

func _init() -> void:
	call_deferred("verify")

func verify() -> void:
	require(Config.validated_server_url("https://arelogic.space/") == Config.PRODUCT_SERVER, "product URL rejected")
	for invalid in ["http://arelogic.space", "https://arelogic.space.evil.test", "https://user@arelogic.space", "https://arelogic.space/path", "https://arelogic.space?token=bad", "", "http://127.0.0.1:3000"]:
		require(Config.validated_server_url(invalid).is_empty(), "unsafe URL accepted: " + invalid)
	require(Config.validated_server_url("http://127.0.0.1:3000", true) != "", "explicit local test URL rejected")
	require(Config.validated_build("aurion-g06.1") != "", "build ID rejected")
	for invalid_build in ["ab", "has spaces", "a".repeat(121), "bad/token"]:
		require(Config.validated_build(invalid_build).is_empty(), "unsafe build accepted")
	for action in ["move_left", "move_right", "move_forward", "move_backward", "interact", "primary_action"]:
		require(InputMap.has_action(action), "missing input action: " + action)
	require(ProjectSettings.get_setting("rendering/renderer/rendering_method") == "gl_compatibility", "renderer changed")
	require(ProjectSettings.get_setting("rendering/textures/vram_compression/import_etc2_astc", false), "Android texture import missing")
	require(ResourceLoader.exists(ProjectSettings.get_setting("application/config/icon", "")), "Android project icon missing")
	var packed := load("res://app/main.tscn") as PackedScene
	require(packed != null, "main scene unavailable")
	if packed == null:
		quit(1)
		return
	var scene := packed.instantiate()
	root.add_child(scene)
	for viewport_size in [Vector2i(1340, 800), Vector2i(800, 1340), Vector2i(360, 640)]:
		root.size = viewport_size
		await process_frame
		await process_frame
		var card: Control = scene.get_node("%LaunchCard")
		var button: Button = scene.get_node("%Login")
		print("Layout: window=", viewport_size, " root=", root.size, " scene=", scene.size, " card=", card.size, " minimum=", card.get_combined_minimum_size())
		require(card.size.x <= viewport_size.x - 32, "launch card overflows width")
		require(button.size.y >= 48, "touch target too small")
		require(scene.get_node("%BuildIdentity").text == "Build · " + Config.current().client_build, "visible build identity missing")
		require(button.disabled, "production-unready native login must stay disabled")
		require(scene.get_node("%ConnectionStatus").text == "Nicht verbunden", "offline status missing")
	scene.queue_free()
	await process_frame
	ProjectSettings.set_setting("aurion/native_auth_start_enabled", true)
	var enabled_scene := packed.instantiate()
	root.add_child(enabled_scene)
	await process_frame
	require(not enabled_scene.get_node("%Login").disabled, "verified native login start was not enabled")
	var live_api: Node = enabled_scene._api
	live_api.cancel()
	live_api.queue_free()
	var fake_api := FakeApi.new()
	enabled_scene.add_child(fake_api)
	enabled_scene._api = fake_api
	enabled_scene._on_auth_session_succeeded()
	require(fake_api.calls == 1, "confirmed session did not request one zone ticket")
	require(fake_api.server == Config.PRODUCT_SERVER, "zone ticket used the wrong server")
	require(fake_api.build == Config.current().client_build, "zone ticket used the wrong build")
	require(enabled_scene.get_node("%ConnectionStatus").text == "Zonenticket wird angefordert", "ticket pending state missing")
	enabled_scene._on_zone_ticket_succeeded({
		"ticket": "z".repeat(48),
		"zoneId": "observatory_threshold",
		"expiresAt": "2026-10-18T19:00:00.000Z",
	})
	require(enabled_scene.get_node("%ConnectionStatus").text == "Sicher verbunden", "confirmed ticket state missing")
	require(enabled_scene.get_node("%Login").text == "Verbunden", "confirmed ticket action state missing")
	enabled_scene._on_zone_ticket_failed("AURION_API_REQUEST_FAILED")
	require(enabled_scene.get_node("%ConnectionStatus").text == "Verbindung derzeit nicht verfügbar", "ticket failure state missing")
	require(not enabled_scene.get_node("%Login").disabled, "terminal logout did not restore login")
	require(enabled_scene.get_node("%Login").text == "Anmelden", "terminal logout action state missing")
	enabled_scene.queue_free()
	await process_frame
	ProjectSettings.set_setting("aurion/server_base_url", "https://attacker.test")
	var invalid_scene := packed.instantiate()
	root.add_child(invalid_scene)
	await process_frame
	require(invalid_scene.get_node("%Login").disabled, "bad configuration enabled login")
	require(invalid_scene.get_node("%ConnectionStatus").text == "Konfiguration ungültig", "bad configuration not blocked")
	invalid_scene.queue_free()
	await process_frame
	if failures.is_empty():
		print("Aurion startup scene and configuration verified")
		quit(0)
	else:
		for failure in failures:
			push_error(failure)
		quit(1)
