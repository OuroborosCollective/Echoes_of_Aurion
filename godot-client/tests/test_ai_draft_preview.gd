extends "res://tests/test_world_design_projection.gd"
## Real Godot/GLB rendering with synthetic DTOs; never production evidence.
const Preview = preload("res://authoring/ai_draft_preview.gd")
const State = preload("res://authoring/world_authoring_state.gd")
func verify() -> void:
	var preview := Preview.new()
	root.add_child(preview)
	var confirmed: Node3D = load("res://world/world_design_projection.gd").new()
	root.add_child(confirmed)
	var d: Dictionary = design().designs[0].duplicate(true)
	d.erase("designHash")
	d.schemaVersion = "aurion.world-design.v1"
	var bytes := small_glb(123)
	var sha := digest(bytes)
	var asset: Dictionary = catalog().entries[0].duplicate(true)
	asset.sha256 = sha
	asset.storageUrl = "/api/assets/glb/" + sha + ".glb"
	asset.normalization.sourceSha256 = sha
	require(not preview.bind_confirmed(design(), catalog(), SESSION), "preview accepted live readback")
	require(not preview.accept_surface(surface(), SESSION, Vector2i.ZERO), "preview accepted live terrain")
	require(preview.stage(d, {asset.assetId:asset}, "a".repeat(64), SESSION), "valid draft not staged")
	require(preview._design.is_empty(), "preview manufactured confirmed world")
	require(preview.supply_asset(sha, bytes, SESSION), "hash-checked real GLB rejected")
	require(preview.get_child_count() == 1, "actual preview model missing")
	require(preview.get_child(0).get_meta("aurion_status") == "PREVIEW_ONLY", "draft model unlabelled")
	require(preview.get_child(0).position.y == 0.0, "preview claimed terrain height")
	require(confirmed.get_child_count() == 0 and confirmed._design.is_empty(), "draft altered confirmed projection")
	var bad := d.duplicate(true)
	bad.placements[0].assetId = "glb_unknown"
	require(not preview.stage(bad, {asset.assetId:asset}, "a".repeat(64), SESSION), "unknown asset accepted")
	require(preview.get_child_count() == 0, "stale preview survived rejection")
	require(not preview.stage(d, {asset.assetId:asset}, "b".repeat(64), SESSION), "stale catalog accepted")
	preview.free()
	confirmed.free()
	if not failures.is_empty():
		for failure in failures: push_error(failure)
		quit(1)
	else:
		print("AI_DRAFT_PREVIEW_PASS_ISOLATED_REAL_GODOT")
		quit(0)
