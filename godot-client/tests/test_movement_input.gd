extends SceneTree
## Synthetic input only. This must never be treated as a live zone/Tab A9 proof.
const Codec = preload("res://net/zone_codec.gd")
var failures: Array[String] = []

class CaptureZone:
	extends Node
	var connected := true
	var calls: Array[Vector2i] = []
	func send_move(x: int, z: int) -> bool:
		if not connected:
			return false
		calls.append(Vector2i(x, z))
		return true

func require(ok: bool, why: String) -> void:
	if not ok:
		failures.append(why)

func _init() -> void:
	call_deferred("verify")

func verify() -> void:
	var script: Script = load("res://app/input_adapter.gd") as Script
	require(script != null, "G20 shared move-intent adapter missing")
	if script == null:
		_finish()
		return
	var a: RefCounted = script.new()
	require(a.quantize(Vector2.ZERO) == Vector2i.ZERO, "neutral drift")
	require(a.quantize(Vector2(0.10, -0.10)) == Vector2i.ZERO, "deadzone ignored")
	require(a.quantize(Vector2(0.85, -0.90)) == Vector2i(1, -1), "digital diagonal changed")
	require(a.quantize(Vector2(-1, 1)) == Vector2i(-1, 1), "signed axes changed")
	require(Codec.valid_move(1, 1, -1).get("input") == {"x":1, "z":-1}, "server codec changed")
	var zone: CaptureZone = CaptureZone.new()
	root.add_child(zone)
	require(a.send_if_due(1000, Vector2(0.8, -0.8), zone, true), "first active move missing")
	require(not a.send_if_due(1099, Vector2(0.8, -0.8), zone, true), "frame-driven movement flood")
	require(a.send_if_due(1100, Vector2(0.8, -0.8), zone, true), "100ms cadence missing")
	require(not a.send_if_due(1101, Vector2.ZERO, zone, true), "sub-tick movement burst")
	require(a.send_if_due(1200, Vector2.ZERO, zone, true), "finger-release neutral missing")
	require(not a.send_if_due(1300, Vector2.ZERO, zone, true), "neutral move flood")
	require(zone.calls == [Vector2i(1,-1),Vector2i(1,-1),Vector2i.ZERO], "unexpected movement series")
	require(a.send_if_due(1400, Vector2(1, 0), zone, true), "resumed movement missing")
	require(a.cancel(zone, true), "menu cancel must send neutral exactly once")
	require(not a.cancel(zone, true), "second cancel sent duplicate")
	require(zone.calls.back() == Vector2i.ZERO, "cancel did not release movement")
	require(not a.send_if_due(1500, Vector2(1, 0), zone, false), "disconnected input was accepted")
	require(not a.cancel(zone, false), "disconnected cancel sent input")
	require(not a.send_if_due(1600, Vector2.ZERO, zone, true), "reconnect resurrected stale intent")
	require(InputMap.has_action("move_forward") and InputMap.has_action("move_left"), "Godot engine InputMap missing")
	for action in ["move_left", "move_right", "move_forward", "move_backward"]:
		var has_gamepad := false
		for event in InputMap.action_get_events(action):
			if event is InputEventJoypadMotion:
				has_gamepad = true
		require(has_gamepad, "gamepad axis missing from " + action)
	var packed := load("res://app/main.tscn") as PackedScene
	require(packed != null, "active main scene missing")
	if packed != null:
		var scene: Control = packed.instantiate()
		root.add_child(scene)
		await process_frame
		var joystick: Control = scene.get_node_or_null("MobileJoystick") as Control
		require(joystick != null, "native G20 joystick not in active scene")
		if joystick != null:
			require(not joystick.visible, "joystick visible before authenticated zone")
			require(joystick.get("use_input_actions") == false, "upstream joystick must not inject duplicate InputMap events")
			require(joystick.get("deadzone_size") >= 10, "unbounded joystick deadzone")
		scene.queue_free()
		await process_frame
	zone.queue_free()
	_finish()

func _finish() -> void:
	for failure in failures:
		push_error(failure)
	if failures.is_empty():
		print("Godot G20 native input and bounded move-intent regression verified (headless fixture only)")
	quit(0 if failures.is_empty() else 1)
