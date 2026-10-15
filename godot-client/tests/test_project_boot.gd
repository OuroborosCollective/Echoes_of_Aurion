extends SceneTree

func _initialize() -> void:
	call_deferred("verify_boot")

func verify_boot() -> void:
	var scene_path: String = ProjectSettings.get_setting("application/run/main_scene", "")
	var packed := load(scene_path) as PackedScene
	if packed == null:
		push_error("Main scene failed to load")
		quit(1)
		return
	var scene := packed.instantiate()
	root.add_child(scene)
	current_scene = scene
	for frame in range(3):
		await process_frame
	if not is_instance_valid(current_scene) or current_scene.name != "AurionLaunch":
		push_error("Main scene failed to boot")
		quit(1)
		return
	print("Aurion project boot verified")
	quit(0)
