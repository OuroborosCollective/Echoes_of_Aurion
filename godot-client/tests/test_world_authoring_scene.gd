extends "res://tests/test_world_design_scene.gd"
## Actual main scene and fake transport; no server or production mutation.
const Journal = preload("res://authoring/world_authoring_journal.gd")

class FakeAuthoringApi:
	extends Node
	var sent: Array[Dictionary] = []
	var start_ok := true
	var in_flight := false
	var on_refuse: Callable
	func busy() -> bool: return in_flight
	func cancel() -> void: pass
	func request(kind: String, _server: String, _connection: String, payload: Dictionary = {}, _allow_local: bool = false) -> bool:
		if not start_ok:
			if on_refuse.is_valid(): on_refuse.call()
			return false
		sent.append({"kind":kind,"payload":payload.duplicate(true)})
		return true

func draft() -> Dictionary:
	var d: Dictionary = design().designs[0].duplicate(true)
	d.erase("designHash")
	d["schemaVersion"] = "aurion.world-design.v1"
	return d

func verified_plan(d: Dictionary, operation_id: String) -> Dictionary:
	var p: Dictionary = JSON.parse_string(JSON.stringify(d))
	p["planHash"] = "d".repeat(64)
	p["requiresHumanConfirmation"] = true
	p["referencedAssetHashes"] = [SHA]
	p["expectedPreviousHash"] = null
	p["operationId"] = operation_id
	return p

func receipt_response() -> Dictionary:
	return {"receipt":{"schemaVersion":"aurion.authoring-receipt.v1", "receiptId":"authoring:world:" + "f".repeat(24),
		"kind":"world", "action":"apply", "targetId":"test-village:v1", "actorUserId":42,
		"planHash":"d".repeat(64), "previousHash":null, "resultHash":"b".repeat(64),
		"receiptHash":"f".repeat(64), "humanConfirmed":true}, "readback":design()}

