extends "res://tests/test_world_design_scene.gd"
## Largest legal server-shaped plan; timings are local regression guards, not
## tablet FPS evidence. The repeated query must not sort the full plan per frame.

func verify() -> void:
	var projection := load("res://world/world_design_projection.gd").new() as Node3D
	root.add_child(projection)
	var plan := design()
	plan.designs.clear()
	for d in range(64):
		var group: Dictionary = design().designs[0].duplicate(true)
		group.designKey = "design-%02d" % d
		group.placements.clear()
		for index in range(255, -1, -1):
			var placement: Dictionary = design().designs[0].placements[0].duplicate(true)
			placement.placementKey = "slot-%03d" % index
			group.placements.append(placement)
		plan.designs.append(group)
	var started := Time.get_ticks_msec()
	require(projection.bind_confirmed(plan, catalog(), SESSION), "maximum-size valid server plan rejected")
	var bound := Time.get_ticks_msec()
	require(projection.accept_surface(surface(), SESSION, Vector2i.ZERO), "large-plan confirmed chunk rejected")
	var surface_ready := Time.get_ticks_msec()
	for i in range(100):
		require(projection.needed_assets().size() == 1, "large-plan needed asset became inconsistent")
	var finished := Time.get_ticks_msec()
	print("WORLD_DESIGN_BENCH bind_ms=%d surface_ms=%d repeated_100_ms=%d" % [bound-started,surface_ready-bound,finished-surface_ready])
	require(finished-surface_ready < 10000, "repeated asset checks exceeded bounded regression budget")
	projection.queue_free()
	await process_frame
	if failures.is_empty(): print("GODOT_WORLD_DESIGN_LARGE_READBACK_PASS (synthetic plan; no device performance claim)")
	else:
		for failure in failures: push_error(failure)
	quit(0 if failures.is_empty() else 1)
