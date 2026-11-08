extends SceneTree
## UI contract using a local request recorder, never live Aurion state.
const Studio = preload("res://ui/screens/world_authoring_studio.gd")
const SESSION := "zone_peer_ai_tools_fixture"
var failures: Array[String] = []

class FixtureAuth:
	extends Node
	signal refresh_succeeded
	func session_generation() -> int: return 7
	func protected_response_allowed() -> bool: return true
	func access_token() -> String: return "isolated-authoring-fixture"
	func refresh_in_flight() -> bool: return false
	func refresh() -> bool: return false

class Recorder:
	extends Node
	var sent: Array[Dictionary] = []
	func busy() -> bool: return false
	func cancel() -> void: pass
	func request(kind: String, _server: String, _connection: String, payload: Dictionary = {}, _allow_local: bool = false) -> bool:
		sent.append({"kind":kind, "payload":payload.duplicate(true)})
		return true

func check(ok: bool, message: String) -> void:
	if not ok: failures.append(message)

func envelope(tool: String, value: Dictionary) -> Dictionary:
	return {"tool":tool, "previewOnly":true, "mutationAuthority":"none", "result":value}

func quest_template() -> Dictionary:
	return {"templateId":"fadenwerk_test_strand","version":1,"title":"Test Strand","description":"Native draft",
		"roles":[],"prerequisiteFacts":[],"nodes":[{"id":"start","type":"start","title":"Start"}, {"id":"end","type":"end","title":"End"}],
		"edges":[{"id":"finish","fromNodeId":"start","toNodeId":"end","priority":0}],"outcomes":[],
		"maxCompositionDepth":10,"active":false,"quarantined":true}

