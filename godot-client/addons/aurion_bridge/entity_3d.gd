@tool
extends Node3D
## Darstellung einer Server-Entity in der 3D-Ansicht (Primitive + Label3D).

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
var target: Vector3 = Vector3.ZERO
var selected: bool = false : set = _set_selected

var _mesh: MeshInstance3D = null
var _label: Label3D = null
var _mat: StandardMaterial3D = null


func setup(e: Dictionary) -> void:
    entity_id = str(e.get("id", ""))
    kind = str(e.get("kind", "object"))

    _mat = StandardMaterial3D.new()
    _mat.albedo_color = COLORS.get(kind, Color(0.9, 0.9, 0.9))
    _mat.emission = Color(1, 1, 1)

    var prim: PrimitiveMesh
    var lift := 0.4
    match kind:
        "player", "npc":
            var c := CapsuleMesh.new()
            c.radius = 0.35
            c.height = 1.8
            prim = c
            lift = 0.9
        "monster":
            var s := SphereMesh.new()
            s.radius = 0.6
            s.height = 1.2
            prim = s
            lift = 0.6
        "board":
            var b := BoxMesh.new()
            b.size = Vector3(1.2, 1.6, 0.15)
            prim = b
            lift = 0.8
        "item":
            var i := BoxMesh.new()
            i.size = Vector3(0.4, 0.4, 0.4)
            prim = i
            lift = 0.2
        _:
            var o := BoxMesh.new()
            o.size = Vector3(0.8, 0.8, 0.8)
            prim = o
    prim.material = _mat

    _mesh = MeshInstance3D.new()
    _mesh.mesh = prim
    _mesh.position.y = lift
    add_child(_mesh)

    _label = Label3D.new()
    _label.billboard = BaseMaterial3D.BILLBOARD_ENABLED
    _label.pixel_size = 0.01
    _label.font_size = 32
    _label.position.y = lift * 2.0 + 0.5
    add_child(_label)
    update_info(e)


func update_info(e: Dictionary) -> void:
    var nm := str(e.get("name", ""))
    _label.text = nm if nm != "" else entity_id
    if e.has("rot"):
        rotation.y = float(e.get("rot", 0.0))


func set_target(p: Vector3, snap: bool = false) -> void:
    target = p
    if snap:
        position = p


func _process(delta: float) -> void:
    var d := position.distance_to(target)
    if d > 20.0:
        position = target
    elif d > 0.002:
        position = position.lerp(target, 1.0 - exp(-delta * 16.0))


func _set_selected(v: bool) -> void:
    selected = v
    if _mat != null:
        _mat.emission_enabled = v
