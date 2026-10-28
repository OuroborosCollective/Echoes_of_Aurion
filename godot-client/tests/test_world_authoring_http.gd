extends SceneTree
## Isolated HTTP fixture with synthetic auth and server data; not live evidence.
const Studio = preload("res://ui/screens/world_authoring_studio.gd")
const SERVER := "http://127.0.0.1:3000"
var failures: Array[String] = []
var projections: Array[Dictionary] = []

class TestAuth:
	extends Node
	func access_token() -> String:
		return "a".repeat(43)
	func protected_response_allowed() -> bool:
		return true
	func session_generation() -> int:
		return 1

func _init() -> void:
	call_deferred("verify")

func require(condition: bool, message: String) -> void:
	if not condition:
		failures.append(message)

func wait_until_idle(studio: Control) -> void:
	var started := Time.get_ticks_msec()
	while studio._busy and Time.get_ticks_msec() - started < 4000:
		await process_frame
	require(not studio._busy, "worldstudio request timed out")

func verify() -> void:
	var auth := TestAuth.new()
	root.add_child(auth)
	var studio := Studio.new()
	root.add_child(studio)
	studio.confirmed_world.connect(func(value: Dictionary) -> void: projections.append(value))
	studio.configure(auth, SERVER, "synthetic-zone", true)
	require(studio.open_studio(), "worldstudio failed to open")
	await wait_until_idle(studio)
	require(projections.size() == 1 and projections[0].designs.is_empty(), "initial HTTP readback missing")
	var draft := {
		"schemaVersion": "aurion.world-design.v1", "designKey": "village.http",
		"version": 1, "title": "HTTP Village", "expectedCatalogRevision": "c".repeat(64),
		"placements": [{"placementKey": "village.tower", "assetId": "glb_1234567890abc",
			"chunkX": 0, "chunkZ": 0, "xMm": 1200, "zMm": 4500,
			"rotationQuarterTurns": 1, "scalePermille": 1000}],
	}
	studio._draft.text = JSON.stringify(draft)
	studio._plan()
	await wait_until_idle(studio)
	require(studio._plan_hash == "d".repeat(64), "HTTP worldPlan was not accepted")
	require(projections.size() == 1, "planning projected unconfirmed world")
	studio._request_confirmation()
	require(studio._confirm.visible, "confirmation dialog was not opened")
	studio._confirm.confirmed.emit()
	await wait_until_idle(studio)
	require(projections.size() == 2, "HTTP apply did not complete independent readback")
	if projections.size() == 2:
		require(projections[1].designs[0].designHash == "b".repeat(64), "wrong confirmed design projected")
	require(studio._pending_apply.is_empty(), "matched readback left apply pending")
	studio._readback()
	await wait_until_idle(studio)
	require(projections.size() == 2, "non-JSON response projected")
	require(studio._info.text.contains("WORLD_AUTHORING_NOT_JSON"), "non-JSON response was not rejected")
	studio.close_session()
	studio.queue_free()
	auth.queue_free()
	if failures.is_empty():
		print("G21_WORLD_AUTHORING_HTTP_FIXTURE_PASS")
		quit(0)
	else:
		for failure in failures:
			push_error(failure)
		quit(1)
