extends RefCounted
## Godot-side validation and ephemeral in-process credentials only.
## Aurion server remains the sole session authority. No persistence or network I/O.
const VERSION := "aurion.native-auth.v1"
const ACCESS_TTL_SECONDS := 900
const REFRESH_IDLE_SECONDS := 604800
const REFRESH_ABSOLUTE_MAX_SECONDS := 2592000

var _access_token := ""
var _refresh_token := ""
var _issued_at_ms := -1
var _access_deadline_ms := -1
var _idle_deadline_ms := -1
var _absolute_deadline_ms := -1
var _refresh_in_flight := false

static func _json_integer(value: Variant) -> bool:
	return typeof(value) == TYPE_INT or (
		typeof(value) == TYPE_FLOAT and is_finite(value) and value == floor(value)
	)

static func _opaque(value: Variant) -> bool:
	if typeof(value) != TYPE_STRING:
		return false
	var token: String = value
	if token.length() < 43 or token.length() > 256:
		return false
	var pattern := RegEx.new()
	pattern.compile("^[A-Za-z0-9_-]+$")
	return pattern.search(token) != null

func clear() -> void:
	_access_token = ""
	_refresh_token = ""
	_issued_at_ms = -1
	_access_deadline_ms = -1
	_idle_deadline_ms = -1
	_absolute_deadline_ms = -1
	_refresh_in_flight = false

## On invalid response, refuse the whole session; never retain an old refresh.
func accept_token_response(raw: Variant, now_ms: int = -1) -> bool:
	var now: int = now_ms if now_ms >= 0 else Time.get_ticks_msec()
	if not _refresh_token.is_empty() and not _refresh_in_flight:
		clear()
		return false
	if typeof(raw) != TYPE_DICTIONARY:
		clear()
		return false
	var payload: Dictionary = raw
	if payload.size() != 7:
		clear()
		return false
	if payload.get("version") != VERSION or payload.get("tokenType") != "Bearer":
		clear()
		return false
	if not _opaque(payload.get("accessToken")) or not _opaque(payload.get("refreshToken")):
		clear()
		return false
	var access: String = payload.get("accessToken")
	var refresh: String = payload.get("refreshToken")
	if access == refresh:
		clear()
		return false
	if not _json_integer(payload.get("accessExpiresInSeconds")) or \
			payload.get("accessExpiresInSeconds") != ACCESS_TTL_SECONDS:
		clear()
		return false
	if not _json_integer(payload.get("refreshIdleExpiresInSeconds")) or \
			payload.get("refreshIdleExpiresInSeconds") != REFRESH_IDLE_SECONDS:
		clear()
		return false
	if not _json_integer(payload.get("refreshAbsoluteRemainingSeconds")):
		clear()
		return false
	var absolute_remaining := int(payload.get("refreshAbsoluteRemainingSeconds"))
	if absolute_remaining <= 0 or absolute_remaining > REFRESH_ABSOLUTE_MAX_SECONDS:
		clear()
		return false
	# A rotation must replace the previous refresh secret, not replay it.
	if _refresh_in_flight:
		if now < _issued_at_ms or refresh == _refresh_token:
			clear()
			return false
	# A refresh may shorten the absolute limit, never extend the first confirmed session.
	var new_absolute: int = now + absolute_remaining * 1000
	if _refresh_in_flight and _absolute_deadline_ms >= 0:
		new_absolute = mini(new_absolute, _absolute_deadline_ms)
	if new_absolute <= now:
		clear()
		return false
	_access_token = access
	_refresh_token = refresh
	_issued_at_ms = now
	_absolute_deadline_ms = new_absolute
	_access_deadline_ms = mini(now + ACCESS_TTL_SECONDS * 1000, _absolute_deadline_ms)
	_idle_deadline_ms = mini(now + REFRESH_IDLE_SECONDS * 1000, _absolute_deadline_ms)
	_refresh_in_flight = false
	return true

func access_token(now_ms: int = -1) -> String:
	if _access_token.is_empty():
		return ""
	var now: int = now_ms if now_ms >= 0 else Time.get_ticks_msec()
	if now < _issued_at_ms:
		clear()
		return ""
	if now >= _idle_deadline_ms or now >= _absolute_deadline_ms:
		clear()
		return ""
	if now >= _access_deadline_ms:
		_access_token = ""
		return ""
	return _access_token

## Exactly one in-flight refresh: a duplicate would trigger server replay revocation.
func begin_refresh(now_ms: int = -1) -> Dictionary:
	if _refresh_token.is_empty() or _refresh_in_flight:
		return {}
	var now: int = now_ms if now_ms >= 0 else Time.get_ticks_msec()
	if now < _issued_at_ms or now >= _idle_deadline_ms or now >= _absolute_deadline_ms:
		clear()
		return {}
	_refresh_in_flight = true
	return {"version": VERSION, "refreshToken": _refresh_token}

## Caller sends this over approved HTTPS; local authority is cleared immediately.
func begin_logout() -> Dictionary:
	var result: Dictionary = {}
	if not _refresh_token.is_empty():
		result = {"version": VERSION, "refreshToken": _refresh_token, "scope": "session"}
	clear()
	return result
