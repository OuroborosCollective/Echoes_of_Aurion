extends SceneTree
## G14 source-asset probe. Never installed as a gameplay or auth route.
var failures: Array[String] = []
var records: Array[Dictionary] = []
var render_dir := ""
var camera: Camera3D
var caption: Label

func require(ok: bool, message: String) -> void:
	if not ok:
		failures.append(message)

func _init() -> void:
	call_deferred("verify")

func poses(skeletons: Array[Node]) -> Array[Transform3D]:
	var result: Array[Transform3D] = []
	for skeleton in skeletons:
		for bone in range(skeleton.get_bone_count()):
			result.append(skeleton.get_bone_pose(bone))
	return result

func prepare_render() -> void:
	root.size = Vector2i(1024, 768)
	DisplayServer.window_set_size(root.size)
	DirAccess.make_dir_recursive_absolute(render_dir)
	var stage := Node3D.new()
	root.add_child(stage)
	var environment := WorldEnvironment.new()
	environment.environment = Environment.new()
	environment.environment.background_mode = Environment.BG_COLOR
	environment.environment.background_color = Color("18252e")
	environment.environment.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	environment.environment.ambient_light_color = Color.WHITE
	environment.environment.ambient_light_energy = 0.7
	stage.add_child(environment)
	var light := DirectionalLight3D.new()
	light.rotation_degrees = Vector3(-45, -30, 0)
	stage.add_child(light)
	camera = Camera3D.new()
	stage.add_child(camera)
	camera.make_current()
	var overlay := CanvasLayer.new()
	root.add_child(overlay)
	caption = Label.new()
	caption.position = Vector2(20, 16)
	caption.size = Vector2(984, 100)
	caption.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	caption.add_theme_font_size_override("font_size", 18)
	overlay.add_child(caption)

func render_asset(source: Dictionary, bounds: AABB, players: Array[Node]) -> Array[Dictionary]:
	var captures: Array[Dictionary] = []
	var radius := maxf(bounds.size.length() * 0.5, 0.1)
	var center := bounds.get_center()
	camera.near = radius / 100.0
	camera.far = radius * 30.0
	camera.position = center + Vector3(1.0, 0.6, 1.5).normalized() * radius * 3.5
	camera.look_at(center)
	var player: AnimationPlayer = players[0] if not players.is_empty() else null
	var phases := [0.0, 0.3] if player != null and player.has_animation("Walk") else [0.0]
	for phase: float in phases:
		if phases.size() == 2:
			player.play("Walk")
			player.pause()
			player.seek(player.get_animation("Walk").length * phase, true)
		caption.text = "G14 · 3D-Assetprobe · %s\nSHA-256 %s\nGodot %s · keine Live-Welt / kein Android-Gerätetest" % [source.path.get_file(), source.sha256, Engine.get_version_info().string]
		for frame in range(3):
			await process_frame
		await RenderingServer.frame_post_draw
		var image := root.get_texture().get_image()
		require(not image.is_empty(), "Renderer returned empty asset capture")
		if image.is_empty():
			continue
		var background := image.get_pixel(2, 150)
		var geometry_pixels := 0
		for y in range(150, 740, 10):
			for x in range(40, 984, 10):
				var pixel := image.get_pixel(x, y)
				if maxf(absf(pixel.r - background.r), maxf(absf(pixel.g - background.g), absf(pixel.b - background.b))) > 0.03:
					geometry_pixels += 1
		require(geometry_pixels > 10, "3D asset is not visible in capture: " + source.path)
		var name := "%s-walk-%02d.png" % [source.path.get_file().get_basename(), int(phase * 100)]
		var path := render_dir.path_join(name)
		require(image.save_png(path) == OK, "Asset capture could not be saved")
		captures.append({"file":name, "sha256":FileAccess.get_sha256(path), "visibleSamplePixels":geometry_pixels})
	return captures