func verify() -> void:
	var scene: Control = load("res://app/main.tscn").instantiate()
	root.add_child(scene)
	await process_frame
	scene.set_process(false)
	scene._mobile_hud_enabled = true
	scene._on_zone_welcome(welcome())
	scene._zone_socket.set_process(false)
	scene._zone_socket._state = "connected"
	scene._show_3d()
	var tokens := {"version":"aurion.native-auth.v1", "tokenType":"Bearer", "accessToken":"a".repeat(43),
		"refreshToken":"r".repeat(43), "accessExpiresInSeconds":900,
		"refreshIdleExpiresInSeconds":604800, "refreshAbsoluteRemainingSeconds":2592000}
	require(scene._auth_start._tokens.accept_token_response(tokens, Time.get_ticks_msec()), "fixture auth failed")
	var generation: int = scene._auth_start.session_generation()
	require(scene._apply_chunk_surface(surface(), SESSION), "fixture surface rejected")
	scene._monster_catalog = catalog()
	var studio: Control = scene._world_studio
	var journal_path := "user://aurion-test-scene-%d.json" % Time.get_ticks_usec()
	studio._journal = Journal.new(journal_path)
	studio.configure(scene._auth_start, "http://127.0.0.1:3000", SESSION, true)
	studio._api.queue_free()
	var fake := FakeAuthoringApi.new()
	studio.add_child(fake)
	studio._api = fake
	require(scene._world_input_permitted(), "world input fixture not ready")
	scene.mobile_hud.set_menu_open(true)
	scene.mobile_hud.get_node("MenuPanel/Scroll/Content/WorldStudio").pressed.emit()
	require(studio.visible and not scene._world_input_permitted() and not scene.mobile_joystick.visible, "open studio allowed movement or joystick")
	require(fake.sent.size() == 1 and fake.sent[0].kind == "identity", "studio did not request confirmed identity")
	# Inspector consumes the existing authenticated zone projection. Export and
	# filtering must neither send gameplay commands nor invent causal evidence.
	require(studio.has_method("inspection_export"), "WorldStudio lacks confirmed-state inspector")
	if studio.has_method("inspection_export"):
		var before_inspection := fake.sent.size()
		require(studio._inspection_list.item_count == 0, "hidden inspector allocated controls before it was opened")
		var inspection: Dictionary = studio.inspection_export()
		require(inspection.get("schemaVersion") == "aurion.inspection.v1" and inspection.get("zoneId") == "observatory_threshold" and inspection.get("tick") == 1, "inspector lost confirmed zone identity")
		require(inspection.get("causalProof") == "UNVERIFIED" and inspection.get("receiptHash") == null, "zone-v5 inspector fabricated receipt evidence")
		var rows: Array = studio.inspection_entities("player:1")
		require(rows.size() == 1 and rows[0].get("entityId") == "player:1", "inspector filter lost the confirmed player")
		if not rows.is_empty(): rows[0]["entityId"] = "local-only"
		require(scene._entities.record("presences", "player:1").get("entityId") == "player:1", "inspector changed the canonical projection")
		require(fake.sent.size() == before_inspection, "read-only inspector sent a server command")
		studio._toggle_inspector()
		require(studio._inspection_list.item_count > 0, "opening inspector did not display the latest model")
		studio._toggle_inspector()
		studio._inspection_list.clear()
		studio._inspection["snapshotSeq"] = -1
		studio.set_inspection_context(scene._confirmed_zone, scene._entities, false)
		require(studio._inspection_list.item_count == 0 and not studio.inspection_export().is_empty(), "hidden snapshot rebuilt controls or lost its read-only model")
		studio._toggle_inspector()
		require(studio._inspection_list.item_count > 0, "reopened inspector did not render the deferred snapshot")
		studio._toggle_inspector()
	studio._completed("identity", {"id":42,"role":"admin"}, SESSION, generation)
	require(fake.sent.back().kind == "catalog", "admin identity did not request catalog")
	studio._completed("catalog", {"glbCatalogRevision":"a".repeat(64),"assets":[]}, SESSION, generation)
	require(studio.has_method("stage_catalog_placement") and studio.has_method("import_world_draft"), "WorldStudio lacks catalog-bound draft staging/import")
	if studio.has_method("stage_catalog_placement") and studio.has_method("import_world_draft"):
		var before_staging := fake.sent.size()
		studio._completed("catalog", {"glbCatalogRevision":"a".repeat(64),"assets":[
			{"assetId":"glb_test_barrel","sha256":SHA,"assetType":"arena","purpose":"world-environment","displayName":"Fixture barrel","targetKey":null},
			{"assetId":"glb_bound_lod","sha256":SHA,"assetType":"arena","purpose":"world-environment","targetKey":"starter_lod0"},
			{"assetId":"glb_unknown_target","sha256":SHA,"assetType":"arena","purpose":"world-environment"}]}, SESSION, generation)
		require(studio._catalog_assets.size() == 1 and studio._asset_choice.item_count == 1, "target-bound or unclassified catalog entry entered the placement picker")
		require(studio.new_world_draft("owner.village", "Owner village", 1), "form could not create a local catalog-bound draft")
		require(studio.stage_catalog_placement(draft().placements[0]), "first catalog placement could not enter an empty local draft")
		require(studio.import_world_draft(JSON.stringify(draft())), "valid catalog-bound draft import rejected")
		for forbidden in ["glb_bound_lod", "glb_unknown_target"]:
			var forbidden_draft := draft()
			forbidden_draft.placements[0].assetId = forbidden
			require(not studio.import_world_draft(JSON.stringify(forbidden_draft)), "non-placeable asset entered an imported world draft")
			require(not studio.stage_catalog_placement(forbidden_draft.placements[0]), "non-placeable asset entered a staged world draft")
		var placement: Dictionary = draft().placements[0].duplicate(true)
		placement.placementKey = "barrel-two"
		require(studio.stage_catalog_placement(placement), "approved catalog placement could not enter the draft")
		require(JSON.parse_string(studio._draft.text).placements.size() == 2, "staged placement did not reach the existing reviewed draft")
		var staged: String = studio._draft.text
		require(not studio.stage_catalog_placement(placement), "duplicate placement key accepted")
		placement.placementKey = "barrel-three"
		placement.assetId = "glb_unknown_asset"
		require(not studio.stage_catalog_placement(placement), "unapproved catalog asset entered the draft")
		require(not studio.import_world_draft("{broken") and studio._draft.text == staged, "invalid import replaced the reviewed draft")
		var stale_draft := draft()
		stale_draft.expectedCatalogRevision = "9".repeat(64)
		require(not studio.import_world_draft(JSON.stringify(stale_draft)), "stale catalog import accepted")
		require(fake.sent.size() == before_staging, "local staging/import submitted a world change")
	var original := draft()
	studio._draft.text = JSON.stringify(original)
	studio._plan()
	require(fake.sent.back().kind == "worldPlan", "plan was not sent")
	fake.in_flight = true
	studio._close_requested()
	require(studio.visible and studio._state.phase == "planning", "studio closed while its plan was in flight")
	fake.in_flight = false
	var edited := original.duplicate(true)
	edited.title = "Edited after request"
	studio._draft.text = JSON.stringify(edited)
	studio._on_draft_changed()
	studio._completed("worldPlan", verified_plan(original, fake.sent.back().payload.operationId), SESSION, generation)
	require(studio._state.planned_summary().is_empty(), "late plan authorized an edited draft")
	studio._draft.text = JSON.stringify(original)
	studio._plan()
	studio._completed("worldPlan", verified_plan(original, fake.sent.back().payload.operationId), SESSION, generation)
	require(not studio._state.planned_summary().is_empty(), "valid fixture plan not accepted")
	root.size = Vector2i(360, 640)
	await process_frame
	studio._request_confirmation()
	await process_frame
	require(studio._confirm.visible and studio._plan_view.text.contains("test-village") and studio._plan_view.text.contains("d".repeat(64)), "confirmation did not show the exact target and plan")
	require(studio._confirm.size.x <= root.size.x and studio._confirm.size.y <= root.size.y and studio._confirm.position.x >= 0 and studio._confirm.position.y >= 0, "confirmation extends outside the mobile viewport")
	require(studio._confirm.get_ok_button().get_combined_minimum_size().y >= 48 and studio._confirm.get_cancel_button().get_combined_minimum_size().y >= 48, "confirmation buttons are too small for touch")
	require(studio._plan_view.text.contains("expectedPreviousHash") and studio._plan_view.text.contains("referencedAssetHashes"), "confirmation omitted server plan details")
	studio._confirm.confirmed.emit()
	require(fake.sent.back().kind == "worldApply" and fake.sent.back().payload.expectedPlanHash == "d".repeat(64), "apply did not use the confirmed plan")
	studio._plan()
	require(studio._state.phase == "applying", "repeated plan tap disturbed an in-flight apply")
	var before_apply := fake.sent.size()
	studio._apply()
	require(fake.sent.size() == before_apply, "apply was sent twice")
	studio._completed("worldApply", receipt_response(), SESSION, generation)
	require(fake.sent.back().kind == "readback" and studio._state.phase == "awaiting_readback", "apply did not start a separate readback")
	fake.in_flight = true
	studio._close_requested()
	require(studio.visible, "studio closed during the receipt readback")
	fake.in_flight = false
	studio._failed("readback", "fixture", SESSION, generation)
	studio._plan()
	require(studio._state.phase == "awaiting_readback", "repeated plan tap discarded a received receipt")
	studio._close_requested()
	var sent_before_reopen := fake.sent.size()
	require(studio.open_studio() and studio._state.phase == "awaiting_readback" and fake.sent.size() == sent_before_reopen, "reopening lost an already received receipt")
	studio._readback()
	require(fake.sent.size() == sent_before_reopen + 1 and fake.sent.back().kind == "readback", "reopened studio could not request a fresh readback")
	studio._completed("readback", design(), SESSION, generation + 1)
	require(studio._state.phase == "awaiting_readback", "different session generation confirmed apply")
	studio._completed("readback", design(), SESSION, generation)
	require(studio._state.phase == "confirmed" and scene._world_design_readback == design(), "confirmed result did not reach the existing world projection")
	require(Journal.new(journal_path).read().is_empty(), "confirmed apply retained its pending marker")
	require(scene._world_design_visuals.needed_assets().size() == 1, "confirmed readback did not request its catalog model")
	studio._draft.text = JSON.stringify(original)
	studio._plan()
	studio._completed("worldPlan", verified_plan(original, fake.sent.back().payload.operationId), SESSION, generation)
	studio._request_confirmation()
	studio._confirm.confirmed.emit()
	studio._completed("worldApply", receipt_response(), SESSION, generation)
	var replaced: Dictionary = design().duplicate(true)
	replaced.designs[0].version = 2
	replaced.designs[0].designHash = "9".repeat(64)
	studio._completed("readback", replaced, SESSION, generation)
	require(studio._state.phase == "confirmed" and studio._info.text.contains("verändert"), "superseded receipt was not distinguished from current world")
	require(Journal.new(journal_path).read().is_empty() and scene._world_design_readback == replaced, "superseded receipt did not clear safely and project the newer world")
	studio._draft.text = JSON.stringify(original)
	studio._plan()
	studio._completed("worldPlan", verified_plan(original, fake.sent.back().payload.operationId), SESSION, generation)
	fake.start_ok = false
	studio._request_confirmation()
	studio._confirm.confirmed.emit()
	require(studio._state.phase == "ready" and Journal.new(journal_path).read().is_empty(), "unstarted request retained an ambiguous apply")
	fake.start_ok = true
	studio._plan()
	studio._completed("worldPlan", verified_plan(original, fake.sent.back().payload.operationId), SESSION, generation)
	fake.start_ok = false
	fake.on_refuse = func(): studio._state.close()
	studio._request_confirmation()
	studio._confirm.confirmed.emit()
	require(Journal.new(journal_path).read().is_empty(), "synchronous session reset prevented unsubmitted marker cleanup")
	fake.start_ok = true
	fake.on_refuse = Callable()
	studio._close_requested()
	require(not studio.visible and scene._world_input_permitted(), "closing studio did not restore world input")
	scene._mobile_hud_enabled = false
	scene.get_node("WorldHUD/WorldBar/WorldStudioButton").pressed.emit()
	require(studio.visible and not scene._world_input_permitted(), "desktop studio button did not block world input")
	studio._close_requested()
	verify_native_quest_editor(scene, studio, generation)
	scene._reset_projection()
	require(studio._state.phase == "closed" and studio._connection.is_empty(), "zone reset retained authoring session")
	if studio.has_method("inspection_export"):
		require(studio.inspection_export().is_empty(), "zone reset retained stale inspector state")
	scene.queue_free()
	await process_frame
	if FileAccess.file_exists(journal_path.path_join("record.json")): DirAccess.remove_absolute(ProjectSettings.globalize_path(journal_path.path_join("record.json")))
	if DirAccess.dir_exists_absolute(ProjectSettings.globalize_path(journal_path)): DirAccess.remove_absolute(ProjectSettings.globalize_path(journal_path))
	if failures.is_empty(): print("GODOT_WORLD_AUTHORING_SCENE_PASS (synthetic fixtures; no live writes or tablet)")
	else:
		for failure in failures: push_error(failure)
	quit(0 if failures.is_empty() else 1)

