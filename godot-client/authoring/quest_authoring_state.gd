extends RefCounted
## Native presentation of Aurion's quest proposal/plan/publish contract.
## No quest is evaluated here. Only a receipt plus a later GET confirms a publish.
const Guard = preload("res://world/world_design_projection.gd")
var phase := "closed"
var message := ""
var actor_id := 0
var connection_id := ""
var generation := -1
var _draft: Dictionary = {}
var _proposal: Dictionary = {}
var _plan: Dictionary = {}
var _publishing: Dictionary = {}
var _receipt: Dictionary = {}

static func _text(value: Variant, minimum: int = 1, maximum: int = 128) -> bool:
	return typeof(value) == TYPE_STRING and value.length() >= minimum and value.length() <= maximum and value.strip_edges() == value

## Godot parses JSON numbers as floats; an inline integer and its JSON
## round-trip must match without treating booleans or imprecise integers alike.
static func same_json(left: Variant, right: Variant) -> bool:
	if typeof(left) in [TYPE_INT, TYPE_FLOAT] and typeof(right) in [TYPE_INT, TYPE_FLOAT]:
		if not is_finite(float(left)) or not is_finite(float(right)): return false
		if left < -9007199254740991 or left > 9007199254740991 or right < -9007199254740991 or right > 9007199254740991: return false
		return float(left) == float(right)
	if typeof(left) != typeof(right): return false
	if typeof(left) == TYPE_DICTIONARY:
		if left.size() != right.size(): return false
		for key in left:
			if typeof(key) != TYPE_STRING or not right.has(key) or not same_json(left[key], right[key]): return false
		return true
	if typeof(left) == TYPE_ARRAY:
		if left.size() != right.size(): return false
		for index in range(left.size()):
			if not same_json(left[index], right[index]): return false
		return true
	return left == right

static func draft_valid(value: Variant) -> bool:
	if typeof(value) != TYPE_DICTIONARY or not same_json(value, value) or not _text(value.get("templateId"), 1, 96) or not Guard._whole(value.get("version"), 1, 1000000) or not _text(value.get("title"), 1, 255) or typeof(value.get("description")) != TYPE_STRING:
		return false
	if JSON.stringify(value).to_utf8_buffer().size() > 120000 or typeof(value.get("active")) != TYPE_BOOL or typeof(value.get("quarantined")) != TYPE_BOOL:
		return false
	for key in ["roles", "nodes", "edges", "outcomes"]:
		if typeof(value.get(key)) != TYPE_ARRAY or value[key].size() > 1024: return false
	if value.nodes.is_empty() or value.nodes.size() > 256: return false
	for node in value.nodes:
		if typeof(node) != TYPE_DICTIONARY or not _text(node.get("id"), 1, 128) or typeof(node.get("title")) != TYPE_STRING or node.get("type") not in ["start", "objective", "branch", "subquest", "end"]: return false
	for edge in value.edges:
		if typeof(edge) != TYPE_DICTIONARY or not _text(edge.get("id"), 1, 128) or not _text(edge.get("fromNodeId"), 1, 128) or not _text(edge.get("toNodeId"), 1, 128): return false
	return true

static func pending_valid(value: Variant) -> bool:
	return typeof(value) == TYPE_DICTIONARY and value.size() == 7 and value.get("schemaVersion") == "aurion.quest-authoring-pending.v1" and Guard._whole(value.get("actorUserId"), 1, 2147483647) and _text(value.get("proposalId"), 8, 128) and Guard._hex(value.get("planHash"), 64) and _text(value.get("templateId"), 1, 96) and Guard._whole(value.get("version"), 1, 1000000) and Guard._hex(value.get("templateHash"), 64)

func open(connection: String, session_generation: int, actor: Variant) -> bool:
	close()
	if not connection.begins_with("zone_peer_") or session_generation < 0 or not Guard._whole(actor, 1, 2147483647): return false
	connection_id = connection
	generation = session_generation
	actor_id = int(actor)
	phase = "ready"
	return true

