@tool
extends Node
## Aurion-Bridge-Client (WebSocket, Protokoll aurion-bridge/1).
##
## Hält den gespiegelten Live-Zustand in `entities` (id -> Dictionary) und meldet
## Änderungen per Signal. GODOT VERÄNDERT NIE WELTZUSTAND: Bearbeiten heißt
## Commands senden (cmd_*). Der Server entscheidet; das Ergebnis kommt als Delta.

signal connected
signal disconnected(reason: String)
signal snapshot_received
signal entity_upserted(entity: Dictionary)
signal entity_removed(id: String)
signal status_changed(upstream_up: bool)
signal ack_received(cmd_id: String, ok: bool, error: String, tick: int)
signal log_message(text: String)

@export var url: String = "ws://127.0.0.1:8765/godot"
var token: String = "" # Credential is process-local, never a serialized scene property.
var credential_source_path: String = "" # Set only after an actual successful file read.
@export var auto_connect: bool = true

const PROTO := 1
const RECONNECT_MIN := 1.0
const RECONNECT_MAX := 15.0
## Snapshots können groß werden; Godots Standard (64 KB) reicht dafür nicht.
const INBOUND_BUFFER := 8 * 1024 * 1024

var entities: Dictionary = {}
var regions: Array = []
var world_id: String = ""
var tick: int = 0
var seq: int = 0
var edit_enabled: bool = false
var upstream_up: bool = false
var is_authed: bool = false
var auth_failed: bool = false
var has_snapshot: bool = false
var identity: Dictionary = {}
var _last_confirmed_identity: Dictionary = {}
var want_connection: bool = false

var _ws: WebSocketPeer = null
var _was_open := false
var _awaiting_snapshot := true
var _retry_left := 0.0
var _backoff := RECONNECT_MIN
var _cmd_counter := 0
var _offered_edit := false
var _last_observation_ms := -1
const MAX_ENTITIES := 2048


func _ready() -> void:
    var env_url := OS.get_environment("AURION_BRIDGE_URL")
    if env_url != "":
        url = env_url
    var env_token := OS.get_environment("AURION_BRIDGE_TOKEN")
    var token_file := OS.get_environment("AURION_BRIDGE_TOKEN_FILE")
    if token == "" and token_file != "":
        var file := FileAccess.open(token_file, FileAccess.READ)
        if file != null:
            token = file.get_as_text().strip_edges()
            if token != "":
                credential_source_path = token_file
    if token == "" and env_token != "":
        token = env_token
    if auto_connect and not Engine.is_editor_hint():
        connect_to_bridge()


func connect_to_bridge() -> void:
    var endpoint := RegEx.new()
    endpoint.compile("^ws://(127\\.0\\.0\\.1|localhost|\\[::1\\]):[0-9]{1,5}/godot$")
    if endpoint.search(url) == null or token.length() < 16:
        log_message.emit("Lokale Bridge-URL und gültiges Credential erforderlich.")
        return
    want_connection = true
    auth_failed = false
    _backoff = RECONNECT_MIN
    _retry_left = 0.0
    if _ws == null:
        _open()


func disconnect_from_bridge() -> void:
    want_connection = false
    _clear_projection()
    if _ws != null:
        _ws.close(1000, "client_disconnect")


func _clear_projection() -> void:
    entities.clear()
    regions.clear()
    has_snapshot = false
    _last_observation_ms = -1
    identity.clear()
    edit_enabled = false
    _awaiting_snapshot = true
    snapshot_received.emit()


func _exit_tree() -> void:
    want_connection = false
    if _ws != null:
        _ws.close(1000, "client_shutdown")


func request_resync() -> void:
    _clear_projection()
    _send({"t": "resync"})


# ───────────────────────── Commands (Intents an den Server) ─────────────────────────

func send_edit(cmd: Dictionary) -> String:
    if not is_authed or not has_snapshot or not upstream_up or not edit_enabled:
        return ""
    _cmd_counter += 1
    var id := "g%d-%d" % [Time.get_ticks_msec(), _cmd_counter]
    _send({"t": "edit", "cmdId": id, "cmd": cmd})
    return id


