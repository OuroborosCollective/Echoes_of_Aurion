extends SceneTree

const PlayerUiApi = preload("res://net/api/player_ui_api.gd")

var failures: Array[String] = []

func require(condition: bool, message: String) -> void:
	if not condition:
		failures.append(message)

func _init() -> void:
	call_deferred("verify")

func verify() -> void:
	var settings := {
		"revision": 7,
		"autoLoot": true,
		"analyticsConsent": false,
		"hotbar": ["1", "2", "3", "4", "5"],
		"movementMode": "joystick",
	}
	require(PlayerUiApi.valid_control_settings(settings), "valid server control settings rejected")
	var duplicate_hotbar := settings.duplicate(true)
	duplicate_hotbar["hotbar"] = ["1", "2", "3", "4", "4"]
	require(not PlayerUiApi.valid_control_settings(duplicate_hotbar), "duplicate hotbar binding accepted")
	var unknown_command := settings.duplicate(true)
	unknown_command["hotbar"] = ["1", "2", "3", "4", "10"]
	require(not PlayerUiApi.valid_control_settings(unknown_command), "unknown hotbar command accepted")
	var extra_setting := settings.duplicate(true)
	extra_setting["localVolume"] = 0.5
	require(not PlayerUiApi.valid_control_settings(extra_setting), "local device preference mixed into server settings")
	var wrong_movement := settings.duplicate(true)
	wrong_movement["movementMode"] = "free_flight"
	require(not PlayerUiApi.valid_control_settings(wrong_movement), "unsupported movement mode accepted")
	var boundary := settings.duplicate(true)
	boundary["revision"] = 2000000000
	require(PlayerUiApi.valid_control_settings(boundary), "maximum persisted revision cannot be read")
	boundary["revision"] = 2000000001
	require(not PlayerUiApi.valid_control_settings(boundary), "out-of-range revision accepted")

	var readback := {
		"version": "aurion-ax1-ui.v1",
		"userId": 42,
		"settings": settings,
		"items": [],
		"equipment": [],
	}
	var parsed := PlayerUiApi.parse_player_ui_readback(readback)
	require(not parsed.is_empty() and parsed.get("userId") == 42, "valid player.ui readback rejected")
	var wire := JSON.stringify([{"result": {"data": {"json": readback}}}]).to_utf8_buffer()
	require(PlayerUiApi.parse_player_ui_wire(wire).get("settings", {}).get("revision") == 7, "tRPC batched JSON response not decoded")
	require(PlayerUiApi.parse_player_ui_wire("{}".to_utf8_buffer()).is_empty(), "non-batch tRPC response accepted")
	var wrong_version := readback.duplicate(true)
	wrong_version["version"] = "unknown"
	require(PlayerUiApi.parse_player_ui_readback(wrong_version).is_empty(), "unknown readback protocol version accepted")
	var bad_identity := readback.duplicate(true)
	bad_identity["userId"] = 0
	require(PlayerUiApi.parse_player_ui_readback(bad_identity).is_empty(), "invalid player identity accepted")
	var bad_items := readback.duplicate(true)
	bad_items["items"] = "not-an-array"
	require(PlayerUiApi.parse_player_ui_readback(bad_items).is_empty(), "malformed item collection accepted")
	var extra_readback := readback.duplicate(true)
	extra_readback["accessToken"] = "must-not-be-projected"
	require(PlayerUiApi.parse_player_ui_readback(extra_readback).is_empty(), "unexpected root field accepted")

	if failures.is_empty():
		print("Godot player.ui strict contract and settings validation verified")
		quit(0)
	else:
		for failure in failures:
			push_error(failure)
		quit(1)
