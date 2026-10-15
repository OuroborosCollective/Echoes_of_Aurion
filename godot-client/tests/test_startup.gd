extends SceneTree

const Config = preload("res://config/runtime_config.gd")
var failures: Array[String] = []

func require(condition: bool, message: String) -> void:
	if not condition:
		failures.append(message)

func _init() -> void:
	call_deferred("verify")

func verify() -> void:
	require(Config.validated_server_url("https://arelogic.space/") == Config.PRODUCT_SERVER, "product URL rejected")
	for invalid in ["http://arelogic.space", "https://arelogic.space.evil.test", "https://user@arelogic.space", "https://arelogic.space/path", "https://arelogic.space?token=bad", "", "http://127.0.0.1:3000"]:
		require(Config.validated_server_url(invalid).is_empty(), "unsafe URL accepted: " + invalid)
	require(Config.validated_server_url("http://127.0.0.1:3000", true) != "", "explicit local test URL rejected")
	require(Config.validated_build("aurion-g06.1") != "", "build ID rejected")
	for invalid_build in ["ab", "has spaces", "a".repeat(121), "bad/token"]:
		require(Config.validated_build(invalid_build).is_empty(), "unsafe build accepted")
	for action in ["move_left", "move_right", "move_forward", "move_backward", "interact", "primary_action"]:
		require(InputMap.has_action(action), "missing input action: " + action)
	require(ProjectSettings.get_setting("rendering/renderer/rendering_method") == "gl_compatibility", "renderer changed")
	var packed := load("res://app/main.tscn") as PackedScene
	require(packed != null, "main scene unavailable")
	if packed == null:
		quit(1)
		return
	var scene := packed.instantiate()
	root.add_child(scene)
	for viewport_size in [Vector2i(1340, 800), Vector2i(800, 1340), Vector2i(360, 640)]:
		root.size = viewport_size
		await process_frame
		await process_frame
		var card: Control = scene.get_node("%LaunchCard")
		var button: Button = scene.get_node("%Login")
		print("Layout: window=", viewport_size, " root=", root.size, " scene=", scene.size, " card=", card.size, " minimum=", card.get_combined_minimum_size())
		require(card.size.x <= viewport_size.x - 32, "launch card overflows width")
		require(button.size.y >= 48, "touch target too small")
		require(scene.get_node("%BuildIdentity").text == "Build · " + Config.current().client_build, "visible build identity missing")
		require(button.disabled, "unimplemented login must stay disabled")
		require(scene.get_node("%ConnectionStatus").text == "Nicht verbunden", "offline status missing")
	scene.queue_free()
	await process_frame
	ProjectSettings.set_setting("aurion/server_base_url", "https://attacker.test")
	var invalid_scene := packed.instantiate()
	root.add_child(invalid_scene)
	await process_frame
	require(invalid_scene.get_node("%ConnectionStatus").text == "Konfiguration ungültig", "bad configuration not blocked")
	invalid_scene.queue_free()
	await process_frame
	if failures.is_empty():
		print("Aurion startup scene and configuration verified")
		quit(0)
	else:
		for failure in failures:
			push_error(failure)
		quit(1)