func vec3_to_dict(v: Vector3) -> Dictionary:
    return {"x": v.x, "y": v.y, "z": v.z}


func cmd_move(id: String, pos: Vector3, rot: float = NAN) -> String:
    var cmd := {"op": "entity.move", "id": id, "pos": vec3_to_dict(pos)}
    if not is_nan(rot):
        cmd["rot"] = rot
    return send_edit(cmd)


func cmd_spawn(kind: String, def_id: String, pos: Vector3, props: Dictionary = {}) -> String:
    var cmd := {"op": "entity.spawn", "kind": kind, "pos": vec3_to_dict(pos)}
    if def_id != "":
        cmd["defId"] = def_id
    if not props.is_empty():
        cmd["props"] = props
    return send_edit(cmd)


func cmd_remove(id: String) -> String:
    return send_edit({"op": "entity.remove", "id": id})


func cmd_set(id: String, key: String, value: Variant) -> String:
    return send_edit({"op": "entity.set", "id": id, "key": key, "value": value})


func cmd_quest_attach(strand_key: String, anchor_id: String) -> String:
    return send_edit({"op": "quest.attach", "strandKey": strand_key, "anchorId": anchor_id})


# ───────────────────────── Verbindung ─────────────────────────

func _open() -> void:
    _ws = WebSocketPeer.new()
    _ws.inbound_buffer_size = INBOUND_BUFFER
    _ws.max_queued_packets = 8192
    var err := _ws.connect_to_url(url)
    if err != OK:
        _ws = null
        _schedule_retry("connect_to_url Fehler %d" % err)


func _schedule_retry(reason: String) -> void:
    _retry_left = _backoff
    _backoff = minf(_backoff * 2.0, RECONNECT_MAX)
    log_message.emit("Neuer Verbindungsversuch in %.0f s (%s)" % [_retry_left, reason])


func _process(delta: float) -> void:
    if has_snapshot and _last_observation_ms >= 0 and Time.get_ticks_msec() - _last_observation_ms > 1500:
        request_resync()
    if _ws == null:
        if want_connection and not auth_failed:
            _retry_left -= delta
            if _retry_left <= 0.0:
                _open()
        return

    _ws.poll()
    match _ws.get_ready_state():
        WebSocketPeer.STATE_OPEN:
            if not _was_open:
                _was_open = true
                _awaiting_snapshot = true
                _send({"t": "auth", "token": token})
            while _ws.get_available_packet_count() > 0:
                _on_packet(_ws.get_packet())
        WebSocketPeer.STATE_CLOSED:
            var code := _ws.get_close_code()
            var reason := _ws.get_close_reason()
            _ws = null
            _was_open = false
            is_authed = false
            upstream_up = false
            _clear_projection()
            if code == 4003:
                auth_failed = true
                reason = "Token abgelehnt"
            disconnected.emit(reason if reason != "" else "Verbindung beendet (Code %d)" % code)
            if want_connection and not auth_failed:
                _schedule_retry(reason if reason != "" else "Code %d" % code)


func _send(d: Dictionary) -> void:
    if _ws != null and _ws.get_ready_state() == WebSocketPeer.STATE_OPEN:
        _ws.send_text(JSON.stringify(d))


func _on_packet(pkt: PackedByteArray) -> void:
    var parsed: Variant = JSON.parse_string(pkt.get_string_from_utf8())
    if typeof(parsed) != TYPE_DICTIONARY:
        return
    _handle(parsed)


static func _valid_counter(value: Variant) -> bool:
    return typeof(value) in [TYPE_INT, TYPE_FLOAT] and is_finite(float(value)) and float(value) >= 0.0 and float(value) <= 9007199254740991.0 and float(value) == floorf(float(value))


