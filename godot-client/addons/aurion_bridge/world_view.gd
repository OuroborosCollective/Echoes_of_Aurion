@tool
extends Node
## Live-Weltansicht. Spiegelt die Entities des Servers als Nodes unter diesem Node.
##
## - Laufzeit: nutzt den Autoload "AurionBridge".
## - Editor: nutzt den vom Plugin bereitgestellten Editor-Client (Dock "Aurion") – so
##   siehst du die Live-Welt direkt im Editor-Viewport (Nodes ohne owner, werden nicht gespeichert).
## - 2D: Bridge (x, z) -> Bildschirm (x, y) * pixels_per_unit.  3D: (x, y, z) -> (x, y, z).
## - Bearbeiten (nur 2D, Laufzeit): Klick = wählen, Ziehen = verschieben, Entf = löschen.
##   Alles geht als Command an den Server; die Ansicht folgt erst dem bestätigten Delta.

signal entity_selected(id: String)

enum Mode { VIEW_2D, VIEW_3D }

@export var mode: Mode = Mode.VIEW_2D
@export var pixels_per_unit: float = 32.0
@export var live_in_editor: bool = true
@export var interactive_edit: bool = true
@export var auto_camera_3d: bool = true

const Entity2D := preload("res://addons/aurion_bridge/entity_2d.gd")
const Entity3D := preload("res://addons/aurion_bridge/entity_3d.gd")

var _client = null
var _nodes: Dictionary = {}
var _selected_id: String = ""
var _dragging := false
var _find_cooldown := 0.0


func _ready() -> void:
    if mode == Mode.VIEW_3D and auto_camera_3d and not Engine.is_editor_hint():
        _make_camera_3d()


func _exit_tree() -> void:
    _unbind()


func _process(delta: float) -> void:
    if Engine.is_editor_hint() and not live_in_editor:
        return
    if _client == null or not is_instance_valid(_client):
        _client = null
        _find_cooldown -= delta
        if _find_cooldown <= 0.0:
            _find_cooldown = 0.5
            _bind(_find_client())


func get_client():
    return _client


func _find_client():
    if Engine.is_editor_hint():
        if Engine.has_meta("aurion_editor_client"):
            var c = Engine.get_meta("aurion_editor_client")
            if is_instance_valid(c):
                return c
        return null
    return get_node_or_null("/root/AurionBridge")


func _bind(c) -> void:
    if c == null:
        return
    _client = c
    if not c.snapshot_received.is_connected(_rebuild):
        c.snapshot_received.connect(_rebuild)
    if not c.entity_upserted.is_connected(_on_upsert):
        c.entity_upserted.connect(_on_upsert)
    if not c.entity_removed.is_connected(_on_remove):
        c.entity_removed.connect(_on_remove)
    if c.is_authed:
        _rebuild()


func _unbind() -> void:
    if _client != null and is_instance_valid(_client):
        if _client.snapshot_received.is_connected(_rebuild):
            _client.snapshot_received.disconnect(_rebuild)
        if _client.entity_upserted.is_connected(_on_upsert):
            _client.entity_upserted.disconnect(_on_upsert)
        if _client.entity_removed.is_connected(_on_remove):
            _client.entity_removed.disconnect(_on_remove)
    _client = null


# ───────────────────────── Spiegeln ─────────────────────────

func _rebuild() -> void:
    var ents: Dictionary = _client.entities
    for id in _nodes.keys():
        if not ents.has(id):
            _remove_node(id)
    for id in ents.keys():
        _upsert_node(ents[id], true)


func _on_upsert(e: Dictionary) -> void:
    _upsert_node(e, false)


func _on_remove(id: String) -> void:
    _remove_node(id)


func _upsert_node(e: Dictionary, snap: bool) -> void:
    var id := str(e.get("id", ""))
    if id == "":
        return
    var n = _nodes.get(id)
    var created := false
    if n == null or not is_instance_valid(n):
        if mode == Mode.VIEW_2D:
            n = Entity2D.new()
        else:
            n = Entity3D.new()
        n.setup(e)
        add_child(n)
        _nodes[id] = n
        created = true
        if id == _selected_id:
            n.selected = true
    else:
        n.update_info(e)
    if _dragging and id == _selected_id:
        return  # lokale Drag-Vorschau nicht überschreiben
    var p: Dictionary = e.get("pos", {})
    var x := float(p.get("x", 0.0))
    var y := float(p.get("y", 0.0))
    var z := float(p.get("z", 0.0))
    if mode == Mode.VIEW_2D:
        n.set_target(Vector2(x, z) * pixels_per_unit, snap or created)
    else:
        n.set_target(Vector3(x, y, z), snap or created)


func _remove_node(id: String) -> void:
    var n = _nodes.get(id)
    _nodes.erase(id)
    if n != null and is_instance_valid(n):
        n.queue_free()
    if id == _selected_id:
        _selected_id = ""
        _dragging = false


# ───────────────────────── Auswahl & Live-Editing (2D) ─────────────────────────

func select_entity(id: String) -> void:
    if _nodes.has(_selected_id):
        _nodes[_selected_id].selected = false
    _selected_id = id
    if _nodes.has(id):
        _nodes[id].selected = true
    entity_selected.emit(id)


func _unhandled_input(event: InputEvent) -> void:
    if Engine.is_editor_hint() or not interactive_edit or mode != Mode.VIEW_2D or _client == null:
        return
    if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT:
        if event.pressed:
            var hit := _pick_2d(_mouse_world_2d())
            select_entity(hit)
            _dragging = hit != "" and _client.edit_enabled
        elif _dragging:
            _dragging = false
            _commit_drag()
    elif event is InputEventMouseMotion and _dragging and _nodes.has(_selected_id):
        var n = _nodes[_selected_id]
        var w := _mouse_world_2d()
        n.position = w
        n.target = w
    elif event is InputEventKey and event.pressed and not event.echo and event.keycode == KEY_DELETE:
        if _selected_id != "" and _client.edit_enabled:
            _client.cmd_remove(_selected_id)


func _mouse_world_2d() -> Vector2:
    var vp := get_viewport()
    return vp.get_canvas_transform().affine_inverse() * vp.get_mouse_position()


func _pick_2d(w: Vector2) -> String:
    var best := ""
    var best_d := 24.0
    for id in _nodes.keys():
        var n = _nodes[id]
        var d: float = n.position.distance_to(w)
        if d < best_d:
            best_d = d
            best = id
    return best


func _commit_drag() -> void:
    if not _nodes.has(_selected_id):
        return
    var id := _selected_id
    var n = _nodes[id]
    var old: Dictionary = _client.entities.get(id, {})
    var old_pos: Dictionary = old.get("pos", {})
    var pos := Vector3(n.position.x / pixels_per_unit, float(old_pos.get("y", 0.0)), n.position.y / pixels_per_unit)
    _client.cmd_move(id, pos)
    # Server ist autoritativ: Wurde der Move nicht übernommen, springt die Ansicht zurück.
    get_tree().create_timer(1.5).timeout.connect(_revert_to_server.bind(id))


func _revert_to_server(id: String) -> void:
    if _dragging or _client == null or not _client.entities.has(id):
        return
    _upsert_node(_client.entities[id], true)


func _make_camera_3d() -> void:
    var cam := Camera3D.new()
    add_child(cam)
    cam.look_at_from_position(Vector3(0, 35, 28), Vector3.ZERO, Vector3.UP)
    cam.current = true
    var sun := DirectionalLight3D.new()
    add_child(sun)
    sun.rotation_degrees = Vector3(-55, 30, 0)
