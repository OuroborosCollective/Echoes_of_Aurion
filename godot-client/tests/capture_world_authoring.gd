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
	if not await capture_quest_editor(scene, studio, output):
		quit(1)
		return
	print("Rendered native world studio with synthetic data; no live apply")
	quit(0)

func capture_quest_editor(scene: Control, studio: Control, output: String) -> bool:
	var editor: Control = studio.quest_editor()
	editor.visible = true
	editor.open_context("zone_peer_capture_fixture", 1, 42, func(_kind: String, _payload: Dictionary = {}): return false)
	var template := {"templateId":"quest.capture-fixture", "version":1, "title":"TESTDATEN · Vorräte für das Dorf", "description":"Synthetischer Graph, kein Live-Publish",
		"roles":[], "prerequisiteFacts":[], "nodes":[{"id":"start", "type":"start", "title":"Auftrag erhalten"}, {"id":"end", "type":"end", "title":"Vorräte bestätigt"}],
		"edges":[{"id":"finish", "fromNodeId":"start", "toNodeId":"end", "priority":0}], "outcomes":[],
		"maxCompositionDepth":10, "active":true, "quarantined":false}
	editor.completed("questTemplates", {"templates":[template]})
	if not editor.copy_template(0): return false
	editor.set_activation(true)
	var draft_value: Dictionary = editor.current_draft()
	var proposal := {"id":"prop_capture_fixture_v2", "authorUserId":42, "templateId":draft_value.templateId, "templateVersion":draft_value.version,
		"proposedDataJson":JSON.stringify(draft_value), "receiptHash":"c".repeat(64), "expectedTemplateSetHash":"a".repeat(64), "status":"draft"}
	var plan := {"schemaVersion":"aurion.authoring.v1", "proposalId":proposal.id, "proposalReceiptHash":proposal.receiptHash,
		"expectedTemplateSetHash":proposal.expectedTemplateSetHash, "template":draft_value, "templateHash":"e".repeat(64), "planHash":"b".repeat(64), "requiresHumanConfirmation":true}
	if editor._state.begin_proposal(draft_value).is_empty() or not editor._state.accept_proposal(proposal): return false
	if editor._state.begin_plan().is_empty() or not editor._state.accept_plan(plan, draft_value): return false
	var watermark := Label.new()
	watermark.text = "TESTDATEN · native Godot-Oberfläche · kein Live-Effekt"
	watermark.add_theme_color_override("font_color", Color.YELLOW)
	watermark.position = Vector2(8, 2)
	watermark.z_index = 100
	scene.add_child(watermark)
	var scroll: ScrollContainer = editor.get_parent().get_parent()
	for viewport_size in [Vector2i(1340, 800), Vector2i(360, 640)]:
		root.size = viewport_size
		DisplayServer.window_set_size(viewport_size)
		await process_frame
		await process_frame
		scroll.ensure_control_visible(editor._graph)
		await process_frame
		await RenderingServer.frame_post_draw
		if not save_image(output, "quest-graph", viewport_size): return false
		editor.request_confirmation()
		await process_frame
		await process_frame
		await RenderingServer.frame_post_draw
		if not editor._confirm.visible or not save_image(output, "quest-confirmation", viewport_size): return false
		editor._confirm.hide()
	return true

func save_image(output: String, kind: String, size: Vector2i) -> bool:
	var image := root.get_texture().get_image()
	if image.is_empty() or image.save_png(output.path_join("world-%s-%dx%d.png" % [kind, size.x, size.y])) != OK:
		push_error("Native world studio capture failed")
		return false
	return true
