extends SceneTree
## Synthetic contract fixtures only; this does not write to Aurion or MariaDB.
const State = preload("res://authoring/world_authoring_state.gd")
const Journal = preload("res://authoring/world_authoring_journal.gd")
const CONNECTION := "zone_peer_authoring_fixture"
const OP := "1234567890abcdef1234567890abcdef"
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
	p["expectedPreviousHash"] = null
	p["operationId"] = OP
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
	require(state.begin_plan(d, OP), "plan did not start")
	require(state.accept_plan(plan(d), d), "valid plan rejected")

func verify() -> void:
	verify_quest_contract()
	var d: Dictionary = JSON.parse_string(JSON.stringify(draft()))
	var state: Variant = fresh()
	require(state.session_matches(CONNECTION, 7), "bound session not recognized")
	require(not state.session_matches(CONNECTION, 8), "other generation accepted")
	require(state.begin_plan(d, OP), "JSON integer-valued floats rejected")
	state.draft_changed()
	var altered := d.duplicate(true)
	altered.title = "Changed after submission"
	require(not state.accept_plan(plan(d), altered) and state.planned_summary().is_empty(), "changed draft inherited an old plan")
	require(state.begin_plan(d, OP), "legacy-plan fixture did not start")
	var legacy := plan(d)
	legacy.erase("expectedPreviousHash")
	require(not state.accept_plan(legacy, d), "plan without a bound predecessor was accepted")
	state.failed("worldPlan")
	verified_plan(state, d)
	require(state.begin_apply(altered).is_empty(), "changed draft applied against old plan")
	var payload: Dictionary = state.begin_apply(d)
	require(payload.get("expectedPlanHash") == "b".repeat(64) and payload.get("operationId") == OP and payload.get("confirmation") == "APPLY_WORLD_DESIGN", "exact apply payload lost")
	require(state.begin_apply(d).is_empty(), "same plan was applied twice")
	for field in ["actorUserId", "targetId", "planHash", "resultHash", "receiptHash", "humanConfirmed"]:
		var bad := applied()
		bad.receipt[field] = false if field == "humanConfirmed" else (99 if field == "actorUserId" else "invalid")
		require(not state.accept_apply(bad), "invalid receipt %s accepted" % field)
	var wrong_predecessor := applied()
	wrong_predecessor.receipt.previousHash = "9".repeat(64)
	require(not state.accept_apply(wrong_predecessor), "receipt with a different predecessor was accepted")
	require(state.accept_apply(applied()), "valid receipt rejected")
	var wrong := readback()
	wrong.designs[0].designHash = "invalid"
	require(not state.accept_readback(wrong), "malformed independent readback accepted")
	var concurrent := readback()
	concurrent.revision = "8".repeat(64)
	require(state.accept_readback(concurrent), "same confirmed design rejected after unrelated revision change")
	state.close()
	require(not state.session_matches(CONNECTION, 7), "closed session remained valid")
	state = fresh()
	verified_plan(state, d)
	require(not state.begin_apply(d).is_empty(), "apply fixture did not start")
	state.failed("worldApply")
	require(state.phase == "unknown" and not state.begin_plan(d, OP), "ambiguous apply allowed an automatic retry")
	state.close()
	state = fresh()
	state.mark_unresolved()
	var pending := {"designKey":d.designKey, "version":d.version, "actorUserId":42, "planHash":"b".repeat(64), "operationId":OP}
	var found := applied()
	found["status"] = "found"
	found["plan"] = plan(d)
	require(not state.accept_recovered(pending, {"status":"unresolved"}) and state.phase == "unknown", "missing receipt cleared uncertainty")
	var foreign := pending.duplicate(true)
	foreign.actorUserId = 43
	require(not state.accept_recovered(foreign, found) and state.phase == "unknown", "another actor recovered the pending receipt")
	var other_attempt := pending.duplicate(true)
	other_attempt.operationId = "2".repeat(32)
	require(not state.accept_recovered(other_attempt, found) and state.phase == "unknown", "another attempt recovered the pending receipt")
	var wrong_receipt := found.duplicate(true)
	wrong_receipt.receipt.previousHash = "9".repeat(64)
	require(not state.accept_recovered(pending, wrong_receipt) and state.phase == "unknown", "mismatched recovered receipt accepted")
	require(state.accept_recovered(pending, found) and state.phase == "awaiting_readback", "matching receipt could not be recovered")
	var replaced := readback()
	replaced.designs[0].version = 2
	replaced.designs[0].designHash = "9".repeat(64)
	require(state.accept_readback(replaced) and state.phase == "confirmed" and state.message.contains("verändert"), "confirmed receipt and newer world were not distinguished")
	state.close()
	var path := "user://aurion-test-journal-%d" % Time.get_ticks_usec()
	var first := Journal.new(path)
	var second := Journal.new(path)
	require(first.reserve(d, 42, "b".repeat(64), OP), "pending marker could not be reserved")
	require(not second.reserve(d, 42, "b".repeat(64), OP), "two clients reserved the same marker")
	require(Journal.new(path).read().get("designKey") == d.designKey, "new instance could not read pending marker")
	require(not second.clear_confirmed(d, 43, "b".repeat(64), OP), "different actor cleared a pending marker")
	require(not second.clear_confirmed(d, 42, "b".repeat(64), "2".repeat(32)), "different attempt cleared a pending marker")
	require(first.clear_confirmed(d, 42, "b".repeat(64), OP) and first.read().is_empty(), "matching confirmed marker did not clear")
	require(DirAccess.make_dir_absolute(ProjectSettings.globalize_path(path)) == OK, "corrupt marker fixture could not be created")
	require(first.read().get("invalid") == true and not second.reserve(d, 42, "b".repeat(64), OP), "incomplete marker did not fail closed")
	DirAccess.remove_absolute(ProjectSettings.globalize_path(path))
	if failures.is_empty():
		print("GODOT_WORLD_AUTHORING_STATE_PASS (synthetic fixtures; no live writes)")
	else:
		for failure in failures:
			push_error(failure)
	quit(0 if failures.is_empty() else 1)

