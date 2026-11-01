extends SceneTree
## Offline protocol fixtures, never a production-world or authentication proof.
const EditorPluginBridge = preload("res://addons/aurion_bridge/plugin.gd")
const Client = preload("res://addons/aurion_bridge/aurion_client.gd")
const View = preload("res://addons/aurion_bridge/world_view.gd")
const Entity2D = preload("res://addons/aurion_bridge/entity_2d.gd")
const Entity3D = preload("res://addons/aurion_bridge/entity_3d.gd")

func identity_for(tick: int, payload_hash: String) -> Dictionary:
    return {
        "schema":"aurion.godot.committed-projection.v1", "worldId":"fixture-world",
        "zoneId":"fixture-zone", "tick":tick, "sourceRevision":"1".repeat(40),
        "receiptHash":"sha256:" + "2".repeat(64), "stateHash":"sha256:" + "3".repeat(64),
        "projectionHash":payload_hash, "runtimeImageDigest":"UNVERIFIED",
        "streamInstance":"11111111-1111-4111-8111-111111111111",
        "coordinates":"aurion.fixed-xz-flat.v1", "fixedPointScale":1000,
    }

func _initialize() -> void:
    # Editor-only protected credential gate. These are synthetic strings, not credentials.
    var protected_path := "/run/credentials/serverin-aurion-godot-editor.service/aurion-editor"
    assert(EditorPluginBridge.protected_editor_autoconnect_allowed(protected_path, "x".repeat(32)))
    assert(not EditorPluginBridge.protected_editor_autoconnect_allowed("", "x".repeat(32)))
    assert(not EditorPluginBridge.protected_editor_autoconnect_allowed("/tmp/aurion-editor", "x".repeat(32)))
    assert(not EditorPluginBridge.protected_editor_autoconnect_allowed(protected_path, "too-short"))
    var client := Client.new()
    client.auto_connect = false
    client._handle({"t":"hello", "proto":1, "worldId":"fixture-world", "edit":true, "upstream":"up"})
    client._handle({"t":"snapshot", "tick":1, "seq":1, "entities":[], "regions":[], "identity":identity_for(1, "sha256:9ccc31807d178cd5875db52ff520f29e4898c9f844754d16f4b73c9be2ae9756")})
    assert(client.has_snapshot and client.entities.is_empty(), "A confirmed empty snapshot must be valid")
    var entity := {"id":"mob_1", "kind":"monster", "pos":{"x":1.25,"y":0.0,"z":-2.0}}
    client._handle({"t":"delta", "tick":2, "seq":2, "upsert":[entity], "remove":[], "identity":identity_for(2, "sha256:21ea444e698e9ee2f6c334c8214ea7bf45c91d26f2b9303a06cdf120b6f5ae99")})
    assert(client.entities.mob_1.pos.x == 1.25)
    var marker_2d := Entity2D.new()
    marker_2d.setup(entity)
    marker_2d.set_target(Vector2(1, 2), true)
    assert(marker_2d.position == Vector2(1, 2))
    var marker_3d := Entity3D.new()
    marker_3d.setup(entity)
    marker_3d.set_target(Vector3(1, 0, -2), true)
    assert(marker_3d.position == Vector3(1, 0, -2))
    client._handle({"t":"delta", "tick":3, "seq":4, "upsert":[], "remove":[], "identity":identity_for(3, "sha256:59d176c437d76fca78a04bc16580d79aeb3f13d660d01823dbb429d3811fa58f")})
    assert(not client.has_snapshot and client.entities.is_empty(), "A gap must invalidate the presentation")
    client._handle({"t":"snapshot", "tick":3, "seq":4, "entities":[entity], "regions":[], "identity":identity_for(3, "sha256:59d176c437d76fca78a04bc16580d79aeb3f13d660d01823dbb429d3811fa58f")})
    assert(client.has_snapshot and client.edit_enabled)
    client._handle({"t":"status", "upstream":"down"})
    assert(not client.has_snapshot and not client.edit_enabled and client.entities.is_empty())
    assert(client.send_edit({"op":"entity.remove","id":"mob_1"}).is_empty())
    client._handle({"t":"status", "upstream":"up", "edit":false})
    var malformed := entity.duplicate(true)
    malformed.pos.x = "bad"
    client._handle({"t":"snapshot", "tick":4, "seq":5, "entities":[malformed], "regions":[], "identity":identity_for(4, "sha256:e488615836f2f23553fc35ec880841e53cefed1820904fc6258ea27a0cdadfd6")})
    assert(not client.has_snapshot and client.entities.is_empty(), "Invalid payload cannot become a partial world")
    client.free()
    client = Client.new()
    client.auto_connect = false
    client._handle({"t":"hello", "proto":1, "worldId":"fixture-world", "edit":false, "upstream":"up"})
    var tampered := entity.duplicate(true)
    tampered.pos.x = 999.0
    client._handle({"t":"snapshot", "tick":4, "seq":1, "entities":[tampered], "regions":[], "identity":identity_for(4, "sha256:e488615836f2f23553fc35ec880841e53cefed1820904fc6258ea27a0cdadfd6")})
    assert(not client.has_snapshot, "A well-shaped hash cannot authenticate altered payload")
    client._handle({"t":"hello", "proto":1, "worldId":"fixture-world", "edit":false, "upstream":"up"})
    client._handle({"t":"snapshot", "tick":4, "seq":1, "entities":[entity], "regions":[], "identity":identity_for(4, "sha256:e488615836f2f23553fc35ec880841e53cefed1820904fc6258ea27a0cdadfd6")})
    assert(client.has_snapshot)
    client._handle({"t":"delta", "tick":5, "seq":2, "upsert":[tampered], "remove":[], "identity":identity_for(5, "sha256:59c9f420a8a7e7628f341da67f7ed546e9b92068773b0e7d71e4cc4dd82ee45b")})
    assert(not client.has_snapshot, "Tampered delta cannot mutate the accepted projection")
    client.free()
    marker_2d.free()
    marker_3d.free()
    var view := View.new()
    view.free()
    print("AURION_LIVE_BRIDGE_PROTOCOL_FIXTURES_PASS")
    quit(0)

