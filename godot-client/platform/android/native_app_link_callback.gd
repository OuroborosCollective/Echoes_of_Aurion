extends RefCounted
## Validates a URL forwarded by the future Android App-Link adapter.
## URL shape does not prove Android association: release package and SHA-256
## signing certificate remain separate, mandatory Android verification gates.
## Never print or persist the one-time code or request state.
const CALLBACK_PREFIX := "https://arelogic.space/app/auth/callback?"
const KEY_CODE := "code"
const KEY_STATE := "state"

static func consume(raw_url: Variant, flow: RefCounted, now_ms: int = -1) -> Dictionary:
	# Reject every invalid delivery and invalidate any pending PKCE transaction.
	if typeof(raw_url) != TYPE_STRING:
		flow.call("clear")
		return {}
	var uri: String = raw_url
	if not uri.begins_with(CALLBACK_PREFIX) or uri.count("?") != 1 or \
			uri.contains("#") or uri.contains("%") or uri.contains("+") or \
			uri.contains(";") or uri.contains("\\"):
		flow.call("clear")
		return {}
	var query: String = uri.substr(CALLBACK_PREFIX.length())
	var fields: PackedStringArray = query.split("&", true)
	if fields.size() != 2:
		flow.call("clear")
		return {}
	var params := {}
	for field in fields:
		if field.count("=") != 1:
			flow.call("clear")
			return {}
		var pair: PackedStringArray = field.split("=", true)
		if pair.size() != 2 or not (pair[0] in [KEY_CODE, KEY_STATE]) or \
				params.has(pair[0]) or pair[1].is_empty():
			flow.call("clear")
			return {}
		params[pair[0]] = pair[1]
	if not params.has(KEY_CODE) or not params.has(KEY_STATE):
		flow.call("clear")
		return {}
	var state_status: String = flow.call("callback_state_status", params[KEY_STATE], now_ms)
	if state_status == "mismatch":
		# A cancelled browser can return during the next attempt. Consume its
		# Activity intent without letting it destroy the current PKCE state.
		return {}
	if state_status != "match":
		flow.call("clear")
		return {}
	# Only the transaction owner can accept a state and generate an exchange
	# payload. This function never creates a local session.
	return flow.call("consume_callback", params[KEY_CODE], params[KEY_STATE], now_ms)
