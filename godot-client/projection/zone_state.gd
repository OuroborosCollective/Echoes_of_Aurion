extends RefCounted
## A read-only projection of validated Aurion v5 world state.
## No movement, combat, persistence, authority or prediction lives here.
const Codec = preload("res://net/zone_codec.gd")

var _state: Dictionary = {}
var _connection_id := ""
var _self_entity_id := ""
var _last_seq := -1
var _last_tick := -1

func has_state() -> bool:
	return not _state.is_empty()

func connection_id() -> String:
	return _connection_id

func self_entity_id() -> String:
	return _self_entity_id

func last_seq() -> int:
	return _last_seq

func last_tick() -> int:
	return _last_tick

func current_state() -> Dictionary:
	# Caller-owned copy: UI and visual effects cannot mutate server truth.
	return _state.duplicate(true)

func apply_welcome(welcome: Variant) -> bool:
	if has_state() or not Codec.is_valid_welcome(welcome):
		return false
	_state = (welcome as Dictionary).duplicate(true)
	_connection_id = str(welcome["connectionId"])
	_self_entity_id = str(welcome["selfEntityId"])
	_last_seq = int(welcome["snapshotSeq"])
	_last_tick = int(welcome["tick"])
	return true

func apply_snapshot(snapshot: Variant) -> bool:
	if not has_state() or not Codec.is_valid_snapshot(snapshot):
		return false
	if snapshot["snapshotSeq"] <= _last_seq or snapshot["tick"] < _last_tick:
		return false
	_state = (snapshot as Dictionary).duplicate(true)
	_last_seq = int(snapshot["snapshotSeq"])
	_last_tick = int(snapshot["tick"])
	return true

func reset() -> void:
	_state.clear()
	_connection_id = ""
	_self_entity_id = ""
	_last_seq = -1
	_last_tick = -1
