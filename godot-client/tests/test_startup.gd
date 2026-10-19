extends SceneTree

const Config = preload("res://config/runtime_config.gd")
var failures: Array[String] = []

class FakeLogoutAuth:
	extends Node
	signal logout_succeeded
	signal logout_failed(error_code: String)
	var in_flight := false
	var logout_calls := 0

	func logout_in_flight() -> bool:
		return in_flight

	func logout() -> bool:
		logout_calls += 1
		return false

class FakeApi:
	extends Node
	var calls := 0
	var cancelled := 0

	func cancel() -> void:
		cancelled += 1
	var server := ""
	var build := ""

	func issue_zone_ticket(server_base_url: String, client_build: String, _allow_local: bool = false) -> bool:
		calls += 1
		server = server_base_url
		build = client_build
		return true

class FakeZone:
	extends Node
	var connect_calls := 0
	var close_calls := 0
	var ticket_length := 0
	var last_server := ""
	var allow_connect := true
	var active_state := "closed"

	func state_name() -> String:
		return active_state

	func connect_zone(base_url: String, ticket: String) -> bool:
		connect_calls += 1
		last_server = base_url
		ticket_length = ticket.length()
		return allow_connect

	func close_zone() -> void:
		close_calls += 1

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
	var real_zone: Node = enabled_scene._zone_socket
	real_zone.queue_free()
	var fake_zone := FakeZone.new()
	enabled_scene.add_child(fake_zone)
	enabled_scene._zone_socket = fake_zone
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
	require(fake_zone.connect_calls == 1, "confirmed ticket did not open a zone socket")
	require(fake_zone.ticket_length == 48, "zone socket received an incorrect ticket length")
	require(fake_zone.last_server == Config.PRODUCT_SERVER, "zone socket used the wrong origin")
	require(enabled_scene.get_node("%ConnectionStatus").text == "Zonenverbindung wird aufgebaut", "ticket prematurely reported a connected zone")
	require(enabled_scene.get_node("%Login").text == "Verbinden", "handshake action state missing")
	var nodes: Array = []
	for id in preload("res://net/zone_codec.gd").NODE_IDS:
		nodes.append({"nodeId":id, "remaining":5, "depleted":false, "respawnAtTick":null})
	var confirmed_welcome := {
		"type":"welcome", "protocolVersion":5, "zoneId":"observatory_threshold",
		"connectionId":"zone_peer_startupintegration123", "selfEntityId":"player:1",
		"snapshotSeq":1, "tick":1,
		"presences":[{"entityId":"player:1", "userId":1, "position":{"x":1000,"z":0},"lastAcceptedClientSeq":0}],
		"mobs":[], "combatants":[],
		"resources":{"contractVersion":1,"contentSourceRevision":"286c575d3d0050ffa77b794d5b7a7e24858acee8","revision":1,"nodes":nodes}
	}
	fake_zone.active_state = "connected"
	enabled_scene._on_zone_connected()
	require(enabled_scene.get_node("%ConnectionStatus").text != "Sicher mit Aurion verbunden", "connected UI accepted without verified world projection")
	enabled_scene._on_zone_welcome(confirmed_welcome)
	require(enabled_scene._confirmed_zone.has_state(), "native scene failed to project confirmed welcome")
	enabled_scene._on_zone_connected()
	require(enabled_scene.get_node("%ConnectionStatus").text == "Sicher mit Aurion verbunden", "validated welcome did not mark zone connected")
	require(enabled_scene.get_node("%Login").text == "Verbunden", "validated welcome action state missing")
	enabled_scene._on_zone_rejected("COMBAT_SKILL_COOLDOWN")
	require(enabled_scene.get_node("%ConnectionStatus").text == "Sicher mit Aurion verbunden", "recoverable command rejection changed connected UI")
	require(enabled_scene.get_node("%Login").text == "Verbunden", "recoverable command rejection changed action state")
	var fake_logout := FakeLogoutAuth.new()
	fake_logout.in_flight = true
	enabled_scene.add_child(fake_logout)
	fake_zone.active_state = "authenticating"
	enabled_scene._on_zone_rejected("PROTOCOL_VERSION_UNSUPPORTED")
	require(enabled_scene.get_node("%ConnectionStatus").text == "Zonenverbindung abgelehnt", "server rejection not displayed")
	enabled_scene._on_zone_closed("server_reject")
	require(enabled_scene.get_node("%ConnectionStatus").text == "Zonenverbindung abgelehnt", "server reject overwritten by socket close")
	enabled_scene._auth_start = fake_logout
	enabled_scene._on_zone_ticket_failed("AURION_API_AUTH_REQUIRED")
	require(enabled_scene.get_node("%ConnectionStatus").text == "Verbindung derzeit nicht verfügbar", "ticket failure state missing")
	require(enabled_scene.get_node("%Login").disabled, "in-flight logout restored login early")
	require(fake_logout.logout_calls == 0, "in-flight logout was started twice")
	enabled_scene._on_auth_logout_terminal()
	require(fake_zone.close_calls >= 2, "logout did not terminate zone socket")
	require(fake_api.cancelled > 0, "logout did not clear pending ticket API")
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
