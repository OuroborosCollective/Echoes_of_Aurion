extends Node
## Read one content-addressed public Aurion GLB. Authentication is checked to
## bind the reply to the active session, but no bearer is sent to the asset URL.
signal asset_ready(sha256: String, body: PackedByteArray, connection_id: String, generation: int)
signal request_failed(reason: String, connection_id: String)
const RuntimeConfig = preload("res://config/runtime_config.gd")
const MAX_BYTES := 24 * 1024 * 1024
var _auth: Node
var _http: HTTPRequest
var _active := false
var _epoch := 0
var _connection := ""
var _generation := -1
var _sha := ""

func _init(auth: Node) -> void:
	_auth = auth

func busy() -> bool:
	return _active

func request_asset(base_url: String, request: Dictionary, connection_id: String, allow_local: bool = false) -> bool:
	if _active or not is_inside_tree() or connection_id.is_empty() or not _auth.protected_response_allowed():
		return false
	var server: String = RuntimeConfig.validated_server_url(base_url, allow_local)
	var sha: Variant = request.get("sha256")
	if server.is_empty() or typeof(sha) != TYPE_STRING or sha.length() != 64:
		return false
	for character in sha:
		if not "0123456789abcdef".contains(character):
			return false
	if request.get("storageUrl") != "/api/assets/glb/" + sha + ".glb":
		return false
	_active = true
	_connection = connection_id
	_generation = _auth.session_generation()
	_sha = sha
	if is_instance_valid(_http):
		_http.cancel_request()
		_http.queue_free()
	_epoch += 1
	var epoch := _epoch
	_http = HTTPRequest.new()
	_http.body_size_limit = MAX_BYTES
	_http.max_redirects = 0
	_http.timeout = 15.0
	add_child(_http)
	_http.request_completed.connect(_on_completed.bind(epoch))
	var error := _http.request(server + request.storageUrl, PackedStringArray(["Accept: model/gltf-binary"]), HTTPClient.METHOD_GET)
	if error != OK:
		_fail("WORLD_ASSET_REQUEST_FAILED")
		return false
	return true

func _on_completed(result: int, code: int, headers: PackedStringArray, body: PackedByteArray, epoch: int) -> void:
	if not _active or epoch != _epoch:
		return
	if not _auth.protected_response_allowed() or _auth.session_generation() != _generation:
		_fail("WORLD_ASSET_SESSION_CHANGED")
		return
	if result != HTTPRequest.RESULT_SUCCESS:
		_fail("WORLD_ASSET_REQUEST_FAILED")
		return
	var valid_type := false
	for header in headers:
		var value := header.to_lower()
		if value.begins_with("content-type:"):
			var mime := value.trim_prefix("content-type:").strip_edges()
			var separator := mime.find(";")
			if separator >= 0:
				mime = mime.substr(0, separator).strip_edges()
			valid_type = mime in ["model/gltf-binary", "application/octet-stream"]
			break
	if code != 200 or not valid_type or body.is_empty() or body.size() > MAX_BYTES:
		_fail("WORLD_ASSET_RESPONSE_INVALID")
		return
	var connection := _connection
	var generation := _generation
	var sha := _sha
	_complete()
	asset_ready.emit(sha, body, connection, generation)

func _complete() -> void:
	_active = false
	_connection = ""
	_generation = -1
	_sha = ""

func _fail(reason: String) -> void:
	var connection := _connection
	_complete()
	request_failed.emit(reason, connection)

func cancel() -> void:
	_epoch += 1
	if is_instance_valid(_http):
		_http.cancel_request()
	_complete()

func _exit_tree() -> void:
	cancel()
