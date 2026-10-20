extends Node
## Native Android callback transport only. Authority remains with PKCE state and Aurion.
signal callback_received(raw_url: String)
const PREFIX := "https://arelogic.space/app/auth/callback?"
var _last_delivered := ""
var _android_runtime: Object
var _activity: Object

func _ready() -> void:
	if OS.get_name() != "Android":
		return
	if not Engine.has_singleton("AndroidRuntime"):
		return
	_android_runtime = Engine.get_singleton("AndroidRuntime")
	if _android_runtime == null or not _android_runtime.has_method("getActivity"):
		return
	_activity = _android_runtime.getActivity()

func poll_for_callback(pending_login: bool) -> bool:
	if OS.get_name() != "Android":
		return false
	return poll_activity_intent_for_test(pending_login)

func poll_activity_intent_for_test(pending_login: bool) -> bool:
	if not pending_login or _activity == null:
		return false
	var intent: Variant = _activity.getIntent()
	if intent == null:
		return false
	var data: Variant = intent.getDataString()
	if data == null:
		return false
	var accepted := deliver_for_test(str(data), pending_login)
	if accepted:
		# Clear every delivered canonical URI, including malformed callbacks that
		# the strict auth validator rejects, so app resume cannot retry it forever.
		intent.setData(null)
	return accepted

func reset() -> void:
	_last_delivered = ""
	if _activity == null:
		return
	var intent: Variant = _activity.getIntent()
	if intent == null:
		return
	var data: Variant = intent.getDataString()
	if data != null and str(data).begins_with(PREFIX):
		# A callback may arrive after cancellation while polling is paused.
		# Discard it before a fresh transaction can mistake it for its own.
		intent.setData(null)

func deliver_for_test(raw_url: String, pending_login: bool) -> bool:
	# This transport recognizes only the exact callback route. The downstream
	# callback parser owns URI, field and PKCE/state validation and fails closed.
	if not pending_login or not raw_url.begins_with(PREFIX):
		return false
	if raw_url == _last_delivered:
		return false
	_last_delivered = raw_url
	callback_received.emit(raw_url)
	return true
