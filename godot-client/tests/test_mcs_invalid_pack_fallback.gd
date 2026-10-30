extends SceneTree
## Synthetic confirmed NPC rows, real imported catalog GLB, no live-world claim.
const Registry = preload("res://actors/quest_npc_registry.gd")
const Visual = preload("res://actors/modular_npc_visual.gd")
const SHA := "2f447361e6ba5e6e38d8b38c19b78773a0d62fcf80e771d34f3d94a0e64765cc"

func _init() -> void:
	call_deferred("verify")

func verify() -> void:
	if Visual.available():
		push_error("INVALID_MCS_PACK_ACCEPTED")
		quit(1)
		return
	var host := Node3D.new()
	root.add_child(host)
	var asset_id := "glb_" + SHA.substr(0, 48)
	var manifest := {"schemaVersion": "aurion.godot-prepared-assets.v1", "outputMode": "byte-exact-compatible-copy", "sourceRevision": "a".repeat(40), "sources": [{"assetId": asset_id, "role": "character", "sha256": SHA, "sourceSha256": SHA, "outputSha256": SHA, "path": "godot-client/assets/generated/" + asset_id + ".glb"}]}
	var row := {"npcId": "smith", "entityId": "npc:smith", "displayName": "fixture", "position": {"x": 0, "z": 0}, "model": {"source": "audited-standard", "catalogAssetId": asset_id, "sha256": SHA}}
	var other := row.duplicate(true)
	other.npcId = "farmer"
	other.entityId = "npc:farmer"
	var response := {"version": "aurion.quest-npc-visuals.v1", "zoneId": "observatory_threshold", "stateSource": "aurion-canonical-quest-anchors", "catalogRevision": "a".repeat(64), "npcs": [row, other]}
	var registry = Registry.new()
	var valid: bool = registry.apply(host, response, manifest) and registry.visible_count() == 2
	for actor in host.get_children():
		var clips := actor.find_children("*", "AnimationPlayer", true, false)
		valid = valid and actor.visible and actor.get_meta("aurion_visual_source", "") == "catalog-glb" and not actor.find_children("*", "MeshInstance3D", true, false).is_empty() and clips.size() == 1
		if clips.size() == 1:
			valid = valid and clips[0].current_animation == "Idle"
	host.queue_free()
	if not valid:
		push_error("INVALID_MCS_PACK_GLB_FALLBACK_FAILED")
		quit(1)
		return
	print("INVALID_MCS_PACK_GLB_FALLBACK_PASS")
	quit(0)
