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
	if _android_runtime == null or not _android_runtime.has_method("getJavaGodotActivity"):
		return
	_activity = _android_runtime.getJavaGodotActivity()

func poll_for_callback(pending_login: bool) -> bool:
	if not pending_login or OS.get_name() != "Android" or _activity == null:
		return false
	var intent: Variant = _activity.getIntent()
	if intent == null:
		return false
	var data: Variant = intent.getDataString()
	if data == null:
		return false
	var url := str(data)
	var accepted := deliver_for_test(url, pending_login)
	if accepted:
		# Clear only the delivered URI, preventing an app resume from replaying it.
		intent.setData(null)
	return accepted

func reset() -> void:
	_last_delivered = ""

func deliver_for_test(raw_url: String, pending_login: bool) -> bool:
	if not pending_login or not raw_url.begins_with(PREFIX):
		return false
	if raw_url == _last_delivered:
		return false
	_last_delivered = raw_url
	callback_received.emit(raw_url)
	return true