func verify_quest_contract() -> void:
	var state_path := "res://authoring/quest_authoring_state.gd"
	var journal_path := "res://authoring/quest_authoring_journal.gd"
	require(FileAccess.file_exists(state_path) and FileAccess.file_exists(journal_path), "native quest publish state and durable pending marker are missing")
	if not FileAccess.file_exists(state_path) or not FileAccess.file_exists(journal_path): return
	var state: Variant = load(state_path).new()
	require(state.open(CONNECTION, 7, 42), "quest state rejected current authenticated actor")
	var d := {"templateId":"quest.inspector", "version":2, "title":"Quest fixture", "description":"Synthetic graph",
		"roles":[], "prerequisiteFacts":[], "nodes":[{"id":"start", "type":"start", "title":"Start"}, {"id":"end", "type":"end", "title":"End"}],
		"edges":[{"id":"finish", "fromNodeId":"start", "toNodeId":"end", "priority":0}], "outcomes":[],
		"maxCompositionDepth":10, "active":true, "quarantined":false}
	var proposal := {"id":"prop_quest_inspector_v2_fixture", "proposalType":"create_template_draft", "authorUserId":42,
		"templateId":d.templateId, "templateVersion":d.version, "proposedDataJson":JSON.stringify(d),
		"expectedTemplateSetHash":"a".repeat(64), "receiptHash":"c".repeat(64), "status":"draft"}
	var p := {"schemaVersion":"aurion.authoring.v1", "proposalId":proposal.id, "expectedTemplateSetHash":proposal.expectedTemplateSetHash,
		"proposalReceiptHash":proposal.receiptHash, "template":d, "templateHash":"e".repeat(64), "planHash":"b".repeat(64), "requiresHumanConfirmation":true}
	require(state.same_json(d, JSON.parse_string(JSON.stringify(d))), "quest JSON round-trip changed semantic draft identity")
	var long_title := d.duplicate(true)
	long_title.title = "t".repeat(256)
	require(not state.draft_valid(long_title), "quest title exceeds the actual MariaDB column")
	long_title.title = "t".repeat(255)
	require(state.draft_valid(long_title), "persistable 255-character quest title rejected")
	for title in ["  Canonical quest title\t", " \t "]:
		var spaced := d.duplicate(true)
		spaced.title = title
		require(state.draft_valid(spaced), "canonical whitespace-bearing quest title rejected or normalized")
	var unsafe := d.duplicate(true)
	unsafe.edges[0].priority = JSON.parse_string("9007199254740993")
	require(not state.same_json(unsafe, unsafe) and not state.draft_valid(unsafe), "rounded unsafe JSON float reached quest proposal validation")
	require(not state.same_json(true, 1) and not state.same_json(1, 2.0), "quest numeric comparison weakened type/value identity")
	require(not state.same_json(INF, INF) and not state.same_json(9007199254740993, 9007199254740992.0), "unsafe quest numbers compared as exact JSON identity")
	require(not state.begin_proposal(d).is_empty(), "quest draft was not staged")
	var wrong_actor := proposal.duplicate(true)
	wrong_actor.authorUserId = 43
	require(not state.accept_proposal(wrong_actor), "another actor's quest proposal was accepted")
	require(state.accept_proposal(proposal), "matching persisted quest draft was rejected")
	require(state.begin_plan().get("proposalId") == proposal.id, "quest plan did not bind proposal")
	require(state.accept_plan(p, d), "matching quest plan rejected")
	var changed := d.duplicate(true)
	changed.title = "Changed after plan"
	require(state.begin_publish(changed).is_empty(), "changed quest bypassed a new plan")
	var publication: Dictionary = state.begin_publish(d)
	require(publication.get("expectedPlanHash") == p.planHash and publication.get("confirmation") == "PUBLISH_QUEST_TEMPLATE", "publish lacked exact explicit confirmation")
	require(state.begin_publish(d).is_empty(), "quest publish was sent twice")
	var receipt := {"schemaVersion":"aurion.authoring-receipt.v1", "receiptId":"authoring:quest:" + "f".repeat(24),
		"kind":"quest", "action":"publish", "targetId":proposal.id, "actorUserId":42, "planHash":p.planHash,
		"previousHash":null, "resultHash":p.templateHash, "receiptHash":"f".repeat(64), "humanConfirmed":true}
	var response := {"receipt":receipt, "template":d, "templateSetHash":"d".repeat(64)}
	var bad := response.duplicate(true)
	bad.receipt.resultHash = "0".repeat(64)
	require(not state.accept_publish(bad), "wrong quest effect hash was accepted")
	require(state.accept_publish(response) and state.phase == "awaiting_readback", "publish response incorrectly certified independent readback")
	require(not state.accept_readback({"templates":[]}), "absent quest was reported as confirmed")
	require(state.accept_readback({"templates":[d]}) and state.phase == "confirmed", "independent matching quest readback rejected")
	var pending := {"schemaVersion":"aurion.quest-authoring-pending.v1", "actorUserId":42, "proposalId":proposal.id,
		"planHash":p.planHash, "templateId":d.templateId, "version":d.version, "templateHash":p.templateHash}
	state.close()
	require(state.open(CONNECTION, 8, 42) and state.restore_pending(pending), "pending quest could not survive native session recreation")
	require(state.begin_publish(d).is_empty() and state.begin_proposal(d).is_empty(), "ambiguous quest publish was automatically retried")
	require(not state.accept_recovered(pending, {"status":"unresolved"}) and state.phase == "unknown", "absent receipt was treated as rejection")
	require(state.accept_recovered(pending, {"status":"found", "plan":p, "receipt":receipt}), "exact recovered quest receipt rejected")
	require(state.accept_readback({"templates":[d]}), "recovered quest lacked independent readback")
	var path := "user://aurion-test-quest-pending-%d" % Time.get_ticks_usec()
	var journal: Variant = load(journal_path).new(path)
	var second: Variant = load(journal_path).new(path)
	require(journal.reserve(pending) and journal.read() == pending, "quest pending marker was not durably read back")
	require(not second.reserve(pending), "parallel native client replaced a pending quest publish")
	var different := pending.duplicate(true)
	different.planHash = "0".repeat(64)
	require(not second.clear_confirmed(different), "wrong quest receipt cleared the marker")
	require(journal.clear_confirmed(pending) and journal.read().is_empty(), "confirmed quest marker was not cleared")
	state.close()
	require(state.phase == "closed", "quest state survived logout")
