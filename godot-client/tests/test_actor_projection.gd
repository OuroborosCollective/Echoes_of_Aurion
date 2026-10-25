extends SceneTree
## Real imported models with explicit protocol fixtures, NOT a live-world claim.
const Actor = preload("res://actors/actor_view.tscn")
const World = preload("res://projection/zone_state.gd")
const Visual = preload("res://projection/snapshot_interpolator.gd")
const Codec = preload("res://net/zone_codec.gd")
var failures: Array[String] = []

func require(ok: bool, why: String) -> void:
	if not ok:
		failures.append(why)

func _init() -> void:
	call_deferred("verify")

func fixture() -> Dictionary:
	var nodes: Array = []
	for id in Codec.NODE_IDS:
		nodes.append({"nodeId":id,"remaining":5,"depleted":false,"respawnAtTick":null})
	return {"type":"welcome","protocolVersion":5,"zoneId":"observatory_threshold",
		"connectionId":"zone_peer_actorprojection123","selfEntityId":"player:1","snapshotSeq":1,"tick":1,
		"presences":[{"entityId":"player:1","userId":1,"position":{"x":0,"z":0},"lastAcceptedClientSeq":0}],
		"mobs":[{"entityId":"mob_1","archetype":"clockwork_stalker","level":1,"state":"idle","position":{"x":2000,"z":0},"targetEntityId":null,"isBoss":false,"isElite":false,"health":10,"maxHealth":10}],
		"combatants":[],"resources":{"contractVersion":1,"contentSourceRevision":Codec.FIXED_CONTENT,"revision":1,"nodes":nodes}}

