extends SceneTree
## Aurion-only authoring response and confirmed-world presentation contract fixtures.
## Synthetic data, no production Admin approval or database effects.
const Api = preload("res://net/api/world_authoring_api.gd")
const Projection = preload("res://world/confirmed_world_designs.gd")
var failures: Array[String] = []

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
	var visual := Projection.new()
	root.add_child(visual)
	var valid := readback()
	require(Projection.validate_readback(valid), "legitimate authoritative world readback rejected")
	require(visual.apply_confirmed(valid), "confirmed world readback not applied")
	require(visual.revision == "a".repeat(64), "readback revision lost")
	require(visual.get_child_count() == 1, "expected one read-only placement proxy")
	require(visual.apply_confirmed(valid) and visual.get_child_count() == 1, "same revision duplicated placement")
	var bad := readback()
	bad.designs[0].placements[0].xMm = -1
	require(not Projection.validate_readback(bad), "negative placement coordinate accepted")
	bad = readback()
	bad.designs[0].placements[0].assetId = "../data"
	require(not Projection.validate_readback(bad), "untrusted asset ID accepted")
	bad = readback()
	bad.designs[0].placements.append(bad.designs[0].placements[0].duplicate(true))
	require(not Projection.validate_readback(bad), "duplicate placement identity accepted")
	bad = readback()
	bad.revision = "unverified"
	require(not visual.apply_confirmed(bad), "invalid revision was rendered")
	require(visual.revision.is_empty() and visual.get_child_count() == 0, "invalid readback left stale confirmed world")
	visual.clear()
	require(visual.get_child_count() == 0, "session reset leaked world proxies")
	visual.queue_free()
	if failures.is_empty():
		print("AURION_WORLD_AUTHORING_CONTRACT_PASS: strict tRPC and confirmed-only native world proxies")
		quit(0)
	else:
		for failure in failures:
			push_error(failure)
		quit(1)
