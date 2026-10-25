@tool
extends EditorExportPlugin

const FILTER_PATH := "res://addons/aurion_android_app_link/callback_filter.xml"

func _get_name() -> String:
	return "AurionAndroidAppLink"

func _supports_platform(platform: EditorExportPlatform) -> bool:
	return platform is EditorExportPlatformAndroid

# Godot merges only attributes from src/main for GodotAppLauncher. This hook
# writes the filter into the generated release/debug overlay itself.
func _get_android_manifest_activity_element_contents(_platform: EditorExportPlatform, _debug: bool) -> String:
	var contents := FileAccess.get_file_as_string(FILTER_PATH)
	assert(not contents.is_empty(), "Aurion Android callback filter missing")
	return contents

