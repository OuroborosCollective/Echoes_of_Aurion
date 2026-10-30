extends SceneTree
## Real editor-marker transforms produce an untrusted draft only.
const Marker = preload("res://addons/aurion_world_bridge/world_marker.gd")
const Exporter = preload("res://addons/aurion_world_bridge/world_draft_export.gd")
var failures: Array[String] = []

func _init() -> void: call_deferred("verify")
func require(ok: bool, reason: String) -> void:
	if not ok: failures.append(reason)

func build(scene: Node) -> Dictionary:
	return Exporter.build(scene, "village.main", 2, "Test village", "a".repeat(64))

func verify() -> void:
	var scene := Node3D.new()
	root.add_child(scene)
	var marker := Marker.new()
	marker.placement_key = "barrel.one"
	marker.asset_id = "glb_test_barrel"
	marker.position = Vector3(-32.001, 4.0, 32.0)
	marker.rotation.y = 3.0 * PI / 2.0
	marker.scale = Vector3.ONE * 1.5
	scene.add_child(marker)
	var result := build(scene)
	require(result.has("draft"), "valid marker rejected")
	if result.has("draft"):
		var placement: Dictionary = result.draft.placements[0]
		require(placement.chunkX == -1 and placement.xMm == 63999 and placement.chunkZ == 1 and placement.zMm == 0, "centered chunk boundaries were exported incorrectly")
		require(placement.rotationQuarterTurns == 3 and placement.scalePermille == 1500, "rotation or scale not exported")
		require(not placement.has("yMm") and placement.size() == 8, "editor exported non-authoritative scene fields")
	marker.rotation.y = PI / 4.0
	require(build(scene).has("error"), "unsupported angle was silently snapped")
	marker.rotation.y = 0.0
	marker.scale = Vector3(1, 2, 1)
	require(build(scene).has("error"), "non-uniform scaling accepted")
	marker.transform = Transform3D(Basis(Vector3(1, 0, 0), Vector3(0, 1, 0), Vector3(0.6, 0, 0.8)), marker.position)
	require(build(scene).has("error"), "sheared equal-length axes were silently normalized")
	marker.transform = Transform3D.IDENTITY
	marker.scale = Vector3.ONE
	marker.position.x = 8193.0
	require(build(scene).has("error"), "imprecise distant coordinates accepted")
	marker.position.x = 0
	var duplicate := Marker.new()
	duplicate.placement_key = marker.placement_key
	duplicate.asset_id = marker.asset_id
	scene.add_child(duplicate)
	require(build(scene).has("error"), "duplicate placement key accepted")
	duplicate.queue_free()
	marker.asset_id = "../invalid"
	require(build(scene).has("error"), "invalid asset ID accepted")
	scene.queue_free()
	await process_frame
	if failures.is_empty(): print("GODOT_WORLD_EDITOR_DRAFT_PASS (editor fixture; no server writes)")
	else:
		for failure in failures: push_error(failure)
	quit(0 if failures.is_empty() else 1)
