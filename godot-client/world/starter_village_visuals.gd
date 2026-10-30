extends Node3D
## Presentation-only Quaternius CC0 render skins for the server-authenticated
## Aurion starter-village visual plan attached to the protected chunk GET.
## No collisions, NPC decisions, world seed, building placement or persistence.
const VERSION := "aurion.starter-village-visuals.v1"
const CATALOG_HASH := "94de6cf4ff05f0ccc93c9471f077972b09def8e21c42e3720215017ab7939c4f"
const COLLISION_HASH := "ba350a340de4cac8a1326af7c9d02c8704bf4fff01b0d600347cf9b4c8bb2580"
const WORLD_SIZE_MM := 32000
const TILE_SIZE_MM := 4000
const EXPECTED := {
    "aurion.starter-village.v1:starter-village-gate-north": "city-fencewooddoor-gate",
    "aurion.starter-village.v1:starter-village-gate-east": "city-fencewooddoor-gate",
    "aurion.starter-village.v1:starter-village-gate-south": "city-fencewooddoor-gate",
    "aurion.starter-village.v1:starter-village-gate-west": "city-fencewooddoor-gate",
    "aurion.starter-village.v1:starter-village-pilot-wall-nw": "city-wall-stone01",
    "aurion.starter-village.v1:starter-village-pilot-wall-ne": "city-wall-stone02",
    "aurion.starter-village.v1:starter-village-market-nw": "city-market03",
    "aurion.starter-village.v1:starter-village-hut-ne": "city-stylized-hut01",
    "aurion.starter-village.v1:starter-village-hut-se": "city-stylized-hut02",
    "aurion.starter-village.v1:starter-village-hut-sw": "city-stylized-hut01",
}
const SCENES := {
    "city-fencewooddoor-gate": preload("res://world/starter_gate.tscn"),
    "city-wall-stone01": preload("res://world/starter_wall.tscn"),
    "city-wall-stone02": preload("res://world/starter_wall.tscn"),
    "city-market03": preload("res://world/starter_market.tscn"),
    "city-stylized-hut01": preload("res://world/starter_house.tscn"),
    "city-stylized-hut02": preload("res://world/starter_house.tscn"),
}
var diagnostic := "Kein bestätigter Starterdorf-Plan"
var _last_connection := ""
var _last_plan: Array = []

func clear() -> void:
    for child in get_children():
        remove_child(child)
        child.queue_free()
    _last_connection = ""
    _last_plan.clear()
    diagnostic = "Kein bestätigter Starterdorf-Plan"

func _reject(reason: String) -> bool:
    clear()
    diagnostic = reason
    return false

static func _valid_integer(value: Variant, lower: int, upper: int) -> bool:
    if typeof(value) not in [TYPE_INT, TYPE_FLOAT]:
        return false
    var number := float(value)
    return is_finite(number) and number == floor(number) and number >= lower and number <= upper

static func _confirmed_height(tiles: Array, x_mm: int, z_mm: int) -> Variant:
    var col: int = clampi(floori(float(x_mm + WORLD_SIZE_MM) / float(TILE_SIZE_MM)), 0, 15)
    var row: int = clampi(floori(float(z_mm + WORLD_SIZE_MM) / float(TILE_SIZE_MM)), 0, 15)
    for item in tiles:
        if typeof(item) == TYPE_DICTIONARY and item.get("x") == col and item.get("z") == row:
            return item.get("heightMm")
    return null

