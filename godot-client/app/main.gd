extends Control

const RuntimeConfig = preload("res://config/runtime_config.gd")
const NativeAuthStart = preload("res://net/auth/native_auth_start.gd")
const AurionApi = preload("res://net/api/aurion_api.gd")
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
var _awaiting_callback := false

func _ready() -> void:
	Engine.max_fps = 30
	_config = RuntimeConfig.current()
	%BuildIdentity.text = "Build · " + _config.client_build
	_auth_start = NativeAuthStart.new()
	add_child(_auth_start)
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
	if not _auth_start.begin(_config.server_base_url, _config.client_build):
		login.disabled = false

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
	_awaiting_callback = false
	status.text = "Zonenticket wird angefordert"
	login.text = "Verbinden"
	login.disabled = true
	_api.issue_zone_ticket(_config.server_base_url, _config.client_build)

func _on_zone_ticket_succeeded(_receipt: Dictionary) -> void:
	status.text = "Sicher angemeldet · Zonenticket bestätigt"
	login.text = "Angemeldet"
	login.disabled = true

func _on_zone_ticket_failed(_error_code: String) -> void:
	status.text = "Verbindung derzeit nicht verfügbar"
	login.text = "Anmelden"
	login.disabled = true
	if _auth_start.logout_in_flight():
		return
	if not _auth_start.logout():
		_on_auth_logout_terminal()

func _on_auth_logout_terminal(_error_code: String = "") -> void:
	login.text = "Anmelden"
	login.disabled = not _config.native_auth_start_enabled

func _on_auth_session_failed(_error_code: String) -> void:
	_awaiting_callback = false
	status.text = "Anmeldung derzeit nicht verfügbar"
	login.text = "Anmelden"
	login.disabled = not _config.native_auth_start_enabled

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
