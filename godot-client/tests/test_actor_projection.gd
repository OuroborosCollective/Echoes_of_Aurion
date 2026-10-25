extends SceneTree
## Real imported models with explicit protocol fixtures, NOT a live-world claim.
const Actor = preload("res://actors/actor_view.tscn")
const AppearanceResolver = preload("res://actors/appearance_resolver.gd")
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
	check_approved_self_appearance(world, manifest)
	await verify_active_scene(welcome, manifest)
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

# Server response below is an explicit contract fixture, never a live selection.
# It must be joined to a confirmed self presence and a packaged source hash.

## Component/scene integration with explicit protocol fixtures and real imported
## GLBs. NOT an authenticated HTTP, production or physical-device assertion.
func verify_active_scene(welcome: Dictionary, manifest: Dictionary) -> void:
	var packed_main: PackedScene = load("res://app/main.tscn") as PackedScene
	require(packed_main != null, "G16 active Godot scene absent")
	if packed_main == null:
		return
	var scene: Control = packed_main.instantiate()
	root.add_child(scene)
	var view := scene.get_node_or_null("%WorldView") as SubViewportContainer
	var actor_root := scene.get_node_or_null("%Actors") as Node3D
	var camera := scene.get_node_or_null("%WorldCamera") as Camera3D
	require(view != null and actor_root != null and camera != null, "G16 active scene lacks 3D viewport/actors/camera")
	if view == null or actor_root == null or camera == null:
		scene.queue_free()
		return
	var live_viewport := view.get_node_or_null("Live3D") as SubViewport
	require(live_viewport != null, "G16 active SubViewport missing")
	if live_viewport != null:
		require(live_viewport.render_target_update_mode == SubViewport.UPDATE_WHEN_PARENT_VISIBLE,
			"hidden login/disconnected 3D viewport still renders continuously")
	var initial_camera_transform: Transform3D = camera.transform
	require(not view.visible, "offline Godot scene presented an invented authenticated world")
	scene._on_zone_welcome(welcome)
	require(not view.visible, "welcome alone misreported full zone connection")
	scene._on_zone_connected()
	require(view.visible, "confirmed zone did not open active native 3D presentation")
	require(actor_root.get_child_count() == 0, "unapproved player appearance silently spawned a figure")
	# No selected/loaded actor must never hide an expired confirmed world in the
	# full-screen 3D HUD. Test the real scene with the existing stale clock.
	var world_label := scene.get_node_or_null("%WorldStatus") as Label
	require(world_label != null, "3D freshness label missing")
	scene._update_world_freshness(scene._last_world_update_ms + 1500)
	require(scene._world_is_stale, "fixture did not reach stale world state")
	if world_label != null:
		require(world_label.text.contains("Stand veraltet"),
			"no-model 3D HUD hid stale confirmed world state")
	var source: Dictionary = {}
	for entry: Dictionary in manifest.sources:
		if entry.role == "character":
			source = entry
			break
	if source.is_empty():
		require(false, "prepared player model absent in scene test")
		scene.queue_free()
		return
	var sha: String = source.sha256
	var asset_id := "glb_" + sha.substr(0, 48)
	var url := "/api/assets/glb/" + sha + ".glb"
	var response := {"version": "aurion.glb-import.v1", "revision": "a".repeat(64),
		"entries": [{"assetId":asset_id, "sha256":sha, "storageUrl":url,
			"purpose":"player-public", "assetType":"character", "targetKey":null}],
		"selected":{"assetId":asset_id, "storageUrl":url, "visibility":"private"}, "immutable":true}
	# An unprotected callback must not mount anything, even with valid-looking JSON.
	scene._on_appearance_ready(response, welcome.connectionId, 0)
	require(actor_root.get_child_count() == 0, "appearance response bypassed session generation/authorization")
	var resolution: Dictionary = AppearanceResolver.new().resolve_self(scene._confirmed_zone, response, manifest)
	require(resolution.get("status") == "resolved", "scene test catalog did not authorize its model")
	if resolution.get("status") != "resolved":
		scene.queue_free()
		return
	require(scene._mount_resolved_self(resolution), "validated real imported GLB did not enter active scene")
	require(actor_root.get_child_count() == 1, "active scene has wrong player count")
	var actor: Node3D = actor_root.get_child(0) as Node3D
	require(actor != null and actor.visible, "approved model is hidden in active viewport")
	require(actor.get("entity_id") == welcome.selfEntityId, "scene actor lost server-confirmed ID")
	require(actor.get("asset_id") == asset_id, "scene actor lost approved catalog ID")
	require(not actor.find_children("*", "MeshInstance3D", true, false).is_empty(),
		"active scene did not instantiate real model geometry")
	require(actor.position == Vector3.ZERO, "scene player position invented offsets")
	var snapshot := welcome.duplicate(true)
	for key in ["protocolVersion", "connectionId", "selfEntityId"]:
		snapshot.erase(key)
	snapshot.type = "snapshot"
	snapshot.snapshotSeq = 2
	snapshot.tick = 2
	snapshot.presences[0].position.x = 1000
	scene._on_zone_snapshot(snapshot)
	scene._project_3d(scene._last_world_update_ms + 100)
	require(is_equal_approx(actor.position.x, 1.0), "native scene actor did not follow confirmed 100-ms position")
	require(is_equal_approx(camera.position.x, 1.0), "native camera stopped tracking confirmed player")
	require(scene._confirmed_zone.current_state().presences[0].position.x == 1000,
		"visual scene changed confirmed integer-mm truth")
	var output := OS.get_environment("AURION_ACTOR_RENDER_DIR")
	if not output.is_empty():
		# The actor component test also owns two Node3D siblings at SceneTree
		# root. Hide them before whole-window capture so no foreign monster can
		# be mistaken for an entity instantiated by the active main scene.
		var unrelated: Array[Node3D] = []
		for child in root.get_children():
			if child is Node3D and child.visible:
				unrelated.append(child)
				child.visible = false
		await process_frame
		await RenderingServer.frame_post_draw
		var live_viewport := view.get_node("Live3D") as SubViewport
		require(live_viewport != null, "native 3D render viewport missing")
		if live_viewport != null:
			require(live_viewport.get_texture().get_image().save_png(output.path_join("world-viewport.png")) == OK,
				"isolated native 3D viewport render was not captured")
		require(root.get_texture().get_image().save_png(output.path_join("world-view.png")) == OK,
			"uncontaminated active native 3D composition render was not captured")
		for hidden in unrelated:
			hidden.visible = true
	# Regression: a distant confirmed X position must not leave the unassigned
	# preview plane behind at the original world origin. This is only visual
	# presentation; it must never turn into a world/terrain authority.
	var preview_floor := scene.get_node_or_null("WorldView/Live3D/World/UnassignedFloor") as MeshInstance3D
	require(preview_floor != null, "G16 unassigned preview floor absent")
	var far_snapshot := snapshot.duplicate(true)
	far_snapshot.snapshotSeq = 3
	far_snapshot.tick = 3
	far_snapshot.presences[0].position.x = 100000
	scene._on_zone_snapshot(far_snapshot)
	scene._project_3d(scene._last_world_update_ms + 100)
	require(is_equal_approx(actor.position.x, 100.0),
		"confirmed distant server position not projected to native actor")
	if preview_floor != null:
		require(is_equal_approx(preview_floor.position.x, actor.position.x),
			"unassigned preview floor did not follow confirmed distant actor")
		var authoritative: Dictionary = scene._confirmed_zone.current_state()
		require(authoritative.presences[0].position.x == 100000,
			"moving the presentation floor modified authoritative integer-mm state")
	scene._reset_projection()
	require(camera.transform == initial_camera_transform,
		"session reset retained the previous confirmed player's camera viewpoint")
	if preview_floor != null:
		require(preview_floor.position == Vector3.ZERO,
			"unassigned preview floor retained prior session's position")
	require(actor_root.get_child_count() == 0 and not view.visible,
		"logout/despawn retained 3D actor or viewport")
	scene.queue_free()

