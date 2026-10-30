extends SceneTree
## Offline protocol fixtures, never a production-world or authentication proof.
const Client = preload("res://addons/aurion_bridge/aurion_client.gd")
const View = preload("res://addons/aurion_bridge/world_view.gd")
const Entity2D = preload("res://addons/aurion_bridge/entity_2d.gd")
const Entity3D = preload("res://addons/aurion_bridge/entity_3d.gd")

func identity_for(tick: int) -> Dictionary:
    return {
        "schema":"aurion.godot.committed-projection.v1", "worldId":"fixture-world",
        "zoneId":"fixture-zone", "tick":tick, "sourceRevision":"1".repeat(40),
        "receiptHash":"sha256:" + "2".repeat(64), "stateHash":"sha256:" + "3".repeat(64),
        "projectionHash":"sha256:" + "4".repeat(64), "runtimeImageDigest":"UNVERIFIED",
        "streamInstance":"11111111-1111-4111-8111-111111111111",
        "coordinates":"aurion.fixed-xz-flat.v1", "fixedPointScale":1000,
    }

func _initialize() -> void:
    var client := Client.new()
    client.auto_connect = false
    client._handle({"t":"hello", "proto":1, "worldId":"fixture-world", "edit":true, "upstream":"up"})
    client._handle({"t":"snapshot", "tick":1, "seq":1, "entities":[], "regions":[], "identity":identity_for(1)})
    assert(client.has_snapshot and client.entities.is_empty(), "A confirmed empty snapshot must be valid")
    var entity := {"id":"mob_1", "kind":"monster", "pos":{"x":1.25,"y":0.0,"z":-2.0}}
    client._handle({"t":"delta", "tick":2, "seq":2, "upsert":[entity], "remove":[], "identity":identity_for(2)})
    assert(client.entities.mob_1.pos.x == 1.25)
    var marker_2d := Entity2D.new()
    marker_2d.setup(entity)
    marker_2d.set_target(Vector2(1, 2), true)
    assert(marker_2d.position == Vector2(1, 2))
    var marker_3d := Entity3D.new()
    marker_3d.setup(entity)
    marker_3d.set_target(Vector3(1, 0, -2), true)
    assert(marker_3d.position == Vector3(1, 0, -2))
    client._handle({"t":"delta", "tick":3, "seq":4, "upsert":[], "remove":[], "identity":identity_for(3)})
    assert(not client.has_snapshot and client.entities.is_empty(), "A gap must invalidate the presentation")
    client._handle({"t":"snapshot", "tick":3, "seq":4, "entities":[entity], "regions":[], "identity":identity_for(3)})
    assert(client.has_snapshot and client.edit_enabled)
    client._handle({"t":"status", "upstream":"down"})
    assert(not client.has_snapshot and not client.edit_enabled and client.entities.is_empty())
    assert(client.send_edit({"op":"entity.remove","id":"mob_1"}).is_empty())
    client._handle({"t":"status", "upstream":"up", "edit":false})
    var malformed := entity.duplicate(true)
    malformed.pos.x = "bad"
    client._handle({"t":"snapshot", "tick":4, "seq":5, "entities":[malformed], "regions":[], "identity":identity_for(4)})
    assert(not client.has_snapshot and client.entities.is_empty(), "Invalid payload cannot become a partial world")
    client.free()
    marker_2d.free()
    marker_3d.free()
    var view := View.new()
    view.free()
    print("AURION_LIVE_BRIDGE_PROTOCOL_FIXTURES_PASS")
    quit(0)
