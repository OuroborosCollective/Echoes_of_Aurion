extends SceneTree

const Session = preload("res://net/auth/native_auth_tokens.gd")
var failures: Array[String] = []

func require(condition: bool, message: String) -> void:
	if not condition:
		failures.append(message)

func pair(access: String = "a", refresh: String = "r") -> Dictionary:
	return {
		"version": "aurion.native-auth.v1",
		"tokenType": "Bearer",
		"accessToken": access.repeat(43),
		"accessExpiresInSeconds": 900,
		"refreshToken": refresh.repeat(43),
		"refreshAbsoluteRemainingSeconds": 2592000,
		"refreshIdleExpiresInSeconds": 604800,
	}

func _init() -> void:
	call_deferred("verify")

func verify() -> void:
	var session = Session.new()
	require(session.access_token(1000).is_empty(), "fresh client must be unauthenticated")
	require(session.begin_refresh(1000).is_empty(), "no refresh without verified server tokens")
	require(session.begin_logout().is_empty(), "logout without a session is inert")
	require(session.accept_token_response(pair(), 1000), "valid exact token pair denied")
	require(session.access_token(1000) == "a".repeat(43), "access token not available in process")
	require(session.access_token(900999) == "a".repeat(43), "unexpired access was removed")
	require(session.access_token(901000).is_empty(), "expired access token accepted")
	var refresh: Dictionary = session.begin_refresh(901000)
	require(refresh.size() == 2 and refresh.get("version") == "aurion.native-auth.v1", "refresh payload shape")
	require(refresh.get("refreshToken") == "r".repeat(43), "refresh token binding")
	require(session.begin_refresh(901001).is_empty(), "parallel refresh was allowed")
	require(session.accept_token_response(pair("b", "s"), 902000), "valid refresh rotation rejected")
	require(session.access_token(902000) == "b".repeat(43), "rotated access not installed")
	# The server's refreshed absolute-remaining field cannot lengthen the original session.
	var first_absolute_test = Session.new()
	var short_pair := pair()
	short_pair["refreshAbsoluteRemainingSeconds"] = 5
	require(first_absolute_test.accept_token_response(short_pair, 100000), "short absolute setup")
	require(first_absolute_test.begin_refresh(101000).size() == 2, "refresh before absolute deadline")
	require(first_absolute_test.accept_token_response(pair("b", "s"), 102000), "rotated short session rejected")
	require(first_absolute_test.access_token(105000).is_empty(), "refresh extended original absolute deadline")
	require(first_absolute_test.begin_refresh(105000).is_empty(), "refresh extended absolute session authority")
	var late_rotation = Session.new()
	require(late_rotation.accept_token_response(short_pair, 200000), "late-rotation setup")
	var late_generation: int = late_rotation.session_generation()
	require(late_rotation.begin_refresh(204999).size() == 2, "late rotation did not begin before absolute expiry")
	require(late_rotation.protected_response_allowed(204999), "valid rotating session rejected protected response")
	require(late_rotation.access_token(205000).is_empty(), "absolute expiry retained access during rotation")
	require(not late_rotation.protected_response_allowed(205000), "absolute-expired rotation accepted protected response")
	require(late_rotation.session_generation() == late_generation, "absolute expiry erased committed rotation identity")
	require(not late_rotation.accept_token_response(pair("b", "s"), 204999, 205001), "late rotation resurrected an expired session")
	require(late_rotation.session_generation() == late_generation + 1, "terminal late rotation did not clear the expired session")
	require(late_rotation.access_token(205001).is_empty(), "late rotation retained expired access")
	require(late_rotation.begin_refresh(205001).is_empty(), "late rotation retained expired refresh authority")
	var rotated_same = Session.new()
	require(rotated_same.accept_token_response(pair(), 110000), "repeat-refresh setup")
	require(rotated_same.begin_refresh(110001).size() == 2, "repeat-refresh request")
	require(not rotated_same.accept_token_response(pair("b", "r"), 110002), "reused refresh secret accepted as rotation")
	require(rotated_same.access_token(110003).is_empty(), "reused refresh retained access")
	require(rotated_same.begin_refresh(110003).is_empty(), "reused refresh retained authority")

	var rotated_backwards = Session.new()
	require(rotated_backwards.accept_token_response(pair(), 120000), "clock-rollback setup")
	require(rotated_backwards.begin_refresh(120001).size() == 2, "clock-rollback refresh requested")
	require(not rotated_backwards.accept_token_response(pair("b", "s"), 119999), "clock-regressed rotation accepted")
	require(rotated_backwards.begin_refresh(120002).is_empty(), "clock-regressed rotation retained authority")
	require(session.begin_logout().get("refreshToken") == "s".repeat(43), "logout did not use latest refresh")
	require(session.access_token(902001).is_empty(), "logout retained access")
	require(session.begin_refresh(902001).is_empty(), "logout retained refresh")
	require(session.begin_logout().is_empty(), "logout replay accepted")

	# Real contract is strict: wrong/missing/extra fields, types, secrets and TTLs fail closed.
	var wrong: Array[Dictionary] = []
	var extra := pair()
	extra["debugToken"] = "never"
	wrong.append(extra)
	var missing := pair()
	missing.erase("tokenType")
	wrong.append(missing)
	for key in ["version", "tokenType", "accessToken", "refreshToken", "accessExpiresInSeconds", "refreshIdleExpiresInSeconds", "refreshAbsoluteRemainingSeconds"]:
		var malformed := pair()
		if key == "version":
			malformed[key] = "future-version"
		elif key == "tokenType":
			malformed[key] = "Basic"
		elif key == "accessToken":
			malformed[key] = "short"
		elif key == "refreshToken":
			malformed[key] = "a".repeat(43)
		elif key == "accessExpiresInSeconds":
			malformed[key] = 901
		elif key == "refreshIdleExpiresInSeconds":
			malformed[key] = 1
		else:
			malformed[key] = 2592001
		wrong.append(malformed)
	var fractional_deadline := pair()
	fractional_deadline["refreshAbsoluteRemainingSeconds"] = 3600.5
	wrong.append(fractional_deadline)
	var negative_deadline := pair()
	negative_deadline["refreshAbsoluteRemainingSeconds"] = -1
	wrong.append(negative_deadline)
	var missing_token := pair()
	missing_token["accessToken"] = null
	wrong.append(missing_token)
	for candidate in wrong:
		require(not session.accept_token_response(candidate, 12000), "invalid token payload accepted")
		require(session.access_token(12000).is_empty(), "invalid response retained access")
		require(session.begin_refresh(12000).is_empty(), "invalid response retained refresh")

	var wire_session = Session.new()
	var wire_pair: Variant = JSON.parse_string(JSON.stringify(pair()))
	require(wire_session.accept_token_response(wire_pair, 19000), "integral JSON number lifetimes rejected")
	require(wire_session.access_token(19000) == "a".repeat(43), "wire token pair was not installed")

	require(session.accept_token_response(pair(), 20000), "fresh pair rejected after negative cases")
	require(not session.accept_token_response(pair("b", "s"), 20001), "unsolicited rotation accepted")
	require(session.begin_refresh(20002).is_empty(), "unsolicited rotation retained credentials")

	require(session.accept_token_response(pair(), 30000), "idle expiry setup failed")
	require(session.begin_refresh(30000 + 604800000).is_empty(), "refresh idle expiry bypassed")
	require(session.access_token(30000 + 604800001).is_empty(), "idle expiry kept access")
	require(session.accept_token_response(pair(), 40000), "absolute TTL setup failed")
	require(session.begin_refresh(40000 + 2592000000).is_empty(), "absolute refresh deadline bypassed")
	require(session.accept_token_response(pair(), 50000), "clock regression setup failed")
	require(session.access_token(49999).is_empty(), "backward monotonic time accepted")
	require(session.begin_refresh(50000).is_empty(), "backward time retained refresh")

	var short_absolute := pair()
	short_absolute["refreshAbsoluteRemainingSeconds"] = 5
	require(session.accept_token_response(short_absolute, 60000), "short absolute TTL rejected")
	require(session.access_token(65000).is_empty(), "absolute expiry must cap access TTL")
	require(session.begin_refresh(65000).is_empty(), "absolute expiry must cap refresh")

	require(not session.accept_token_response("not-json", 70000), "non-dictionary accepted")
	require(session.access_token(70000).is_empty(), "wrong type retained access")
	if failures.is_empty():
		print("Godot native-auth ephemeral token contract verified")
		quit(0)
	else:
		for failure in failures:
			push_error(failure)
		quit(1)
