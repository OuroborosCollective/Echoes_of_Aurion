extends RefCounted
## Durable, credential-free marker for a possibly committed world apply.
## A missing/invalid marker never certifies an Aurion receipt.
const WorldProjection = preload("res://world/world_design_projection.gd")
const DEFAULT_PATH := "user://aurion-world-authoring-pending"
const MAX_BYTES := 4096
var _path: String

func _init(path: String = DEFAULT_PATH) -> void:
	_path = path

func read() -> Dictionary:
	var absolute := ProjectSettings.globalize_path(_path)
	if not DirAccess.dir_exists_absolute(absolute) and not FileAccess.file_exists(_path):
		return {}
	if not DirAccess.dir_exists_absolute(absolute):
		return {"invalid":true}
	var file := FileAccess.open(_path.path_join("record.json"), FileAccess.READ)
	if file == null or file.get_length() > MAX_BYTES:
		return {"invalid":true}
	var value: Variant = JSON.parse_string(file.get_as_text())
	if typeof(value) != TYPE_DICTIONARY or value.get("schemaVersion") != "aurion.world-authoring-pending.v2" or not WorldProjection._id(value.get("designKey")) or not WorldProjection._whole(value.get("version"), 1, 1000000) or not WorldProjection._whole(value.get("actorUserId"), 1, 2147483647) or not WorldProjection._hex(value.get("planHash"), 64) or not WorldProjection._hex(value.get("operationId"), 32):
		return {"invalid":true}
	return value

## Must succeed before the network request is sent. Existing or unreadable
## records block another apply until separately reconciled.
func reserve(draft: Dictionary, actor_id: int, plan_hash: String, operation_id: String) -> bool:
	if not WorldProjection._id(draft.get("designKey")) or not WorldProjection._whole(draft.get("version"), 1, 1000000) or actor_id < 1 or not WorldProjection._hex(plan_hash, 64) or not WorldProjection._hex(operation_id, 32):
		return false
	# mkdir is an exclusive reservation for clients sharing this user directory.
	# A crash before the record is complete leaves an invalid, blocking marker.
	if DirAccess.make_dir_absolute(ProjectSettings.globalize_path(_path)) != OK:
		return false
	var record := {"schemaVersion":"aurion.world-authoring-pending.v2", "designKey":draft.designKey,
		"version":int(draft.version), "actorUserId":actor_id, "planHash":plan_hash, "operationId":operation_id}
	var file := FileAccess.open(_path.path_join("record.json"), FileAccess.WRITE)
	if file == null:
		_cleanup_owned_reservation()
		return false
	file.store_string(JSON.stringify(record))
	file.flush()
	var error := file.get_error()
	file.close()
	if error != OK:
		_cleanup_owned_reservation()
		return false
	var saved := read()
	var valid: bool = not saved.is_empty() and not saved.has("invalid") and saved.get("designKey") == draft.designKey and int(saved.get("version")) == int(draft.version) and int(saved.get("actorUserId")) == actor_id and saved.get("planHash") == plan_hash and saved.get("operationId") == operation_id
	if not valid:
		_cleanup_owned_reservation()
	return valid

## Only used by the instance that just created this directory, before sending.
func _cleanup_owned_reservation() -> void:
	var record := _path.path_join("record.json")
	if FileAccess.file_exists(record) and DirAccess.remove_absolute(ProjectSettings.globalize_path(record)) != OK:
		return
	DirAccess.remove_absolute(ProjectSettings.globalize_path(_path))

## Only the already-correlated receipt and subsequent independent readback may
## clear this marker. Failure leaves the safe pending state in place.
func clear_confirmed(draft: Dictionary, actor_id: int, plan_hash: String, operation_id: String) -> bool:
	return _remove_matching(draft, actor_id, plan_hash, operation_id)

## The request was never started, so its freshly reserved marker can be undone.
func release_unsubmitted(draft: Dictionary, actor_id: int, plan_hash: String, operation_id: String) -> bool:
	return _remove_matching(draft, actor_id, plan_hash, operation_id)

func _remove_matching(draft: Dictionary, actor_id: int, plan_hash: String, operation_id: String) -> bool:
	var saved := read()
	if saved.is_empty() or saved.has("invalid") or saved.get("designKey") != draft.get("designKey") or int(saved.get("version", -1)) != int(draft.get("version", -2)) or int(saved.get("actorUserId", -1)) != actor_id or saved.get("planHash") != plan_hash or saved.get("operationId") != operation_id:
		return false
	if DirAccess.remove_absolute(ProjectSettings.globalize_path(_path.path_join("record.json"))) != OK:
		return false
	return DirAccess.remove_absolute(ProjectSettings.globalize_path(_path)) == OK and read().is_empty()
