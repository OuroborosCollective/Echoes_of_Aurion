extends SceneTree

const NativeFlow = preload("res://net/auth/native_auth_flow.gd")
var failures: Array[String] = []

func require(condition: bool, message: String) -> void:
	if not condition:
		failures.append(message)

func _init() -> void:
	call_deferred("verify")

func verify() -> void:
	var flow = NativeFlow.new()
	require(flow.prepare_start("invalid/build", 1000).is_empty(), "invalid build must block")
	var start: Dictionary = flow.prepare_start("aurion-godot-g09b", 1000)
	require(start.size() == 7, "start request shape")
	require(start.get("version") == "aurion.native-auth.v1", "contract version")
	require(start.get("platform") == "android", "Android-only platform")
	require(start.get("returnId") == "aurion.android.app-link.v1", "return identifier")
	require(start.get("codeChallengeMethod") == "S256", "S256 required")
	require(str(start.get("requestState", "")).length() == 43, "256-bit state")
	require(str(start.get("codeChallenge", "")).length() == 43, "PKCE challenge")
	require(flow.browser_url().is_empty(), "must not open browser before verified server response")

	var id := "t".repeat(43)
	var browser := "https://arelogic.space/api/native-auth/browser/" + id
	var valid := {
		"version": "aurion.native-auth.v1",
		"transactionId": id,
		"browserUrl": browser,
		"expiresInSeconds": 600,
	}
	require(not flow.accept_start_response({
		"version": valid.version,
		"transactionId": id,
		"browserUrl": browser + "?code=leaked",
		"expiresInSeconds": 600,
	}, 1100), "query-bearing browser URL must be rejected")
	require(flow.browser_url().is_empty(), "invalid response must clear browser state")
	require(flow.consume_callback("c".repeat(43), start.requestState, 1200).is_empty(), "invalid transaction cannot be exchanged")

	flow.prepare_start("aurion-godot-g09b", 2000)
	require(not flow.accept_start_response(valid.merged({"unexpected": true}), 2100), "unexpected response field must fail closed")
	flow.prepare_start("aurion-godot-g09b", 3000)
	require(not flow.accept_start_response(valid, 603000), "expired start response must be rejected")

	var next_start: Dictionary = flow.prepare_start("aurion-godot-g09b", 4000)
	require(next_start.requestState != start.requestState, "new transaction must use fresh state")
	require(flow.accept_start_response(valid, 4100), "valid start response was rejected")
	require(flow.browser_url() == browser, "verified browser URL mismatch")
	require(flow.consume_callback("c".repeat(43), "w".repeat(43), 4200).is_empty(), "wrong callback state accepted")
	require(flow.browser_url().is_empty(), "wrong state must clear flow")
	require(flow.consume_callback("c".repeat(43), next_start.requestState, 4300).is_empty(), "callback replay accepted")

	var third_start: Dictionary = flow.prepare_start("aurion-godot-g09b", 5000)
	require(flow.accept_start_response(valid, 5100), "fresh start response rejected")
	require(flow.consume_callback("bad", third_start.requestState, 5200).is_empty(), "malformed handoff code accepted")
	require(flow.browser_url().is_empty(), "invalid code must clear pending state")

	var fourth_start: Dictionary = flow.prepare_start("aurion-godot-g09b", 6000)
	require(flow.accept_start_response(valid, 6100), "new start response rejected")
	var exchange: Dictionary = flow.consume_callback("c".repeat(43), fourth_start.requestState, 6200)
	require(exchange.size() == 5, "exchange wire shape")
	require(exchange.get("code") == "c".repeat(43), "handoff exchange code")
	require(exchange.get("transactionId") == id, "transaction identity")
	require(str(exchange.get("codeVerifier", "")).length() == 43, "PKCE verifier")
	require(exchange.get("appBuild") == "aurion-godot-g09b", "build binding")
	require(flow.browser_url().is_empty(), "successful callback must consume pending state")
	require(flow.consume_callback("c".repeat(43), fourth_start.requestState, 6300).is_empty(), "successful exchange replay accepted")

	var exp_start: Dictionary = flow.prepare_start("aurion-godot-g09b", 7000)
	require(flow.accept_start_response(valid, 7100), "expiring flow setup")
	require(flow.consume_callback("c".repeat(43), exp_start.requestState, 607000).is_empty(), "expired callback accepted")
	flow.prepare_start("aurion-godot-g09b", 8000)
	flow.clear()
	require(flow.browser_url().is_empty(), "cancel must clear browser URL")
	require(flow.consume_callback("c".repeat(43), fourth_start.requestState, 8100).is_empty(), "cancelled transaction accepted")
	# Deadline is a local monotonic presentation/auth boundary, not world time.
	if not flow.has_method("pending_remaining_ms") or not flow.has_method("expire_pending"):
		require(false, "pending browser handoff has no expiry boundary")
	else:
		var pending: Dictionary = flow.prepare_start("aurion-godot-g09b", 1000)
		require(flow.accept_start_response(valid, 1100), "expiry boundary setup")
		require(flow.pending_remaining_ms(1100) == 599900, "start latency must count against deadline")
		require(not flow.expire_pending(600999), "pending handoff expired before deadline")
		require(flow.pending_remaining_ms(600999) == 1, "last valid millisecond")
		require(flow.expire_pending(601000), "pending handoff not cleared at deadline")
		require(flow.browser_url().is_empty(), "expired URL retained")
		require(not flow.expire_pending(601001), "expiry reported twice")
		require(flow.consume_callback("c".repeat(43), pending.requestState, 601001).is_empty(), "expired verifier survived")
		flow.prepare_start("aurion-godot-g09b", 2000)
		require(flow.accept_start_response(valid, 2100), "rollback boundary setup")
		require(flow.expire_pending(1999), "monotonic clock rollback retained pending handoff")
		require(flow.browser_url().is_empty(), "rollback retained URL")
	if failures.is_empty():
		print("Godot native-auth pre-login contract verified")
		quit(0)
	else:
		for failure in failures:
			push_error(failure)
		quit(1)

