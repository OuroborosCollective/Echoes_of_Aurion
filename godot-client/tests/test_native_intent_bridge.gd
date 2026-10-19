extends SceneTree
const Bridge = preload("res://platform/android/native_intent_bridge.gd")
var failures: Array[String] = []
func check(ok: bool, why: String) -> void:
	if not ok: failures.append(why)
func _init() -> void: call_deferred("verify")
func verify() -> void:
	var bridge = Bridge.new()
	check(not bridge.poll_for_callback(false), "disabled login allowed callback")
	check(not bridge.poll_for_callback(true), "non-Android runtime accepted a native callback")
	check(not bridge.deliver_for_test("https://evil.example/app/auth/callback?code=" + "c".repeat(43) + "&state=" + "s".repeat(43), false), "untrusted callback accepted")
	var received: Array[String] = []
	bridge.callback_received.connect(func(url: String): received.append(url))
	var valid := "https://arelogic.space/app/auth/callback?code=" + "c".repeat(43) + "&state=" + "s".repeat(43)
	check(not bridge.deliver_for_test(valid, false), "callback accepted without active login")
	check(bridge.deliver_for_test(valid, true), "valid pending callback not forwarded")
	check(received.size() == 1 and received[0] == valid, "callback not forwarded exactly once")
	check(not bridge.deliver_for_test(valid, true), "same callback replay forwarded")
	check(received.size() == 1, "replayed callback emitted")
	if failures.is_empty():
		print("Godot native Android intent bridge verified (headless injection only)")
		quit(0)
	else:
		for failure in failures: push_error(failure)
		quit(1)
