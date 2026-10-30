extends SceneTree
## Synthetic contract fixtures only; this does not write to Aurion or MariaDB.
const State = preload("res://authoring/world_authoring_state.gd")
const Journal = preload("res://authoring/world_authoring_journal.gd")
const CONNECTION := "zone_peer_authoring_fixture"
var failures: Array[String] = []

func _init() -> void:
	call_deferred("verify")

func require(value: bool, reason: String) -> void:
	if not value:
		failures.append(reason)

func draft() -> Dictionary:
	return {"schemaVersion":"aurion.world-design.v1", "designKey":"test-village", "version":1,
		"title":"Test village", "expectedCatalogRevision":"a".repeat(64), "placements":[{
			"placementKey":"barrel-one", "assetId":"glb_test_barrel", "chunkX":0, "chunkZ":0,
			"xMm":32000, "zMm":32000, "rotationQuarterTurns":0, "scalePermille":1000}]}

func plan(d: Dictionary) -> Dictionary:
	var p := d.duplicate(true)
	p["planHash"] = "b".repeat(64)
	p["requiresHumanConfirmation"] = true
	p["referencedAssetHashes"] = ["c".repeat(64)]
	return p

func readback() -> Dictionary:
	return {"schemaVersion":"aurion.world-design.v1", "revision":"d".repeat(64), "designs":[{
		"designKey":"test-village", "version":1, "title":"Test village", "designHash":"e".repeat(64),
		"expectedCatalogRevision":"a".repeat(64), "placements":draft().placements}]}

func applied() -> Dictionary:
	return {"receipt":{"schemaVersion":"aurion.authoring-receipt.v1", "receiptId":"authoring:world:" + "f".repeat(24),
		"kind":"world", "action":"apply", "targetId":"test-village:v1", "actorUserId":42,
		"planHash":"b".repeat(64), "previousHash":null, "resultHash":"e".repeat(64),
		"receiptHash":"f".repeat(64), "humanConfirmed":true}, "readback":readback()}

func fresh() -> Variant:
	var state := State.new()
	require(state.open(CONNECTION, 7, 42), "valid session rejected")
	return state

func verified_plan(state: Variant, d: Dictionary) -> void:
	require(state.begin_plan(d), "plan did not start")
	require(state.accept_plan(plan(d), d), "valid plan rejected")

func verify() -> void:
	var d: Dictionary = JSON.parse_string(JSON.stringify(draft()))
	var state: Variant = fresh()
	require(state.session_matches(CONNECTION, 7), "bound session not recognized")
	require(not state.session_matches(CONNECTION, 8), "other generation accepted")
	require(state.begin_plan(d), "JSON integer-valued floats rejected")
	state.draft_changed()
	var altered := d.duplicate(true)
	altered.title = "Changed after submission"
	require(not state.accept_plan(plan(d), altered) and state.planned_summary().is_empty(), "changed draft inherited an old plan")
	verified_plan(state, d)
	require(state.begin_apply(altered).is_empty(), "changed draft applied against old plan")
	var payload: Dictionary = state.begin_apply(d)
	require(payload.get("expectedPlanHash") == "b".repeat(64) and payload.get("confirmation") == "APPLY_WORLD_DESIGN", "exact apply payload lost")
	require(state.begin_apply(d).is_empty(), "same plan was applied twice")
	for field in ["actorUserId", "targetId", "planHash", "resultHash", "receiptHash", "humanConfirmed"]:
		var bad := applied()
		bad.receipt[field] = false if field == "humanConfirmed" else (99 if field == "actorUserId" else "invalid")
		require(not state.accept_apply(bad), "invalid receipt %s accepted" % field)
	require(state.accept_apply(applied()), "valid receipt rejected")
	var wrong := readback()
	wrong.designs[0].designHash = "9".repeat(64)
	require(not state.accept_readback(wrong), "mismatched independent readback accepted")
	var concurrent := readback()
	concurrent.revision = "8".repeat(64)
	require(state.accept_readback(concurrent), "same confirmed design rejected after unrelated revision change")
	state.close()
	require(not state.session_matches(CONNECTION, 7), "closed session remained valid")
	state = fresh()
	verified_plan(state, d)
	require(not state.begin_apply(d).is_empty(), "apply fixture did not start")
	state.failed("worldApply")
	require(state.phase == "unknown" and not state.begin_plan(d), "ambiguous apply allowed an automatic retry")
	state.close()
	var path := "user://aurion-test-journal-%d" % Time.get_ticks_usec()
	var first := Journal.new(path)
	var second := Journal.new(path)
	require(first.reserve(d, 42, "b".repeat(64)), "pending marker could not be reserved")
	require(not second.reserve(d, 42, "b".repeat(64)), "two clients reserved the same marker")
	require(Journal.new(path).read().get("designKey") == d.designKey, "new instance could not read pending marker")
	require(not second.clear_confirmed(d, 43, "b".repeat(64)), "different actor cleared a pending marker")
	require(first.clear_confirmed(d, 42, "b".repeat(64)) and first.read().is_empty(), "matching confirmed marker did not clear")
	require(DirAccess.make_dir_absolute(ProjectSettings.globalize_path(path)) == OK, "corrupt marker fixture could not be created")
	require(first.read().get("invalid") == true and not second.reserve(d, 42, "b".repeat(64)), "incomplete marker did not fail closed")
	DirAccess.remove_absolute(ProjectSettings.globalize_path(path))
	if failures.is_empty():
		print("GODOT_WORLD_AUTHORING_STATE_PASS (synthetic fixtures; no live writes)")
	else:
		for failure in failures:
			push_error(failure)
	quit(0 if failures.is_empty() else 1)
