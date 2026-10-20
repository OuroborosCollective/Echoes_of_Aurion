extends SceneTree
const Bridge = preload("res://platform/android/native_intent_bridge.gd")
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
	check(not bridge.deliver_for_test(valid, false), "callback accepted without active login")
	check(not bridge.deliver_for_test("http://arelogic.space/app/auth/callback?code=" + "c".repeat(43) + "&state=" + "s".repeat(43), true), "HTTP callback admitted")
	check(not bridge.deliver_for_test("https://arelogic.space.evil.test/app/auth/callback?code=" + "c".repeat(43) + "&state=" + "s".repeat(43), true), "lookalike host admitted")
	check(bridge.deliver_for_test(valid, true), "valid pending callback not forwarded")
	check(received.size() == 1 and received[0] == valid, "callback not forwarded exactly once")
	check(not bridge.deliver_for_test(valid, true), "same callback replay forwarded")
	check(received.size() == 1, "replayed callback emitted")
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
	bridge.free()
	await process_frame
	if failures.is_empty():
		print("Godot native Android intent bridge verified (headless injection only)")
		quit(0)
	else:
		for failure in failures: push_error(failure)
		quit(1)
