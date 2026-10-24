extends SceneTree
## G15 exported-resource probe. Tests source imports, never a live world/device.
var failures: Array[String] = []
var records: Array[Dictionary] = []

func require(ok: bool, message: String) -> void:
	if not ok:
		failures.append(message)

func _init() -> void:
	call_deferred("verify")

func verify() -> void:
	var manifest_path := "res://assets/generated/manifest.json"
	var output_path := OS.get_environment("AURION_STAGED_ASSET_OUTPUT")
	var manifest: Variant = JSON.parse_string(FileAccess.get_file_as_string(manifest_path))
	if not manifest is Dictionary or not manifest.get("sources") is Array or output_path.is_empty():
		push_error("Explicit generated asset manifest and evidence output required")
		quit(1)
		return
	require(manifest.sourceRevision == OS.get_environment("AURION_EXPECTED_REVISION"), "Staged import revision changed")
	for source: Dictionary in manifest.sources:
		var resource_path := "res://assets/generated/" + str(source.assetId) + ".glb"
		var import_config := ConfigFile.new()
		require(import_config.load(resource_path + ".import") == OK, "Staged import mapping missing")
		var imported: String = import_config.get_value("remap", "path", "")
		require(imported.begins_with("res://.godot/imported/" + str(source.assetId) + ".glb-") and imported.ends_with(".scn"), "Staged import mapping changed")
		var packed := ResourceLoader.load(resource_path, "PackedScene", ResourceLoader.CACHE_MODE_IGNORE) as PackedScene
		require(packed != null, "Staged model cannot load: " + str(source.assetId))
		if packed == null:
			continue
		var scene := packed.instantiate()
		root.add_child(scene)
		var meshes := scene.find_children("*", "MeshInstance3D", true, false)
		require(meshes.size() == source.meshNodeTransforms.size(), "Staged mesh count changed")
		var triangles := 0
		for mesh: MeshInstance3D in meshes:
			require(mesh.mesh != null, "Staged mesh resource missing")
			if mesh.mesh == null:
				continue
			for surface in range(mesh.mesh.get_surface_count()):
				var arrays: Array = mesh.mesh.surface_get_arrays(surface)
				var indices: PackedInt32Array = arrays[Mesh.ARRAY_INDEX]
				var vertices: PackedVector3Array = arrays[Mesh.ARRAY_VERTEX]
				triangles += (indices.size() if not indices.is_empty() else vertices.size()) / 3
				require(mesh.get_active_material(surface) != null, "Staged material missing")
		require(triangles == int(source.triangles), "Staged triangle count changed")
		var skeletons := scene.find_children("*", "Skeleton3D", true, false)
		var bones := 0
		for skeleton: Skeleton3D in skeletons:
			bones += skeleton.get_bone_count()
		var source_bones := 0
		for skin: Dictionary in source.skins:
			source_bones += skin.joints.size()
		require(bones == source_bones, "Staged skeleton changed")
		var players := scene.find_children("*", "AnimationPlayer", true, false)
		var clips: Array[String] = []
		for clip: Dictionary in source.animations:
			require(players.size() == 1 and players[0].has_animation(clip.name), "Staged animation missing")
			if players.size() != 1 or not players[0].has_animation(clip.name):
				continue
			var player: AnimationPlayer = players[0]
			player.play(clip.name)
			player.pause()
			player.seek(0.0, true)
			var initial: Array[Transform3D] = []
			for skeleton: Skeleton3D in skeletons:
				for bone in range(skeleton.get_bone_count()):
					initial.append(skeleton.get_bone_pose(bone))
			var moving := false
			for phase in [0.25, 0.5, 0.75]:
				player.seek(player.get_animation(clip.name).length * phase, true)
				var index := 0
				for skeleton: Skeleton3D in skeletons:
					for bone in range(skeleton.get_bone_count()):
						moving = moving or not initial[index].is_equal_approx(skeleton.get_bone_pose(bone))
						index += 1
			player.stop()
			require(moving, "Staged animation has no skeleton motion")
			clips.append(str(clip.name))
		records.append({"assetId":source.assetId, "importedPath":imported, "importedSha256":FileAccess.get_sha256(imported), "triangles":triangles, "bones":bones, "clips":clips})
		scene.free()
	var report := {"schemaVersion":"aurion.godot-staged-imports.v1", "sourceRevision":manifest.sourceRevision, "manifestSha256":FileAccess.get_sha256(manifest_path), "records":records, "failures":failures}
	var output := FileAccess.open(output_path, FileAccess.WRITE)
	if output == null:
		push_error("Staged asset evidence unavailable")
		quit(1)
		return
	output.store_string(JSON.stringify(report, "\t") + "\n")
	output.close()
	if failures.is_empty():
		print("Godot staged PackedScene assets and animation motion verified")
		quit(0)
	else:
		for failure in failures:
			push_error(failure)
		quit(1)
