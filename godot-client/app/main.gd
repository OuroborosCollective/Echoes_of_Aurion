extends Control

const RuntimeConfig = preload("res://config/runtime_config.gd")
const NativeAuthStart = preload("res://net/auth/native_auth_start.gd")
const AurionApi = preload("res://net/api/aurion_api.gd")
const ZoneSocket = preload("res://net/zone_socket.gd")
const SessionLifecycle = preload("res://app/session_lifecycle.gd")
const ReconnectPolicy = preload("res://net/reconnect_policy.gd")
const ZoneState = preload("res://projection/zone_state.gd")
const EntityRegistry = preload("res://projection/entity_registry.gd")
const SnapshotInterpolator = preload("res://projection/snapshot_interpolator.gd")
const NativeIntentBridge = preload("res://platform/android/native_intent_bridge.gd")
const STARS := [Vector2(0.08, 0.13), Vector2(0.19, 0.65), Vector2(0.33, 0.09), Vector2(0.53, 0.85), Vector2(0.67, 0.18), Vector2(0.79, 0.11), Vector2(0.88, 0.38), Vector2(0.94, 0.73), Vector2(0.72, 0.67)]

@onready var card: PanelContainer = %LaunchCard
@onready var title: Label = %Title
@onready var status: Label = %ConnectionStatus
@onready var destination: Label = %Destination
@onready var login: Button = %Login
@onready var development_notice: Label = $SafeMargin/Scroll/Center/LaunchCard/Content/DevelopmentNotice

var _config: Dictionary
var _auth_start: Node
var _api: Node
var _zone_socket: Node
var _awaiting_callback := false
var _zone_reject_code := ""
var _confirmed_zone = ZoneState.new()
var _entities = EntityRegistry.new()
var _visuals = SnapshotInterpolator.new()
var _lifecycle = SessionLifecycle.new()
var _reconnect = ReconnectPolicy.new()
var _recovering_ticket := false
var _ticket_pending := false
var _ticket_abandoned := false
var _intent_bridge: Node

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
	_zone_socket.zone_connected.connect(_on_zone_connected)
	_zone_socket.zone_rejected.connect(_on_zone_rejected)
	_zone_socket.zone_closed.connect(_on_zone_closed)
	_intent_bridge = NativeIntentBridge.new()
	add_child(_intent_bridge)
	_intent_bridge.callback_received.connect(handle_native_auth_callback)
	login.pressed.connect(_on_login_pressed)
	login.disabled = true
	if _config.server_base_url.is_empty() or _config.client_build.is_empty() or _config.renderer_profile != "compatibility":
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
	status.text = "Anmeldung wird bestätigt"
	login.disabled = true
	return _auth_start.complete_callback(raw_url)

func _on_auth_session_succeeded() -> void:
	_zone_socket.close_zone()
	_reset_projection()
	_zone_reject_code = ""
	_awaiting_callback = false
	status.text = "Zonenticket wird angefordert"
	login.text = "Verbinden"
	login.disabled = true
	_ticket_pending = true
	_ticket_abandoned = false
	_api.issue_zone_ticket(_config.server_base_url, _config.client_build)

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
		_on_zone_ticket_failed("AURION_ZONE_SOCKET_UNAVAILABLE")

func _reset_projection() -> void:
	_confirmed_zone.reset()
	_entities.reset()
	_visuals.reset()

func _on_zone_welcome(welcome: Dictionary) -> void:
	if _lifecycle.is_suspended():
		return
	_reconnect.reset()
	_reset_projection()
	if not _confirmed_zone.apply_welcome(welcome):
		_zone_socket.close_zone()
		return
	_entities.sync(_confirmed_zone)
	_visuals.capture(_confirmed_zone, Time.get_ticks_msec())

func _on_zone_snapshot(snapshot: Dictionary) -> void:
	if _lifecycle.is_suspended():
		return
	if _confirmed_zone.apply_snapshot(snapshot):
		_entities.sync(_confirmed_zone)
		_visuals.capture(_confirmed_zone, Time.get_ticks_msec())

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

func _on_zone_closed(_reason: String) -> void:
	_reset_projection()
	if _reason == "client_close":
		return
	if _reason == "closed" and _zone_reject_code.is_empty() and not _lifecycle.is_suspended() and not _awaiting_callback and _auth_start.protected_response_allowed():
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
		if _reconnect.retry_after_failure(Time.get_ticks_msec()):
			status.text = "Verbindung wird erneut versucht"
			return
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
	login.disabled = not _config.native_auth_start_enabled

func _on_auth_session_failed(_error_code: String) -> void:
	_ticket_abandoned = true
	_ticket_pending = false
	_reset_projection()
	_api.cancel()
	_zone_socket.close_zone()
	_awaiting_callback = false
	status.text = "Anmeldung derzeit nicht verfügbar"
	login.text = "Anmelden"
	login.disabled = not _config.native_auth_start_enabled

func _notification(what: int) -> void:
	if what == NOTIFICATION_APPLICATION_PAUSED:
		_on_app_suspended()
	elif what == NOTIFICATION_APPLICATION_RESUMED:
		_on_app_resumed()

func _process(_delta: float) -> void:
	if _awaiting_callback:
		_intent_bridge.poll_for_callback(true)
	if _reconnect.active() and not _lifecycle.is_suspended():
		_poll_reconnect(Time.get_ticks_msec())

func _on_app_suspended() -> void:
	var must_restore: bool = _confirmed_zone.has_state() or _zone_socket.state_name() == "connected" or _ticket_pending or _reconnect.active()
	if not _lifecycle.suspend(must_restore):
		return
	_reconnect.reset()
	_recovering_ticket = false
	_api.cancel()
	_ticket_abandoned = true
	_ticket_pending = false
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
		if _reconnect.active():
			_reconnect.retry_after_failure(now_ms)

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
