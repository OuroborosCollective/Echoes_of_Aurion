extends RefCounted
## No game authority; tracks mobile suspension and fresh-session requirement.
var _suspended := false
var _had_zone := false
var _pending_restore := false

func is_suspended() -> bool:
	return _suspended

func suspend(had_zone: bool) -> bool:
	if _suspended:
		return false
	_suspended = true
	_had_zone = had_zone
	_pending_restore = had_zone
	return true

func require_restore() -> bool:
	if not _suspended:
		return false
	_had_zone = true
	_pending_restore = true
	return true

func cancel_restore() -> void:
	_had_zone = false
	_pending_restore = false

func resume() -> bool:
	if not _suspended:
		return false
	_suspended = false
	var restore := _pending_restore
	_pending_restore = false
	_had_zone = false
	return restore

func reset() -> void:
	_suspended = false
	_had_zone = false
	_pending_restore = false
