extends RefCounted
## Session-bound editor state; Aurion alone validates and commits a design.
## An interrupted apply is never retried or reported as a rejection.
const WorldProjection = preload("res://world/world_design_projection.gd")

var connection_id := ""
var generation := -1
var actor_id := 0
var phase := "closed"
var message := ""
var _pending_plan: Dictionary = {}
var _pending_operation := ""
var _planned: Dictionary = {}
var _applying: Dictionary = {}
var _receipt: Dictionary = {}

func open(connection: String, session_generation: int, actor: Variant) -> bool:
	close()
	if connection.is_empty() or not connection.begins_with("zone_peer_") or session_generation < 0 or not WorldProjection._whole(actor, 1, 2147483647):
		return false
	connection_id = connection
	generation = session_generation
	actor_id = int(actor)
	phase = "ready"
	return true

func close() -> void:
	connection_id = ""
	generation = -1
	actor_id = 0
	phase = "closed"
	message = ""
	_pending_plan.clear()
	_pending_operation = ""
	_planned.clear()
	_applying.clear()
	_receipt.clear()

func session_matches(connection: String, session_generation: int) -> bool:
	return phase != "closed" and connection == connection_id and session_generation == generation

func mark_unresolved() -> void:
	if phase != "closed":
		phase = "unknown"
		message = "Eine frühere Änderung ist ungeklärt. Vor einem neuen Apply Receipt und Weltstand unabhängig prüfen."

func applying_identity() -> Dictionary:
	return _applying.duplicate(true)

func not_submitted() -> void:
	if phase in ["applying", "unknown"] and not _applying.is_empty():
		_applying.clear()
		phase = "ready"
		message = "Die Anfrage wurde nicht gestartet. Bitte den Entwurf erneut prüfen."

static func _draft_valid(draft: Variant) -> bool:
	if typeof(draft) != TYPE_DICTIONARY or draft.get("schemaVersion") != "aurion.world-design.v1":
		return false
	if not WorldProjection._id(draft.get("designKey")) or not WorldProjection._whole(draft.get("version"), 1, 1000000):
		return false
	if typeof(draft.get("title")) != TYPE_STRING or draft.title.strip_edges() != draft.title or draft.title.length() < 3 or draft.title.length() > 160:
		return false
	if not WorldProjection._hex(draft.get("expectedCatalogRevision"), 64) or typeof(draft.get("placements")) != TYPE_ARRAY or draft.placements.is_empty() or draft.placements.size() > 256:
		return false
	var keys: Dictionary = {}
	for p in draft.placements:
		if typeof(p) != TYPE_DICTIONARY or not WorldProjection._id(p.get("placementKey")) or keys.has(p.placementKey) or not WorldProjection._id(p.get("assetId"), true):
			return false
		keys[p.placementKey] = true
		if not WorldProjection._whole(p.get("chunkX"), -100000, 100000) or not WorldProjection._whole(p.get("chunkZ"), -100000, 100000) or not WorldProjection._whole(p.get("xMm"), 0, 63999) or not WorldProjection._whole(p.get("zMm"), 0, 63999) or not WorldProjection._whole(p.get("rotationQuarterTurns"), 0, 3) or not WorldProjection._whole(p.get("scalePermille"), 250, 4000):
			return false
	return true

func draft_changed() -> void:
	_pending_plan.clear()
	_pending_operation = ""
	_planned.clear()
	if phase in ["planning", "planned"]:
		phase = "ready"

func begin_plan(draft: Variant, operation_id: String) -> bool:
	if phase not in ["ready", "planned", "confirmed"] or not _draft_valid(draft) or not WorldProjection._hex(operation_id, 32):
		return false
	_applying.clear()
	_receipt.clear()
	_pending_plan = draft.duplicate(true)
	_pending_operation = operation_id
	_planned.clear()
	phase = "planning"
	message = "Aurion prüft den Entwurf."
	return true

