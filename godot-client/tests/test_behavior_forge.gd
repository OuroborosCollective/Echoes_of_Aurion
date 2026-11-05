extends SceneTree
const ForgePanel = preload("res://ui/screens/behavior_forge_panel.gd")
var requests: Array = []
var panel: VBoxContainer
func _initialize() -> void:
	call_deferred("run")
func send(kind: String, payload: Dictionary) -> bool:
	requests.append({"kind":kind,"payload":payload.duplicate(true)})
	return true
func check(value: bool, reason: String) -> void:
	if not value:
		push_error(reason)
		quit(1)
func run() -> void:
	panel = ForgePanel.new()
	root.add_child(panel)
	await process_frame
	panel.open_context(send)
	check(panel._request("behaviorActors"), "read starts")
	panel.completed("behaviorActors", {"schemaVersion":"aurion.behavior-actors.v1", "actors":[{"npcId":"isolated", "resolutionIndex":1, "decisionHash":"b".repeat(64), "observationHash":"sha256:" + "a".repeat(64), "journeyMemorySupported":true}, {"npcId":"lyra", "resolutionIndex":4, "decisionHash":"e".repeat(64), "observationHash":"sha256:" + "f".repeat(64), "journeyMemorySupported":false}]})
	check(panel._actors.size() == 2, "server actors displayed")
	# A non-merchant never sends the merchant-only journey readback.
	panel._choice.select(1)
	var before_journey := requests.size()
	panel._journey_memory()
	check(requests.size() == before_journey and panel._pending.is_empty(), "non-merchant journey request not sent")
	check(panel._status.text.contains("nicht unterstützt"), "non-merchant journey shows explicit unsupported state")
	panel._choice.select(0)
	panel._brief.text = "Describe an isolated NPC."
	panel._prepare()
	panel._brief.text = "Changed during request."
	panel.completed("behaviorDraft", {"status":"DRAFT","artifact":{"mode":"tree"}})
	check(panel._draft.text.is_empty(), "late draft rejected")
	panel._draft.text = JSON.stringify({"controllerId":"test.controller","version":1,"mode":"tree","rules":[{"action":"rest","maxRiskBps":10000}]})
	panel._test()
	panel.completed("behaviorTest", {"status":"TESTED","npcId":"different","observationHash":"sha256:" + "a".repeat(64)})
	check(not panel._status.text.begins_with("TESTED"), "foreign comparison rejected")
	panel._test()
	panel.completed("behaviorTest", {"status":"TESTED","npcId":"isolated","observationHash":"sha256:" + "a".repeat(64)})
	check(not panel._status.text.begins_with("TESTED"), "missing comparison rejected")
	panel._test()
	var artifact: Dictionary = JSON.parse_string(panel._draft.text)
	panel.completed("behaviorTest", {"status":"TESTED","npcId":"isolated","observationHash":"sha256:" + "a".repeat(64),"artifact":artifact,"comparison":{"schemaVersion":"aurion.behavior-comparison.v1","mutationAuthority":"none","execution":"offline","controllerId":"test.controller","controllerVersion":1,"controllerHash":"sha256:" + "b".repeat(64),"observationHash":"sha256:" + "c".repeat(64),"comparisonHash":"sha256:" + "d".repeat(64)}})
	check(panel._status.text.begins_with("TESTED"), "matching offline result displayed")
	check(panel._status.text.contains("nicht erreicht"), "no false applied status")
	panel._journey_memory()
	panel.completed("behaviorJourneyMemory", {"status":"READBACK","observationHash":"sha256:"+"a".repeat(64),"memory":{"schemaVersion":"aurion.npc-journey-memory.v1","npcId":"foreign"}})
	check(not panel._status.text.begins_with("READBACK"), "foreign journey readback rejected")
	panel._journey_memory()
	var journey := {"status":"READBACK","observationHash":"sha256:"+"a".repeat(64),"memory":{"schemaVersion":"aurion.npc-journey-memory.v1","npcId":"isolated","asOfResolutionIndex":1,"decisionHash":"b".repeat(64),"scope":"CONFIRMED_ABSTRACT_JOURNEYS","mutationAuthority":"none","spatialPerception":"UNAVAILABLE","readbackHash":"d".repeat(64),"entries":[],"hasOlderActions":true}}
	panel._invalidate()
	panel.completed("behaviorJourneyMemory", journey)
	check(not panel._status.text.begins_with("READBACK"), "stale journey response rejected")
	var wrong_index: Dictionary = journey.duplicate(true)
	wrong_index.memory.asOfResolutionIndex = 0
	panel._journey_memory()
	panel.completed("behaviorJourneyMemory", wrong_index)
	check(not panel._status.text.begins_with("READBACK"), "wrong journey decision index rejected")
	var wrong_hash: Dictionary = journey.duplicate(true)
	wrong_hash.memory.decisionHash = "e".repeat(64)
	panel._journey_memory()
	panel.completed("behaviorJourneyMemory", wrong_hash)
	check(not panel._status.text.begins_with("READBACK"), "wrong journey decision hash rejected")
	panel._journey_memory()
	panel.completed("behaviorJourneyMemory", journey)
	check(panel._status.text.begins_with("READBACK"), "receipt-backed journey view displayed")
	check(panel._status.text.contains("UNAVAILABLE") and panel._status.text.contains("Ältere"), "bounded history and missing perception explicit")
	var populated: Dictionary = journey.duplicate(true)
	populated.memory.entries = [{"fromHubId":"windhollow","toHubId":"emberfall","outcome":"ambushed","ageInResolutions":0,"retainedInMemory":true,"actionReceiptHash":"1".repeat(64),"effectsHash":"2".repeat(64),"effectReadbackHash":"3".repeat(64),"worldSeedSha256":"4".repeat(64)}]
	panel._journey_memory()
	panel.completed("behaviorJourneyMemory", populated)
	check(panel._graph.get_root().get_child_count() == 1, "confirmed journey creates one display row")
	check(panel._graph.get_root().get_first_child().get_text(0).contains("windhollow → emberfall · ambushed"), "journey endpoints and outcome displayed")
	panel.close_context()
	check(panel._actors.is_empty() and panel._draft.text.is_empty(), "logout clears data")
	check(not panel._request("behaviorActors"), "closed session cannot request")
	for request in requests: check(request.kind in ["behaviorActors","behaviorDraft","behaviorTest","behaviorJourneyMemory"], "no apply requests")
	panel.queue_free()
	await process_frame
	print("GODOT_BEHAVIOR_FORGE_PASS")
	quit(0)
