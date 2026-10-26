extends SceneTree
## Explicit synthetic protocol fixture. Proves real native scene binding,
## not a production DB/WorldLease readback or an installed Android APK.
const Codec = preload("res://net/zone_codec.gd")
var failures: Array[String] = []
const SESSION := "zone_peer_starter_village_12345"

func require(ok: bool, message: String) -> void:
    if not ok:
        failures.append(message)

func _init() -> void:
    call_deferred("verify")

func welcome() -> Dictionary:
    var nodes: Array = []
    for id in Codec.NODE_IDS:
        nodes.append({"nodeId":id,"remaining":5,"depleted":false,"respawnAtTick":null})
    return {"type":"welcome","protocolVersion":5,"zoneId":"observatory_threshold",
        "connectionId":SESSION,"selfEntityId":"player:1","snapshotSeq":1,"tick":1,
        "presences":[{"entityId":"player:1","userId":1,"position":{"x":0,"z":0},"lastAcceptedClientSeq":0}],
        "mobs":[],"combatants":[],"resources":{"contractVersion":1,
        "contentSourceRevision":Codec.FIXED_CONTENT,"revision":1,"nodes":nodes}}

func chunk() -> Dictionary:
    var tiles: Array = []
    for z in range(16):
        for x in range(16):
            tiles.append({"x":x,"z":z,"heightMm":1250,"surface":"ruin_path" if x < 4 else "grass"})
    return {"base":{"worldId":"echoes-of-aurion-global","worldSeedDigest":"fnv1a-1234abcd",
        "worldGenerationRevision":"a".repeat(40),"ruleSetVersion":"aurion-world-chunk.v1",
        "coordinate":{"x":0,"z":0},"baseRevision":1,"biome":"plains","tiles":tiles,
        "deterministicHash":"fnv1a-abcdef01"},"appliedDeltaIds":[],
        "visibleResources":[],"structures":[],"roads":[],"deterministicHash":"fnv1a-2345bcde"}

func plan() -> Dictionary:
    var entries: Array = [
        ["gate-north","city-fencewooddoor-gate",0,-30000,0],
        ["gate-east","city-fencewooddoor-gate",30000,0,1],
        ["gate-south","city-fencewooddoor-gate",0,30000,0],
        ["gate-west","city-fencewooddoor-gate",-30000,0,1],
        ["pilot-wall-nw","city-wall-stone01",-9000,-30000,1],
        ["pilot-wall-ne","city-wall-stone02",9000,-30000,1],
        ["market-nw","city-market03",-22000,-22000,0],
        ["hut-ne","city-stylized-hut01",22000,-22000,3],
        ["hut-se","city-stylized-hut02",22000,22000,2],
        ["hut-sw","city-stylized-hut01",-22000,22000,1],
    ]
    var placements: Array = []
    for item in entries:
        placements.append({"id":"aurion.starter-village.v1:starter-village-"+item[0],
            "assetId":item[1],"xMm":item[2],"zMm":item[3],"rotation":item[4]})
    return {"version":"aurion.starter-village-visuals.v1",
        "catalogHash":"94de6cf4ff05f0ccc93c9471f077972b09def8e21c42e3720215017ab7939c4f",
        "collisionHash":"ba350a340de4cac8a1326af7c9d02c8704bf4fff01b0d600347cf9b4c8bb2580",
        "worldId":"echoes-of-aurion-global","center":{"x":0,"z":0},"placements":placements}

func verify() -> void:
    var scene: Control = load("res://app/main.tscn").instantiate()
    root.add_child(scene)
    var village: Node3D = scene.get_node_or_null("WorldView/Live3D/World/StarterVillageVisuals") as Node3D
    require(village != null, "G19 starter-village visual root missing in actual main scene")
    if village == null:
        scene.queue_free()
        finish()
        return
    require(village.get_child_count() == 0, "unconfirmed village was rendered offline")
    var admitted := welcome()
    require(Codec.is_valid_welcome(admitted), "test v5 welcome invalid")
    scene._on_zone_welcome(admitted)
    require(scene._confirmed_zone.has_state(), "admitted test welcome rejected")
    var base := chunk()
    require(scene._apply_chunk_surface(base, SESSION), "G18 terrain-only readback refused")
    require(village.get_child_count() == 0, "terrain-only readback fabricated village")
    var decorated := base.duplicate(true)
    decorated["starterVillageVisuals"] = plan()
    require(scene._apply_chunk_surface(decorated, SESSION), "confirmed readback with server visual plan rejected")
    require(village.get_child_count() == 10, "server-confirmed ten canonical village anchors not projected")
    var market: Node3D = village.get_node_or_null("starter_village_market_nw") as Node3D
    var house: Node3D = village.get_node_or_null("starter_village_hut_ne") as Node3D
    require(market != null and house != null, "actual CC0 market or house prefab absent")
    if market != null:
        require(market.position == Vector3(-22, 1.25, -22), "world mm position or DB height binding lost")
        require(market.get_child_count() >= 2, "market is not an actual composed scene")
    if house != null:
        require(house.position == Vector3(22, 1.25, -22), "canonical hut position or server height lost")
        require(house.get_child_count() >= 5, "house prefab failed to instance real GLBs")
    var original: Node3D = village.get_child(0) as Node3D if village.get_child_count() > 0 else null
    require(scene._apply_chunk_surface(decorated, SESSION), "identical authenticated projection replay refused")
    require(village.get_child_count() == 10 and village.get_child(0) == original, "replay duplicated village scene")
    require(not scene._apply_chunk_surface(decorated, "foreign-session"), "foreign session allowed to change active scene")
    require(village.get_child_count() == 10, "foreign session evicted valid current visual plan")
    var forged := decorated.duplicate(true)
    forged.starterVillageVisuals.catalogHash = "0".repeat(64)
    require(scene._apply_chunk_surface(forged, SESSION), "valid terrain was discarded with bad optional visuals")
    require(village.get_child_count() == 0, "wrong catalogue hash retained stale village visuals")
    require(scene._apply_chunk_surface(decorated, SESSION), "valid plan cannot recover after stale failure")
    var duplicate := decorated.duplicate(true)
    duplicate.starterVillageVisuals.placements[0] = duplicate.starterVillageVisuals.placements[1]
    require(scene._apply_chunk_surface(duplicate, SESSION), "valid terrain refused duplicate visual plan")
    require(village.get_child_count() == 0, "duplicate server asset identity was accepted")
    require(scene._apply_chunk_surface(decorated, SESSION) and village.get_child_count() == 10, "could not restore after invalid visual plan")
    scene._on_zone_closed("client_close")
    require(village.get_child_count() == 0, "logout kept unconfirmed village objects")
    require(scene.get_node("WorldView/Live3D/World/UnassignedFloor").visible, "logout failed to restore neutral floor")
    scene.queue_free()
    await process_frame
    finish()

func finish() -> void:
    for item in failures:
        push_error(item)
    if failures.is_empty():
        print("G19_STARTER_VILLAGE_REAL_SCENE_BINDING_PASS (synthetic confirmed readback only)")
    quit(0 if failures.is_empty() else 1)