func close() -> void:
	phase = "closed"
	message = ""
	actor_id = 0
	connection_id = ""
	generation = -1
	_draft.clear()
	_proposal.clear()
	_plan.clear()
	_publishing.clear()
	_receipt.clear()

func begin_proposal(draft: Variant) -> Dictionary:
	if phase not in ["ready", "planned", "confirmed"] or not draft_valid(draft): return {}
	_draft = draft.duplicate(true)
	_proposal.clear()
	_plan.clear()
	_receipt.clear()
	phase = "proposing"
	message = "Aurion speichert einen unveröffentlichten Questentwurf."
	return {"templateId":draft.templateId, "templateVersion":int(draft.version), "proposedDataJson":JSON.stringify(draft)}

func accept_proposal(response: Variant) -> bool:
	if phase != "proposing" or typeof(response) != TYPE_DICTIONARY or response.get("status") != "draft" or not _text(response.get("id"), 8, 128) or not Guard._whole(response.get("authorUserId"), actor_id, actor_id): return false
	if response.get("templateId") != _draft.templateId or response.get("templateVersion") != _draft.version or not Guard._hex(response.get("receiptHash"), 64) or not Guard._hex(response.get("expectedTemplateSetHash"), 64) or typeof(response.get("proposedDataJson")) != TYPE_STRING or response.proposedDataJson.to_utf8_buffer().size() > 120000: return false
	var parser := JSON.new()
	if parser.parse(response.proposedDataJson) != OK or not same_json(parser.data, _draft): return false
	_proposal = response.duplicate(true)
	phase = "proposal_saved"
	return true

func begin_plan() -> Dictionary:
	if phase != "proposal_saved": return {}
	phase = "planning"
	message = "Aurion prüft Graph, Rollen, Bedingungen und Ergebnisse."
	return {"proposalId":_proposal.id}

func accept_plan(response: Variant, current_draft: Variant) -> bool:
	if phase != "planning" or not draft_valid(current_draft) or not same_json(current_draft, _draft) or typeof(response) != TYPE_DICTIONARY: return false
	if response.get("schemaVersion") != "aurion.authoring.v1" or response.get("proposalId") != _proposal.id or response.get("proposalReceiptHash") != _proposal.receiptHash or response.get("expectedTemplateSetHash") != _proposal.expectedTemplateSetHash or response.get("requiresHumanConfirmation") != true: return false
	if not Guard._hex(response.get("planHash"), 64) or not Guard._hex(response.get("templateHash"), 64) or not same_json(response.get("template"), _draft): return false
	_plan = response.duplicate(true)
	phase = "planned"
	message = "Questplan erhalten; noch nicht veröffentlicht."
	return true

func planned_summary() -> Dictionary:
	return _plan.duplicate(true) if phase == "planned" else {}

func pending_identity() -> Dictionary:
	var plan: Dictionary = _publishing if not _publishing.is_empty() else _plan
	if plan.is_empty(): return {}
	return {"schemaVersion":"aurion.quest-authoring-pending.v1", "actorUserId":actor_id,
		"proposalId":plan.proposalId, "planHash":plan.planHash, "templateId":plan.template.templateId,
		"version":int(plan.template.version), "templateHash":plan.templateHash}

func begin_publish(current_draft: Variant) -> Dictionary:
	if phase != "planned" or _plan.is_empty() or not draft_valid(current_draft) or not same_json(current_draft, _draft) or not current_draft.active or current_draft.quarantined: return {}
	_publishing = _plan.duplicate(true)
	_plan.clear()
	phase = "publishing"
	message = "Questveröffentlichung einmalig angefordert."
	return {"proposalId":_publishing.proposalId, "expectedPlanHash":_publishing.planHash, "confirmation":"PUBLISH_QUEST_TEMPLATE"}