static func _valid_entity(value: Variant) -> bool:
    if typeof(value) != TYPE_DICTIONARY or typeof(value.get("id")) != TYPE_STRING or typeof(value.get("kind")) != TYPE_STRING or typeof(value.get("pos")) != TYPE_DICTIONARY:
        return false
    var pattern := RegEx.new()
    pattern.compile("^[A-Za-z0-9_.:\\-]{1,64}$")
    if pattern.search(value.id) == null or value.kind.is_empty() or value.kind.length() > 32:
        return false
    for axis in ["x", "y", "z"]:
        var coordinate: Variant = value.pos.get(axis)
        if typeof(coordinate) not in [TYPE_INT, TYPE_FLOAT] or not is_finite(float(coordinate)) or absf(float(coordinate)) > 1000000.0:
            return false
    return true


func _invalid_frame() -> void:
    is_authed = false
    upstream_up = false
    _clear_projection()
    if _ws != null:
        _ws.close(1002, "invalid_server_frame")


func _valid_identity(msg: Dictionary, full_snapshot: bool) -> bool:
    var p: Variant = msg.get("identity")
    if typeof(p) != TYPE_DICTIONARY or p.get("schema") != "aurion.godot.committed-projection.v1" or p.get("worldId") != world_id or p.get("coordinates") != "aurion.fixed-xz-flat.v1" or p.get("fixedPointScale") != 1000:
        return false
    if not _valid_counter(p.get("tick")) or p.tick != msg.get("tick") or p.tick < 1:
        return false
    var revision := RegEx.new()
    revision.compile("^[a-f0-9]{40}$")
    if typeof(p.get("sourceRevision")) != TYPE_STRING or revision.search(p.sourceRevision) == null:
        return false
    var hash_pattern := RegEx.new()
    hash_pattern.compile("^sha256:[a-f0-9]{64}$")
    for field in ["receiptHash", "stateHash", "projectionHash"]:
        if typeof(p.get(field)) != TYPE_STRING or hash_pattern.search(p[field]) == null:
            return false
    if typeof(p.get("streamInstance")) != TYPE_STRING or p.streamInstance.length() != 36:
        return false
    if not _last_confirmed_identity.is_empty() and _last_confirmed_identity.streamInstance != p.streamInstance and not full_snapshot:
        return false
    if not _last_confirmed_identity.is_empty() and (p.worldId != _last_confirmed_identity.worldId or p.get("zoneId") != _last_confirmed_identity.get("zoneId") or p.tick < _last_confirmed_identity.tick):
        return false
    if not _last_confirmed_identity.is_empty() and p.tick == _last_confirmed_identity.tick:
        for field in ["receiptHash", "stateHash", "projectionHash"]:
            if p[field] != _last_confirmed_identity[field]:
                return false
    return true


static func _projection_value(value: Variant) -> Array:
    match typeof(value):
        TYPE_NIL:
            return ["null"]
        TYPE_BOOL:
            return ["bool", value]
        TYPE_STRING:
            return ["string", value]
        TYPE_INT, TYPE_FLOAT:
            var bytes := StreamPeerBuffer.new()
            bytes.big_endian = true
            bytes.put_double(0.0 if float(value) == 0.0 else float(value))
            return ["f64", bytes.data_array.hex_encode()]
        TYPE_ARRAY:
            var items: Array = []
            for item in value:
                items.append(_projection_value(item))
            return ["array", items]
        TYPE_DICTIONARY:
            var keys: Array = value.keys()
            keys.sort()
            var items: Array = []
            for key in keys:
                items.append([key, _projection_value(value[key])])
            return ["object", items]
    return ["invalid"]


static func projection_hash(frame_tick: int, values: Dictionary, world_regions: Array) -> String:
    var ids: Array = values.keys()
    ids.sort()
    var ordered: Array = []
    for id in ids:
        ordered.append(values[id])
    var encoded := _projection_value({"tick":frame_tick, "entities":ordered, "regions":world_regions})
    return "sha256:" + JSON.stringify(encoded, "", false).sha256_text()


