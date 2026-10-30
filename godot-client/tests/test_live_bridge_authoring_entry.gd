extends SceneTree
## Actual client boot with offline assertions. No login, user, world or DB is fabricated.
const Entry = preload("res://addons/aurion_bridge/authoring_entry.tscn")

func _initialize() -> void:
    _run.call_deferred()

func _run() -> void:
    var original_setting: Variant = ProjectSettings.get_setting("aurion/native_auth_start_enabled", false)
    var original_file := FileAccess.get_sha256("res://project.godot")
    var entry := Entry.instantiate()
    root.add_child(entry)
    await process_frame
    await process_frame
    assert(entry._main != null and entry._auth != null)
    assert(not entry._auth.protected_response_allowed())
    assert(entry._auth.access_token().is_empty())
    assert(not entry._main.handle_native_auth_callback("https://arelogic.space/app/auth/callback#invalid"))
    assert(entry._present_browser_handoff("https://other-origin.invalid/native-auth") == ERR_INVALID_PARAMETER)
    assert(ProjectSettings.get_setting("aurion/native_auth_start_enabled") == true)
    assert(FileAccess.get_sha256("res://project.godot") == original_file)
    entry.queue_free()
    await process_frame
    assert(ProjectSettings.get_setting("aurion/native_auth_start_enabled") == original_setting)
    assert(FileAccess.get_sha256("res://project.godot") == original_file)
    print("AURION_LIVE_BRIDGE_AUTHORING_CLIENT_BOOT_PASS")
    quit(0)
