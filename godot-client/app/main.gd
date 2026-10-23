extends Control

const RuntimeConfig = preload("res://config/runtime_config.gd")
const NativeAuthStart = preload("res://net/auth/native_auth_start.gd")
const AurionApi = preload("res://net/api/aurion_api.gd")
const ZoneSocket = preload("res://net/zone_socket.gd")
const SessionLifecycle = preload("res://app/session_lifecycle.gd")
const TechnicalDiagnostics = preload("res://app/technical_diagnostics.gd")
const ReconnectPolicy = preload("res://net/reconnect_policy.gd")
const ZoneState = preload("res://projection/zone_state.gd")
const EntityRegistry = preload("res://projection/entity_registry.gd")
const SnapshotInterpolator = preload("res://projection/snapshot_interpolator.gd")
const NativeIntentBridge = preload("res://platform/android/native_intent_bridge.gd")
const COMBAT_NOTICE_DURATION_MS := 2000
const WORLD_STALE_AFTER_MS := 1000
const STARS := [Vector2(0.08, 0.13), Vector2(0.19, 0.65), Vector2(0.33, 0.09), Vector2(0.53, 0.85), Vector2(0.67, 0.18), Vector2(0.79, 0.11), Vector2(0.88, 0.38), Vector2(0.94, 0.73), Vector2(0.72, 0.67)]

@onready var card: PanelContainer = %LaunchCard
@onready var title: Label = %Title
@onready var status: Label = %ConnectionStatus
@onready var combat_notice: Label = %CombatNotice
@onready var confirmed_position: Label = %ConfirmedPosition
@onready var confirmed_vitals: Label = %ConfirmedVitals
@onready var confirmed_health_meter: ProgressBar = %ConfirmedHealthMeter
@onready var confirmed_stamina_meter: ProgressBar = %ConfirmedStaminaMeter
@onready var entity_summary: Label = %EntitySummary
@onready var map_panel: VBoxContainer = %MapPanel
@onready var zone_map: Control = %ZoneMap
@onready var map_selection: Label = %MapSelection
@onready var destination: Label = %Destination
@onready var login: Button = %Login
@onready var development_notice: Label = $SafeMargin/Scroll/Center/LaunchCard/Content/DevelopmentNotice

var _diagnostics = TechnicalDiagnostics.new()
var _config: Dictionary
var _auth_start: Node
var _api: Node
var _zone_socket: Node
var _awaiting_callback := false
var _zone_reject_code := ""
var _seen_combat_events: Dictionary = {}
var _seen_combat_order: Array[String] = []
var _seen_telegraph_events: Dictionary = {}
var _seen_telegraph_order: Array[String] = []
var _combat_notice_expires_at_ms := -1
var _last_world_update_ms := -1
var _world_is_stale := false
var _confirmed_zone = ZoneState.new()
var _entities = EntityRegistry.new()
var _visuals = SnapshotInterpolator.new()
var _lifecycle = SessionLifecycle.new()
var _reconnect = ReconnectPolicy.new()
var _recovering_ticket := false
var _ticket_pending := false
var _ticket_abandoned := false
var _intent_bridge: Node
var _discarded_zone_generation_through := -1

func _configuration_valid() -> bool:
	return not _config.server_base_url.is_empty() and not _config.client_build.is_empty() and _config.renderer_profile == "compatibility"

