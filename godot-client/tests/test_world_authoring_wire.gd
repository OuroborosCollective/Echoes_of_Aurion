extends SceneTree
## Real Godot HTTP/UI against a local in-memory fixture; no live writes.
const Studio = preload("res://ui/screens/world_authoring_studio.gd")
const Journal = preload("res://authoring/world_authoring_journal.gd")
const SESSION := "zone_peer_authoring_wire_fixture"
var failures: Array[String] = []
var worlds: Array[Dictionary] = []

class TestAuth:
	extends Node
	signal refresh_succeeded
	var token := "fixture-access-token"
	var refreshes := 0
	func session_generation() -> int: return 5
	func protected_response_allowed() -> bool: return true
	func access_token() -> String: return token
	func refresh_in_flight() -> bool: return false
	func refresh() -> bool:
		refreshes += 1
		return true

func _init() -> void: call_deferred("verify")
func require(ok: bool, reason: String) -> void:
	if not ok: failures.append(reason)
func received(world: Dictionary, connection: String, generation: int) -> void:
	if connection == SESSION and generation == 5: worlds.append(world)

func draft(version: int) -> Dictionary:
	return {"schemaVersion":"aurion.world-design.v1", "designKey":"test-village", "version":version,
		"title":"Test village", "expectedCatalogRevision":"a".repeat(64), "placements":[{
			"placementKey":"barrel-one", "assetId":"glb_test_barrel", "chunkX":0, "chunkZ":0,
			"xMm":32000, "zMm":32000, "rotationQuarterTurns":0, "scalePermille":1000}]}

func wait_for_phase(studio: Control, expected: String) -> void:
	var start := Time.get_ticks_msec()
	while studio._state.phase != expected and Time.get_ticks_msec() - start < 3500:
		await process_frame
	require(studio._state.phase == expected, "expected %s, got %s" % [expected, studio._state.phase])

