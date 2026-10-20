extends SceneTree

const Flow = preload("res://net/auth/native_auth_flow.gd")
const Callback = preload("res://platform/android/native_app_link_callback.gd")
const CALLBACK := "https://arelogic.space/app/auth/callback?"
var ID: String = "t".repeat(43)
var CODE: String = "c".repeat(43)
var failures: Array[String] = []

func require(value: bool, label: String) -> void:
	if not value:
		failures.append(label)

func begin(now: int) -> Dictionary:
	var flow = Flow.new()
	var start: Dictionary = flow.prepare_start("aurion-godot-g09b", now)
	var approved := {
		"version": "aurion.native-auth.v1",
		"transactionId": ID,
		"browserUrl": "https://arelogic.space/api/native-auth/browser/" + ID,
		"expiresInSeconds": 600,
	}
	require(flow.accept_start_response(approved, now + 1), "test fixture start response rejected")
	return {"flow": flow, "state": start["requestState"]}

func _init() -> void:
	call_deferred("verify")

func verify() -> void:
	var flow = Flow.new()
	require(Callback.consume(CALLBACK + "code=" + CODE + "&state=" + "s".repeat(43), flow, 1000).is_empty(),
		"callback with no active transaction accepted")
	var first: Dictionary = begin(2000)
	var state: String = first["state"]
	var exchange: Dictionary = Callback.consume(CALLBACK + "code=" + CODE + "&state=" + state, first["flow"], 2100)
	require(exchange.size() == 5 and exchange.get("code") == CODE, "valid canonical URL rejected")
	require(exchange.get("transactionId") == ID, "transaction not bound")
	require(str(exchange.get("codeVerifier", "")).length() == 43, "PKCE verifier absent")
	require(Callback.consume(CALLBACK + "code=" + CODE + "&state=" + state, first["flow"], 2101).is_empty(),
		"callback replay accepted")
	var swapped: Dictionary = begin(3000)
	var alternative: Dictionary = Callback.consume(CALLBACK + "state=" + swapped["state"] + "&code=" + CODE, swapped["flow"], 3100)
	require(alternative.size() == 5, "parameter order incorrectly matters")
	require(Callback.consume(CALLBACK + "code=" + CODE + "&state=" + swapped["state"], swapped["flow"], 3101).is_empty(),
		"reverse order callback replay accepted")

	var hostile: Array[Variant] = [
		null, 17, {},
		"http://arelogic.space/app/auth/callback?code=" + CODE + "&state=placeholder",
		"https://evil.example/app/auth/callback?code=" + CODE + "&state=placeholder",
		"https://arelogic.space.evil.example/app/auth/callback?code=" + CODE + "&state=placeholder",
		"https://arelogic.space:443/app/auth/callback?code=" + CODE + "&state=placeholder",
		"https://user@arelogic.space/app/auth/callback?code=" + CODE + "&state=placeholder",
		"https://arelogic.space/app/auth/callback/?code=" + CODE + "&state=placeholder",
		CALLBACK + "code=" + CODE + "&state=placeholder#fragment",
		CALLBACK + "code=" + CODE + "&state=placeholder?more=1",
		CALLBACK + "code=" + CODE + "&state=placeholder&debug=1",
		CALLBACK + "code=" + CODE + "&code=" + CODE,
		CALLBACK + "state=placeholder&state=placeholder",
		CALLBACK + "code=" + CODE + "&state=placeholder&state=placeholder",
		CALLBACK + "code=" + CODE + "&state=",
		CALLBACK + "code=" + CODE + "&state=placeholder&",
		CALLBACK + "code=%63" + CODE.substr(1) + "&state=placeholder",
		CALLBACK + "code=" + CODE + "&state=placeholder+bad",
		CALLBACK + "code=" + CODE + ";state=placeholder",
		CALLBACK + "code=" + CODE + "&state=placeholder\\extra",
	]
	for i in range(hostile.size()):
		var fixture: Dictionary = begin(4000 + i * 1000)
		require(Callback.consume(hostile[i], fixture["flow"], 4100 + i * 1000).is_empty(),
			"unsafe URL accepted, case " + str(i))
		require(fixture["flow"].browser_url().is_empty(),
			"unsafe URL retained pending authorization, case " + str(i))
	# The URI shape alone must not authorize a mismatched or expired state.
	var mismatch: Dictionary = begin(30000)
	require(Callback.consume(CALLBACK + "code=" + CODE + "&state=" + "x".repeat(43),
			mismatch["flow"], 30100).is_empty(), "foreign callback state accepted")
	require(not mismatch["flow"].browser_url().is_empty(), "well-formed stale state destroyed the current transaction")
	var after_stale: Dictionary = Callback.consume(CALLBACK + "code=" + CODE + "&state=" + mismatch["state"],
			mismatch["flow"], 30101)
	require(after_stale.size() == 5, "current callback was rejected after a stale browser callback")
	require(mismatch["flow"].browser_url().is_empty(), "accepted current callback did not consume the transaction")
	var malformed_state: Dictionary = begin(40000)
	require(Callback.consume(CALLBACK + "code=" + CODE + "&state=short",
			malformed_state["flow"], 40100).is_empty(), "malformed callback state accepted")
	require(malformed_state["flow"].browser_url().is_empty(), "malformed callback state retained the transaction")
	var expired: Dictionary = begin(50000)
	require(Callback.consume(CALLBACK + "code=" + CODE + "&state=" + expired["state"],
			expired["flow"], 650000).is_empty(), "expired callback accepted")
	require(expired["flow"].browser_url().is_empty(), "expired callback kept PKCE pending")
	var wrong_code: Dictionary = begin(70000)
	require(Callback.consume(CALLBACK + "code=short&state=" + wrong_code["state"],
			wrong_code["flow"], 70100).is_empty(), "malformed code accepted")
	require(wrong_code["flow"].browser_url().is_empty(), "invalid code retained transaction")
	if failures.is_empty():
		print("Godot Android callback URI contract verified")
		quit(0)
	else:
		for failure in failures:
			push_error(failure)
		quit(1)
