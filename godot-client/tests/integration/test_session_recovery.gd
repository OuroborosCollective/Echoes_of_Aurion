extends SceneTree
## G12 isolated Android lifecycle contract on the actual pinned Godot runtime.
## A fixture tests UI/controller boundaries; it is not a Tab A9 device receipt.
const Codec = preload("res://net/zone_codec.gd")

class FreshTicketApi:
	extends Node
	var issues := 0
	var cancelled := 0
	var start_succeeds := true
	func cancel() -> void:
		cancelled += 1
	func issue_zone_ticket(_server: String, _build: String, _allow_local: bool = false) -> bool:
		issues += 1
		return start_succeeds

class ProtectedAuth:
	extends Node
	var allowed := true
	var cancel_calls := 0
	var logout_calls := 0
	var request_active := false
	func protected_response_allowed() -> bool:
		return allowed
	func request_in_flight() -> bool:
		return request_active
	func cancel() -> void:
		cancel_calls += 1
	func logout_in_flight() -> bool:
		return false
	func logout() -> bool:
		logout_calls += 1
		return false

class ZoneTransport:
	extends Node
	var connected := false
	var closes := 0
	var opens := 0
	var reported_state := ""
	var generation := 0
	var open_succeeds := true
	func state_name() -> String:
		return reported_state if not reported_state.is_empty() else ("connected" if connected else "closed")
	func connection_generation() -> int:
		return generation
	func close_zone() -> void:
		closes += 1
		connected = false
		reported_state = ""
	func connect_zone(_base: String, _ticket: String) -> bool:
		opens += 1
		if not open_succeeds:
			return false
		generation += 1
		connected = true
		return true

var errors: Array[String] = []
func require(ok: bool, description: String) -> void:
	if not ok:
		errors.append(description)

func valid_welcome(seq: int = 0) -> Dictionary:
	var nodes: Array = []
	for id in Codec.NODE_IDS:
		nodes.append({"nodeId":id,"remaining":5,"depleted":false,"respawnAtTick":null})
	return {
		"type":"welcome", "protocolVersion":5, "zoneId":"observatory_threshold",
		"connectionId":"zone_peer_g12recovery123456", "selfEntityId":"player:1",
		"snapshotSeq":seq, "tick":seq,
		"presences":[{"entityId":"player:1","userId":1,"position":{"x":1000,"z":0},"lastAcceptedClientSeq":0}],
		"mobs":[], "combatants":[],
		"resources":{"contractVersion":1,"contentSourceRevision":Codec.FIXED_CONTENT,"revision":1,"nodes":nodes},
	}

func _init() -> void:
	call_deferred("verify")