func _ready() -> void:
	Engine.max_fps = 30
	_config = RuntimeConfig.current()
	%BuildIdentity.text = "Build · " + _config.client_build
	_auth_start = NativeAuthStart.new()
	add_child(_auth_start)
	_auth_start.browser_opening.connect(_on_auth_browser_opening)
	_auth_start.start_succeeded.connect(_on_auth_start_succeeded)
	_auth_start.start_failed.connect(_on_auth_start_failed)
	_auth_start.session_succeeded.connect(_on_auth_session_succeeded)
	_auth_start.session_failed.connect(_on_auth_session_failed)
	_auth_start.logout_succeeded.connect(_on_auth_logout_terminal)
	_auth_start.logout_failed.connect(_on_auth_logout_terminal)
	_api = AurionApi.new(_auth_start)
	add_child(_api)
	_api.zone_ticket_succeeded.connect(_on_zone_ticket_succeeded)
	_api.request_failed.connect(_on_zone_ticket_failed)
	_zone_socket = ZoneSocket.new()
	add_child(_zone_socket)
	_zone_socket.zone_welcome.connect(_on_zone_welcome)
	_zone_socket.zone_snapshot.connect(_on_zone_snapshot)
	_zone_socket.zone_combat.connect(_on_zone_combat)
	_zone_socket.zone_telegraph.connect(_on_zone_telegraph)
	_zone_socket.zone_connected.connect(_on_zone_connected)
	_zone_socket.zone_rejected.connect(_on_zone_rejected)
	_zone_socket.zone_closed_generation.connect(_on_zone_closed)
	_intent_bridge = NativeIntentBridge.new()
	add_child(_intent_bridge)
	_intent_bridge.callback_received.connect(handle_native_auth_callback)
	login.pressed.connect(_on_login_pressed)
	%CopyDiagnostics.pressed.connect(_on_copy_diagnostics_pressed)
	zone_map.selection_changed.connect(_on_map_selection_changed)
	%PlanA.pressed.connect(func(): zone_map.arm_plan("A"))
	%PlanB.pressed.connect(func(): zone_map.arm_plan("B"))
	%PlanHouse.pressed.connect(func(): zone_map.arm_plan("Haus"))
	login.disabled = true
	if not _configuration_valid():
		status.text = "Konfiguration ungültig"
		destination.text = "Die Verbindung ist gesperrt. Bitte verwende einen geprüften Client-Build."
	else:
		status.text = "Nicht verbunden"
		destination.text = "Aurion · arelogic.space"
		if _config.native_auth_start_enabled:
			development_notice.text = "Die Anmeldung wird sicher im Systembrowser fortgesetzt."
			login.disabled = false
	set_process(true)
	resized.connect(_fit_layout)
	_fit_layout()

func _on_map_selection_changed(message: String) -> void:
	map_selection.text = message if not message.is_empty() else "Berühre ein bestätigtes Objekt oder skizziere einen Punkt."

func _on_copy_diagnostics_pressed() -> void:
	var readback: String = _diagnostics.report(_config.client_build, _config.server_base_url, _zone_socket.state_name(), _zone_socket.state_name() == "connected", _confirmed_zone.has_state())
	DisplayServer.clipboard_set(readback)
	%CopyDiagnostics.text = "Diagnose kopiert"

func _on_login_pressed() -> void:
	if _awaiting_callback:
		_auth_start.cancel()
		_awaiting_callback = false
		status.text = "Anmeldung abgebrochen"
		login.text = "Anmelden"
		return
	login.disabled = true
	status.text = "Anmeldung wird vorbereitet"
	if not _begin_native_login():
		login.disabled = false

func _begin_native_login() -> bool:
	return _auth_start.begin(_config.server_base_url, _config.client_build)

func _on_auth_browser_opening() -> void:
	# The start request is asynchronous: a cancelled browser can return while it
	# is in flight. Clear that stale callback at the last boundary before the new
	# browser opens; anything delivered afterwards belongs to the new attempt.
	_intent_bridge.reset()

func _on_auth_start_succeeded() -> void:
	_awaiting_callback = true
	status.text = "Systembrowser geöffnet"
	login.text = "Abbrechen"
	login.disabled = false

func _on_auth_start_failed(error_code: String) -> void:
	_awaiting_callback = false
	login.text = "Anmelden"
	login.disabled = not _config.native_auth_start_enabled
	if error_code == "NATIVE_AUTH_BUILD_UNSUPPORTED":
		status.text = "Client-Aktualisierung erforderlich"
	else:
		status.text = "Anmeldung derzeit nicht verfügbar"

## Called only by the verified Android App-Link delivery boundary.
func handle_native_auth_callback(raw_url: Variant) -> bool:
	if not _awaiting_callback:
		return false
	var exchange_started: bool = _auth_start.complete_callback(raw_url)
	if exchange_started:
		status.text = "Anmeldung wird bestätigt"
		login.disabled = true
	elif _auth_start.callback_pending():
		status.text = "Systembrowser geöffnet"
		login.disabled = false
	return exchange_started

