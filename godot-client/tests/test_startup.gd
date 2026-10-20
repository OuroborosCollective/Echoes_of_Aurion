extends SceneTree

const Config = preload("res://config/runtime_config.gd")
const ZoneCodec = preload("res://net/zone_codec.gd")
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
	var nodes: Array = []
	for id in ZoneCodec.NODE_IDS:
		nodes.append({"nodeId":id, "remaining":5, "depleted":false, "respawnAtTick":null})
	var confirmed_welcome := {
		"type":"welcome", "protocolVersion":5, "zoneId":"observatory_threshold",
		"connectionId":"zone_peer_startupintegration123", "selfEntityId":"player:1",
		"snapshotSeq":1, "tick":1,
		"presences":[
			{"entityId":"player:1", "userId":1, "position":{"x":1000,"z":0},"lastAcceptedClientSeq":0},
			{"entityId":"player:2", "userId":2, "position":{"x":2000,"z":1000},"lastAcceptedClientSeq":0}
		],
		"mobs":[{
			"entityId":"mob_1", "archetype":"clockwork_stalker", "level":1, "state":"idle",
			"position":{"x":2000,"z":1000}, "targetEntityId":null,
			"isBoss":false, "isElite":false, "health":10, "maxHealth":10
		}], "combatants":[],
		"resources":{"contractVersion":1,"contentSourceRevision":"286c575d3d0050ffa77b794d5b7a7e24858acee8","revision":1,"nodes":nodes}
	}
	enabled_scene._on_zone_welcome(confirmed_welcome)
	var entity_summary := enabled_scene.get_node_or_null("%EntitySummary") as Label
	require(entity_summary != null, "confirmed entities have no active scene presentation")
	if entity_summary != null:
		require(entity_summary.visible, "confirmed entity summary stayed hidden")
		require(entity_summary.text == "In der Nähe · 1 Reisender · 1 Kreatur", "welcome entity summary did not reflect the confirmed registry")
	var position_label := enabled_scene.get_node_or_null("%ConfirmedPosition") as Label
	require(position_label != null, "confirmed self position has no active scene presentation")
	if position_label != null:
		enabled_scene._update_position_presentation(Time.get_ticks_msec() + 100)
		require(position_label.visible, "confirmed self position presentation stayed hidden")
		require(position_label.text == "Position · X 1.00 m · Z 0.00 m", "welcome position presentation did not preserve confirmed millimetres")
		require(enabled_scene.has_method("_update_world_freshness"), "active scene cannot expose stale confirmed state")
		if enabled_scene.has_method("_update_world_freshness"):
			enabled_scene._update_world_freshness(Time.get_ticks_msec() + 5000)
			require(position_label.text == "Position · X 1.00 m · Z 0.00 m · Stand veraltet", "stale presentation did not freeze and mark the last confirmed position")
			if entity_summary != null:
				require(entity_summary.text == "In der Nähe · 1 Reisender · 1 Kreatur · Stand veraltet", "stale presentation did not preserve and mark confirmed entities")
		var moved_snapshot: Dictionary = confirmed_welcome.duplicate(true)
		moved_snapshot.erase("protocolVersion")
		moved_snapshot.erase("connectionId")
		moved_snapshot.erase("selfEntityId")
		moved_snapshot["type"] = "snapshot"
		moved_snapshot["snapshotSeq"] = 2
		moved_snapshot["tick"] = 2
		moved_snapshot["resources"]["revision"] = 2
		moved_snapshot["presences"][0]["position"] = {"x":3000,"z":-2000}
		require(ZoneCodec.is_valid_snapshot(moved_snapshot), "position presentation fixture violates Aurion v5")
		enabled_scene._on_zone_snapshot(moved_snapshot)
		enabled_scene._update_position_presentation(Time.get_ticks_msec() + 100)
		require(position_label.text == "Position · X 3.00 m · Z -2.00 m", "new confirmed snapshot did not reach active position presentation")
		var stale_snapshot: Dictionary = moved_snapshot.duplicate(true)
		stale_snapshot["snapshotSeq"] = 1
		stale_snapshot["presences"][0]["position"] = {"x":9000,"z":9000}
		enabled_scene._on_zone_snapshot(stale_snapshot)
		enabled_scene._update_position_presentation(Time.get_ticks_msec() + 100)
		require(position_label.text == "Position · X 3.00 m · Z -2.00 m", "stale snapshot rewound active position presentation")
		var large_snapshot: Dictionary = moved_snapshot.duplicate(true)
		large_snapshot["snapshotSeq"] = 3
		large_snapshot["tick"] = 3
		large_snapshot["resources"]["revision"] = 3
		large_snapshot["presences"][0]["position"] = {"x":60000000123,"z":-60000000123}
		require(ZoneCodec.is_valid_snapshot(large_snapshot), "large position presentation fixture violates Aurion v5")
		enabled_scene._on_zone_snapshot(large_snapshot)
		enabled_scene._update_position_presentation(Time.get_ticks_msec() + 100)
		require(position_label.text == "Position · X 60000000.12 m · Z -60000000.12 m", "large confirmed world position lost integer precision in presentation")
		var cleared_entities: Dictionary = large_snapshot.duplicate(true)
		cleared_entities["snapshotSeq"] = 4
		cleared_entities["tick"] = 4
		cleared_entities["resources"]["revision"] = 4
		cleared_entities["presences"] = [cleared_entities["presences"][0]]
		cleared_entities["mobs"] = []
		require(ZoneCodec.is_valid_snapshot(cleared_entities), "entity despawn fixture violates Aurion v5")
		enabled_scene._on_zone_snapshot(cleared_entities)
		if entity_summary != null:
			require(entity_summary.text == "In der Nähe · 0 Reisende · 0 Kreaturen", "entity despawn did not update active presentation")
		var stale_entities: Dictionary = large_snapshot.duplicate(true)
		stale_entities["snapshotSeq"] = 3
		enabled_scene._on_zone_snapshot(stale_entities)
		if entity_summary != null:
			require(entity_summary.text == "In der Nähe · 0 Reisende · 0 Kreaturen", "stale snapshot rewound active entity presentation")
	var real_zone: Node = enabled_scene._zone_socket
	var telegraph := {
		"type":"telegraph", "contractVersion":"aurion-zone-telegraph.v1",
		"id":"telegraph:mob_1:1", "sequence":1, "startTick":2, "impactTick":3,
		"attackerEntityId":"mob_1", "targetEntityId":"player:1", "kind":"line",
		"origin":{"x":0,"z":0}, "target":{"x":1000,"z":0}, "widthFixed":500,
		"color":"#ef4444", "visualSourceRevision":ZoneCodec.FIXED_CONTENT,
		"authorityRuleset":"aurion-ax1-mob-windup.v1"
	}
	require(ZoneCodec.is_valid_telegraph_event(telegraph), "telegraph notice fixture violates Aurion v5")
	real_zone.emit_signal("zone_telegraph", telegraph)
	require(enabled_scene.get_node("%CombatNotice").text == "Angriff angekündigt", "confirmed self telegraph was discarded before presentation")
	enabled_scene.get_node("%CombatNotice").text = "sequenced"
	real_zone.emit_signal("zone_telegraph", telegraph)
	require(enabled_scene.get_node("%CombatNotice").text == "sequenced", "duplicate telegraph replayed presentation")
	var foreign_telegraph: Dictionary = telegraph.duplicate(true)
	foreign_telegraph["id"] = "telegraph:mob_1:2"
	foreign_telegraph["sequence"] = 2
	foreign_telegraph["targetEntityId"] = "player:2"
	real_zone.emit_signal("zone_telegraph", foreign_telegraph)
	require(enabled_scene.get_node("%CombatNotice").text == "sequenced", "foreign telegraph leaked into self presentation")
	var combat := {
		"type":"combat", "contractVersion":"wasd-zone-combat.v2", "action":"melee",
		"tick":5, "sequence":9, "attackerEntityId":"mob_1", "defenderEntityId":"player:1",
		"skillId":null, "skillSourceRevision":null, "hit":true, "crit":false, "killed":false,
		"damage":4, "defenderHealth":16, "attackerStamina":10,
		"gameplaySourceRevision":"a".repeat(40)
	}
	require(ZoneCodec.is_valid_combat_event(combat), "combat notice event fixture violates Aurion v5")
	real_zone.emit_signal("zone_combat", combat)
	require(enabled_scene.get_node("%CombatNotice").text == "Treffer erhalten · 4 Schaden", "confirmed self combat result was not displayed")
	enabled_scene.get_node("%CombatNotice").text = "sequenced"
	real_zone.emit_signal("zone_combat", combat)
	require(enabled_scene.get_node("%CombatNotice").text == "sequenced", "duplicate combat result replayed presentation")
	var next_tick_combat: Dictionary = combat.duplicate(true)
	next_tick_combat["tick"] = 6
	next_tick_combat["sequence"] = 1
	next_tick_combat["damage"] = 3
	real_zone.emit_signal("zone_combat", next_tick_combat)
	require(enabled_scene.get_node("%CombatNotice").text == "Treffer erhalten · 3 Schaden", "valid lower sequence from a later tick was discarded")
	var critical_combat: Dictionary = combat.duplicate(true)
	critical_combat["tick"] = 7
	critical_combat["sequence"] = 2
	critical_combat["attackerEntityId"] = "player:1"
	critical_combat["defenderEntityId"] = "mob_1"
	critical_combat["damage"] = 9
	critical_combat["crit"] = true
	require(ZoneCodec.is_valid_combat_event(critical_combat), "critical combat notice fixture violates Aurion v5")
	real_zone.emit_signal("zone_combat", critical_combat)
	require(enabled_scene.get_node("%CombatNotice").text == "Kritischer Treffer bestätigt · 9 Schaden", "confirmed critical result was reduced to generic damage")
	var lethal_combat: Dictionary = combat.duplicate(true)
	lethal_combat["tick"] = 8
	lethal_combat["sequence"] = 3
	lethal_combat["attackerEntityId"] = "player:1"
	lethal_combat["defenderEntityId"] = "mob_1"
	lethal_combat["damage"] = 12
	lethal_combat["defenderHealth"] = 0
	lethal_combat["killed"] = true
	require(ZoneCodec.is_valid_combat_event(lethal_combat), "lethal combat notice fixture violates Aurion v5")
	real_zone.emit_signal("zone_combat", lethal_combat)
	require(enabled_scene.get_node("%CombatNotice").text == "Gegner besiegt · 12 Schaden", "confirmed lethal result was reduced to generic damage")
	await create_timer(2.1).timeout
	require(enabled_scene.get_node("%CombatNotice").text.is_empty(), "expired combat presentation retained stale text")
	require(not enabled_scene.get_node("%CombatNotice").visible, "expired combat presentation retained layout space")
	enabled_scene._reset_projection()
	require(enabled_scene.get_node("%CombatNotice").text.is_empty(), "combat presentation survived projection reset")
	require(not enabled_scene.get_node("%CombatNotice").visible, "combat presentation retained layout space after reset")
	if entity_summary != null:
		require(entity_summary.text.is_empty(), "confirmed entity summary survived projection reset")
		require(not entity_summary.visible, "confirmed entity summary retained layout space after reset")
	if position_label != null:
		require(position_label.text.is_empty(), "confirmed position text survived projection reset")
		require(not position_label.visible, "confirmed position retained layout space after projection reset")
	var live_api: Node = enabled_scene._api
	live_api.cancel()
	live_api.queue_free()
	var fake_api := FakeApi.new()
	enabled_scene.add_child(fake_api)
	enabled_scene._api = fake_api
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
	fake_zone.active_state = "connected"
	enabled_scene._on_zone_connected()
	require(enabled_scene.get_node("%ConnectionStatus").text != "Sicher mit Aurion verbunden", "connected UI accepted without verified world projection")
	# A failed handshake ends the ticket generation; an independent verified
	# auth success must begin a new ticket generation before the next welcome.
	enabled_scene._on_auth_session_succeeded()
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
	enabled_scene._on_auth_session_succeeded()
	enabled_scene._on_zone_ticket_failed("AURION_API_AUTH_REQUIRED")
	require(enabled_scene.get_node("%ConnectionStatus").text == "Verbindung derzeit nicht verfügbar", "ticket failure state missing")
	require(enabled_scene.get_node("%Login").disabled, "in-flight logout restored login early")
	require(fake_logout.logout_calls == 0, "in-flight logout was started twice")
	enabled_scene._on_auth_logout_terminal()
	require(fake_zone.close_calls >= 2, "logout did not terminate zone socket")
	require(fake_api.cancelled > 0, "logout did not clear pending ticket API")
	require(not enabled_scene.get_node("%Login").disabled, "terminal logout did not restore login")
	require(enabled_scene.get_node("%Login").text == "Anmelden", "terminal logout action state missing")
	# A connected callback without a projected server welcome must terminate
	# the pending login UI, not leave an unusable "connecting" screen.
	enabled_scene._reset_projection()
	enabled_scene._on_auth_session_succeeded()
	enabled_scene.get_node("%ConnectionStatus").text = "Zonenverbindung wird aufgebaut"
	fake_zone.active_state = "connected"
	enabled_scene._on_zone_connected()
	require(enabled_scene.get_node("%ConnectionStatus").text == "Verbindung derzeit nicht verfügbar", "missing world projection left the UI stuck connecting")
	require(enabled_scene.get_node("%Login").disabled, "missing world projection enabled a new login before session termination")
	require(not enabled_scene._confirmed_zone.has_state() and enabled_scene._entities.ids("presences").is_empty(), "failed projection retained a world after close")
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