func verify() -> void:
	var auth := FixtureAuth.new()
	root.add_child(auth)
	var studio := Studio.new()
	root.add_child(studio)
	await process_frame
	studio.configure(auth, "http://127.0.0.1:3000", SESSION, true)
	var recorder := Recorder.new()
	studio.add_child(recorder)
	studio._api = recorder
	check(studio.open_studio(), "studio identity request did not start")
	studio._completed("identity", {"id":42,"role":"admin"}, SESSION, 7)
	studio._completed("catalog", {"glbCatalogRevision":"a".repeat(64),"assets":[]}, SESSION, 7)
	check(studio.has_method("show_section") and studio.show_section("tools"), "unified tools navigation missing")
	check(recorder.sent.back().kind == "aiToolCatalog", "tools tab failed to load canonical tool catalog")
	check(not studio._tools_ready, "tools advertised readiness before server reply")
	var invalid := {"schemaVersion":"aurion.ai-authoring-tools.v1","mutationAuthority":"write","tools":[]}
	studio._completed("aiToolCatalog", invalid, SESSION, 7)
	check(not studio._tools_ready, "catalog with write authority accepted")
	studio._refresh_tool_catalog()
	var tool_names := ["fadenwerk.inspect","fadenwerk.draft","quest.template.validate","npc.behavior.draft","world.design.propose"]
	var catalog := {"schemaVersion":"aurion.ai-authoring-tools.v1","mutationAuthority":"none",
		"tools":tool_names.map(func(name: String): return {"tool":name,"previewOnly":true}), "handoffs":{"quest":[],"npc":[],"world":[],"godot":[]}}
	studio._completed("aiToolCatalog", catalog, SESSION, 7)
	check(studio._tools_ready, "read-only canonical catalog not acknowledged")
	check(studio._tool_status.text.contains("PREVIEW_ONLY"), "UI did not distinguish authoring preview from live runtime")

	check(studio.show_section("quests"), "quest section not reachable")
	var editor: VBoxContainer = studio.quest_editor()
	var source := JSON.stringify({"version":1,"questlines":[{"id":"test_strand","title":"Test Strand","entryNode":"start","graph":{
		"start":{"id":"start","title":"Start","choices":[{"id":"go","label":"Next","nextNode":"end"}]},
		"end":{"id":"end","title":"End","choices":[]}}}]})
	editor._faden_source.text = source
	check(editor.inspect_fadenwerk(), "Fadenwerk inspection did not start")
	check(recorder.sent.back().kind == "aiToolPreview" and recorder.sent.back().payload.tool == "fadenwerk.inspect", "Fadenwerk failed typed dispatch")
	studio._completed("aiToolPreview", envelope("fadenwerk.inspect", {"previewOnly":true,"sourceHash":source.sha256_text(),"questlines":[{"id":"test_strand","title":"Test Strand","issues":[]}]}), SESSION, 7)
	check(editor._faden_choice.item_count == 1, "typed Fadenwerk inspection did not reach quest editor")
	check(editor.import_fadenwerk(), "Fadenwerk draft did not start")
	check(recorder.sent.back().payload.tool == "fadenwerk.draft", "Fadenwerk draft used wrong tool")
	studio._completed("aiToolPreview", envelope("fadenwerk.draft", {"previewOnly":true,"sourceHash":source.sha256_text(),"questlineId":"test_strand","template":quest_template()}), SESSION, 7)
	check(editor.current_draft().get("active") == false and editor.current_draft().get("quarantined") == true, "Fadenwerk output was not held as a quarantined preview")
	check(editor.has_method("validate_current_draft") and editor.validate_current_draft(), "quest validation UI did not start")
	check(recorder.sent.back().payload.tool == "quest.template.validate", "quest validator did not go through typed dispatch")
	var draft_before: Dictionary = editor.current_draft()
	studio._completed("aiToolPreview", envelope("quest.template.validate", {"valid":true,"diagnostics":[]}), SESSION, 7)
	check(editor.current_draft() == draft_before and editor._validation_status.text.contains("PREVIEW_ONLY"), "validation changed draft or was mistaken for publication")
	check(not recorder.sent.back().kind in ["questPublish","worldApply"], "preview published world or quest")

	check(studio.show_section("npc"), "NPC Forge page not reachable")
	var forge: VBoxContainer = studio._behavior_forge
	forge._brief.text = "Describe safe guard behavior for a village entrance."
	forge._prepare()
	check(recorder.sent.back().kind == "aiToolPreview" and recorder.sent.back().payload.tool == "npc.behavior.draft", "NPC template failed typed dispatch")
	studio._completed("aiToolPreview", envelope("npc.behavior.draft", {"status":"DRAFT","artifact":{"mode":"tree","rules":[]},"generation":"EXPLICIT_TEMPLATE_NOT_AI"}), SESSION, 7)
	check(forge._status.text.contains("keine KI-Inferenz"), "NPC shadow-only status missing")

	check(studio.show_section("world"), "world design section not reachable")
	studio._inspection = {"zoneId":"observatory_threshold","stale":false}
	studio._brief.text = "Place an approved environment asset into the selected chunk."
	studio._propose()
	check(recorder.sent.back().kind == "aiToolPreview" and recorder.sent.back().payload.tool == "world.design.propose", "world proposal bypassed typed tool dispatch")
	var original := studio._draft.text
	studio._draft.text = "{\"not\":\"the same draft\"}"
	studio._completed("aiToolPreview", envelope("world.design.propose", {"status":"AI_DRAFT","requiresHumanReview":true,"draftJson":"{}"}), SESSION, 7)
	check(studio._draft.text != original and studio._draft.text.contains("not"), "stale or invalid AI world proposal replaced current editor draft")

	check(studio.show_section("inspector"), "confirmed world inspection page not reachable")
	check(studio._inspection_panel.visible, "inspection panel not shown by navigation")
	studio.close_session()
	check(not studio._tools_ready and studio._pending_tool.is_empty(), "tools survived logout")
	check(not studio.show_section("tools"), "closed session could request tool catalog")
	studio.queue_free()
	auth.queue_free()
	await process_frame
	if failures.is_empty():
		print("GODOT_AI_AUTHORING_TOOLCHAIN_UI_PASS (isolated UI fixture, no world writes)")
	else:
		for issue in failures: push_error(issue)
	quit(0 if failures.is_empty() else 1)