func _on_auth_session_succeeded() -> void:
	_zone_socket.close_zone()
	_reset_projection()
	_zone_reject_code = ""
	_awaiting_callback = false
	login.text = "Verbinden"
	login.disabled = true
	if _lifecycle.is_suspended():
		_lifecycle.require_restore()
		_ticket_abandoned = true
		_ticket_pending = false
		return
	status.text = "Zonenticket wird angefordert"
	_ticket_pending = true
	_ticket_abandoned = false
	if not _api.issue_zone_ticket(_config.server_base_url, _config.client_build):
		# A synchronous API failure may already have emitted request_failed.
		if not _ticket_pending:
			return
		_ticket_pending = false
		_on_zone_closed("ticket_start_failed")

func _on_zone_ticket_succeeded(receipt: Dictionary) -> void:
	if _ticket_abandoned or not _ticket_pending:
		return
	_ticket_pending = false
	if _lifecycle.is_suspended():
		return
	_recovering_ticket = false
	login.disabled = true
	if receipt.get("zoneId") != "observatory_threshold" or typeof(receipt.get("ticket")) != TYPE_STRING:
		_on_zone_ticket_failed("AURION_API_RESPONSE_INVALID")
		return
	status.text = "Zonenverbindung wird aufgebaut"
	login.text = "Verbinden"
	if not _zone_socket.connect_zone(_config.server_base_url, receipt["ticket"]):
		_on_zone_closed("socket_open_failed")

func _reset_projection() -> void:
	_confirmed_zone.reset()
	_entities.reset()
	_visuals.reset()
	_seen_combat_events.clear()
	_seen_combat_order.clear()
	_seen_telegraph_events.clear()
	_seen_telegraph_order.clear()
	_combat_notice_expires_at_ms = -1
	_last_world_update_ms = -1
	_world_is_stale = false
	combat_notice.text = ""
	combat_notice.visible = false
	confirmed_position.text = ""
	confirmed_position.visible = false
	_clear_vitals_presentation()
	entity_summary.text = ""
	entity_summary.visible = false
	zone_map.clear()
	map_panel.visible = false

func _on_zone_welcome(welcome: Dictionary) -> void:
	if _lifecycle.is_suspended():
		return
	_reconnect.reset()
	_reset_projection()
	if not _confirmed_zone.apply_welcome(welcome):
		_zone_socket.close_zone()
		return
	_entities.sync(_confirmed_zone)
	zone_map.set_confirmed(_confirmed_zone, _entities)
	map_panel.visible = zone_map.visible
	var now_ms := Time.get_ticks_msec()
	_last_world_update_ms = now_ms
	_world_is_stale = false
	_visuals.capture(_confirmed_zone, now_ms)
	_update_entity_presentation()
	_update_vitals_presentation()
	_update_position_presentation(now_ms)

func _on_zone_snapshot(snapshot: Dictionary) -> void:
	if _lifecycle.is_suspended():
		return
	if _confirmed_zone.apply_snapshot(snapshot):
		_entities.sync(_confirmed_zone)
		zone_map.set_confirmed(_confirmed_zone, _entities)
		map_panel.visible = zone_map.visible
		var now_ms := Time.get_ticks_msec()
		_last_world_update_ms = now_ms
		_world_is_stale = false
		_visuals.capture(_confirmed_zone, now_ms)
		_update_entity_presentation()
		_update_vitals_presentation()
		_update_position_presentation(now_ms)

func _on_zone_combat(event: Dictionary) -> void:
	if not _confirmed_zone.has_state():
		return
	var self_id := _confirmed_zone.self_entity_id()
	if event.get("attackerEntityId") != self_id and event.get("defenderEntityId") != self_id:
		return
	var event_id := "%d:%d:%s:%s" % [
		int(event.get("tick", -1)),
		int(event.get("sequence", -1)),
		str(event.get("attackerEntityId")),
		str(event.get("defenderEntityId")),
	]
	if _seen_combat_events.has(event_id):
		return
	_seen_combat_events[event_id] = true
	_seen_combat_order.append(event_id)
	if _seen_combat_order.size() > 128:
		_seen_combat_events.erase(_seen_combat_order.pop_front())
	combat_notice.visible = true
	_combat_notice_expires_at_ms = Time.get_ticks_msec() + COMBAT_NOTICE_DURATION_MS
	if event.get("killed", false):
		combat_notice.text = ("Du wurdest besiegt" if event.get("defenderEntityId") == self_id else "Gegner besiegt") + " · %d Schaden" % int(event.get("damage", 0))
	elif not event.get("hit", false):
		combat_notice.text = "Angriff verfehlt"
	elif event.get("crit", false):
		combat_notice.text = ("Kritischer Treffer erhalten" if event.get("defenderEntityId") == self_id else "Kritischer Treffer bestätigt") + " · %d Schaden" % int(event.get("damage", 0))
	elif event.get("defenderEntityId") == self_id:
		combat_notice.text = "Treffer erhalten · %d Schaden" % int(event.get("damage", 0))
	else:
		combat_notice.text = "Treffer bestätigt · %d Schaden" % int(event.get("damage", 0))

