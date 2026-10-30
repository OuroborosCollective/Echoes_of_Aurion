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

func verified_plan(d: Dictionary) -> Dictionary:
	var p: Dictionary = JSON.parse_string(JSON.stringify(d))
	p["planHash"] = "d".repeat(64)
	p["requiresHumanConfirmation"] = true
	p["referencedAssetHashes"] = [SHA]
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
	studio._completed("identity", {"id":42,"role":"admin"}, SESSION, generation)
	require(fake.sent.back().kind == "catalog", "admin identity did not request catalog")
	studio._completed("catalog", {"glbCatalogRevision":"a".repeat(64),"assets":[]}, SESSION, generation)
	var original := draft()
	studio._draft.text = JSON.stringify(original)
	studio._plan()
	require(fake.sent.back().kind == "worldPlan", "plan was not sent")
	var edited := original.duplicate(true)
	edited.title = "Edited after request"
	studio._draft.text = JSON.stringify(edited)
	studio._on_draft_changed()
	studio._completed("worldPlan", verified_plan(original), SESSION, generation)
	require(studio._state.planned_summary().is_empty(), "late plan authorized an edited draft")
	studio._draft.text = JSON.stringify(original)
	studio._plan()
	studio._completed("worldPlan", verified_plan(original), SESSION, generation)
	require(not studio._state.planned_summary().is_empty(), "valid fixture plan not accepted")
	studio._request_confirmation()
	require(studio._confirm.visible and studio._confirm.dialog_text.contains("test-village") and studio._confirm.dialog_text.contains("d".repeat(64)), "confirmation did not show the exact target and plan")
	studio._confirm.confirmed.emit()
	require(fake.sent.back().kind == "worldApply" and fake.sent.back().payload.expectedPlanHash == "d".repeat(64), "apply did not use the confirmed plan")
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
	studio._close_requested()
	var sent_before_reopen := fake.sent.size()
	require(studio.open_studio() and studio._state.phase == "awaiting_readback" and fake.sent.size() == sent_before_reopen, "reopening lost an already received receipt")
	studio._completed("readback", design(), SESSION, generation + 1)
	require(studio._state.phase == "awaiting_readback", "different session generation confirmed apply")
	studio._completed("readback", design(), SESSION, generation)
	require(studio._state.phase == "confirmed" and scene._world_design_readback == design(), "confirmed result did not reach the existing world projection")
	require(Journal.new(journal_path).read().is_empty(), "confirmed apply retained its pending marker")
	require(scene._world_design_visuals.needed_assets().size() == 1, "confirmed readback did not request its catalog model")
	studio._draft.text = JSON.stringify(original)
	studio._plan()
	studio._completed("worldPlan", verified_plan(original), SESSION, generation)
	fake.start_ok = false
	studio._request_confirmation()
	studio._confirm.confirmed.emit()
	require(studio._state.phase == "ready" and Journal.new(journal_path).read().is_empty(), "unstarted request retained an ambiguous apply")
	fake.start_ok = true
	studio._plan()
	studio._completed("worldPlan", verified_plan(original), SESSION, generation)
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
	scene._reset_projection()
	require(studio._state.phase == "closed" and studio._connection.is_empty(), "zone reset retained authoring session")
	scene.queue_free()
	await process_frame
	if FileAccess.file_exists(journal_path.path_join("record.json")): DirAccess.remove_absolute(ProjectSettings.globalize_path(journal_path.path_join("record.json")))
	if DirAccess.dir_exists_absolute(ProjectSettings.globalize_path(journal_path)): DirAccess.remove_absolute(ProjectSettings.globalize_path(journal_path))
	if failures.is_empty(): print("GODOT_WORLD_AUTHORING_SCENE_PASS (synthetic fixtures; no live writes or tablet)")
	else:
		for failure in failures: push_error(failure)
	quit(0 if failures.is_empty() else 1)
