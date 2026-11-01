extends RefCounted
## Local credential-free reservation only. This marker never proves a publish.
const State = preload("res://authoring/quest_authoring_state.gd")
var _path: String

func _init(path: String = "user://aurion-quest-authoring-pending") -> void:
	_path = path

func read() -> Dictionary:
	var absolute := ProjectSettings.globalize_path(_path)
	if not DirAccess.dir_exists_absolute(absolute) and not FileAccess.file_exists(_path): return {}
	if not DirAccess.dir_exists_absolute(absolute): return {"invalid":true}
	var file := FileAccess.open(_path.path_join("record.json"), FileAccess.READ)
	if file == null or file.get_length() > 8192: return {"invalid":true}
	var parser := JSON.new()
	if parser.parse(file.get_as_text()) != OK or not State.pending_valid(parser.data): return {"invalid":true}
	var record: Dictionary = parser.data
	record.actorUserId = int(record.actorUserId)
	record.version = int(record.version)
	return record

func reserve(record: Dictionary) -> bool:
	if not State.pending_valid(record) or DirAccess.make_dir_absolute(ProjectSettings.globalize_path(_path)) != OK: return false
	var file := FileAccess.open(_path.path_join("record.json"), FileAccess.WRITE)
	if file == null:
		_cleanup_owned()
		return false
	file.store_string(JSON.stringify(record))
	file.flush()
	var error := file.get_error()
	file.close()
	if error != OK or not State.same_json(read(), record):
		_cleanup_owned()
		return false
	return true

func _cleanup_owned() -> void:
	var record := _path.path_join("record.json")
	if FileAccess.file_exists(record) and DirAccess.remove_absolute(ProjectSettings.globalize_path(record)) != OK: return
	DirAccess.remove_absolute(ProjectSettings.globalize_path(_path))

func clear_confirmed(record: Dictionary) -> bool:
	return _remove_matching(record)

func release_unsubmitted(record: Dictionary) -> bool:
	return _remove_matching(record)

func _remove_matching(record: Dictionary) -> bool:
	if not State.pending_valid(record) or not State.same_json(read(), record): return false
	if DirAccess.remove_absolute(ProjectSettings.globalize_path(_path.path_join("record.json"))) != OK: return false
	return DirAccess.remove_absolute(ProjectSettings.globalize_path(_path)) == OK and read().is_empty()
