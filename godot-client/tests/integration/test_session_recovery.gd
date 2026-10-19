extends SceneTree
## G12 isolated Android lifecycle contract on the actual pinned Godot runtime.
## A fixture tests UI/controller boundaries; it is not a Tab A9 device receipt.
const Codec = preload("res://net/zone_codec.gd")

class FreshTicketApi:
	extends Node
	var issues := 0
	var cancelled := 0
	func cancel() -> void:
		cancelled += 1
	func issue_zone_ticket(_server: String, _build: String, _allow_local: bool = false) -> bool:
		issues += 1
		return true

class ProtectedAuth:
	extends Node
	var allowed := true
	var cancel_calls := 0
	var logout_calls := 0
	func protected_response_allowed() -> bool:
		return allowed
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
	func state_name() -> String:
		return "connected" if connected else "closed"
	func close_zone() -> void:
		closes += 1
		connected = false
	func connect_zone(_base: String, _ticket: String) -> bool:
		opens += 1
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

	# Android switches to system browser during PKCE. Pause must preserve that
	# pending transaction; only the original verified callback can complete it.
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
	socket.connected = true
	require(Codec.is_valid_welcome(valid_welcome()), "G12 welcome fixture invalid")
	scene._on_zone_welcome(valid_welcome())
	scene._on_zone_connected()
	require(scene._confirmed_zone.has_state(), "verified initial zone missing")
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
	require(auth.logout_calls == 0, "recoverable pause incorrectly revoked authenticated session")

	scene._on_app_suspended()
	auth.allowed = false
	scene._on_app_resumed()
	scene._poll_reconnect(Time.get_ticks_msec())
	require(api.issues == 1, "expired auth attempted protected ticket")
	require(not scene._confirmed_zone.has_state(), "expired auth retained world")
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
