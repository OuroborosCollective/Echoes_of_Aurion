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
    # Synthetic pending transaction only: no user/session/world is fabricated.
    if not entry._auth.has_method("expire_pending_callback"):
        push_error("Pending native login has no expiry boundary")
        quit(1)
        return
    var flow: RefCounted = entry._auth._flow
    var now := Time.get_ticks_msec()
    flow.prepare_start("aurion-godot-expiry-fixture", now)
    var id := "t".repeat(43)
    var url := "https://arelogic.space/api/native-auth/browser/" + id
    assert(flow.accept_start_response({"version": flow.VERSION, "transactionId": id, "browserUrl": url, "expiresInSeconds": 600}, now))
    entry._main._on_auth_start_succeeded()
    assert(entry._present_browser_handoff(url) == OK)
    entry._callback.text = "synthetic-expired-return"
    assert(entry._auth.callback_pending(now + 599999))
    assert(not entry._auth.begin("https://arelogic.space", "aurion-godot-expiry-fixture"))
    assert(entry._auth.expire_pending_callback(now + 600000))
    assert(not entry._auth.callback_pending(now + 600000))
    assert(not entry._main._awaiting_callback)
    assert(entry._main.login.text == "Anmelden" and not entry._main.login.disabled)
    assert("abgelaufen" in entry._main.status.text)
    assert(entry._login_url.is_empty() and entry._link.uri.is_empty() and not entry._link.visible)
    assert(entry._callback.text.is_empty() and entry._dialog.visible)
    assert(not entry._callback.editable and entry._copy.disabled and entry._submit.disabled)
    assert("60 Sekunden" in entry._status.text)
    assert(entry._auth.access_token().is_empty())
    entry._auth._fail_session("NATIVE_AUTH_CODE_EXPIRED")
    assert("abgelaufen" in entry._main.status.text and "60 Sekunden" in entry._status.text)
    # Frame-driven expiry and cancellation must clear a displayed old link too.
    flow.prepare_start("aurion-godot-expiry-fixture", now)
    assert(flow.accept_start_response({"version": flow.VERSION, "transactionId": id, "browserUrl": url, "expiresInSeconds": 600}, now))
    entry._main._on_auth_start_succeeded()
    entry._present_browser_handoff(url)
    flow._started_at_ms = Time.get_ticks_msec() - 600000
    entry._auth._process(0.0)
    assert(not entry._main._awaiting_callback and entry._login_url.is_empty())
    flow.prepare_start("aurion-godot-expiry-fixture", now)
    assert(flow.accept_start_response({"version": flow.VERSION, "transactionId": id, "browserUrl": url, "expiresInSeconds": 600}, now))
    entry._main._on_auth_start_succeeded()
    entry._present_browser_handoff(url)
    entry._main._on_login_pressed()
    entry._process(0.0)
    assert(entry._login_url.is_empty() and entry._callback.text.is_empty())
    assert(not entry._auth.request_in_flight() and entry._auth.access_token().is_empty())
    entry.queue_free()
    await process_frame
    assert(ProjectSettings.get_setting("aurion/native_auth_start_enabled") == original_setting)
    assert(FileAccess.get_sha256("res://project.godot") == original_file)
    print("AURION_LIVE_BRIDGE_AUTHORING_CLIENT_BOOT_PASS")
    quit(0)

