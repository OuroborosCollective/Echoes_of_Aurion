extends SceneTree
## Real llvmpipe framebuffer, synthetically shaped and explicitly NON-live zone data.
## No production WorldLease, tablet frames, or signed APK are claimed here.
const Codec = preload("res://net/zone_codec.gd")
const SESSION := "zone_peer_starter_village_12345"
const SAMPLE_STEP := 12
var failures: Array[String] = []
func _init() -> void:
    call_deferred("verify")
func require(ok: bool, message: String) -> void:
    if not ok:
        failures.append(message)

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


func take_frame(viewport: SubViewport) -> Image:
    for index in range(6):
        await process_frame
    await RenderingServer.frame_post_draw
    return viewport.get_texture().get_image()

func measure(before: Image, after: Image) -> Dictionary:
    var sampled := 0
    var changed := 0
    var lit := 0
    var palette: Dictionary = {}
    for y in range(0, after.get_height(), SAMPLE_STEP):
        for x in range(0, after.get_width(), SAMPLE_STEP):
            var a: Color = before.get_pixel(x, y)
            var b: Color = after.get_pixel(x, y)
            sampled += 1
            if absf(a.r - b.r) + absf(a.g - b.g) + absf(a.b - b.b) > 0.16:
                changed += 1
            if b.r + b.g + b.b > 0.40:
                lit += 1
            palette["%d:%d:%d" % [roundi(b.r * 6.0), roundi(b.g * 6.0), roundi(b.b * 6.0)]] = true
    return {"sampled":sampled, "changed":changed, "lit":lit, "colors":palette.size()}

func verify() -> void:
    if DisplayServer.get_name() == "headless":
        push_error("G19 requires real display with Mesa, not headless")
        quit(1)
        return
    var outdir: String = OS.get_environment("AURION_VILLAGE_CAPTURE_DIR")
    if outdir.is_empty():
        push_error("G19 capture destination absent")
        quit(1)
        return
    DirAccess.make_dir_recursive_absolute(outdir)
    var packed := load("res://app/main.tscn") as PackedScene
    require(packed != null, "G19 live 3D scene absent")
    if packed == null:
        finish(null)
        return
    root.size = Vector2i(960, 600)
    DisplayServer.window_set_size(root.size)
    var scene: Control = packed.instantiate()
    root.add_child(scene)
    var admitted := welcome()
    scene._on_zone_welcome(admitted)
    require(scene._confirmed_zone.has_state(), "G19 fixture v5 welcome rejected")
    if not scene._confirmed_zone.has_state():
        finish(scene)
        return
    scene._show_3d()
    var viewport := scene.get_node("WorldView/Live3D") as SubViewport
    var camera := scene.get_node("WorldView/Live3D/World/WorldCamera") as Camera3D
    var village := scene.get_node_or_null("WorldView/Live3D/World/StarterVillageVisuals") as Node3D
    require(village != null, "G19 active main scene has no village projection")
    if village == null:
        finish(scene)
        return
    # Tight shot makes the real prefab occupy enough measurable frame area;
    # the 6.7% pixel-difference threshold is deliberately not relaxed.
    camera.position = Vector3(29.0, 7.5, -13.0)
    camera.look_at(Vector3(22.0, 2.0, -22.0), Vector3.UP)
    require(scene._apply_chunk_surface(chunk(), admitted.connectionId), "G19 G18 base chunk unavailable")
    var before: Image = await take_frame(viewport)
    require(not before.is_empty(), "G19 baseline framebuffer missing")
    if before.is_empty():
        finish(scene)
        return
    require(before.save_png(outdir.path_join("village-before-server-visuals.png")) == OK, "G19 baseline save error")
    var decorated := chunk()
    decorated["starterVillageVisuals"] = plan()
    require(scene._apply_chunk_surface(decorated, admitted.connectionId), "G19 confirmed read model rejected")
    require(village.get_child_count() == 10, "G19 canonical ten objects not projected")
    var after: Image = await take_frame(viewport)
    require(not after.is_empty() and after.get_size() == before.get_size(), "G19 confirmed framebuffer missing")
    if not after.is_empty() and after.get_size() == before.get_size():
        require(after.save_png(outdir.path_join("village-after-confirmed-visuals.png")) == OK, "G19 confirmed image save error")
        var evidence := measure(before, after)
        print("G19_VILLAGE_PIXELS sampled=%d changed=%d lit=%d colors=%d" % [evidence.sampled, evidence.changed, evidence.lit, evidence.colors])
        require(evidence.changed >= maxi(30, int(evidence.sampled / 15)), "G19 3D real models not visibly projected")
        require(evidence.lit >= maxi(30, int(evidence.sampled / 10)), "G19 dark framebuffer")
        require(evidence.colors >= 4, "G19 3D village lacks visible color variations")
    scene._on_zone_closed("client_close")
    require(village.get_child_count() == 0, "G19 logout left orphan village visuals")
    finish(scene)

func finish(scene: Control) -> void:
    if scene != null:
        scene.queue_free()
        await process_frame
    for reason in failures:
        push_error(reason)
    if failures.is_empty():
        print("G19_VILLAGE_REAL_SOFTWARE_PIXELS_PASS (synthetic visual fixture, not Tab A9)")
    quit(0 if failures.is_empty() else 1)