func accept_plan(plan: Variant, current_draft: Variant) -> bool:
	if phase != "planning" or _pending_plan.is_empty() or not _draft_valid(current_draft) or JSON.stringify(current_draft) != JSON.stringify(_pending_plan):
		return false
	if not _plan_matches(plan, _pending_plan) or plan.operationId != _pending_operation:
		return false
	_planned = {"draft":_pending_plan.duplicate(true), "planHash":plan.planHash, "plan":plan.duplicate(true)}
	_pending_plan.clear()
	_pending_operation = ""
	phase = "planned"
	message = "Aurion-Plan geprüft; menschliche Bestätigung erforderlich."
	return true

static func _plan_matches(plan: Variant, draft: Dictionary) -> bool:
	if typeof(plan) != TYPE_DICTIONARY or not WorldProjection._hex(plan.get("planHash"), 64) or not WorldProjection._hex(plan.get("operationId"), 32) or plan.get("requiresHumanConfirmation") != true:
		return false
	# Older servers did not bind the predecessor. Do not authorize their plans.
	if not plan.has("expectedPreviousHash") or (plan.expectedPreviousHash != null and not WorldProjection._hex(plan.expectedPreviousHash, 64)):
		return false
	for key in ["schemaVersion", "designKey", "version", "title", "expectedCatalogRevision", "placements"]:
		if JSON.stringify(plan.get(key)) != JSON.stringify(draft.get(key)):
			return false
	var hashes: Variant = plan.get("referencedAssetHashes")
	if typeof(hashes) != TYPE_ARRAY or hashes.is_empty() or hashes.size() > 256:
		return false
	for hash in hashes:
		if not WorldProjection._hex(hash, 64):
			return false
	return true

func planned_summary() -> Dictionary:
	return _planned.duplicate(true)

## Consume one exact confirmation. Subsequent calls cannot send a second apply.
func begin_apply(current_draft: Variant) -> Dictionary:
	if phase != "planned" or _planned.is_empty() or not _draft_valid(current_draft) or JSON.stringify(current_draft) != JSON.stringify(_planned.draft):
		return {}
	_applying = _planned.duplicate(true)
	_planned.clear()
	_receipt.clear()
	phase = "applying"
	message = "Aurion-Änderung angefordert."
	return {"draft":_applying.draft.duplicate(true), "expectedPlanHash":_applying.planHash, "operationId":_applying.plan.operationId, "confirmation":"APPLY_WORLD_DESIGN"}

static func _target_matches(readback: Variant, draft: Dictionary, result_hash: String) -> bool:
	if typeof(readback) != TYPE_DICTIONARY or readback.get("schemaVersion") != "aurion.world-design.v1" or not WorldProjection._hex(readback.get("revision"), 64) or typeof(readback.get("designs")) != TYPE_ARRAY or readback.designs.size() > 64:
		return false
	var matches := 0
	for design in readback.designs:
		if typeof(design) != TYPE_DICTIONARY:
			return false
		if design.get("designKey") == draft.designKey:
			if not WorldProjection._whole(design.get("version"), int(draft.version), int(draft.version)) or design.get("designHash") != result_hash:
				return false
			matches += 1
	return matches == 1

static func _world_valid(readback: Variant) -> bool:
	if typeof(readback) != TYPE_DICTIONARY or readback.get("schemaVersion") != "aurion.world-design.v1" or not WorldProjection._hex(readback.get("revision"), 64) or typeof(readback.get("designs")) != TYPE_ARRAY or readback.designs.size() > 64:
		return false
	var keys: Dictionary = {}
	for item in readback.designs:
		if typeof(item) != TYPE_DICTIONARY or not WorldProjection._id(item.get("designKey")) or keys.has(item.designKey) or not WorldProjection._hex(item.get("designHash"), 64):
			return false
		keys[item.designKey] = true
		var draft := {"schemaVersion":"aurion.world-design.v1", "designKey":item.designKey, "version":item.get("version"), "title":item.get("title"), "expectedCatalogRevision":item.get("expectedCatalogRevision"), "placements":item.get("placements")}
		if not _draft_valid(draft):
			return false
	return true