func verify() -> void:
	var manifest: Variant = JSON.parse_string(FileAccess.get_file_as_string("res://assets/generated/manifest.json"))
	if not manifest is Dictionary or not manifest.get("sources") is Array:
		push_error("prepared model manifest required")
		quit(1)
		return
	var world := World.new()
	var visual := Visual.new()
	var welcome := fixture()
	require(world.apply_welcome(welcome), "fixture violates confirmed contract")
	visual.capture(world, 1000)
	var actors: Array[Node3D] = []
	for source: Dictionary in manifest.sources:
		if source.animations.is_empty():
			continue
		var id := "player:1" if source.role == "character" else "mob_1"
		var packed := load("res://assets/generated/" + str(source.assetId) + ".glb") as PackedScene
		var actor := Actor.instantiate() as Node3D
		root.add_child(actor)
		require(not actor.bind_confirmed(world, "player:999", source.assetId, packed), "unknown entity bound")
		require(actor.bind_confirmed(world, id, source.assetId, packed), "real model did not bind")
		require(not actor.bind_confirmed(world, id, source.assetId, packed), "duplicate bind accepted")
		require(actor.project(world, visual, 1000), "initial projection rejected")
		require(actor.visible and actor.diagnostic.is_empty(), "bound figure not visible or missing Idle")
		require(not actor.find_children("*", "MeshInstance3D", true, false).is_empty(), "figure has no real meshes")
		actors.append(actor)
	require(actors.size() == 2, "expected actual player and monster models")
	var snapshot := welcome.duplicate(true)
	for key in ["protocolVersion", "connectionId", "selfEntityId"]:
		snapshot.erase(key)
	snapshot.type = "snapshot"
	snapshot.snapshotSeq = 2
	snapshot.tick = 2
	snapshot.presences[0].position.x = 1000
	snapshot.mobs[0].position.x = 3000
	require(world.apply_snapshot(snapshot), "movement fixture rejected")
	visual.capture(world, 1100)
	for actor in actors:
		require(actor.project(world, visual, 1150), "movement projection failed")
		var confirmed: Dictionary = actor.confirmed_mm()
		require(absf(actor.position.x - (float(confirmed.x) / 1000.0 - 0.5)) < 0.001, "visual interpolation overwritten")
		var player: AnimationPlayer = actor.find_children("*", "AnimationPlayer", true, false)[0]
		require(player.current_animation == "Walk", "confirmed movement did not choose Walk")
		var before := actor.transform
		var skeletons := actor.find_children("*", "Skeleton3D", true, false)
		var poses: Array[Transform3D] = []
		for skeleton: Skeleton3D in skeletons:
			for bone in range(skeleton.get_bone_count()):
				poses.append(skeleton.get_bone_pose(bone))
		player.advance(0.25)
		var index := 0
		var motion := false
		for skeleton: Skeleton3D in skeletons:
			for bone in range(skeleton.get_bone_count()):
				motion = motion or not poses[index].is_equal_approx(skeleton.get_bone_pose(bone))
				index += 1
		require(motion, "actor Walk produced no real bone motion")
		require(actor.transform == before and actor.confirmed_mm() == confirmed, "animation changed wrapper or confirmed position")
		confirmed.x = -999
		require(actor.confirmed_mm().x != -999, "caller mutated confirmed readback")
		require(actor.project(world, visual, 1200), "settled projection failed")
		require(actor.position.x == float(actor.confirmed_mm().x) / 1000.0, "figure failed to settle")
		require(player.current_animation == "Idle", "settled actor continues invented walking")
	var render_dir := OS.get_environment("AURION_ACTOR_RENDER_DIR")
	if not render_dir.is_empty():
		var camera := Camera3D.new()
		root.add_child(camera)
		camera.position = Vector3(2, 2.0, 5)
		camera.look_at(Vector3(2, 0.5, 0))
		camera.current = true
		var light := DirectionalLight3D.new()
		root.add_child(light)
		light.rotation_degrees = Vector3(-40, -30, 0)
		var environment := WorldEnvironment.new()
		environment.environment = Environment.new()
		environment.environment.background_mode = Environment.BG_COLOR
		environment.environment.background_color = Color(0.08, 0.1, 0.15)
		environment.environment.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
		environment.environment.ambient_light_color = Color.WHITE
		environment.environment.ambient_light_energy = 0.6
		root.add_child(environment)
		await process_frame
		await RenderingServer.frame_post_draw
		require(root.get_texture().get_image().save_png(render_dir.path_join("actors.png")) == OK, "actor render capture failed")
		print("G16_RENDER_ADAPTER=" + RenderingServer.get_video_adapter_name())
	var monster: Node3D
	for actor in actors:
		if actor.entity_id == "mob_1":
			monster = actor
	if monster != null:
		var player: AnimationPlayer = monster.find_children("*", "AnimationPlayer", true, false)[0]
		var starts: Array[String] = []
		player.animation_started.connect(func(clip: StringName): starts.append(str(clip)))
		snapshot.snapshotSeq = 3
		snapshot.tick = 3
		snapshot.mobs[0].state = "dead"
		snapshot.mobs[0].health = 0
		require(world.apply_snapshot(snapshot), "death fixture rejected")
		visual.capture(world, 1300)
		require(monster.project(world, visual, 1300), "death projection failed")
		require(player.current_animation == "Death" and player.get_animation("Death").loop_mode == Animation.LOOP_NONE, "death clip missing or loops")
		player.advance(player.get_animation("Death").length + 0.1)
		snapshot.snapshotSeq = 4
		snapshot.tick = 4
		world.apply_snapshot(snapshot)
		visual.capture(world, 1400)
		monster.project(world, visual, 1400)
		require(starts.count("Death") == 1, "repeated dead snapshot restarted death")
		snapshot.snapshotSeq = 5
		snapshot.tick = 5
		snapshot.mobs.clear()
		world.apply_snapshot(snapshot)
		visual.capture(world, 1500)
		require(not monster.project(world, visual, 1500), "despawn retained model")
		require(monster.get_child_count() == 0 and not monster.visible, "despawn leaked node")
	# A different session with identical positions must not reuse old visuals.
	var other := World.new()
	var other_welcome := world.current_state()
	other_welcome.type = "welcome"
	other_welcome.protocolVersion = 5
	other_welcome.selfEntityId = "player:1"
	other_welcome.connectionId = "zone_peer_otheractor1234567"
	require(other.apply_welcome(other_welcome), "foreign-session fixture invalid")
	var other_visual := Visual.new()
	other_visual.capture(other, 1200)
	for actor in actors:
		if actor.entity_id.is_empty():
			continue
		require(not actor.project(world, other_visual, 1600) and not actor.visible, "foreign-session interpolation accepted")
		require(actor.project(world, visual, 1600) and actor.diagnostic.is_empty(), "same-pose recovery retained diagnostic")
		var stale := World.new()
		var stale_welcome := other_welcome.duplicate(true)
		stale_welcome.connectionId = world.connection_id()
		stale_welcome.snapshotSeq -= 1
		require(stale.apply_welcome(stale_welcome), "stale-session fixture invalid")
		var stale_visual := Visual.new()
		stale_visual.capture(stale, 1600)
		require(not actor.project(world, stale_visual, 1600), "stale-sequence interpolation accepted")
		require(actor.project(world, visual, 1600) and actor.diagnostic.is_empty(), "stale-sequence recovery retained diagnostic")
	world.reset()
	for actor in actors:
		require(not actor.project(world, visual, 1300), "reset retained actor")
		require(not actor.visible and actor.get_child_count() == 0 and actor.entity_id.is_empty(), "reset leaked model or binding")
		actor.free()
	if failures.is_empty():
		print("G16 real model actor projection verified (protocol fixtures, no live assignment)")
		quit(0)
	else:
		for failure in failures:
			push_error(failure)
		quit(1)
