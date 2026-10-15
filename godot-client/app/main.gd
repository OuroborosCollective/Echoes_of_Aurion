extends Control

const RuntimeConfig = preload("res://config/runtime_config.gd")
const STARS := [Vector2(0.08, 0.13), Vector2(0.19, 0.65), Vector2(0.33, 0.09), Vector2(0.53, 0.85), Vector2(0.67, 0.18), Vector2(0.79, 0.11), Vector2(0.88, 0.38), Vector2(0.94, 0.73), Vector2(0.72, 0.67)]

@onready var card: PanelContainer = %LaunchCard
@onready var title: Label = %Title
@onready var status: Label = %ConnectionStatus
@onready var destination: Label = %Destination
@onready var login: Button = %Login

func _ready() -> void:
	Engine.max_fps = 30
	var config := RuntimeConfig.current()
	login.disabled = true
	if config.server_base_url.is_empty() or config.client_build.is_empty() or config.renderer_profile != "compatibility":
		status.text = "Konfiguration ungültig"
		destination.text = "Die Verbindung ist gesperrt. Bitte verwende einen geprüften Client-Build."
	else:
		status.text = "Nicht verbunden"
		destination.text = "Aurion · arelogic.space"
	resized.connect(_fit_layout)
	_fit_layout()

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
