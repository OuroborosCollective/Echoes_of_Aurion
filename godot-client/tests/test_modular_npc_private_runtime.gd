extends SceneTree
## Optional owner-local MCS 1.0 runtime acceptance test.
## Purchased add-on must exist. Missing assets FAIL CLOSED instead of passing fallback.
## Only synthetic NPC IDs; never a live Aurion gameplay/placement receipt.
const Visual = preload("res://actors/modular_npc_visual.gd")
const NPC_IDS := ["npc:smith", "npc:merchant", "npc:guard_01", "npc:farmer_01",
    "npc:farmer_02", "npc:ranger_01", "npc:artisan", "npc:innkeeper"]
var failures: Array[String] = []

func require(ok: bool, message: String) -> void:
    if not ok:
        failures.append(message)

func _init() -> void:
    call_deferred("verify")

func verify() -> void:
    if not Visual.available():
        push_error("PRIVATE_MCS_ADDON_REQUIRED: stage the purchased 1.0 archive privately")
        quit(2)
        return
    var host := Node3D.new()
    root.add_child(host)
    var models := {}
    var mesh_count := 0
    var checked := 0
    for id in NPC_IDS:
        var appearance: Dictionary = Visual.recipe(id)
        models[appearance.get("model", "missing")] = true
        var actor: Node3D = Visual.create(id, "Isolated fixture " + id)
        require(actor != null, "private MCS 1.0 avatar did not instantiate: " + id)
        if actor == null:
            continue
        host.add_child(actor)
        await process_frame
        require(actor.is_node_ready(), "model did not enter scene tree: " + id)
        require(actor.has_method("is_character_valid") and bool(actor.call("is_character_valid")),
            "rig invalid: " + id)
        var meshes := actor.find_children("*", "MeshInstance3D", true, false)
        var skeletons := actor.find_children("*", "Skeleton3D", true, false)
        var players := actor.find_children("*", "AnimationPlayer", true, false)
        require(meshes.size() > 0 and skeletons.size() == 1 and players.size() == 1,
            "incomplete mesh/skeleton/player hierarchy: " + id)
        require(actor.has_method("play_animation") and bool(actor.call("play_animation", &"Idle", 0.0)),
            "MCS Idle is not playable: " + id)
        require(actor.call("get_current_animation") == &"Idle", "Idle state did not persist: " + id)
        require(actor.get_meta("aurion_visual_system", "") == "private-mcs-1.0",
            "vendor adapter provenance lost: " + id)
        mesh_count += meshes.size()
        checked += 1
    require(checked == NPC_IDS.size(), "not every fixture generated a character")
    require(models.has("male") and models.has("female"), "both bundled body variants not exercised")
    require(mesh_count > NPC_IDS.size(), "expected actual layered models and clothing meshes")
    host.queue_free()
    await process_frame
    if failures.is_empty():
        print("AURION_PRIVATE_MCS_1_0_RIG_PASS count=%d meshes=%d" % [checked, mesh_count])
        quit(0)
    else:
        for failure in failures:
            push_error(failure)
        quit(1)
