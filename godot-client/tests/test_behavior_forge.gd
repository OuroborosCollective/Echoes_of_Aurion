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
	panel.completed("behaviorActors", {"schemaVersion":"aurion.behavior-actors.v1", "actors":[{"npcId":"isolated", "observationHash":"sha256:" + "a".repeat(64)}]})
	check(panel._actors.size() == 1, "server actors displayed")
	panel._brief.text = "Describe an isolated NPC."
	panel._prepare()
	panel._brief.text = "Changed during request."
	panel.completed("behaviorDraft", {"status":"DRAFT","artifact":{"mode":"tree"}})
	check(panel._draft.text.is_empty(), "late draft rejected")
	panel._draft.text = JSON.stringify({"mode":"tree","rules":[{"action":"rest","maxRiskBps":10000}]})
	panel._test()
	panel.completed("behaviorTest", {"status":"TESTED","npcId":"different","observationHash":"sha256:" + "a".repeat(64)})
	check(not panel._status.text.begins_with("TESTED"), "foreign comparison rejected")
	panel._test()
	panel.completed("behaviorTest", {"status":"TESTED","npcId":"isolated","observationHash":"sha256:" + "a".repeat(64)})
	check(panel._status.text.begins_with("TESTED"), "matching offline result displayed")
	check(panel._status.text.contains("nicht erreicht"), "no false applied status")
	panel.close_context()
	check(panel._actors.is_empty() and panel._draft.text.is_empty(), "logout clears data")
	check(not panel._request("behaviorActors"), "closed session cannot request")
	for request in requests: check(request.kind in ["behaviorActors","behaviorDraft","behaviorTest"], "no apply requests")
	panel.queue_free()
	await process_frame
	print("GODOT_BEHAVIOR_FORGE_PASS")
	quit(0)