func apply_confirmed(readback: Variant, connection_id: String) -> bool:
    if connection_id.is_empty() or not connection_id.begins_with("zone_peer_"):
        return _reject("VILLAGE_SESSION_UNVERIFIED")
    if typeof(readback) != TYPE_DICTIONARY:
        return _reject("VILLAGE_CHUNK_UNVERIFIED")
    # The server may not yet support the extended visual response: no props,
    # not a local substitute for confirmed Aurion data.
    if not readback.has("starterVillageVisuals"):
        clear()
        return true
    var region: Variant = readback.starterVillageVisuals
    var base: Variant = readback.get("base")
    if typeof(base) != TYPE_DICTIONARY or typeof(region) != TYPE_DICTIONARY:
        return _reject("VILLAGE_SHAPE_INVALID")
    if region.get("version") != VERSION or region.get("catalogHash") != CATALOG_HASH or region.get("collisionHash") != COLLISION_HASH:
        return _reject("VILLAGE_CATALOG_PROVENANCE_INVALID")
    if region.get("worldId") != base.get("worldId") or typeof(base.get("worldId")) != TYPE_STRING:
        return _reject("VILLAGE_WORLD_ID_MISMATCH")
    var coordinate: Variant = base.get("coordinate")
    var center: Variant = region.get("center")
    if typeof(center) != TYPE_DICTIONARY or typeof(coordinate) != TYPE_DICTIONARY or center != coordinate or center.get("x") != 0 or center.get("z") != 0:
        return _reject("VILLAGE_CHUNK_MISMATCH")
    var entries: Variant = region.get("placements")
    var tiles: Variant = base.get("tiles")
    if typeof(entries) != TYPE_ARRAY or entries.size() != EXPECTED.size() or typeof(tiles) != TYPE_ARRAY or tiles.size() != 256:
        return _reject("VILLAGE_PLAN_INCOMPLETE")
    var present: Dictionary = {}
    var admitted: Array = []
    for item in entries:
        if typeof(item) != TYPE_DICTIONARY:
            return _reject("VILLAGE_PLACEMENT_INVALID")
        var id: Variant = item.get("id")
        var asset_id: Variant = item.get("assetId")
        if typeof(id) != TYPE_STRING or not EXPECTED.has(id) or present.has(id) or EXPECTED[id] != asset_id:
            return _reject("VILLAGE_IDENTITY_INVALID")
        if not _valid_integer(item.get("xMm"), -WORLD_SIZE_MM, WORLD_SIZE_MM) or not _valid_integer(item.get("zMm"), -WORLD_SIZE_MM, WORLD_SIZE_MM) or not _valid_integer(item.get("rotation"), 0, 3):
            return _reject("VILLAGE_POSITION_INVALID")
        var altitude: Variant = _confirmed_height(tiles, item.xMm, item.zMm)
        if not _valid_integer(altitude, -100000, 100000):
            return _reject("VILLAGE_HEIGHT_UNVERIFIED")
        present[id] = true
        admitted.append({"id": id, "assetId": asset_id, "xMm": int(item.xMm), "zMm": int(item.zMm), "rotation": int(item.rotation), "heightMm": int(altitude)})
    if present.size() != EXPECTED.size():
        return _reject("VILLAGE_PLAN_MISSING")
    if _last_connection == connection_id and _last_plan == admitted and get_child_count() == EXPECTED.size():
        return true
    var pending: Array[Node3D] = []
    for entry in admitted:
        var packed: PackedScene = SCENES[entry.assetId] as PackedScene
        var created: Node3D = packed.instantiate() as Node3D if packed != null else null
        if created == null:
            for candidate in pending:
                candidate.free()
            return _reject("VILLAGE_RENDER_ASSET_MISSING")
        created.name = str(entry.id).trim_prefix("aurion.starter-village.v1:").replace("-", "_")
        created.position = Vector3(float(entry.xMm) / 1000.0, float(entry.heightMm) / 1000.0, float(entry.zMm) / 1000.0)
        created.rotation_degrees.y = float(entry.rotation) * 90.0
        pending.append(created)
    clear()
    for obj in pending:
        add_child(obj)
    _last_connection = connection_id
    _last_plan = admitted.duplicate(true)
    diagnostic = "Aurion bestätigte Dorfobjekte: %d (nur visuelle Skins)" % pending.size()
    return true