func accept_publish(response: Variant) -> bool:
	if phase != "publishing" or _publishing.is_empty() or typeof(response) != TYPE_DICTIONARY: return false
	var receipt: Variant = response.get("receipt")
	if typeof(receipt) != TYPE_DICTIONARY or receipt.get("schemaVersion") != "aurion.authoring-receipt.v1" or receipt.get("kind") != "quest" or receipt.get("action") != "publish" or receipt.get("humanConfirmed") != true: return false
	if not Guard._whole(receipt.get("actorUserId"), actor_id, actor_id) or receipt.get("targetId") != _publishing.proposalId or receipt.get("planHash") != _publishing.planHash or receipt.get("resultHash") != _publishing.templateHash: return false
	if not Guard._hex(receipt.get("receiptHash"), 64) or receipt.get("receiptId") != "authoring:quest:" + str(receipt.receiptHash).substr(0, 24) or not receipt.has("previousHash") or (receipt.previousHash != null and not Guard._hex(receipt.previousHash, 64)): return false
	if not same_json(response.get("template"), _publishing.template) or not Guard._hex(response.get("templateSetHash"), 64): return false
	_receipt = receipt.duplicate(true)
	phase = "awaiting_readback"
	message = "Quest-Receipt erhalten; separater Vorlagen-Readback steht aus."
	return true

func accept_readback(response: Variant) -> bool:
	if phase != "awaiting_readback" or _receipt.is_empty() or typeof(response) != TYPE_DICTIONARY or typeof(response.get("templates")) != TYPE_ARRAY or response.templates.size() > 4096: return false
	var matches := 0
	for template in response.templates:
		if typeof(template) != TYPE_DICTIONARY: return false
		if template.get("templateId") == _publishing.template.templateId and template.get("version") == _publishing.template.version:
			if not same_json(template, _publishing.template): return false
			matches += 1
	if matches != 1: return false
	phase = "confirmed"
	message = "Questveröffentlichung durch Receipt und separaten Vorlagen-Readback bestätigt."
	return true

func restore_pending(pending: Variant) -> bool:
	if phase != "ready" or not pending_valid(pending) or int(pending.actorUserId) != actor_id: return false
	phase = "unknown"
	message = "Frühere Veröffentlichung ungeklärt. Nur Receipt und Vorlagen lesen; kein Publish wiederholen."
	return true

func accept_recovered(pending: Variant, response: Variant) -> bool:
	if phase != "unknown" or not pending_valid(pending) or int(pending.actorUserId) != actor_id or typeof(response) != TYPE_DICTIONARY or response.get("status") != "found": return false
	var plan: Variant = response.get("plan")
	if typeof(plan) != TYPE_DICTIONARY or plan.get("schemaVersion") != "aurion.authoring.v1" or plan.get("requiresHumanConfirmation") != true or plan.get("proposalId") != pending.proposalId or plan.get("planHash") != pending.planHash or plan.get("templateHash") != pending.templateHash or not Guard._hex(plan.get("expectedTemplateSetHash"), 64) or not Guard._hex(plan.get("proposalReceiptHash"), 64) or not draft_valid(plan.get("template")): return false
	if plan.template.templateId != pending.templateId or int(plan.template.version) != int(pending.version): return false
	_publishing = plan.duplicate(true)
	phase = "publishing"
	var accepted := accept_publish({"receipt":response.get("receipt"), "template":plan.template, "templateSetHash":plan.expectedTemplateSetHash})
	if not accepted: phase = "unknown"
	return accepted

func draft_changed() -> void:
	if phase in ["proposing", "proposal_saved", "planning", "planned"]:
		_plan.clear()
		phase = "ready"

func publish_not_started() -> void:
	if phase == "publishing":
		_publishing.clear()
		phase = "ready"
		message = "Anfrage nicht gestartet; Questentwurf erneut prüfen."

func failed(kind: String) -> void:
	if kind == "questPublish" and phase == "publishing":
		phase = "unknown"
		message = "Veröffentlichung ungeklärt; Receipt lesen, Publish nicht wiederholen."
	elif phase == "awaiting_readback":
		message = "Receipt vorhanden; separaten Vorlagen-Readback erneut anfordern."
	elif phase not in ["unknown", "closed"]:
		phase = "ready"
		message = "Aurion konnte den Questentwurf nicht bestätigen."
