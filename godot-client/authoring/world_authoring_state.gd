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
	_planned.clear()
	if phase in ["planning", "planned"]:
		phase = "ready"

func begin_plan(draft: Variant) -> bool:
	if phase not in ["ready", "planned", "confirmed"] or not _draft_valid(draft):
		return false
	_applying.clear()
	_receipt.clear()
	_pending_plan = draft.duplicate(true)
	_planned.clear()
	phase = "planning"
	message = "Aurion prüft den Entwurf."
	return true

func accept_plan(plan: Variant, current_draft: Variant) -> bool:
	if phase != "planning" or _pending_plan.is_empty() or not _draft_valid(current_draft) or JSON.stringify(current_draft) != JSON.stringify(_pending_plan):
		return false
	if typeof(plan) != TYPE_DICTIONARY or not WorldProjection._hex(plan.get("planHash"), 64) or plan.get("requiresHumanConfirmation") != true:
		return false
	# Older servers did not bind the predecessor. Do not authorize their plans.
	if not plan.has("expectedPreviousHash") or (plan.expectedPreviousHash != null and not WorldProjection._hex(plan.expectedPreviousHash, 64)):
		return false
	for key in ["schemaVersion", "designKey", "version", "title", "expectedCatalogRevision", "placements"]:
		if JSON.stringify(plan.get(key)) != JSON.stringify(_pending_plan.get(key)):
			return false
	var hashes: Variant = plan.get("referencedAssetHashes")
	if typeof(hashes) != TYPE_ARRAY or hashes.is_empty() or hashes.size() > 256:
		return false
	for hash in hashes:
		if not WorldProjection._hex(hash, 64):
			return false
	_planned = {"draft":_pending_plan.duplicate(true), "planHash":plan.planHash, "plan":plan.duplicate(true)}
	_pending_plan.clear()
	phase = "planned"
	message = "Aurion-Plan geprüft; menschliche Bestätigung erforderlich."
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
	return {"draft":_applying.draft.duplicate(true), "expectedPlanHash":_applying.planHash, "confirmation":"APPLY_WORLD_DESIGN"}

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
	if not _target_matches(response.get("readback"), _applying.draft, receipt.resultHash):
		return false
	_receipt = receipt.duplicate(true)
	phase = "awaiting_readback"
	message = "Receipt erhalten; unabhängiger Weltstand wird geprüft."
	return true

## Call only for a GET initiated after accept_apply, never a cached earlier GET.
func accept_readback(readback: Variant) -> bool:
	if phase != "awaiting_readback" or _receipt.is_empty() or not _target_matches(readback, _applying.draft, _receipt.resultHash):
		return false
	phase = "confirmed"
	message = "Aurion-Receipt und unabhängiger Weltstand stimmen überein."
	return true

func failed(kind: String) -> void:
	if kind == "worldApply" and phase == "applying":
		phase = "unknown"
		message = "Ergebnis unklar: Aurion könnte bereits gespeichert haben. Nicht automatisch erneut anwenden."
	elif kind == "worldPlan" and phase == "planning":
		_pending_plan.clear()
		phase = "ready"
		message = "Plan konnte nicht geprüft werden."
	elif kind == "readback" and phase == "awaiting_readback":
		message = "Receipt erhalten; unabhängiger Weltstand noch nicht bestätigt."
