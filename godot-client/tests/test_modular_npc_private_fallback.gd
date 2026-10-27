extends SceneTree
## Synthetic lifecycle failure with the actual private MCS rig and audited GLB.
## This does not establish live NPC state or Android behavior.
const Registry = preload("res://actors/quest_npc_registry.gd")
const Visual = preload("res://actors/modular_npc_visual.gd")
const SHA := "2f447361e6ba5e6e38d8b38c19b78773a0d62fcf80e771d34f3d94a0e64765cc"
var sabotaged := false

func _init() -> void:
	call_deferred("verify")

func on_model_entered(child: Node) -> void:
	if not sabotaged and child.get_meta("aurion_visual_system", "") == "private-mcs-1.0":
		var players := child.find_children("*", "AnimationPlayer", true, false)
		if players.size() == 1:
			sabotaged = true
			players[0].get_parent().remove_child(players[0])
			players[0].free()

func on_actor_entered(child: Node) -> void:
	if child.name == "QuestNPC_farmer":
		child.child_entered_tree.connect(on_model_entered)

func verify() -> void:
	if not Visual.available():
		push_error("PRIVATE_MCS_ADDON_REQUIRED")
		quit(2)
		return
	var scene := Node3D.new()
	root.add_child(scene)
	scene.child_entered_tree.connect(on_actor_entered)
	var id := "glb_" + SHA.substr(0, 48)
	var manifest := {"schemaVersion": "aurion.godot-prepared-assets.v1", "outputMode": "byte-exact-compatible-copy", "sourceRevision": "a".repeat(40), "sources": [{"assetId": id, "role": "character", "sha256": SHA, "sourceSha256": SHA, "outputSha256": SHA, "path": "godot-client/assets/generated/" + id + ".glb"}]}
	var row := {"npcId": "smith", "entityId": "npc:smith", "displayName": "fixture", "position": {"x": 0, "z": 0}, "model": {"source": "audited-standard", "catalogAssetId": id, "sha256": SHA}}
	var second := row.duplicate(true)
	second.npcId = "farmer"
	second.entityId = "npc:farmer"
	var response := {"version": "aurion.quest-npc-visuals.v1", "zoneId": "observatory_threshold", "stateSource": "aurion-canonical-quest-anchors", "catalogRevision": "a".repeat(64), "npcs": [row, second]}
	var registry = Registry.new()
	var ok: bool = registry.apply(scene, response, manifest)
	var actor := scene.get_node_or_null("QuestNPC_farmer") as Node3D
	var first := scene.get_node_or_null("QuestNPC_smith") as Node3D
	var valid := sabotaged and ok and registry.visible_count() == 2 and actor != null and first != null
	if valid:
		var players := actor.find_children("*", "AnimationPlayer", true, false)
		valid = first.visible and first.get_meta("aurion_visual_source", "") == "private-mcs-1.0" and actor.get_meta("aurion_visual_source", "") == "catalog-glb" and not actor.find_children("*", "MeshInstance3D", true, false).is_empty() and players.size() == 1
		if valid:
			valid = players[0].current_animation == "Idle"
	scene.queue_free()
	if not valid:
		push_error("PRIVATE_MCS_LATE_RIG_FALLBACK_FAILED: " + registry.diagnostic)
		quit(1)
		return
	print("PRIVATE_MCS_LATE_RIG_FALLBACK_PASS")
	quit(0)