func accept_apply(response: Variant) -> bool:
	if phase != "applying" or _applying.is_empty() or typeof(response) != TYPE_DICTIONARY:
		return false
	var receipt: Variant = response.get("receipt")
	if typeof(receipt) != TYPE_DICTIONARY or receipt.get("schemaVersion") != "aurion.authoring-receipt.v1" or receipt.get("kind") != "world" or receipt.get("action") != "apply" or receipt.get("humanConfirmed") != true:
		return false
	if not WorldProjection._whole(receipt.get("actorUserId"), actor_id, actor_id) or receipt.get("targetId") != "%s:v%d" % [_applying.draft.designKey, int(_applying.draft.version)] or receipt.get("planHash") != _applying.planHash:
		return false
	if not WorldProjection._hex(receipt.get("resultHash"), 64) or not WorldProjection._hex(receipt.get("receiptHash"), 64) or receipt.get("receiptId") != "authoring:world:" + str(receipt.receiptHash).substr(0, 24):
		return false
	if not receipt.has("previousHash") or (receipt.previousHash != null and not WorldProjection._hex(receipt.previousHash, 64)):
		return false
	if receipt.previousHash != _applying.plan.expectedPreviousHash:
		return false
	_receipt = receipt.duplicate(true)
	phase = "awaiting_readback"
	message = "Receipt erhalten; unabhängiger Weltstand wird geprüft."
	return true

## Recover a committed receipt for the exact locally pending operation. A
## missing receipt or a mismatched current world remains unresolved.
func accept_recovered(pending: Variant, response: Variant) -> bool:
	if phase != "unknown" or typeof(pending) != TYPE_DICTIONARY or typeof(response) != TYPE_DICTIONARY or response.get("status") != "found":
		return false
	if not WorldProjection._whole(pending.get("actorUserId"), actor_id, actor_id) or not WorldProjection._id(pending.get("designKey")) or not WorldProjection._whole(pending.get("version"), 1, 1000000) or not WorldProjection._hex(pending.get("planHash"), 64) or not WorldProjection._hex(pending.get("operationId"), 32):
		return false
	var plan: Variant = response.get("plan")
	if typeof(plan) != TYPE_DICTIONARY:
		return false
	var draft: Dictionary = plan.duplicate(true)
	for key in ["planHash", "referencedAssetHashes", "requiresHumanConfirmation", "expectedPreviousHash", "operationId"]:
		draft.erase(key)
	if not _draft_valid(draft) or not _plan_matches(plan, draft) or plan.planHash != pending.planHash or plan.operationId != pending.operationId or draft.designKey != pending.designKey or int(draft.version) != int(pending.version):
		return false
	_applying = {"draft":draft, "planHash":plan.planHash, "plan":plan.duplicate(true)}
	phase = "applying"
	if accept_apply(response):
		return true
	_applying.clear()
	phase = "unknown"
	message = "Das gefundene Receipt oder der Weltstand passt nicht zur Vormerkung."
	return false

## Call only for a GET initiated after accept_apply, never a cached earlier GET.
func accept_readback(readback: Variant) -> bool:
	if phase != "awaiting_readback" or _receipt.is_empty() or not _world_valid(readback):
		return false
	phase = "confirmed"
	message = "Aurion-Receipt und unabhängiger Weltstand stimmen überein." if _target_matches(readback, _applying.draft, _receipt.resultHash) else "Aurion-Receipt bestätigt; der aktuelle Weltstand wurde inzwischen verändert."
	return true

func failed(kind: String) -> void:
	if kind == "worldApply" and phase == "applying":
		phase = "unknown"
		message = "Ergebnis unklar: Aurion könnte bereits gespeichert haben. Nicht automatisch erneut anwenden."
	elif kind == "worldPlan" and phase == "planning":
		_pending_plan.clear()
		_pending_operation = ""
		phase = "ready"
		message = "Plan konnte nicht geprüft werden."
	elif kind == "readback" and phase == "awaiting_readback":
		message = "Receipt erhalten; unabhängiger Weltstand noch nicht bestätigt."
