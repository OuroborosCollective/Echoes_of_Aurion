extends SceneTree

const PROTOCOL_VERSION := 5
const TICK_MS := 100
const MAX_CLIENT_MESSAGE_BYTES := 2048
const MAX_BROWSER_SNAPSHOT_UTF16_UNITS := 65536
const MAX_CLIENT_SEQUENCE := 2147483647
const CONTRACT_PATH := "res://net/contracts/zone_v5.schema.json"

var failures: Array[String] = []

func require(condition: bool, message: String) -> void:
	if not condition:
		failures.append(message)

func valid_client_sequence(value: Variant) -> bool:
	return typeof(value) == TYPE_INT and value >= 1 and value <= MAX_CLIENT_SEQUENCE

func valid_axis(value: Variant) -> bool:
	return typeof(value) == TYPE_INT and value in [-1, 0, 1]

func valid_move(message: Dictionary) -> bool:
	if message.get("type") != "move" or not valid_client_sequence(message.get("clientSeq")):
		return false
	var input: Variant = message.get("input")
	return typeof(input) == TYPE_DICTIONARY and valid_axis(input.get("x")) and valid_axis(input.get("z"))

func utf16_code_units(value: String) -> int:
	var units := 0
	for index in value.length():
		units += 2 if value.unicode_at(index) > 0xffff else 1
	return units

func _init() -> void:
	var file := FileAccess.open(CONTRACT_PATH, FileAccess.READ)
	require(file != null, "zone-v5 schema must be readable")
	if file != null:
		var parsed: Variant = JSON.parse_string(file.get_as_text())
		require(typeof(parsed) == TYPE_DICTIONARY, "zone-v5 schema must parse")
		if typeof(parsed) == TYPE_DICTIONARY:
			var limits: Dictionary = parsed.get("x-aurion-wire-limits", {})
			require(limits.get("protocol_version") == PROTOCOL_VERSION, "protocol version drift")
			require(limits.get("tick_ms") == TICK_MS, "tick drift")
			require(limits.get("client_message_utf8_bytes_max") == MAX_CLIENT_MESSAGE_BYTES, "client byte limit drift")
			require(limits.get("browser_snapshot_utf16_code_units_max") == MAX_BROWSER_SNAPSHOT_UTF16_UNITS, "snapshot UTF-16 limit drift")
	require(valid_move({"type": "move", "clientSeq": 1, "input": {"x": -1, "z": 1}}), "valid move rejected")
	require(not valid_move({"type": "move", "clientSeq": 1, "input": {"x": 2, "z": 0}}), "invalid axis accepted")
	require(not valid_move({"type": "move", "clientSeq": 0, "input": {"x": 0, "z": 0}}), "invalid sequence accepted")
	var unicode_probe := "😀".repeat(1024)
	require(utf16_code_units(unicode_probe) == 2048, "UTF-16 count drift")
	require(unicode_probe.to_utf8_buffer().size() == 4096, "UTF-8 byte count drift")
	if failures.is_empty():
		print("zone-v5 Godot contract verified")
		quit(0)
	else:
		for failure in failures:
			push_error(failure)
		quit(1)

