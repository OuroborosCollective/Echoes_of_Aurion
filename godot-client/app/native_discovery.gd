extends Node
## Explicit player observation -> existing Aurion command -> independent GET.
## No automatic retries for writes, no camera-triggered discovery or local reward.
signal status_changed(message: String)
const ReadApi = preload("res://net/api/chunk_surface_api.gd")
const CommandApi = preload("res://net/api/world_authoring_api.gd")
const Slice = preload("res://projection/world_slice.gd")
var _reader: Node
var _commands: Node
var _auth: Node
var _server := ""
var _allow_local := false
var _actor := ""
var _connection := ""
var _generation := -1
var _coordinate := Vector2i.ZERO
var _phase := "idle"
var _epoch := -1
var _receipt_hash := ""

func configure(auth: Node, server: String, allow_local: bool = false) -> void:
	_auth = auth
	_server = server
	_allow_local = allow_local
	_reader = ReadApi.new(auth, "/api/game/world-slice")
	_commands = CommandApi.new(auth)
	add_child(_reader)
	add_child(_commands)
	_reader.surface_ready.connect(_on_slice)
	_reader.request_failed.connect(func(_reason: String, connection: String):
		if connection == _connection: _fail())
	_commands.completed.connect(_on_receipt)
	_commands.failed.connect(func(_kind: String, _reason: String, connection: String, _generation_id: int):
		if connection == _connection: _fail())

func busy() -> bool:
	return _phase != "idle"

func begin(connection: String, actor: String, coordinate: Vector2i) -> bool:
	if busy() or _reader == null or not _auth.protected_response_allowed() or not Slice._actor(actor) or connection.is_empty():
		return false
	_connection = connection
	_actor = actor
	_coordinate = coordinate
	_generation = _auth.session_generation()
	_phase = "observe"
	status_changed.emit("Entdeckung wird bei Aurion geprüft …")
	if not _reader.request_surface(_server, connection, coordinate, _allow_local):
		_fail()
		return false
	return true

func reconcile(connection: String, actor: String, coordinate: Vector2i, stale: bool) -> void:
	if busy() and (stale or connection != _connection or actor != _actor or coordinate != _coordinate or not _session_valid()):
		_fail()

func _session_valid() -> bool:
	return _auth != null and _auth.protected_response_allowed() and _auth.session_generation() == _generation

func _on_slice(reply: Dictionary, connection: String, generation: int, coordinate: Vector2i) -> void:
	if not busy() or connection != _connection or generation != _generation or coordinate != _coordinate:
		return
	if not _session_valid() or not Slice.valid(reply, _actor, connection, coordinate):
		_fail()
		return
	if _phase == "readback":
		if reply.status != "VERIFIED" or reply.slice.epoch != _epoch or reply.slice.knowledgeHash != _receipt_hash:
			_fail()
			return
		cancel()
		status_changed.emit("Entdeckung gespeichert und unabhängig bestätigt. Der Weltentisch kann sie jetzt anzeigen.")
	elif _phase == "observe":
		_epoch = int(reply.slice.epoch)
		_phase = "write"
		if not _commands.request("recordDiscovery", _server, _connection, {
			"epoch": _epoch, "chunkX": coordinate.x, "chunkZ": coordinate.y,
			"observedAtLogicalFrame": int(reply.slice.observedAtTick),
		}, _allow_local):
			_fail()

func _on_receipt(kind: String, reply: Dictionary, connection: String, generation: int) -> void:
	if _phase != "write" or kind != "recordDiscovery" or connection != _connection or generation != _generation:
		return
	if not _session_valid() or not _valid_receipt(reply):
		_fail()
		return
	_receipt_hash = reply.memory.memoryHash
	_phase = "readback"
	if not _reader.request_surface(_server, connection, _coordinate, _allow_local):
		_fail()

func _valid_receipt(reply: Dictionary) -> bool:
	if not Slice._keys(reply, ["status", "memory", "mutationAuthority"]) or reply.status != "VERIFIED" or reply.mutationAuthority != "none":
		return false
	var m: Variant = reply.memory
	if not Slice._keys(m, ["schema", "userId", "worldId", "worldEpoch", "chunkX", "chunkZ", "firstDiscoveryReceiptHash", "latestConfirmedVisitSequence", "latestProjectionHash", "sourceRevision", "memoryHash"]):
		return false
	return m.schema == "aurion.exploration-memory.v1" and m.worldId == "echoes-of-aurion-global" and Slice.Chunk._whole(m.userId, 1, Slice.SAFE) and str(int(m.userId)) == _actor.substr(7) and m.worldEpoch == _epoch and m.chunkX == _coordinate.x and m.chunkZ == _coordinate.y and Slice.Chunk._whole(m.latestConfirmedVisitSequence, 0, Slice.SAFE) and Slice._sha(m.firstDiscoveryReceiptHash) and Slice._sha(m.latestProjectionHash) and Slice._sha(m.memoryHash) and Slice.Chunk._hex(m.sourceRevision, 40)

func _fail() -> void:
	cancel()
	status_changed.emit("Entdeckung nicht bestätigt. Bitte erneut lesen; ein unterbrochener Auftrag kann bereits gespeichert sein.")

func cancel() -> void:
	if _reader != null: _reader.cancel()
	if _commands != null: _commands.cancel()
	_phase = "idle"
	_connection = ""
	_actor = ""
	_generation = -1
	_epoch = -1
	_receipt_hash = ""

func _exit_tree() -> void:
	cancel()