func verify() -> void:
	var life_path := "res://app/session_lifecycle.gd"
	var retry_path := "res://net/reconnect_policy.gd"
	require(ResourceLoader.exists(life_path), "G12 session lifecycle implementation missing")
	require(ResourceLoader.exists(retry_path), "G12 bounded reconnect implementation missing")
	if not errors.is_empty():
		finish()
		return
	var life = load(life_path).new()
	require(not life.is_suspended(), "new client starts suspended")
	require(life.suspend(false), "first suspension rejected")
	require(not life.suspend(true), "duplicate suspension changed state")
	require(not life.resume(), "browser-only resume attempted to restore a zone")
	require(not life.resume(), "duplicate resume created a second connection")
	require(life.suspend(true), "connected session could not be suspended")
	require(life.resume(), "connected session did not require fresh ticket")
	require(not life.resume(), "replayed resume issued duplicate ticket")
	life.reset()
	require(not life.is_suspended(), "reset retained suspended state")
	var retry = load(retry_path).new()
	require(retry.begin(1000), "bounded retry cannot start")
	require(not retry.begin(1000), "duplicate retry starter accepted")
	require(retry.take_if_due(1000), "initial recovery ticket not due immediately")
	require(not retry.take_if_due(1000), "duplicate same-tick ticket issued")
	require(retry.retry_after_failure(1000), "first transient failure did not schedule retry")
	require(not retry.take_if_due(1499), "retry ignored minimum backoff")
	require(retry.take_if_due(1500), "first backoff deadline missed")
	require(retry.retry_after_failure(1500), "second transient failure not scheduled")
	require(not retry.take_if_due(2999), "second retry happened before backoff")
	require(retry.take_if_due(3000), "second backoff not honoured")
	require(not retry.retry_after_failure(3000), "unbounded fourth reconnect allowed")
	require(not retry.active(), "exhausted policy still active")

	var packed := load("res://app/main.tscn") as PackedScene
	require(packed != null, "G12 native scene not loadable")
	if packed == null:
		finish()
		return
	var scene = packed.instantiate()
	root.add_child(scene)
	await process_frame
	var live_api: Node = scene._api
	live_api.cancel()
	live_api.queue_free()
	var api := FreshTicketApi.new()
	scene.add_child(api)
	scene._api = api
	var native_socket: Node = scene._zone_socket
	native_socket.close_zone()
	native_socket.queue_free()
	var socket := ZoneTransport.new()
	scene.add_child(socket)
	scene._zone_socket = socket
	var native_auth: Node = scene._auth_start
	native_auth.cancel()
	native_auth.queue_free()
	var auth := ProtectedAuth.new()
	scene.add_child(auth)
	scene._auth_start = auth

	# A logged-out app has no zone to restore. Resume must make the real login
	# action usable again without starting a ticket or socket.
	auth.allowed = false
	scene._config.native_auth_start_enabled = true
	scene._on_auth_logout_terminal()
	require(not scene.get_node("%Login").disabled, "logged-out scene did not start with login enabled")
	scene._on_app_suspended()
	require(scene._lifecycle.is_suspended(), "logged-out OS pause not registered")
	require(scene.get_node("%Login").disabled, "logged-out app remained interactive while paused")
	scene._on_app_resumed()
	require(scene.get_node("%ConnectionStatus").text == "Nicht verbunden", "logged-out resume retained paused status")
	require(not scene.get_node("%Login").disabled, "logged-out resume left login disabled")
	require(api.issues == 0 and socket.opens == 0, "logged-out resume started a protected connection")

	# Resume must not bypass startup configuration validation.
	var valid_server: String = scene._config.server_base_url
	scene._config.server_base_url = ""
	scene._on_app_suspended()
	scene._on_app_resumed()
	require(scene.get_node("%ConnectionStatus").text == "Konfiguration ungültig", "invalid configuration was hidden by resume")
	require(scene.get_node("%Login").disabled, "invalid configuration enabled login after resume")
	scene._config.server_base_url = valid_server
	scene._on_auth_logout_terminal()

	# Native login may still be in flight while Android pauses. It remains the
	# sole active attempt and resume must not expose a second login action.
	auth.request_active = true
	scene._on_app_suspended()
	scene._on_app_resumed()
	require(scene.get_node("%Login").disabled, "resume enabled login during an active native-auth request")
	require(api.issues == 0 and socket.opens == 0, "native-auth resume started a protected connection")
	auth.request_active = false
	scene._on_auth_logout_terminal()

	# A pre-welcome socket has consumed its ticket but still owns authenticated
	# recovery. Pause/resume must request one replacement ticket, not show login.
	auth.allowed = true
	socket.reported_state = "connecting"
	scene._on_app_suspended()
	scene._on_app_resumed()
	scene._poll_reconnect(Time.get_ticks_msec())
	require(api.issues == 1, "pre-welcome resume did not request a replacement ticket")
	require(scene.get_node("%Login").disabled, "pre-welcome resume exposed a second login")
	scene._api.cancel()
	scene._ticket_pending = false
	scene._ticket_abandoned = true
	scene._recovering_ticket = false
	scene._reconnect.reset()
	api.issues = 0

	# Android switches to system browser during PKCE. Pause must preserve that
	# pending transaction; only the original verified callback can complete it.
	auth.allowed = false
	scene._awaiting_callback = true
	scene.get_node("%ConnectionStatus").text = "Systembrowser geöffnet"
	scene._on_app_suspended()
	require(scene._lifecycle.is_suspended(), "OS pause not registered")
	require(scene._awaiting_callback, "Android browser handoff cancelled on app pause")
	require(auth.cancel_calls == 0, "backgrounding erased pending PKCE transaction")
	scene._on_app_resumed()
	scene._poll_reconnect(Time.get_ticks_msec())
	require(api.issues == 0, "resume without an authenticated zone issued a ticket")
	require(scene._awaiting_callback, "browser callback lost on resume")

	scene._awaiting_callback = false
	# A native exchange may complete while Android is still paused. No protected
	# ticket may start in the background; resume must request exactly one fresh
	# ticket through the bounded recovery path.
	var suspended_auth_issues_before: int = api.issues
	scene._on_app_suspended()
	scene._on_auth_session_succeeded()
	require(api.issues == suspended_auth_issues_before, "suspended auth completion started a background ticket")
	scene._on_app_resumed()
	scene._process(0.0)
	require(api.issues == suspended_auth_issues_before + 1, "suspended auth completion did not request one ticket after resume")
	scene._on_auth_logout_terminal()
	api.issues = 0

	auth.allowed = true
	# The first protected ticket request can refuse to start without emitting a
	# failure signal. It must leave no phantom pending request and enter the same
	# bounded recovery used by later pre-response transport failures.
	var initial_start_logouts_before: int = auth.logout_calls
	api.start_succeeds = false
	scene._on_auth_session_succeeded()
	require(not scene._ticket_pending, "initial ticket-start refusal left a phantom request pending")
	require(scene._reconnect.active(), "initial ticket-start refusal did not arm bounded recovery")
	require(auth.logout_calls == initial_start_logouts_before, "initial ticket-start refusal revoked healthy auth")
	api.start_succeeds = true
	scene._poll_reconnect(Time.get_ticks_msec())
	require(api.issues == 2, "initial ticket-start refusal did not request a fresh ticket")
	scene._reconnect.reset()
	scene._recovering_ticket = false
	scene._ticket_abandoned = false
	api.issues = 0

	# Initial transport setup uses the same authenticated recovery budget as a
	# later drop: a missing welcome must refresh the ticket before logout.
	var initial_logouts_before: int = auth.logout_calls
	scene._on_auth_session_succeeded()
	require(api.issues == 1, "initial session did not request a zone ticket")
	scene._on_zone_ticket_succeeded({
		"ticket": "i".repeat(48),
		"zoneId": "observatory_threshold",
		"expiresAt": "2026-10-19T06:00:00.000Z",
	})
	require(socket.opens == 1, "initial ticket did not open the zone socket")
	socket.connected = false
	scene._on_zone_closed("hello_timeout")
	require(scene._reconnect.active(), "initial hello timeout did not arm bounded recovery")
	require(auth.logout_calls == initial_logouts_before, "initial hello timeout revoked healthy auth")
	scene._poll_reconnect(Time.get_ticks_msec())
	require(api.issues == 2, "initial hello timeout did not request a fresh ticket")
	# Keep the remaining independent lifecycle scenarios on their zero baseline.
	scene._reconnect.reset()
	scene._recovering_ticket = false
	scene._ticket_pending = false
	scene._ticket_abandoned = false
	api.issues = 0
	socket.opens = 0
	auth.logout_calls = initial_logouts_before

	# A synchronous native WebSocket open failure is transport loss before any
	# server response. It must use the same bounded fresh-ticket recovery instead
	# of revoking an otherwise healthy authenticated session.
	var socket_open_logouts_before: int = auth.logout_calls
	var socket_open_issues_before: int = api.issues
	socket.open_succeeds = false
	scene._on_auth_session_succeeded()
	scene._on_zone_ticket_succeeded({
		"ticket": "p".repeat(48),
		"zoneId": "observatory_threshold",
		"expiresAt": "2026-10-19T06:00:00.000Z",
	})
	require(scene._reconnect.active(), "socket open failure did not arm bounded recovery")
	require(auth.logout_calls == socket_open_logouts_before, "socket open failure revoked healthy auth")
	scene._poll_reconnect(Time.get_ticks_msec())
	require(api.issues == socket_open_issues_before + 2, "socket open failure did not request a fresh ticket")
	scene._api.cancel()
	scene._ticket_pending = false
	scene._ticket_abandoned = true
	scene._recovering_ticket = false
	scene._reconnect.reset()
	api.issues = 0
	socket.opens = 0
	socket.open_succeeds = true

	socket.connected = true
	require(Codec.is_valid_welcome(valid_welcome()), "G12 welcome fixture invalid")
	scene._on_zone_welcome(valid_welcome())
	scene._on_zone_connected()
	require(scene._confirmed_zone.has_state(), "verified initial zone missing")
	var suspended_generation: int = socket.connection_generation()
	scene._on_app_suspended()
	require(not scene._confirmed_zone.has_state(), "suspend retained stale world authority")
	require(scene._entities.ids("presences").is_empty(), "suspend retained stale entity readmodels")
	require(socket.closes > 0 and not socket.connected, "suspend did not neutralize active socket")
	scene._on_zone_welcome(valid_welcome(1))
	require(not scene._confirmed_zone.has_state(), "late suspended welcome revived world")
	scene._on_app_resumed()
	var current_time := Time.get_ticks_msec()
	scene._poll_reconnect(current_time)
	require(api.issues == 1, "resume did not request exactly one fresh Aurion ticket")
	scene._on_app_resumed()
	scene._poll_reconnect(current_time)
	require(api.issues == 1, "duplicate resumed event requested another ticket")
	scene._on_zone_ticket_succeeded({
		"ticket":"z".repeat(48),
		"zoneId":"observatory_threshold",
		"expiresAt":"2026-10-19T06:00:00.000Z",
	})
	require(socket.opens == 1, "resume did not establish new socket with fresh ticket")
	require(not scene._confirmed_zone.has_state(), "ticket incorrectly claimed server-confirmed world")
	scene._on_zone_welcome(valid_welcome(0))
	scene._on_zone_connected()
	require(scene._confirmed_zone.has_state(), "fresh server welcome did not restore world")
	require(not scene._reconnect.active(), "successful welcome left retry loop enabled")
	# A second pause may discard another socket before the first generation's
	# terminal callback arrives. Both must remain isolated from the successor.
	var second_suspended_generation: int = socket.connection_generation()
	scene._on_app_suspended()
	scene._on_app_resumed()
	scene._poll_reconnect(Time.get_ticks_msec())
	require(api.issues == 2, "second resume did not request one fresh ticket")
	scene._on_zone_ticket_succeeded({
		"ticket":"y".repeat(48),
		"zoneId":"observatory_threshold",
		"expiresAt":"2026-10-19T06:00:00.000Z",
	})
	scene._on_zone_welcome(valid_welcome(1))
	scene._on_zone_connected()
	require(scene._confirmed_zone.has_state(), "second successor welcome did not restore world")
	var suspended_logouts_before: int = auth.logout_calls
	scene._on_zone_closed("closed", suspended_generation)
	scene._on_zone_closed("closed", second_suspended_generation)
	require(scene._confirmed_zone.has_state(), "discarded closes erased successor projection")
	require(not scene._reconnect.active(), "discarded closes consumed successor retry state")
	require(auth.logout_calls == suspended_logouts_before, "discarded closes revoked healthy auth")
	require(auth.logout_calls == 0, "recoverable pauses incorrectly revoked authenticated session")
	# Keep later independent scenarios on their established counter baseline.
	api.issues = 1
	socket.opens = 1

	# Re-establish a confirmed session for an unexpected network-drop test.
	socket.connected = true
	scene._on_zone_welcome(valid_welcome(2))
	scene._on_zone_connected()
	require(scene._confirmed_zone.has_state(), "network-drop setup did not establish a confirmed session")
	scene._on_zone_closed("closed")
	require(not scene._confirmed_zone.has_state(), "network drop left stale world projection")
	scene._poll_reconnect(Time.get_ticks_msec())
	require(api.issues == 2, "network drop did not request one fresh ticket")
	scene._poll_reconnect(Time.get_ticks_msec())
	require(api.issues == 2, "duplicate network poll produced second ticket")
	scene._on_zone_ticket_failed("AURION_API_REQUEST_FAILED")
	require(scene._reconnect.active(), "transient network failure did not preserve bounded retry")
	scene._poll_reconnect(Time.get_ticks_msec() + 10000)
	require(api.issues == 3, "bounded network retry did not request a fresh ticket")
	scene._on_zone_ticket_succeeded({
		"ticket":"z".repeat(48),
		"zoneId":"observatory_threshold",
		"expiresAt":"2026-10-19T06:00:00.000Z",
	})
	scene._on_zone_welcome(valid_welcome(3))
	scene._on_zone_connected()
	require(scene._confirmed_zone.has_state(), "network recovery lacked fresh validated welcome")
	require(not scene._reconnect.active(), "network recovery left retry policy armed")

	# The WebSocket can open and still fail while sending its authenticated hello.
	# That is transport loss before any server response, so it must consume the
	# same bounded fresh-ticket recovery budget instead of revoking native auth.
	var hello_send_logouts_before: int = auth.logout_calls
	var hello_send_issues_before: int = api.issues
	socket.connected = false
	scene._on_zone_closed("hello_send_failed")
	require(scene._reconnect.active(), "hello send failure did not arm bounded recovery")
	require(auth.logout_calls == hello_send_logouts_before, "hello send failure revoked healthy auth")
	scene._poll_reconnect(Time.get_ticks_msec())
	require(api.issues == hello_send_issues_before + 1, "hello send failure did not request a fresh ticket")
	scene._api.cancel()
	scene._ticket_pending = false
	scene._ticket_abandoned = true
	scene._recovering_ticket = false
	scene._reconnect.reset()
	api.issues = hello_send_issues_before

	scene._on_app_suspended()
	auth.allowed = false
	scene._on_app_resumed()
	scene._poll_reconnect(Time.get_ticks_msec())
	require(api.issues == 3, "expired auth attempted protected ticket")
	require(not scene._confirmed_zone.has_state(), "expired auth retained world")

	# G12: foregrounding during a pending HTTPS ticket must require a fresh
	# request. A callback from the cancelled request cannot open the zone.
	auth.allowed = true
	scene._on_auth_session_succeeded()
	require(api.issues == 4, "new session did not start pending ticket")
	var opens_before: int = socket.opens
	scene._on_app_suspended()
	require(api.cancelled > 0, "pause did not cancel pending protected request")
	scene._on_app_resumed()
	scene._on_zone_ticket_succeeded({
		"ticket":"o".repeat(48),
		"zoneId":"observatory_threshold",
		"expiresAt":"2026-10-19T06:00:00.000Z",
	})
	require(socket.opens == opens_before, "stale cancelled ticket opened a zone after resume")
	scene._poll_reconnect(Time.get_ticks_msec())
	require(api.issues == 5, "resume of pending ticket failed to issue a fresh ticket")
	scene._poll_reconnect(Time.get_ticks_msec())
	require(api.issues == 5, "pending-ticket recovery duplicated the ticket request")

	# G12 regression: a fresh-ticket reconnect can still fail at WebSocket
	# hello. Its transport failure must spend the next bounded retry, not
	# revoke the otherwise valid native session on the first timeout.
	var fresh_ticket := {
		"ticket": "n".repeat(48),
		"zoneId": "observatory_threshold",
		"expiresAt": "2026-10-19T06:00:00.000Z",
	}
	var logouts_before: int = auth.logout_calls
	scene._on_zone_ticket_succeeded(fresh_ticket)
	require(scene._reconnect.active(), "reconnect reservation cleared before welcome")
	socket.connected = false
	scene._on_zone_closed("hello_timeout")
	require(scene._reconnect.active(), "hello timeout discarded bounded reconnect")
	require(auth.logout_calls == logouts_before, "first hello timeout revoked healthy auth")
	var issues_before: int = api.issues
	scene._poll_reconnect(Time.get_ticks_msec() + 10000)
	require(api.issues == issues_before + 1, "hello timeout did not request a second fresh ticket")
	scene._on_zone_ticket_succeeded(fresh_ticket)
	socket.connected = false
	scene._on_zone_closed("closed")
	require(scene._reconnect.active(), "closed handshake discarded final bounded retry")
	require(auth.logout_calls == logouts_before, "second handshake failure revoked auth early")
	issues_before = api.issues
	scene._poll_reconnect(Time.get_ticks_msec() + 10000)
	require(api.issues == issues_before + 1, "closed handshake did not request third ticket")
	scene._on_zone_ticket_succeeded(fresh_ticket)
	socket.connected = false
	scene._on_zone_closed("hello_timeout")
	require(not scene._reconnect.active(), "exhausted handshake attempts remained active")
	require(auth.logout_calls == logouts_before + 1, "exhausted retry did not terminate native session")

	# A synchronous ticket-request start refusal can occur before any failure
	# signal. It must consume the same finite retry budget and terminate cleanly.
	var start_refusal_logouts_before: int = auth.logout_calls
	api.start_succeeds = false
	var start_refusal_now: int = Time.get_ticks_msec()
	require(scene._reconnect.begin(start_refusal_now), "ticket-start refusal setup could not reserve recovery")
	scene._poll_reconnect(start_refusal_now)
	scene._poll_reconnect(start_refusal_now + 500)
	scene._poll_reconnect(start_refusal_now + 2000)
	require(not scene._reconnect.active(), "exhausted ticket-start refusals retained reconnect budget")
	require(not scene._ticket_pending, "exhausted ticket-start refusals left a phantom request pending")
	require(auth.logout_calls == start_refusal_logouts_before + 1, "exhausted ticket-start refusals did not terminate native session")
	api.start_succeeds = true


	# A structurally invalid protected ticket response is not a transient network
	# failure. Retrying it would keep a suspect authenticated session alive and
	# issue another protected request without any transport interruption.
	var invalid_ticket_logouts_before: int = auth.logout_calls
	var invalid_ticket_now: int = Time.get_ticks_msec()
	require(scene._reconnect.begin(invalid_ticket_now), "invalid-ticket setup could not reserve recovery")
	require(scene._reconnect.take_if_due(invalid_ticket_now), "invalid-ticket setup did not start an attempt")
	scene._recovering_ticket = true
	scene._ticket_pending = true
	scene._ticket_abandoned = false
	scene._on_zone_ticket_failed("AURION_API_RESPONSE_INVALID")
	require(not scene._reconnect.active(), "invalid ticket response retained reconnect budget")
	require(auth.logout_calls == invalid_ticket_logouts_before + 1, "invalid ticket response did not terminate native session")


	# A server frame that fails the welcome contract is not a transient network
	# interruption. It must terminate immediately instead of spending retries.
	var invalid_logouts_before: int = auth.logout_calls
	var invalid_now: int = Time.get_ticks_msec()
	require(scene._reconnect.begin(invalid_now), "invalid-welcome setup could not reserve recovery")
	require(scene._reconnect.take_if_due(invalid_now), "invalid-welcome setup did not start an attempt")
	scene._on_zone_closed("invalid_welcome")
	require(not scene._reconnect.active(), "invalid welcome retained reconnect budget")
	require(auth.logout_calls == invalid_logouts_before + 1, "invalid welcome did not terminate native session")

	scene.queue_free()
	await process_frame
	finish()

func finish() -> void:
	if errors.is_empty():
		print("Godot G12 pause/resume, fresh-ticket recovery and bounded retry verified (headless)")
		quit(0)
	else:
		for error in errors:
			push_error(error)
		quit(1)
