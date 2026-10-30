extends SceneTree
## Render the actual main scene's native studio with synthetic authoring data.

class FakeApi:
	extends Node
	func busy() -> bool: return false

func _init() -> void:
	call_deferred("capture")

func capture() -> void:
	if DisplayServer.get_name() == "headless":
		push_error("World studio capture requires a display backend")
		quit(1)
		return
	var output := OS.get_environment("AURION_CAPTURE_DIR")
	if output.is_empty():
		push_error("AURION_CAPTURE_DIR is required")
		quit(1)
		return
	DirAccess.make_dir_recursive_absolute(output)
	var scene: Control = (load("res://app/main.tscn") as PackedScene).instantiate()
	root.add_child(scene)
	await process_frame
	scene.set_process(false)
	var studio: Control = scene._world_studio
	var api := FakeApi.new()
	studio.add_child(api)
	studio._api = api
	studio.visible = true
	studio._catalog_info.text = "TESTDATEN · kein Live-Server · Katalog: 1 Weltasset"
	var draft := {"schemaVersion":"aurion.world-design.v1", "designKey":"test-village", "version":1,
		"title":"Testdorf", "expectedCatalogRevision":"a".repeat(64), "placements":[{
			"placementKey":"barrel-one", "assetId":"glb_test_barrel", "chunkX":0, "chunkZ":0,
			"xMm":32000, "zMm":32000, "rotationQuarterTurns":0, "scalePermille":1000}]}
	studio._draft.text = JSON.stringify(draft, "\t")
	draft = JSON.parse_string(studio._draft.text)
	var plan := draft.duplicate(true)
	plan["planHash"] = "d".repeat(64)
	plan["operationId"] = "1".repeat(32)
	plan["expectedPreviousHash"] = null
	plan["referencedAssetHashes"] = ["b".repeat(64)]
	plan["requiresHumanConfirmation"] = true
	if not studio._state.open("zone_peer_capture_fixture", 1, 42) or not studio._state.begin_plan(draft, plan.operationId) or not studio._state.accept_plan(plan, draft):
		push_error("Synthetic world studio plan was rejected")
		quit(1)
		return
	studio._info.text = studio._state.message
	for viewport_size in [Vector2i(1340, 800), Vector2i(360, 640)]:
		root.size = viewport_size
		DisplayServer.window_set_size(viewport_size)
		await process_frame
		await process_frame
		await RenderingServer.frame_post_draw
		if not save_image(output, "studio", viewport_size):
			quit(1)
			return
		studio._request_confirmation()
		await process_frame
		await process_frame
		await RenderingServer.frame_post_draw
		if not studio._confirm.visible or not save_image(output, "confirmation", viewport_size):
			quit(1)
			return
		studio._confirm.hide()
	print("Rendered native world studio with synthetic data; no live apply")
	quit(0)

func save_image(output: String, kind: String, size: Vector2i) -> bool:
	var image := root.get_texture().get_image()
	if image.is_empty() or image.save_png(output.path_join("world-%s-%dx%d.png" % [kind, size.x, size.y])) != OK:
		push_error("Native world studio capture failed")
		return false
	return true
