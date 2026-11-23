extends SceneTree

const Preferences = preload("res://app/preferences.gd")

var failures: Array[String] = []

func require(condition: bool, message: String) -> void:
	if not condition:
		failures.append(message)

func _init() -> void:
	call_deferred("verify")

func verify() -> void:
	var preferences = Preferences.new()
	preferences.master_volume = 0.78
	preferences.ui_scale = 1.0
	require(preferences.set_master_volume(0.5), "master volume did not persist locally")
	require(preferences.set_ui_scale(1.1), "UI scale did not persist locally")
	var reloaded = Preferences.new()
	reloaded.load_preferences()
	require(is_equal_approx(reloaded.master_volume, 0.5), "master volume did not survive reload")
	require(is_equal_approx(reloaded.ui_scale, 1.1), "UI scale did not survive reload")
	require(reloaded.set_master_volume(9.0), "out-of-range volume was rejected instead of clamped")
	require(is_equal_approx(reloaded.master_volume, 1.0), "volume was not clamped to device-safe range")
	require(not reloaded.set_ui_scale(NAN), "non-finite UI scale was accepted")
	var config := ConfigFile.new()
	require(config.load(Preferences.CONFIG_PATH) == OK, "preferences file was not readable")
	require(not config.has_section_key("gameplay", "autoLoot"), "server gameplay preference leaked into local file")
	DirAccess.remove_absolute(ProjectSettings.globalize_path(Preferences.CONFIG_PATH))
	if failures.is_empty():
		print("G30 local audio/UI preferences persistence and domain separation verified")
		quit(0)
	else:
		for failure in failures:
			push_error(failure)
		quit(1)