func _on_zone_telegraph(event: Dictionary) -> void:
	if not _confirmed_zone.has_state() or event.get("targetEntityId") != _confirmed_zone.self_entity_id():
		return
	var event_id := str(event.get("id", ""))
	if event_id.is_empty() or _seen_telegraph_events.has(event_id):
		return
	_seen_telegraph_events[event_id] = true
	_seen_telegraph_order.append(event_id)
	if _seen_telegraph_order.size() > 128:
		_seen_telegraph_events.erase(_seen_telegraph_order.pop_front())
	combat_notice.text = "Angriff angekündigt"
	combat_notice.visible = true
	_combat_notice_expires_at_ms = Time.get_ticks_msec() + COMBAT_NOTICE_DURATION_MS

func _on_zone_connected() -> void:
	if not _confirmed_zone.has_state():
		_on_zone_ticket_failed("AURION_ZONE_WELCOME_PROJECTION_MISSING")
		return
	status.text = "Sicher mit Aurion verbunden"
	login.text = "Verbunden"
	login.disabled = true

func _on_zone_rejected(code: String) -> void:
	# Command-level rejection is recoverable after a verified welcome.
	if _zone_socket.state_name() == "connected":
		status.text = "Sicher mit Aurion verbunden"
		return
	_zone_reject_code = code
	status.text = "Zonenverbindung abgelehnt"

func _on_zone_closed(_reason: String, generation: int = -1) -> void:
	# Suspension discards one exact socket generation. Its terminal callback may
	# arrive after resume or a successor welcome and must not touch that session.
	if generation >= 0 and generation <= _discarded_zone_generation_through:
		return
	_reset_projection()
	if _reason == "client_close":
		return
	if _lifecycle.is_suspended():
		return
	var was_reconnecting: bool = _reconnect.active()
	var retryable_handshake_end := _reason in ["closed", "hello_timeout", "hello_send_failed", "socket_open_failed", "ticket_start_failed"]
	# A reconnect attempt remains reserved until the first verified welcome.
	# Only transport/timeout endings consume that budget; rejected protocol
	# frames fail closed immediately and cannot race another ticket request.
	if _reconnect.active() and not _lifecycle.is_suspended():
		_recovering_ticket = false
		if retryable_handshake_end and _zone_reject_code.is_empty() and _auth_start.protected_response_allowed() and _reconnect.retry_after_failure(Time.get_ticks_msec()):
			status.text = "Verbindung wird erneut versucht"
			return
		_reconnect.reset()
	if retryable_handshake_end and not was_reconnecting and _zone_reject_code.is_empty() and not _lifecycle.is_suspended() and not _awaiting_callback and _auth_start.protected_response_allowed():
		if _reconnect.begin(Time.get_ticks_msec()):
			_recovering_ticket = false
			status.text = "Verbindung wird erneut versucht"
			login.disabled = true
			return
	if _zone_reject_code.is_empty():
		status.text = "Zonenverbindung getrennt"
	login.disabled = true
	if _auth_start.logout_in_flight():
		return
	if not _auth_start.logout():
		_on_auth_logout_terminal()

func _on_zone_ticket_failed(_error_code: String) -> void:
	if _ticket_abandoned:
		return
	_ticket_pending = false
	if _reconnect.active() and not _lifecycle.is_suspended():
		_recovering_ticket = false
		if _error_code == "AURION_API_REQUEST_FAILED" and _reconnect.retry_after_failure(Time.get_ticks_msec()):
			status.text = "Verbindung wird erneut versucht"
			return
		_reconnect.reset()
	_reset_projection()
	_zone_socket.close_zone()
	status.text = "Verbindung derzeit nicht verfügbar"
	login.text = "Anmelden"
	login.disabled = true
	if _auth_start.logout_in_flight():
		return
	if not _auth_start.logout():
		_on_auth_logout_terminal()

