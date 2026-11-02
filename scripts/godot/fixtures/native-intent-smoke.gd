extends Node
## Test-only autoload in a disposable debug APK. No auth request or credential.
var _app: Variant
var _callbacks := 0
var _rejection_observed := false
var _mode := "warm"
var _previous := ""

func _ready() -> void:
	if OS.get_name() != "Android":
		push_error("ANDROID_SMOKE_REQUIRES_ANDROID")
		return
	await get_tree().process_frame
	_app = get_tree().current_scene
	if FileAccess.file_exists("user://smoke-mode"):
		_mode = FileAccess.get_file_as_string("user://smoke-mode").strip_edges()
	_app._intent_bridge.callback_received.connect(_observed_callback)
	_app._auth_start.session_failed.connect(_observed_rejection)
	if _mode == "warm":
		# Exercise the real waiting controller and strict rejection path, without
		# /start, PKCE material or any request to a production auth endpoint.
		_app._auth_start._server_base_url = "http://127.0.0.1:1"
		_app._on_auth_start_succeeded()
		_write_report()
		var guard: String = ProjectSettings.get_setting("aurion_smoke/guard")
		if guard not in ["legacy", "fixed"] or OS.shell_open("http://127.0.0.1:8765/" + guard) != OK:
			push_error("SMOKE_BROWSER_OPEN_FAILED")
	set_process(true)
	_write_report()

func _observed_callback(_raw_url: String) -> void:
	_callbacks += 1

func _observed_rejection(error_code: String) -> void:
	# The real controller emits this synchronously for this malformed callback.
	# Resume may replace its UI label before the next report sample.
	if error_code == "NATIVE_AUTH_CONFIGURATION_UNAVAILABLE":
		_rejection_observed = true

func _process(_delta: float) -> void:
	if _app != null:
		# Sample after Main's process/poll work in this frame, so an Intent ack
		# cannot race ahead of the controller's opportunity to process it.
		call_deferred("_write_report")

func _write_report() -> void:
	var bridge: Variant = _app._intent_bridge
	var runtime: Variant = bridge._android_runtime
	var has_activity: bool = bridge._activity != null
	var intent_present: Variant = null
	var dispatch_sequence := 0
	if has_activity:
		var intent: Variant = bridge._activity.getIntent()
		if intent != null:
			intent_present = intent.getDataString() != null
			dispatch_sequence = intent.getIntExtra("aurion_smoke_dispatch", 0)
	var phase := "waiting" if _app._awaiting_callback else "other"
	if _mode == "cold" and not _app._awaiting_callback:
		phase = "cold_login_required"
	elif _callbacks == 1 and _rejection_observed and not _app._awaiting_callback:
		phase = "callback_rejected"
	var report := {
		"schemaVersion": 1, "layer": "android-jni-bridge-smoke", "mode": _mode,
		"guard": ProjectSettings.get_setting("aurion_smoke/guard"),
		"pid": OS.get_process_id(), "phase": phase,
		"dispatchSequence": dispatch_sequence,
		"runtimeClass": runtime.get_class() if runtime != null else "absent",
		"javaGetActivity": runtime != null and runtime.has_java_method("getActivity"),
		"objectGetActivity": runtime != null and runtime.has_method("getActivity"),
		"activityPresent": has_activity, "intentDataPresent": intent_present,
		"callbacks": _callbacks, "waiting": _app._awaiting_callback,
		"requestActive": _app._auth_start.request_in_flight(),
		"sessionPresent": not _app._auth_start.access_token().is_empty(),
		"worldConfirmed": _app._confirmed_zone.has_state(),
		"loginEnabled": not _app.login.disabled,
		"fullLogin": "UNVERIFIED", "physicalDevice": "UNVERIFIED",
	}
	var encoded := JSON.stringify(report)
	if encoded == _previous:
		return
	_previous = encoded
	var file := FileAccess.open("user://bridge-smoke.json", FileAccess.WRITE)
	if file == null:
		push_error("SMOKE_REPORT_UNAVAILABLE")
		return
	file.store_string(encoded)