func verify_native_quest_editor(scene: Control, studio: Control, generation: int) -> void:
	require(studio.has_method("quest_editor"), "existing WorldStudio lacks the native canonical quest editor")
	if not studio.has_method("quest_editor"): return
	studio.configure(scene._auth_start, "http://127.0.0.1:3000", SESSION, true)
	studio._api.queue_free()
	var transport := FakeAuthoringApi.new()
	studio.add_child(transport)
	studio._api = transport
	require(studio.open_studio(), "native quest studio could not open")
	studio._completed("identity", {"id":42,"role":"admin"}, SESSION, generation)
	studio._completed("catalog", {"glbCatalogRevision":"a".repeat(64),"assets":[]}, SESSION, generation)
	var editor: Variant = studio.quest_editor()
	require(editor.has_method("load_more_templates"), "quest selection lacks bounded pagination")
	var pending_path := "user://aurion-quest-scene-%d" % Time.get_ticks_usec()
	editor._journal = load("res://authoring/quest_authoring_journal.gd").new(pending_path)
	var template := {"templateId":"quest.native-editor", "version":1, "title":"Quest fixture", "description":"Synthetic native graph",
		"roles":[], "prerequisiteFacts":[], "nodes":[{"id":"start", "type":"start", "title":"Start"}, {"id":"end", "type":"end", "title":"End"}],
		"edges":[{"id":"finish", "fromNodeId":"start", "toNodeId":"end", "priority":0}], "outcomes":[],
		"maxCompositionDepth":10, "active":true, "quarantined":false}
	editor.load_templates()
	require(transport.sent.back().kind == "questTemplates", "native quest template loader bypassed existing auth transport")
	var summary := {"templateId":template.templateId, "version":1, "title":template.title, "active":true, "quarantined":false}
	var cursor := {"templateId":template.templateId, "version":1}
	var spaced_summary := summary.duplicate(true)
	spaced_summary.title = "  Canonical quest title\t"
	studio._completed("questTemplates", {"schemaVersion":"aurion.quest-template-page.v1", "items":[summary, spaced_summary], "nextCursor":null}, SESSION, generation)
	require(editor._templates.size() == 2 and editor._templates[1].title == spaced_summary.title, "canonical title whitespace rejected the entire metadata page")
	studio._completed("questTemplates", {"schemaVersion":"aurion.quest-template-page.v1", "items":[summary], "nextCursor":cursor}, SESSION, generation)
	editor.load_more_templates()
	require(transport.sent.back().kind == "questTemplates" and transport.sent.back().payload.get("after") == cursor, "next template page lost its canonical cursor")
	studio._completed("questTemplates", {"schemaVersion":"aurion.quest-template-page.v1", "items":[summary], "nextCursor":null}, SESSION, generation)
	require(editor.copy_template(0), "native quest editor could not copy the confirmed template")
	require(transport.sent.back().kind == "questTemplate" and transport.sent.back().payload.version == 1, "quest copy did not request the selected canonical version")
	studio._completed("questTemplate", {"templates":[template], "nextVersion":8}, SESSION, generation)
	var inactive: Dictionary = editor.current_draft()
	require(inactive.version == 8 and inactive.active == false and inactive.quarantined == true, "quest copy ignored the server version or became active without review")
	editor.set_activation(true)
	var draft_value: Dictionary = editor.current_draft()
	editor.request_plan()
	require(transport.sent.back().kind == "questPropose", "native quest draft did not use canonical proposal API")
	var proposal := {"id":"prop_native_scene_v2", "proposalType":"create_template_draft", "authorUserId":42,
		"templateId":draft_value.templateId, "templateVersion":draft_value.version, "proposedDataJson":JSON.stringify(draft_value),
		"expectedTemplateSetHash":"a".repeat(64), "receiptHash":"c".repeat(64), "status":"draft"}
	studio._completed("questPropose", proposal, SESSION, generation)
	require(transport.sent.back().kind == "questPlan", "persisted native quest draft did not request server validation")
	var plan_value := {"schemaVersion":"aurion.authoring.v1", "proposalId":proposal.id, "expectedTemplateSetHash":proposal.expectedTemplateSetHash,
		"proposalReceiptHash":proposal.receiptHash, "template":draft_value, "templateHash":"e".repeat(64), "planHash":"b".repeat(64), "requiresHumanConfirmation":true}
	studio._completed("questPlan", plan_value, SESSION, generation + 1)
	require(editor._state.phase == "planning", "another auth generation supplied a quest plan")
	studio._completed("questPlan", plan_value, SESSION, generation)
	require(transport.sent.back().kind == "questPlan" and editor._state.phase == "planned", "receiving a plan auto-published the quest")
	editor.request_confirmation()
	require(editor._confirm.visible, "native quest publish lacked the review dialog")
	editor._confirm.confirmed.emit()
	require(transport.sent.back().kind == "questPublish" and transport.sent.back().payload.expectedPlanHash == plan_value.planHash, "explicit native quest confirmation lost its exact plan")
	var sent_once := transport.sent.size()
	editor._confirm.confirmed.emit()
	require(transport.sent.size() == sent_once, "duplicate confirmation republished a quest")
	require(editor._journal.read().get("proposalId") == proposal.id, "quest publish did not reserve durable recovery before send")
	var receipt := {"schemaVersion":"aurion.authoring-receipt.v1", "receiptId":"authoring:quest:" + "f".repeat(24),
		"kind":"quest", "action":"publish", "targetId":proposal.id, "actorUserId":42, "planHash":plan_value.planHash,
		"previousHash":null, "resultHash":plan_value.templateHash, "receiptHash":"f".repeat(64), "humanConfirmed":true}
	studio._completed("questPublish", {"receipt":receipt,"template":draft_value,"templateSetHash":"d".repeat(64)}, SESSION, generation)
	require(transport.sent.back().kind == "questReadback" and transport.sent.back().payload == {"templateId":draft_value.templateId,"version":8} and editor._state.phase == "awaiting_readback", "publish response stood in for exact-version independent readback")
	studio._completed("questTemplates", {"schemaVersion":"aurion.quest-template-page.v1", "items":[summary], "nextCursor":null}, SESSION, generation)
	require(not editor._journal.read().is_empty(), "a catalog page stood in for independent publication readback")
	studio._completed("questReadback", {"templates":[]}, SESSION, generation)
	require(not editor._journal.read().is_empty(), "absent quest readback cleared the pending marker")
	studio._completed("questReadback", {"templates":[draft_value], "durable":false}, SESSION, generation)
	require(not editor._journal.read().is_empty() and editor._state.phase == "awaiting_readback", "ephemeral or compiled template cleared the durable pending journal")
	editor.load_templates()
	require(transport.sent.back().kind == "questReadback", "pending publication fell back to unbounded history readback")
	studio._completed("questReadback", {"templates":[draft_value], "durable":true}, SESSION, generation)
	require(editor._state.phase == "confirmed" and editor._journal.read().is_empty(), "matching independent quest readback did not confirm/clear publication")
	studio._close_requested()
