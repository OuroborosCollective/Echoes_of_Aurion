extends SceneTree
const Bridge = preload("res://platform/android/native_intent_bridge.gd")
const Main = preload("res://app/main.gd")
var failures: Array[String] = []

class FakeIntent:
	extends RefCounted
	var data: Variant
	func _init(value: Variant) -> void:
		data = value
	func getDataString() -> Variant:
		return data
	func setData(value: Variant) -> void:
		data = value

class FakeActivity:
	extends RefCounted
	var intent: FakeIntent
	func _init(value: FakeIntent) -> void:
		intent = value
	func getIntent() -> FakeIntent:
		return intent

class FakeJniRuntime:
	extends RefCounted
	var activity: Object
	var java_available := true
	var activity_calls := 0
	func _init(value: Object) -> void:
		activity = value
	# Model Godot's JNISingleton boundary: Java methods are callable via
	# callp but absent from Object.has_method's Script/ClassDB lookup.
	@warning_ignore("native_method_override")
	func has_method(method: StringName) -> bool:
		return method == "has_java_method"
	func has_java_method(method: StringName) -> bool:
		return java_available and method == "getActivity"
	func getActivity() -> Object:
		activity_calls += 1
		return activity

class FakeAuth:
	extends Node
	signal browser_opening
	var bridge: Node
	var fresh_url: String
	var stale_was_cleared := false
	var callback_pending_value := false
	var exchange_accepted := false
	var callback_calls := 0
	func _init(value: Node, url: String) -> void:
		bridge = value
		fresh_url = url
	func begin(_server_base_url: String, _app_build: String) -> bool:
		var intent: Variant = bridge._activity.getIntent()
		# Simulate a cancelled browser returning while /start is in flight.
		intent.setData(fresh_url + "-stale")
		browser_opening.emit()
		stale_was_cleared = intent.getDataString() == null
		# The new browser can now return immediately after the boundary.
		intent.setData(fresh_url)
		return true
	func complete_callback(_raw_url: Variant) -> bool:
		callback_calls += 1
		return exchange_accepted
	func callback_pending() -> bool:
		return callback_pending_value

func check(ok: bool, why: String) -> void:
	if not ok: failures.append(why)