func check_approved_self_appearance(world: Variant, manifest: Dictionary) -> void:
	var resolver_path := "res://actors/appearance_resolver.gd"
	if not ResourceLoader.exists(resolver_path):
		require(false, "G16 approved appearance resolver missing")
		return
	var resolver: Variant = load(resolver_path).new()
	var source: Dictionary = {}
	for candidate: Dictionary in manifest.sources:
		if candidate.role == "character":
			source = candidate
			break
	require(not source.is_empty(), "G16 real player GLB unavailable")
	if source.is_empty():
		return
	var sha: String = source.sha256
	var server_asset_id := "glb_" + sha.substr(0, 48)
	var storage_url := "/api/assets/glb/" + sha + ".glb"
	var entry := {"assetId": server_asset_id, "sha256": sha, "storageUrl": storage_url,
		"purpose": "player-public", "assetType": "character", "targetKey": null}
	var response := {"version": "aurion.glb-import.v1", "revision": "a".repeat(64),
		"entries": [entry], "selected": {"assetId": server_asset_id,
			"storageUrl": storage_url, "visibility": "private"}, "immutable": true}
	var before := JSON.stringify(world.current_state())
	var result: Dictionary = resolver.resolve_self(world, response, manifest)
	require(result.get("status") == "resolved", "approved selected player model not resolved: " + str(result))
	require(result.get("entityId") == world.self_entity_id(), "resolver did not bind confirmed self ID")
	require(result.get("catalogAssetId") == server_asset_id, "resolver invented catalog identity")
	require(result.get("sourceAssetId") == source.assetId, "resolver lost generated source identity")
	require(result.get("sha256") == sha, "resolver lost source content hash")
	# Real JSON decoders may represent an integer wire userId as float 1.0.
	# The authoritative codec admits either integral representation.
	var json_numeric_welcome: Dictionary = fixture()
	json_numeric_welcome.presences[0].userId = 1.0
	var json_numeric_world := World.new()
	require(json_numeric_world.apply_welcome(json_numeric_welcome),
		"canonical codec rejected integral JSON float userId")
	require(resolver.resolve_self(json_numeric_world, response, manifest).get("status") == "resolved",
		"valid JSON float presence was blocked by appearance join")
	json_numeric_welcome.presences[0].userId = 1.5
	var invalid_fraction_world := World.new()
	require(not invalid_fraction_world.apply_welcome(json_numeric_welcome),
		"fractional userId admitted by canonical zone validation")
	require(result.get("resourcePath") == "res://assets/generated/" + str(source.assetId) + ".glb",
		"resolver selected an unapproved local path")
	require(JSON.stringify(world.current_state()) == before, "visual resolution changed confirmed Aurion state")
	# Server catalog IDs are authority IDs; generated local IDs are content
	# addresses. They need not be identical even when the SHA is identical.
	var aliased: Dictionary = response.duplicate(true)
	aliased.entries[0].assetId = "approved_player_custom_01"
	aliased.selected.assetId = "approved_player_custom_01"
	var alias_result: Dictionary = resolver.resolve_self(world, aliased, manifest)
	require(alias_result.get("status") == "resolved" and alias_result.get("catalogAssetId") == "approved_player_custom_01" and alias_result.get("sourceAssetId") == source.assetId,
		"server catalog alias incorrectly treated as generated GLB filename")
	var no_selection: Dictionary = response.duplicate(true)
	no_selection.selected = null
	require(resolver.resolve_self(world, no_selection, manifest).get("reason") == "selection_missing",
		"missing character selection silently fell back")
	var wrong_purpose: Dictionary = response.duplicate(true)
	wrong_purpose.entries[0].purpose = "enemy-fallback"
	require(resolver.resolve_self(world, wrong_purpose, manifest).get("reason") == "selection_not_admitted",
		"monster was admitted as selected player")
	var changed_hash: Dictionary = response.duplicate(true)
	changed_hash.entries[0].sha256 = "b".repeat(64)
	require(resolver.resolve_self(world, changed_hash, manifest).get("reason") == "selection_not_admitted",
		"catalog hash mismatch accepted")
	var duplicate: Dictionary = response.duplicate(true)
	duplicate.entries.append(entry.duplicate(true))
	require(resolver.resolve_self(world, duplicate, manifest).get("reason") == "catalog_ambiguous",
		"duplicate server catalog identity was silently selected")
	var missing_local: Dictionary = manifest.duplicate(true)
	missing_local.sources = []
	require(resolver.resolve_self(world, response, missing_local).get("reason") == "prepared_model_missing",
		"unshipped server model was rendered using a fallback")
	var different_output: Dictionary = manifest.duplicate(true)
	for item: Dictionary in different_output.sources:
		if item.role == "character":
			item.outputSha256 = "c".repeat(64)
	require(resolver.resolve_self(world, response, different_output).get("reason") == "prepared_model_missing",
		"corrupt prepared GLB identity was used")
	var no_world := World.new()
	require(resolver.resolve_self(no_world, response, manifest).get("reason") == "no_confirmed_self",
		"unconfirmed identity rendered a player")
	var invalid_catalog: Dictionary = response.duplicate(true)
	invalid_catalog.revision = "wrong"
	require(resolver.resolve_self(world, invalid_catalog, manifest).get("reason") == "catalog_invalid",
		"unversioned catalog response was trusted")
