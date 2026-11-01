extends SceneTree
## Isolated real-controller regression, never Android delivery or login evidence.
const Reporter = preload("res://bridge_smoke.gd")
var failures: Array[String] = []
func check(value: bool, message: String) -> void:
	if not value:
		failures.append(message)
func _initialize() -> void:
	call_deferred("verify")
func verify() -> void:
	var app = load("res://app/main.tscn").instantiate()
	root.add_child(app)
	await process_frame
	var reporter = Reporter.new()
	# Do not run the Android-only autoload lifecycle in this headless test.
	reporter._app = app
	reporter._callbacks = 1
	app.status.text = "Anmeldung derzeit nicht verfügbar"
	reporter._write_report()
	var report: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("user://bridge-smoke.json"))
	check(report.phase != "callback_rejected", "A label alone fabricated rejection evidence")
	reporter._callbacks = 0
	if reporter.has_method("_observed_rejection"):
		app._auth_start.session_failed.connect(reporter._observed_rejection)
	app._intent_bridge.callback_received.connect(reporter._observed_callback)
	app._auth_start._server_base_url = "http://127.0.0.1:1"
	app._on_auth_start_succeeded()
	app._on_app_suspended()
	check(app._intent_bridge.deliver_for_test("https://arelogic.space/app/auth/callback", true), "Canonical malformed callback not delivered")
	check(reporter._callbacks == 1 and not app._awaiting_callback, "Real controller did not reject exactly one callback")
	app._on_app_resumed()
	check(app.status.text != "Anmeldung derzeit nicht verfügbar", "Resume ordering was not reproduced")
	reporter._write_report()
	report = JSON.parse_string(FileAccess.get_file_as_string("user://bridge-smoke.json"))
	check(report.phase == "callback_rejected", "Resume erased actual rejection evidence")
	check(not report.requestActive and not report.sessionPresent and not report.worldConfirmed, "Rejection created authority")
	reporter.free()
	app.queue_free()
	await process_frame
	if failures.is_empty():
		print("SMOKE_REJECTION_REPORT_ORDER_VERIFIED / ANDROID_DELIVERY_UNVERIFIED")
		quit(0)
	else:
		for failure in failures:
			push_error(failure)
		quit(1)
