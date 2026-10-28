extends SceneTree
## Aurion-only authoring response and confirmed-world presentation contract fixtures.
## Synthetic data, no production Admin approval or database effects.
const Api = preload("res://net/api/world_authoring_api.gd")
const ConfirmedWorldDesigns = preload("res://world/confirmed_world_designs.gd")
const WorldStudio = preload("res://ui/screens/world_authoring_studio.gd")
var failures: Array[String] = []

class FakeAuth:
	extends Node
	func protected_response_allowed() -> bool:
		return true
	func session_generation() -> int:
		return 1
	func access_token() -> String:
		return "a".repeat(43)

class CaptureTransport:
	extends Node
	var kinds: Array[String] = []
	func request(kind: String, _server: String, _connection: String, _payload: Dictionary = {}, _allow_local: bool = false) -> bool:
		kinds.append(kind)
		return true
	func cancel() -> void:
		pass

func require(ok: bool, why: String) -> void:
	if not ok:
		failures.append(why)

func _init() -> void:
	call_deferred("verify")

func placement() -> Dictionary:
	return {
		"placementKey": "village.tower", "assetId": "glb_1234567890abc",
		"chunkX": 0, "chunkZ": 0, "xMm": 1200, "zMm": 4500,
		"rotationQuarterTurns": 1, "scalePermille": 1000,
	}

func readback() -> Dictionary:
	return {
		"schemaVersion": "aurion.world-design.v1",
		"revision": "a".repeat(64),
		"designs": [{
			"designKey": "village.g01", "version": 1, "title": "Confirmed Village",
			"designHash": "b".repeat(64),
			"expectedCatalogRevision": "c".repeat(64),
			"placements": [placement()],
		}],
	}