func verify() -> void:
	var auth := TestAuth.new()
	root.add_child(auth)
	var studio := Studio.new()
	root.add_child(studio)
	await process_frame
	var journal_path := "user://aurion-test-wire-%d.json" % Time.get_ticks_usec()
	studio._journal = Journal.new(journal_path)
	studio.configure(auth, "http://127.0.0.1:3000", SESSION, true)
	studio.confirmed_world.connect(received)
	require(studio.open_studio(), "studio could not start identity request")
	await wait_for_phase(studio, "ready")
	var start := Time.get_ticks_msec()
	while studio._api.busy() and Time.get_ticks_msec() - start < 3500:
		await process_frame
	studio._draft.text = JSON.stringify(draft(1))
	studio._plan()
	await wait_for_phase(studio, "planned")
	studio._request_confirmation()
	require(studio._confirm.visible, "human confirmation dialog missing")
	studio._confirm.confirmed.emit()
	await wait_for_phase(studio, "confirmed")
	require(worlds.size() == 1 and int(worlds[0].designs[0].version) == 1, "fresh readback was not emitted")
	studio._draft.text = JSON.stringify(draft(2))
	studio._plan()
	await wait_for_phase(studio, "planned")
	studio._request_confirmation()
	studio._confirm.confirmed.emit()
	await wait_for_phase(studio, "unknown")
	require(studio._info.text.contains("unklar"), "lost apply reply was presented as a rejection or success")
	studio._readback()
	start = Time.get_ticks_msec()
	while (studio._api.busy() or worlds.size() < 2) and Time.get_ticks_msec() - start < 3500:
		await process_frame
	require(worlds.size() == 2 and int(worlds[1].designs[0].version) == 2, "separate current readback not received")
	require(studio._state.phase == "unknown" and studio._info.text.contains("nicht bewiesen"), "world readback falsely proved an unreceived receipt")
	studio._plan()
	require(studio._state.phase == "unknown", "ambiguous apply allowed another plan in the same session")
	studio.close_session()
	require(not Journal.new(journal_path).read().is_empty(), "pending marker did not survive studio reset")
	studio.configure(auth, "http://127.0.0.1:3000", SESSION, true)
	require(studio.open_studio(), "studio could not reopen")
	await wait_for_phase(studio, "unknown")
	require(studio._info.text.contains("ungeklärt"), "reopened session hid the ambiguous apply")
	studio._draft.text = JSON.stringify(draft(3))
	studio._plan()
	require(studio._state.phase == "unknown", "reopened session allowed a new plan")
	start = Time.get_ticks_msec()
	while studio._api.busy() and Time.get_ticks_msec() - start < 3500:
		await process_frame
	studio._recover_receipt()
	await wait_for_phase(studio, "confirmed")
	require(Journal.new(journal_path).read().is_empty(), "recovered receipt and fresh readback did not clear the pending marker")
	require(worlds.size() == 3 and int(worlds[2].designs[0].version) == 2, "recovery did not emit the independently read world")
	studio.close_session()
	var reset_path := journal_path + ".reset"
	studio._journal = Journal.new(reset_path)
	studio.configure(auth, "http://127.0.0.1:3000", SESSION, true)
	studio.visible = true
	require(studio._state.open(SESSION, 5, 42), "reset fixture session rejected")
	studio._draft.text = JSON.stringify(draft(3))
	var current: Dictionary = JSON.parse_string(studio._draft.text)
	var planned := current.duplicate(true)
	planned["planHash"] = "d".repeat(64)
	planned["referencedAssetHashes"] = ["b".repeat(64)]
	planned["requiresHumanConfirmation"] = true
	planned["expectedPreviousHash"] = null
	planned["operationId"] = "1".repeat(32)
	require(studio._state.begin_plan(current, planned.operationId) and studio._state.accept_plan(planned, current), "reset fixture plan rejected")
	studio._request_confirmation()
	studio._confirm.confirmed.emit()
	require(studio._state.phase == "applying", "reset fixture apply did not start")
	await create_timer(0.10).timeout
	studio.close_session()
	require(not Journal.new(reset_path).read().is_empty(), "reset during apply discarded the pending marker")
	studio.configure(auth, "http://127.0.0.1:3000", SESSION, true)
	studio.open_studio()
	await wait_for_phase(studio, "unknown")
	studio.close_session()
	var refresh_path := journal_path + ".refresh"
	studio._journal = Journal.new(refresh_path)
	studio.configure(auth, "http://127.0.0.1:3000", SESSION, true)
	studio.visible = true
	require(studio._state.open(SESSION, 5, 42), "refresh fixture session rejected")
	studio._draft.text = JSON.stringify(draft(4))
	current = JSON.parse_string(studio._draft.text)
	planned = current.duplicate(true)
	planned["planHash"] = "d".repeat(64)
	planned["referencedAssetHashes"] = ["b".repeat(64)]
	planned["requiresHumanConfirmation"] = true
	planned["expectedPreviousHash"] = null
	planned["operationId"] = "2".repeat(32)
	require(studio._state.begin_plan(current, planned.operationId) and studio._state.accept_plan(planned, current), "refresh fixture plan rejected")
	auth.token = ""
	studio._apply()
	require(auth.refreshes == 1 and studio._state.phase == "planned", "expired access consumed an unsubmitted apply or did not refresh")
	auth.token = "fixture-access-token"
	auth.refresh_succeeded.emit()
	require(studio._state.phase == "planned", "refresh automatically applied a plan")
	studio.close_session()
	var startup_path := journal_path + ".startup"
	studio._journal = Journal.new(startup_path)
	studio.configure(auth, "http://127.0.0.1:3000", SESSION, true)
	auth.token = ""
	require(studio.open_studio() and auth.refreshes == 2 and studio._state.phase == "closed", "expired access did not start studio refresh")
	auth.token = "fixture-access-token"
	auth.refresh_succeeded.emit()
	await wait_for_phase(studio, "ready")
	studio.close_session()
	studio.queue_free()
	auth.queue_free()
	await process_frame
	for path in [journal_path, reset_path, refresh_path, startup_path]:
		if FileAccess.file_exists(path.path_join("record.json")): DirAccess.remove_absolute(ProjectSettings.globalize_path(path.path_join("record.json")))
		if DirAccess.dir_exists_absolute(ProjectSettings.globalize_path(path)): DirAccess.remove_absolute(ProjectSettings.globalize_path(path))
	if failures.is_empty(): print("GODOT_WORLD_AUTHORING_WIRE_PASS (local fixture; no live or database writes)")
	else:
		for reason in failures: push_error(reason)
	quit(0 if failures.is_empty() else 1)