func _on_auth_logout_terminal(_error_code: String = "") -> void:
	_ticket_abandoned = true
	_ticket_pending = false
	_reconnect.reset()
	_recovering_ticket = false
	_reset_projection()
	_api.cancel()
	_zone_socket.close_zone()
	login.text = "Anmelden"
	login.disabled = _lifecycle.is_suspended() or not _config.native_auth_start_enabled

func _on_auth_session_failed(_error_code: String) -> void:
	_ticket_abandoned = true
	_ticket_pending = false
	_reset_projection()
	_api.cancel()
	_zone_socket.close_zone()
	_awaiting_callback = false
	status.text = "Anmeldung derzeit nicht verfügbar"
	login.text = "Anmelden"
	login.disabled = _lifecycle.is_suspended() or not _config.native_auth_start_enabled

func _notification(what: int) -> void:
	if what == NOTIFICATION_APPLICATION_PAUSED:
		_on_app_suspended()
	elif what == NOTIFICATION_APPLICATION_RESUMED:
		_on_app_resumed()

func _process(_delta: float) -> void:
	var now_ms := Time.get_ticks_msec()
	_expire_combat_notice(now_ms)
	_update_position_presentation(now_ms)
	_update_world_freshness(now_ms)
	if _awaiting_callback:
		_intent_bridge.poll_for_callback(true)
	if _reconnect.active() and not _lifecycle.is_suspended():
		_poll_reconnect(Time.get_ticks_msec())

func _update_entity_presentation() -> void:
	if not _confirmed_zone.has_state():
		entity_summary.text = ""
		entity_summary.visible = false
		return
	var travellers := maxi(_entities.ids("presences").size() - 1, 0)
	var creatures := _entities.ids("mobs").size()
	var traveller_word := "Reisender" if travellers == 1 else "Reisende"
	var creature_word := "Kreatur" if creatures == 1 else "Kreaturen"
	entity_summary.text = "In der Nähe · %d %s · %d %s%s" % [travellers, traveller_word, creatures, creature_word, _world_freshness_suffix()]
	entity_summary.visible = true

func _update_world_freshness(now_ms: int) -> void:
	if not _confirmed_zone.has_state() or _last_world_update_ms < 0:
		return
	var stale := now_ms - _last_world_update_ms >= WORLD_STALE_AFTER_MS
	if stale == _world_is_stale:
		return
	_world_is_stale = stale
	zone_map.set_stale(stale)
	_update_entity_presentation()
	_update_vitals_presentation()
	_update_position_presentation(now_ms)

func _world_freshness_suffix() -> String:
	return " · Stand veraltet" if _world_is_stale else ""

func _clear_vitals_presentation() -> void:
	confirmed_vitals.text = ""
	confirmed_vitals.visible = false
	confirmed_health_meter.value = 0
	confirmed_health_meter.visible = false
	confirmed_stamina_meter.value = 0
	confirmed_stamina_meter.visible = false

func _update_vitals_presentation() -> void:
	if not _confirmed_zone.has_state():
		_clear_vitals_presentation()
		return
	var self_combatant := _entities.record("combatants", _confirmed_zone.self_entity_id())
	if self_combatant.is_empty():
		_clear_vitals_presentation()
		return
	confirmed_vitals.text = "Zustand · HP %d/%d · Ausdauer %d/%d%s" % [
		int(self_combatant["health"]),
		int(self_combatant["maxHealth"]),
		int(self_combatant["stamina"]),
		int(self_combatant["maxStamina"]),
		_world_freshness_suffix(),
	]
	confirmed_vitals.visible = true
	confirmed_health_meter.max_value = int(self_combatant["maxHealth"])
	confirmed_health_meter.value = int(self_combatant["health"])
	confirmed_health_meter.visible = true
	confirmed_stamina_meter.max_value = int(self_combatant["maxStamina"])
	confirmed_stamina_meter.value = int(self_combatant["stamina"])
	confirmed_stamina_meter.visible = true