func verify() -> void:
	var input_path := OS.get_environment("AURION_ASSET_AUDIT_INPUT")
	var output_path := OS.get_environment("AURION_ASSET_AUDIT_OUTPUT")
	var source_root := OS.get_environment("AURION_ASSET_SOURCE_ROOT")
	render_dir = OS.get_environment("AURION_ASSET_RENDER_DIR")
	if not render_dir.is_empty():
		if DisplayServer.get_name() == "headless":
			push_error("G14 rendering requires a real display backend")
			quit(1)
			return
		prepare_render()
	if input_path.is_empty() or output_path.is_empty() or source_root.is_empty():
		push_error("Explicit G14 source/input/output paths required")
		quit(1)
		return
	var inventory: Variant = JSON.parse_string(FileAccess.get_file_as_string(input_path))
	if not inventory is Dictionary or not inventory.get("sources") is Array:
		push_error("G14 source inventory invalid")
		quit(1)
		return
	for source: Dictionary in inventory.sources:
		var path := source_root.path_join(source.path)
		require(FileAccess.get_sha256(path) == source.sha256, "Source hash changed: " + source.path)
		if not failures.is_empty():
			break
		var document := GLTFDocument.new()
		var state := GLTFState.new()
		var imported := document.append_from_file(path, state)
		require(imported == OK, "Godot GLTF import rejected " + source.path)
		if imported != OK:
			continue
		var scene := document.generate_scene(state)
		require(scene != null, "Godot generated no scene: " + source.path)
		if scene == null:
			continue
		root.add_child(scene)
		var meshes := scene.find_children("*", "MeshInstance3D", true, false)
		var skeletons := scene.find_children("*", "Skeleton3D", true, false)
		var players := scene.find_children("*", "AnimationPlayer", true, false)
		require(not meshes.is_empty(), "Imported asset is invisible/meshless: " + source.path)
		var triangles := 0
		var bounds: AABB
		var first_bounds := true
		for instance in meshes:
			require(instance.mesh != null, "Imported mesh resource missing")
			if instance.mesh == null:
				continue
			var mesh_bounds: AABB = instance.global_transform * instance.get_aabb()
			bounds = mesh_bounds if first_bounds else bounds.merge(mesh_bounds)
			first_bounds = false
			for surface in range(instance.mesh.get_surface_count()):
				var arrays: Array = instance.mesh.surface_get_arrays(surface)
				var indices: PackedInt32Array = arrays[Mesh.ARRAY_INDEX]
				var vertices: PackedVector3Array = arrays[Mesh.ARRAY_VERTEX]
				triangles += (indices.size() if not indices.is_empty() else vertices.size()) / 3
				require(instance.get_active_material(surface) != null, "Imported surface lost material: " + source.path)
		require(triangles == int(source.triangles), "Godot geometry differs from source: " + source.path)
		var bone_count := 0
		for skeleton in skeletons:
			bone_count += skeleton.get_bone_count()
		var source_bones := 0
		for skin: Dictionary in source.skins:
			source_bones += skin.joints.size()
		require(bone_count == source_bones, "Godot skeleton differs from source: " + source.path)
		var clips: Array[Dictionary] = []
		for clip: Dictionary in source.animations:
			require(players.size() == 1 and players[0].has_animation(clip.name), "Imported clip missing: " + str(clip.name))
			if players.size() != 1 or not players[0].has_animation(clip.name):
				continue
			var player: AnimationPlayer = players[0]
			var animation := player.get_animation(clip.name)
			player.play(clip.name)
			player.seek(0.0, true)
			var initial := poses(skeletons)
			var changed := false
			for sample in range(1, 9):
				player.seek(animation.length * float(sample) / 8.0, true)
				var sampled := poses(skeletons)
				for bone in range(initial.size()):
					changed = changed or not initial[bone].is_equal_approx(sampled[bone])
			require(changed, "Clip has no imported skeleton motion: " + source.path + ":" + str(clip.name))
			clips.append({"name": clip.name, "seconds": animation.length, "skeletonMotion": changed})
			player.stop()
		require(bounds.size.is_finite() and bounds.size.length() > 0.0, "Imported bounds are empty/nonfinite: " + source.path)
		var captures: Array[Dictionary] = []
		if not render_dir.is_empty():
			captures = await render_asset(source, bounds, players)
			if captures.size() == 2:
				require(captures[0].sha256 != captures[1].sha256, "Walk poses produced identical images: " + source.path)
		records.append({"path": source.path, "sha256": source.sha256, "triangles": triangles, "meshInstances": meshes.size(), "bones": bone_count, "boundsMin":[bounds.position.x,bounds.position.y,bounds.position.z], "boundsSize":[bounds.size.x,bounds.size.y,bounds.size.z], "clips": clips, "captures":captures})
		scene.free()
		await process_frame
	var report := {"schemaVersion":"aurion.godot-asset-import.v1", "sourceRevision":inventory.sourceRevision, "engine":Engine.get_version_info().string, "display":DisplayServer.get_name(), "records":records, "failures":failures, "truthNotice":"Real Godot source imports and skeleton-motion samples; no gameplay, live assignment or Android device proof."}
	var output := FileAccess.open(output_path, FileAccess.WRITE)
	if output == null:
		push_error("G14 output unavailable")
		quit(1)
		return
	output.store_string(JSON.stringify(report, "\t") + "\n")
	output.close()
	if failures.is_empty():
		print("Godot source asset geometry, skeletons and clip motion verified")
		quit(0)
	else:
		for failure in failures:
			push_error(failure)
		quit(1)
