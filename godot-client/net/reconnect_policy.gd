extends RefCounted
## Bounded retries that outlast a release restart (container recreate, boot
## settlement, health): immediate, 0.5 s, 1.5 s, 3 s, 5 s, 10 s, then every 15 s;
## about 140 s in total, never forever.
const DELAYS := [0, 500, 1500, 3000, 5000, 10000, 15000, 15000, 15000, 15000, 15000, 15000, 15000, 15000]
var _active := false
var _attempt := 0
var _due := -1
var _waiting := false

func begin(now_ms: int) -> bool:
	if _active or now_ms < 0:
		return false
	_active = true
	_attempt = 0
	_due = now_ms
	_waiting = false
	return true

func active() -> bool:
	return _active

func take_if_due(now_ms: int) -> bool:
	if not _active or _waiting or _due < 0 or now_ms < _due:
		return false
	_waiting = true
	_due = -1
	_attempt += 1
	return true

func retry_after_failure(now_ms: int) -> bool:
	if not _active or not _waiting:
		return false
	_waiting = false
	if _attempt >= DELAYS.size():
		reset()
		return false
	_due = now_ms + DELAYS[_attempt]
	return true

func reset() -> void:
	_active = false
	_waiting = false
	_attempt = 0
	_due = -1
