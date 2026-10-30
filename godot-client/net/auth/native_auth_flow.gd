extends RefCounted
## Pre-login transaction builder for Android. Secrets exist only in process memory.
## Deliberately no HTTP requests, browser invocation, persistence or credential logging.
const RuntimeConfig = preload("res://config/runtime_config.gd")
const VERSION := "aurion.native-auth.v1"
const RETURN_ID := "aurion.android.app-link.v1"
const SERVER_BROWSER_PREFIX := "https://arelogic.space/api/native-auth/browser/"
const TRANSACTION_TTL_MS := 600000

var _verifier := ""
var _state := ""
var _transaction_id := ""
var _app_build := ""
var _started_at_ms := -1
var _browser_ready := false

static func _base64url(bytes: PackedByteArray) -> String:
	return Marshalls.raw_to_base64(bytes).replace("+", "-").replace("/", "_").trim_suffix("=")

static func _valid_opaque(value: Variant, minimum: int, maximum: int) -> bool:
	if typeof(value) != TYPE_STRING:
		return false
	var token: String = value
	if token.length() < minimum or token.length() > maximum:
		return false
	var pattern := RegEx.new()
	pattern.compile("^[A-Za-z0-9_-]+$")
	return pattern.search(token) != null

static func _same_secret(left: String, right: String) -> bool:
	var a := left.to_utf8_buffer()
	var b := right.to_utf8_buffer()
	var difference := a.size() ^ b.size()
	for i in range(maxi(a.size(), b.size())):
		var first: int = a[i] if i < a.size() else 0
		var second: int = b[i] if i < b.size() else 0
		difference |= first ^ second
	return difference == 0

func clear() -> void:
	_verifier = ""
	_state = ""
	_transaction_id = ""
	_app_build = ""
	_started_at_ms = -1
	_browser_ready = false

func prepare_start(app_build: String, now_ms: int = -1) -> Dictionary:
	clear()
	var validated_build: String = RuntimeConfig.validated_build(app_build)
	if validated_build.is_empty():
		return {}
	_started_at_ms = now_ms if now_ms >= 0 else Time.get_ticks_msec()
	var crypto := Crypto.new()
	_state = _base64url(crypto.generate_random_bytes(32))
	_verifier = _base64url(crypto.generate_random_bytes(32))
	var hashing := HashingContext.new()
	if hashing.start(HashingContext.HASH_SHA256) != OK:
		clear()
		return {}
	if hashing.update(_verifier.to_utf8_buffer()) != OK:
		clear()
		return {}
	var challenge := _base64url(hashing.finish())
	_app_build = validated_build
	return {
		"version": VERSION,
		"codeChallenge": challenge,
		"codeChallengeMethod": "S256",
		"requestState": _state,
		"appBuild": _app_build,
		"platform": "android",
		"returnId": RETURN_ID,
	}

func accept_start_response(raw: Variant, now_ms: int = -1) -> bool:
	if _state.is_empty() or _verifier.is_empty() or _started_at_ms < 0:
		return false
	var now: int = now_ms if now_ms >= 0 else Time.get_ticks_msec()
	if now < _started_at_ms or now >= _started_at_ms + TRANSACTION_TTL_MS or typeof(raw) != TYPE_DICTIONARY:
		clear()
		return false
	var payload: Dictionary = raw
	if payload.size() != 4 or payload.get("version") != VERSION or payload.get("expiresInSeconds") != 600:
		clear()
		return false
	var id: Variant = payload.get("transactionId")
	if not _valid_opaque(id, 32, 128):
		clear()
		return false
	if typeof(payload.get("browserUrl")) != TYPE_STRING or payload.get("browserUrl") != SERVER_BROWSER_PREFIX + str(id):
		clear()
		return false
	_transaction_id = str(id)
	_browser_ready = true
	return true

func browser_url() -> String:
	if not _browser_ready:
		return ""
	return SERVER_BROWSER_PREFIX + _transaction_id

## Monotonic login deadline only; never feeds the deterministic world tick.
## Count transport latency from prepare_start, not from browser presentation.
func pending_remaining_ms(now_ms: int = -1) -> int:
	if not _browser_ready:
		return 0
	var now: int = now_ms if now_ms >= 0 else Time.get_ticks_msec()
	if now < _started_at_ms:
		return 0
	return maxi(0, _started_at_ms + TRANSACTION_TTL_MS - now)

func expire_pending(now_ms: int = -1) -> bool:
	if not _browser_ready or pending_remaining_ms(now_ms) > 0:
		return false
	clear()
	return true

## A well-formed callback from an older browser transaction is untrusted but
## harmless: the Android transport consumes it while the current attempt stays
## pending. Malformed or expired state still fails closed in the parser.
func callback_state_status(callback_state: Variant, now_ms: int = -1) -> String:
	if not _browser_ready:
		return "invalid"
	var now: int = now_ms if now_ms >= 0 else Time.get_ticks_msec()
	if now < _started_at_ms or now >= _started_at_ms + TRANSACTION_TTL_MS or not _valid_opaque(callback_state, 43, 128):
		return "invalid"
	return "match" if _same_secret(_state, str(callback_state)) else "mismatch"

## The platform adapter must deliver parsed callback fields, never grant login.
## An accepted callback or any malformed/expired payload consumes the pending
## transaction; a well-formed mismatched stale state is filtered beforehand.
func consume_callback(code: Variant, callback_state: Variant, now_ms: int = -1) -> Dictionary:
	if not _browser_ready:
		return {}
	var now: int = now_ms if now_ms >= 0 else Time.get_ticks_msec()
	var accepted := now >= _started_at_ms and now < _started_at_ms + TRANSACTION_TTL_MS
	accepted = accepted and _valid_opaque(code, 43, 256) and _valid_opaque(callback_state, 43, 128)
	if accepted:
		accepted = _same_secret(_state, str(callback_state))
	var result: Dictionary = {}
	if accepted:
		result = {
			"version": VERSION,
			"transactionId": _transaction_id,
			"code": str(code),
			"codeVerifier": _verifier,
			"appBuild": _app_build,
		}
	clear()
	return result