func _init() -> void: call_deferred("verify")
func verify() -> void:
	var bridge = Bridge.new()
	check(not bridge.poll_for_callback(false), "disabled login allowed callback")
	check(not bridge.poll_for_callback(true), "non-Android runtime accepted a native callback")
	check(not bridge.deliver_for_test("https://evil.example/app/auth/callback?code=" + "c".repeat(43) + "&state=" + "s".repeat(43), true), "untrusted callback accepted despite pending login")
	var received: Array[String] = []
	bridge.callback_received.connect(func(url: String): received.append(url))
	var valid := "https://arelogic.space/app/auth/callback?code=" + "c".repeat(43) + "&state=" + "s".repeat(43)
	# Exercise the same runtime initialization called by _ready(), rather than
	# assigning _activity directly (which hid the JNI method lookup defect).
	var initial_intent := FakeIntent.new(null)
	var activity := FakeActivity.new(initial_intent)
	var runtime: Variant = FakeJniRuntime.new(activity)
	check(not runtime.has_method("getActivity") and runtime.has_java_method("getActivity"), "JNI fixture did not separate native and Java method discovery")
	bridge._initialize_android_runtime(runtime)
	check(runtime.activity_calls == 1 and bridge._activity == activity, "JNI runtime initialization failed to resolve the Activity")
	# GodotActivity.onNewIntent replaces the Activity intent on a warm return.
	# The already initialized bridge must read that new intent exactly once.
	var returned_intent := FakeIntent.new(valid)
	activity.intent = returned_intent
	check(bridge.poll_activity_intent_for_test(true), "warm return through initialized JNI runtime was not forwarded")
	check(returned_intent.data == null and received.size() == 1, "warm callback was not consumed exactly once")
	bridge.reset()
	received.clear()
	runtime.java_available = false
	bridge._initialize_android_runtime(runtime)
	check(bridge._activity == null and runtime.activity_calls == 1, "missing Java capability retained or invoked an Activity")
	check(not bridge.poll_activity_intent_for_test(true), "missing Java runtime admitted a callback")
	bridge._initialize_android_runtime(RefCounted.new())
	check(bridge._activity == null, "non-JNI runtime admitted an Activity")
	runtime.java_available = true
	runtime.activity = null
	bridge._initialize_android_runtime(runtime)
	check(bridge._activity == null, "null Java Activity did not fail closed")
	bridge._initialize_android_runtime(null)
	check(bridge._activity == null, "missing runtime retained an Activity")
	check(not bridge.deliver_for_test(valid, false), "callback accepted without active login")
	check(not bridge.deliver_for_test("http://arelogic.space/app/auth/callback?code=" + "c".repeat(43) + "&state=" + "s".repeat(43), true), "HTTP callback admitted")
	check(not bridge.deliver_for_test("https://arelogic.space.evil.test/app/auth/callback?code=" + "c".repeat(43) + "&state=" + "s".repeat(43), true), "lookalike host admitted")
	check(bridge.deliver_for_test(valid, true), "valid pending callback not forwarded")
	check(received.size() == 1 and received[0] == valid, "callback not forwarded exactly once")
	check(not bridge.deliver_for_test(valid, true), "same callback replay forwarded")
	check(received.size() == 1, "replayed callback emitted")
	# Android can relaunch the process with a completed App Link after the
	# in-memory PKCE transaction was lost. Drain that canonical orphan without
	# forwarding it as authentication or retaining it for a later login attempt.
	var orphaned_intent := FakeIntent.new(valid)
	bridge._activity = FakeActivity.new(orphaned_intent)
	check(not bridge.poll_activity_intent_for_test(false), "orphaned callback was forwarded without a pending login")
	check(orphaned_intent.data == null, "orphaned canonical callback remained in the Activity intent")
	check(received.size() == 1, "orphaned callback reached the auth validator")
	# Android may redeliver the same callback while the first exchange is in flight.
	# It must be consumed from the Activity even though no second signal is emitted.
	var duplicate_intent := FakeIntent.new(valid)
	bridge._activity = FakeActivity.new(duplicate_intent)
	check(not bridge.poll_activity_intent_for_test(true), "duplicate callback emitted twice")
	check(duplicate_intent.data == null, "duplicate canonical callback remained in the Activity intent")
	check(received.size() == 1, "duplicate callback reached the auth validator twice")
	# Android path matching can deliver the registered route without a query.
	var malformed := "https://arelogic.space/app/auth/callback"
	var malformed_intent := FakeIntent.new(malformed)
	bridge._activity = FakeActivity.new(malformed_intent)
	check(bridge.poll_activity_intent_for_test(true), "canonical malformed callback was trapped before the auth validator")
	check(malformed_intent.data == null, "canonical malformed callback remained in the Activity intent")
	check(received.size() == 2 and received[1] == malformed, "canonical malformed callback did not reach the auth validator exactly once")
	var fragmented := "https://arelogic.space/app/auth/callback#cancelled"
	var fragmented_intent := FakeIntent.new(fragmented)
	bridge._activity = FakeActivity.new(fragmented_intent)
	check(bridge.poll_activity_intent_for_test(true), "fragmented canonical callback was trapped before the auth validator")
	check(fragmented_intent.data == null, "fragmented canonical callback remained in the Activity intent")
	check(received.size() == 3 and received[2] == fragmented, "fragmented canonical callback did not reach the auth validator exactly once")
	var stale_intent := FakeIntent.new(valid)
	bridge._activity = FakeActivity.new(stale_intent)
	bridge.reset()
	check(stale_intent.data == null, "cancelled login callback survived reset into the next attempt")
	var foreign_intent := FakeIntent.new("https://arelogic.space/game/invite?id=party")
	bridge._activity = FakeActivity.new(foreign_intent)
	bridge.reset()
	check(foreign_intent.data == "https://arelogic.space/game/invite?id=party", "reset cleared an unrelated Android intent")
	# The launch path must discard a stale callback before begin(). A fresh App
	# Link delivered after browser launch must remain available for polling.
	var race_intent := FakeIntent.new(valid)
	bridge._activity = FakeActivity.new(race_intent)
	var fake_auth := FakeAuth.new(bridge, valid)
	var app := Main.new()
	app._intent_bridge = bridge
	app._auth_start = fake_auth
	fake_auth.browser_opening.connect(app._on_auth_browser_opening)
	app._config = {
		"server_base_url": "https://arelogic.space",
		"client_build": "aurion-godot-g09b",
	}
	check(app._begin_native_login(), "native login did not begin")
	check(fake_auth.stale_was_cleared, "stale callback survived the pre-browser-open boundary")
	check(race_intent.data == valid, "fresh callback was erased after browser launch")
	check(bridge.poll_activity_intent_for_test(true), "fresh callback was not delivered after browser launch")
	check(race_intent.data == null, "delivered fresh callback remained in the Activity intent")
	app.status = Label.new()
	app.login = Button.new()
	app._awaiting_callback = true
	fake_auth.callback_pending_value = true
	app.status.text = "Anmeldung wird bestätigt"
	app.login.disabled = true
	check(not app.handle_native_auth_callback(valid + "-stale"), "stale callback started an exchange")
	check(app.status.text == "Systembrowser geöffnet", "stale callback left the login UI in exchange state")
	check(not app.login.disabled, "stale callback disabled cancellation of the current login")
	# Connect the initialized transport to the actual controller signal handler.
	# A warm callback advances the waiting UI to exchange; a duplicate cannot
	# start a second exchange. This fixture does not establish Android delivery
	# or real authentication: the HTTP/PKCE suites own those separate boundaries.
	runtime.activity = activity
	bridge._initialize_android_runtime(runtime)
	bridge.reset()
	bridge.callback_received.connect(app.handle_native_auth_callback)
	fake_auth.exchange_accepted = true
	activity.intent = FakeIntent.new(valid)
	var calls_before := fake_auth.callback_calls
	check(bridge.poll_activity_intent_for_test(true), "initialized warm callback did not reach the controller")
	check(app.status.text == "Anmeldung wird bestätigt" and app.login.disabled, "warm return left the controller waiting for the system browser")
	check(fake_auth.callback_calls == calls_before + 1, "warm return did not start exactly one controller exchange")
	activity.intent = FakeIntent.new(valid)
	check(not bridge.poll_activity_intent_for_test(true), "warm callback replay started another exchange")
	check(fake_auth.callback_calls == calls_before + 1 and activity.intent.data == null, "warm callback replay was not drained without exchange")
	app.status.free()
	app.login.free()
	app.free()
	fake_auth.free()
	bridge.free()
	await process_frame
	if failures.is_empty():
		print("Godot native Android intent bridge verified (headless injection only)")
		quit(0)
	else:
		for failure in failures: push_error(failure)
		quit(1)