func _handle(msg: Dictionary) -> void:
    match str(msg.get("t", "")):
        "hello":
            if is_authed:
                _invalid_frame()
                return
            if int(msg.get("proto", 0)) != PROTO:
                log_message.emit("Protokoll-Version passt nicht (erwartet %d)" % PROTO)
                want_connection = false
                if _ws != null:
                    _ws.close(1002, "proto_mismatch")
                return
            is_authed = true
            _backoff = RECONNECT_MIN
            world_id = str(msg.get("worldId", ""))
            _offered_edit = msg.get("edit") == true
            edit_enabled = false
            upstream_up = str(msg.get("upstream", "down")) == "up"
            connected.emit()
        "snapshot":
            if not is_authed or not upstream_up or typeof(msg.get("entities")) != TYPE_ARRAY or typeof(msg.get("regions")) != TYPE_ARRAY:
                return
            if not _valid_counter(msg.get("tick")) or not _valid_counter(msg.get("seq")) or msg.entities.size() > MAX_ENTITIES:
                _invalid_frame()
                return
            if not _valid_identity(msg, true):
                _invalid_frame()
                return
            var next := {}
            for e in msg.entities:
                if not _valid_entity(e) or next.has(e.id):
                    _invalid_frame()
                    return
                next[e.id] = e.duplicate(true)
            if projection_hash(int(msg.tick), next, msg.regions) != msg.identity.projectionHash:
                _invalid_frame()
                return
            entities = next
            identity = msg.identity.duplicate(true)
            _last_confirmed_identity = identity.duplicate(true)
            regions = msg.get("regions", [])
            tick = int(msg.get("tick", 0))
            seq = int(msg.get("seq", 0))
            _awaiting_snapshot = false
            has_snapshot = true
            _last_observation_ms = Time.get_ticks_msec()
            edit_enabled = _offered_edit
            snapshot_received.emit()
        "delta":
            if _awaiting_snapshot:
                return
            if not _valid_counter(msg.get("tick")) or not _valid_counter(msg.get("seq")) or int(msg.tick) < tick or typeof(msg.get("upsert")) != TYPE_ARRAY or typeof(msg.get("remove")) != TYPE_ARRAY:
                _invalid_frame()
                return
            if not _valid_identity(msg, false):
                _invalid_frame()
                return
            for e in msg.upsert:
                if not _valid_entity(e):
                    _invalid_frame()
                    return
            for removed in msg.remove:
                if typeof(removed) != TYPE_STRING:
                    _invalid_frame()
                    return
            var s := int(msg.seq)
            if s != seq + 1:
                # Lücke in der Sequenz -> sauber neu synchronisieren
                request_resync()
                return
            var total := entities.duplicate()
            for e in msg.upsert:
                total[e.id] = e
            for removed in msg.remove:
                total.erase(removed)
            if total.size() > MAX_ENTITIES:
                _invalid_frame()
                return
            if projection_hash(int(msg.tick), total, regions) != msg.identity.projectionHash:
                _invalid_frame()
                return
            seq = s
            _last_observation_ms = Time.get_ticks_msec()
            identity = msg.identity.duplicate(true)
            _last_confirmed_identity = identity.duplicate(true)
            tick = int(msg.get("tick", tick))
            for e in msg.get("upsert", []):
                if typeof(e) == TYPE_DICTIONARY and e.has("id"):
                    entities[str(e["id"])] = e
                    entity_upserted.emit(e)
            for rid in msg.get("remove", []):
                entities.erase(str(rid))
                entity_removed.emit(str(rid))
        "status":
            if typeof(msg.get("edit")) == TYPE_BOOL:
                _offered_edit = msg.edit
            upstream_up = str(msg.get("upstream", "down")) == "up"
            if not upstream_up:
                _clear_projection()
            status_changed.emit(upstream_up)
        "ack":
            ack_received.emit(str(msg.get("cmdId", "")), bool(msg.get("ok", false)), str(msg.get("error", "")), int(msg.get("tick", 0)))

