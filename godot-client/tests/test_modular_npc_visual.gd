extends SceneTree
## Presentation-only fixtures; not proof of Aurion runtime or tablet FPS.
const Visual = preload("res://actors/modular_npc_visual.gd")
var failures: Array[String] = []

func require(ok: bool, message: String) -> void:
	if not ok:
		failures.append(message)

func _init() -> void:
	call_deferred("verify")

func verify() -> void:
	var invalid_ids := ["", "npc:", "player:alice", "npc:Joe", "npc:../bad", "npc:" + "a".repeat(65)]
	for id in invalid_ids:
		require(Visual.recipe(id).is_empty(), "invalid ID yielded an appearance: " + id)
	var npc_ids := ["npc:smith", "npc:merchant", "npc:guard_01", "npc:farmer_01",
		"npc:farmer_02", "npc:ranger_01", "npc:artisan", "npc:innkeeper"]
	var varied := {}
	for id in npc_ids:
		var a: Dictionary = Visual.recipe(id)
		var b: Dictionary = Visual.recipe(id)
		require(a == b and not a.is_empty(), "cosmetic mapping not stable: " + id)
		require(a.get("model") in ["male", "female"] and int(a.get("outfit", -1)) in [1, 2],
			"model/outfit outside allowed choices")
		require(int(a.get("hair", -1)) >= 0 and int(a.get("hair", -1)) < 6,
			"hairstyle outside allowed catalog")
		var key := str(a.get("model")) + "/" + str(a.get("hair")) + "/" + str(a.get("outfit"))
		varied[key] = true
	require(varied.size() >= 3, "all NPCs share one appearance")
	if Visual.available():
		var host := Node3D.new()
		root.add_child(host)
		for id in npc_ids:
			var actor: Node3D = Visual.create(id, "Confirmed visual of " + id)
			require(actor != null, "installed add-on could not instantiate avatar " + id)
			if actor != null:
				host.add_child(actor)
				require(actor.has_method("is_character_valid") and bool(actor.call("is_character_valid")),
					"modular humanoid rig not valid " + id)
				require(actor.has_method("play_animation") and bool(actor.call("play_animation", &"Idle", 0.0)),
					"modular Idle animation unavailable " + id)
				require(not actor.find_children("*", "MeshInstance3D", true, false).is_empty(),
					"no skinned mesh " + id)
		host.queue_free()
		await process_frame
	else:
		require(Visual.create("npc:smith", "fixture") == null,
			"missing private add-on unexpectedly produced a character")
	if failures.is_empty():
		print("Aurion MCS NPC cosmetic recipe and optional 1.0 rig verified (headless presentation only)")
		quit(0)
	else:
		for failure in failures:
			push_error(failure)
		quit(1)
