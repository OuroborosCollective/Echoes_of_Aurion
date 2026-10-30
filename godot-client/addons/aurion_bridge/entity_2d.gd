@tool
extends Node2D
## Darstellung einer Server-Entity in der 2D-Ansicht (Kreis + Label + Blickrichtung).

const COLORS := {
    "player": Color(0.35, 0.85, 1.0),
    "npc": Color(0.45, 0.9, 0.45),
    "monster": Color(0.95, 0.35, 0.35),
    "item": Color(1.0, 0.9, 0.35),
    "board": Color(1.0, 0.65, 0.2),
    "object": Color(0.7, 0.7, 0.75),
}

var entity_id: String = ""
var kind: String = "object"
var target: Vector2 = Vector2.ZERO
var radius: float = 9.0
var yaw: float = 0.0
var has_yaw: bool = false
var selected: bool = false : set = _set_selected

var _label: Label = null


func setup(e: Dictionary) -> void:
    entity_id = str(e.get("id", ""))
    kind = str(e.get("kind", "object"))
    if kind == "board":
        radius = 12.0
    elif kind == "item":
        radius = 6.0
    _label = Label.new()
    _label.add_theme_font_size_override("font_size", 11)
    _label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
    _label.custom_minimum_size = Vector2(120, 0)
    _label.position = Vector2(-60, -radius - 20)
    add_child(_label)
    update_info(e)


func update_info(e: Dictionary) -> void:
    var nm := str(e.get("name", ""))
    _label.text = nm if nm != "" else entity_id
    has_yaw = e.has("rot")
    yaw = float(e.get("rot", 0.0))
    queue_redraw()


func set_target(p: Vector2, snap: bool = false) -> void:
    target = p
    if snap:
        position = p


func _process(delta: float) -> void:
    var d := position.distance_to(target)
    if d > 600.0:
        position = target
    elif d > 0.05:
        position = position.lerp(target, 1.0 - exp(-delta * 16.0))


func _set_selected(v: bool) -> void:
    selected = v
    queue_redraw()


func _draw() -> void:
    var col: Color = COLORS.get(kind, Color(0.9, 0.9, 0.9))
    draw_circle(Vector2.ZERO, radius, col)
    draw_arc(Vector2.ZERO, radius, 0.0, TAU, 24, Color(0, 0, 0, 0.6), 1.5)
    if has_yaw:
        draw_line(Vector2.ZERO, Vector2(cos(yaw), sin(yaw)) * (radius + 5.0), Color.WHITE, 2.0)
    if selected:
        draw_arc(Vector2.ZERO, radius + 5.0, 0.0, TAU, 32, Color(1, 1, 1), 2.0)