func verify() -> void:
	var trpc := {"result": {"data": {"json": {"planHash": "d".repeat(64), "requiresHumanConfirmation": true}}}}
	require(Api.unwrap_trpc(trpc).get("planHash") == "d".repeat(64), "standard tRPC response not decoded")
	require(Api.unwrap_trpc({"result": {"data": {"planHash": "d".repeat(64)}}}).is_empty(), "non-SuperJSON envelope accepted")
	require(Api.unwrap_trpc({"error": {"message": "FORBIDDEN"}}).is_empty(), "server admin rejection accepted")
	require(Api.unwrap_trpc([]).is_empty(), "array accepted as tRPC envelope")
	require(Api.valid_plan_hash("d".repeat(64)), "canonical SHA-256 rejected")
	require(not Api.valid_plan_hash("D".repeat(64)), "uppercase hash accepted")
	require(not Api.valid_plan_hash("g".repeat(64)), "non-hex hash accepted")
	var visual := ConfirmedWorldDesigns.new()
	root.add_child(visual)
	var valid := readback()
	require(ConfirmedWorldDesigns.validate_readback(valid), "legitimate authoritative world readback rejected")
	var json_readback: Variant = JSON.parse_string(JSON.stringify(valid))
	require(ConfirmedWorldDesigns.validate_readback(json_readback), "valid HTTP JSON numeric fields were rejected after roundtrip")
	var noninteger := readback()
	noninteger.designs[0].version = 1.5
	require(not ConfirmedWorldDesigns.validate_readback(noninteger), "fractional design version accepted")
	require(visual.apply_confirmed(valid), "confirmed world readback not applied")
	require(visual.revision == "a".repeat(64), "readback revision lost")
	require(visual.get_child_count() == 1, "expected one read-only placement proxy")
	require(visual.apply_confirmed(valid) and visual.get_child_count() == 1, "same revision duplicated placement")
	var bad := readback()
	bad.designs[0].placements[0].xMm = -1
	require(not ConfirmedWorldDesigns.validate_readback(bad), "negative placement coordinate accepted")
	bad = readback()
	bad.designs[0].placements[0].assetId = "../data"
	require(not ConfirmedWorldDesigns.validate_readback(bad), "untrusted asset ID accepted")
	bad = readback()
	bad.designs[0].placements.append(bad.designs[0].placements[0].duplicate(true))
	require(not ConfirmedWorldDesigns.validate_readback(bad), "duplicate placement identity accepted")
	bad = readback()
	bad.revision = "unverified"
	require(not visual.apply_confirmed(bad), "invalid revision was rendered")
	require(visual.revision.is_empty() and visual.get_child_count() == 0, "invalid readback left stale confirmed world")
	visual.clear()
	require(visual.get_child_count() == 0, "session reset leaked world proxies")
	visual.queue_free()
	var studio := WorldStudio.new()
	root.add_child(studio)
	var seen: Array[Dictionary] = []
	studio.confirmed_world.connect(func(value: Dictionary) -> void: seen.append(value))
	studio._on_completed("readback", readback())
	require(seen.size() == 1, "existing confirmed designs were not projected on first readback")
	studio._confirmed_revision = "f".repeat(64)
	studio._on_completed("readback", readback())
	require(seen.size() == 1, "mismatched post-apply revision was presented as confirmed")

	# Synthetic regression: an old plan reply cannot authorize an edited draft.
	var auth := FakeAuth.new()
	var transport := CaptureTransport.new()
	root.add_child(auth)
	root.add_child(transport)
	studio._auth = auth
	studio._transport = transport
	studio._server = "https://arelogic.space"
	studio._connection = "synthetic-zone"
	studio._confirmed_revision = ""
	var draft := {
		"schemaVersion": "aurion.world-design.v1",
		"designKey": "village.g01", "version": 1, "title": "Confirmed Village",
		"expectedCatalogRevision": "c".repeat(64), "placements": [placement()],
	}
	studio._draft.text = JSON.stringify(draft)
	studio._plan()
	require(transport.kinds == ["worldPlan"], "draft plan was not sent")
	var edited := draft.duplicate(true)
	edited.title = "Edited after request while original worldPlan was in flight"
	studio._draft.text = JSON.stringify(edited)
	studio._invalidate_plan()
	studio._on_completed("worldPlan", draft.merged({"planHash": "d".repeat(64), "referencedAssetHashes": ["e".repeat(64)], "requiresHumanConfirmation": true}))
	require(studio._plan_hash.is_empty() and studio._plan_draft.is_empty(),
		"late worldPlan reply authorized an unverified edited draft")

	# Synthetic wrong-plan receipt must not trigger world readback.
	studio._draft.text = JSON.stringify(draft)
	studio._plan()
	require(not studio._plan_requested.is_empty(), "current draft request must be captured before response")
	studio._on_completed("worldPlan", studio._plan_requested.merged({"planHash": "d".repeat(64), "referencedAssetHashes": ["e".repeat(64)], "requiresHumanConfirmation": true}))
	require(studio._plan_hash == "d".repeat(64), "unchanged plan not accepted: requested=" + JSON.stringify(studio._plan_requested) + " sent=" + JSON.stringify(transport.kinds) + " busy=" + str(studio._busy) + " info=" + studio._info.text)
	studio._apply()
	var requests_before := transport.kinds.size()
	var receipt := {
		"schemaVersion": "aurion.authoring-receipt.v1",
		"receiptId": "authoring:world:fixture0001", "kind": "world", "action": "apply",
		"targetId": "village.g01:v1", "actorUserId": 1,
		"planHash": "e".repeat(64), "previousHash": null,
		"resultHash": "b".repeat(64), "receiptHash": "e".repeat(64),
		"humanConfirmed": true,
	}
	studio._on_completed("worldApply", {"receipt": receipt, "readback": readback()})
	require(transport.kinds.size() == requests_before and studio._confirmed_revision.is_empty(),
		"wrong-plan receipt triggered a confirmed readback")

	# Correct receipt still requires matching design hash in an independent GET.
	studio._draft.text = JSON.stringify(draft)
	studio._plan()
	studio._on_completed("worldPlan", studio._plan_requested.merged({"planHash": "d".repeat(64), "referencedAssetHashes": ["e".repeat(64)], "requiresHumanConfirmation": true}))
	studio._apply()
	receipt.planHash = "d".repeat(64)
	require(not studio._pending_apply.is_empty(), "valid apply did not retain pending receipt identity")
	require(not WorldStudio._valid_apply_receipt({"receipt": receipt, "readback": readback()}, studio._pending_apply).is_empty(), "valid receipt fails binding: " + JSON.stringify(studio._pending_apply) + " receipt=" + JSON.stringify(receipt))
	requests_before = transport.kinds.size()
	studio._on_completed("worldApply", {"receipt": receipt, "readback": readback()})
	require(WorldStudio._valid_apply_receipt({"receipt": receipt, "readback": readback()}, {"plan": "d".repeat(64), "key": "village.g01", "version": 1.5}).is_empty(), "fractional pending version accepted")
	require(transport.kinds.size() == requests_before + 1 and transport.kinds[-1] == "readback",
		"valid receipt did not request independent readback")
	var mismatch := readback()
	mismatch.designs[0].designHash = "f".repeat(64)
	var projected_before := seen.size()
	studio._on_completed("readback", mismatch)
	require(seen.size() == projected_before, "revision-only match confirmed wrong design")
	studio._on_completed("readback", readback())
	require(seen.size() == projected_before + 1,
		"matching independent world revision and design was not projected")
	transport.queue_free()
	auth.queue_free()
	studio.close_session()
	studio.queue_free()
	if failures.is_empty():
		print("AURION_WORLD_AUTHORING_CONTRACT_PASS: strict tRPC and confirmed-only native world proxies")
		quit(0)
	else:
		for failure in failures:
			push_error(failure)
		quit(1)