func _update_position_presentation(now_ms: int) -> void:
	if not _confirmed_zone.has_state():
		confirmed_position.text = ""
		confirmed_position.visible = false
		return
	var visual: Dictionary = _visuals.visual_precise_mm(_confirmed_zone.self_entity_id(), now_ms)
	if visual.is_empty():
		confirmed_position.text = ""
		confirmed_position.visible = false
		return
	confirmed_position.text = "Position · X %.2f m · Z %.2f m%s" % [float(visual["x"]) / 1000.0, float(visual["z"]) / 1000.0, _world_freshness_suffix()]
	confirmed_position.visible = true

func _expire_combat_notice(now_ms: int) -> void:
	if _combat_notice_expires_at_ms < 0 or now_ms < _combat_notice_expires_at_ms:
		return
	_combat_notice_expires_at_ms = -1
	combat_notice.text = ""
	combat_notice.visible = false

func _on_app_suspended() -> void:
	var socket_active: bool = _zone_socket.state_name() != "closed"
	var must_restore: bool = _confirmed_zone.has_state() or socket_active or _ticket_pending or _reconnect.active() or _auth_start.protected_response_allowed()
	if not _lifecycle.suspend(must_restore):
		return
	_reconnect.reset()
	_recovering_ticket = false
	_api.cancel()
	_ticket_abandoned = true
	_ticket_pending = false
	if socket_active:
		_discarded_zone_generation_through = maxi(_discarded_zone_generation_through, _zone_socket.connection_generation())
	_zone_socket.close_zone()
	_reset_projection()
	if not _awaiting_callback:
		status.text = "App pausiert – Verbindung getrennt"
		login.disabled = true

func _on_app_resumed() -> void:
	if not _lifecycle.is_suspended():
		return
	if _lifecycle.resume():
		_reconnect.begin(Time.get_ticks_msec())
		status.text = "Sitzung wird neu bestätigt"
	elif not _awaiting_callback:
		login.text = "Anmelden"
		if not _configuration_valid():
			status.text = "Konfiguration ungültig"
			login.disabled = true
		elif _auth_start.request_in_flight():
			login.disabled = true
		else:
			status.text = "Nicht verbunden"
			login.disabled = not _config.native_auth_start_enabled

func _poll_reconnect(now_ms: int) -> void:
	if not _reconnect.active() or _lifecycle.is_suspended() or _recovering_ticket:
		return
	if not _reconnect.take_if_due(now_ms):
		return
	if not _auth_start.protected_response_allowed():
		_reconnect.reset()
		_on_auth_session_failed("NATIVE_AUTH_SESSION_EXPIRED")
		return
	_recovering_ticket = true
	_ticket_abandoned = false
	_ticket_pending = true
	status.text = "Neues Zonenticket wird angefordert"
	if not _api.issue_zone_ticket(_config.server_base_url, _config.client_build):
		_recovering_ticket = false
		# The API may synchronously emit request_failed before returning false.
		# In that case its callback already classified the failure.
		if not _ticket_pending:
			return
		_ticket_pending = false
		if _reconnect.active() and _reconnect.retry_after_failure(now_ms):
			status.text = "Verbindung wird erneut versucht"
			return
		_on_zone_ticket_failed("AURION_API_REQUEST_FAILED")

func _fit_layout() -> void:
	if not is_node_ready():
		return
	card.custom_minimum_size.x = minf(600.0, maxf(240.0, size.x - 48.0))
	title.add_theme_font_size_override("font_size", 32 if size.x < 600 else 44)
	queue_redraw()

func _draw() -> void:
	draw_rect(Rect2(Vector2.ZERO, size), Color("07131c"))
	var center := Vector2(size.x * 0.78, size.y * 0.38)
	var radius := minf(size.x, size.y) * 0.42
	for ring in range(1, 4):
		draw_arc(center, radius * float(ring) / 3.0, 0, TAU, 96, Color(0.40, 0.56, 0.60, 0.12), 1.0, true)
	draw_line(center - Vector2(radius, 0), center + Vector2(radius, 0), Color(0.40, 0.56, 0.60, 0.10), 1.0, true)
	draw_line(center - Vector2(0, radius), center + Vector2(0, radius), Color(0.40, 0.56, 0.60, 0.10), 1.0, true)
	for star in STARS:
		draw_circle(star * size, 2.0, Color(0.77, 0.69, 0.46, 0.6))
