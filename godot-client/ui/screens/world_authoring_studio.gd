extends Control
## Owner-facing native draft/plan/explicit confirm/readback; only Aurion can apply.
const Api = preload("res://net/api/world_authoring_api.gd")
const ConfirmedWorldDesigns = preload("res://world/confirmed_world_designs.gd")
var _auth: Node
var _transport: Node
var _server := ""
var _connection := ""
var _plan_hash := ""
var _plan_draft: Dictionary = {}
var _plan_requested: Dictionary = {}
var _pending_apply: Dictionary = {}
var _draft: TextEdit
var _brief: TextEdit
var _info: Label
var _confirm: ConfirmationDialog
var _busy := false
var _confirmed_revision := ""
signal confirmed_world(readback: Dictionary)

func configure(auth: Node, server: String, connection: String, allow_local: bool = false) -> void:
	close_session()
	_auth = auth
	_server = server
	_connection = connection
	_transport = Api.new(auth)
	add_child(_transport)
	_transport.completed.connect(_on_completed)
	_transport.failed.connect(_on_failed)
	_transport.set_meta("allow_local", allow_local)

func _ready() -> void:
	visible = false
	mouse_filter = Control.MOUSE_FILTER_STOP
	set_anchors_preset(Control.PRESET_FULL_RECT)
	var panel := PanelContainer.new()
	panel.set_anchors_preset(Control.PRESET_FULL_RECT)
	add_child(panel)
	var scroll := ScrollContainer.new()
	panel.add_child(scroll)
	var stack := VBoxContainer.new()
	stack.add_theme_constant_override("separation", 9)
	scroll.add_child(stack)
	var heading := Label.new()
	heading.text = "Aurion · Mensch + KI Weltstudio (Admin)"
	stack.add_child(heading)
	_brief = TextEdit.new()
	_brief.placeholder_text = "Beschreibe eine Landschaft, ein Gebäude oder ein Dorf. Aurion bleibt die einzige Welt-Authority."
	_brief.custom_minimum_size = Vector2(400, 100)
	stack.add_child(_brief)
	_button(stack, "KI-Entwurf anfordern", _propose)
	_draft = TextEdit.new()
	_draft.placeholder_text = "Prüfbarer Aurion-WorldDesignDraft als JSON"
	_draft.custom_minimum_size = Vector2(400, 220)
	_draft.text_changed.connect(_invalidate_plan)
	stack.add_child(_draft)
	_button(stack, "Entwurf serverseitig prüfen", _plan)
	_button(stack, "Geprüften Plan bestätigen", _request_confirmation)
	_button(stack, "Weltstand aktualisieren", _readback)
	_info = Label.new()
	_info.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	stack.add_child(_info)
	_button(stack, "Zurück zum Spiel", func(): visible = false)
	_confirm = ConfirmationDialog.new()
	_confirm.title = "Aurion: verbindliche Weltänderung"
	_confirm.confirmed.connect(_apply)
	add_child(_confirm)

func _button(stack: VBoxContainer, label: String, callback: Callable) -> void:
	var b := Button.new()
	b.text = label
	b.custom_minimum_size.y = 48
	b.pressed.connect(callback)
	stack.add_child(b)

func open_studio() -> bool:
	if _transport == null or _auth == null or not _auth.protected_response_allowed() or _connection.is_empty():
		return false
	visible = true
	_catalog()
	return true

func close_session() -> void:
	_plan_hash = ""
	_plan_draft.clear()
	_plan_requested.clear()
	_pending_apply.clear()
	_confirmed_revision = ""
	_busy = false
	visible = false
	if is_instance_valid(_transport):
		_transport.cancel()
		_transport.queue_free()
	_transport = null
	_connection = ""
	_server = ""

func _invalidate_plan() -> void:
	_plan_hash = ""
	_plan_draft.clear()
	_plan_requested.clear()

func _send(kind: String, payload: Dictionary = {}) -> bool:
	if _busy or _transport == null or _connection.is_empty() or _auth == null or not _auth.protected_response_allowed():
		return false
	_busy = true
	var started: bool = _transport.request(kind, _server, _connection, payload, bool(_transport.get_meta("allow_local", false)))
	if not started:
		_busy = false
	return started

func _catalog() -> void:
	_send("catalog")

func _propose() -> void:
	var request := _brief.text.strip_edges()
	if request.length() < 12 or request.length() > 4000:
		_info.text = "KI-Brief muss 12 bis 4000 Zeichen enthalten."
		return
	_send("propose", {"kind": "world", "request": request})

func _plan() -> void:
	var data: Variant = JSON.parse_string(_draft.text)
	if typeof(data) != TYPE_DICTIONARY:
		_info.text = "Entwurf ist kein gültiges JSON-Objekt."
		return
	_invalidate_plan()
	if _send("worldPlan", data):
		_plan_requested = data.duplicate(true)

static func _valid_plan_reply(data: Dictionary, draft: Dictionary) -> bool:
	if draft.is_empty() or not Api.valid_plan_hash(data.get("planHash")) or data.get("requiresHumanConfirmation") != true:
		return false
	for key in ["schemaVersion", "designKey", "version", "title", "expectedCatalogRevision", "placements"]:
		if not draft.has(key) or data.get(key) != draft[key]:
			return false
	var hashes: Variant = data.get("referencedAssetHashes")
	if typeof(hashes) != TYPE_ARRAY or hashes.is_empty() or hashes.size() > 256:
		return false
	for digest in hashes:
		if not Api.valid_plan_hash(digest):
			return false
	return true

static func _valid_apply_receipt(data: Dictionary, expected: Dictionary) -> Dictionary:
	var receipt: Variant = data.get("receipt")
	var world: Variant = data.get("readback")
	if expected.is_empty() or typeof(receipt) != TYPE_DICTIONARY or not ConfirmedWorldDesigns.validate_readback(world):
		return {}
	var fields := ["schemaVersion", "receiptId", "kind", "action", "targetId", "actorUserId", "planHash", "previousHash", "resultHash", "receiptHash", "humanConfirmed"]
	if receipt.size() != fields.size():
		return {}
	for field in fields:
		if not receipt.has(field):
			return {}
	if receipt.schemaVersion != "aurion.authoring-receipt.v1" or receipt.kind != "world" or receipt.action != "apply" or receipt.humanConfirmed != true:
		return {}
	var actor: Variant = receipt.actorUserId
	if typeof(receipt.receiptId) != TYPE_STRING or receipt.receiptId.length() < 8 or receipt.receiptId.length() > 128:
		return {}
	# Godot JSON parses numbers as floats; only exact positive integer IDs are valid.
	if typeof(actor) not in [TYPE_INT, TYPE_FLOAT] or not is_finite(float(actor)) or float(actor) != floor(float(actor)) or actor <= 0 or actor > 9007199254740991:
		return {}
	var version: Variant = expected.get("version", -1)
	if typeof(version) not in [TYPE_INT, TYPE_FLOAT] or not is_finite(float(version)) or float(version) != floor(float(version)) or version < 1 or version > 1000000:
		return {}
	if receipt.planHash != expected.get("plan") or receipt.targetId != expected.get("key", "") + ":v" + str(int(version)):
		return {}
	if not Api.valid_plan_hash(receipt.resultHash) or not Api.valid_plan_hash(receipt.receiptHash):
		return {}
	if receipt.previousHash != null and not Api.valid_plan_hash(receipt.previousHash):
		return {}
	for design in world.designs:
		if design.designKey == expected.get("key") and design.version == expected.get("version") and design.designHash == receipt.resultHash:
			return {"revision": world.revision, "key": design.designKey, "version": design.version, "design_hash": design.designHash}
	return {}

static func _confirmed_apply_readback(data: Dictionary, expected: Dictionary) -> bool:
	if expected.is_empty() or not ConfirmedWorldDesigns.validate_readback(data) or data.revision != expected.get("revision"):
		return false
	for design in data.designs:
		if design.designKey == expected.get("key") and design.version == expected.get("version") and design.designHash == expected.get("design_hash"):
			return true
	return false

func _request_confirmation() -> void:
	if not Api.valid_plan_hash(_plan_hash) or _plan_draft.is_empty() or _busy or not _pending_apply.is_empty():
		return
	var current: Variant = JSON.parse_string(_draft.text)
	if typeof(current) != TYPE_DICTIONARY or JSON.stringify(current) != JSON.stringify(_plan_draft):
		_invalidate_plan()
		return
	_confirm.dialog_text = "Weltänderung dauerhaft bei Aurion anwenden?\nPlan-SHA256: " + _plan_hash + "\nKein automatischer Retry."
	_confirm.popup_centered()

func _apply() -> void:
	if not Api.valid_plan_hash(_plan_hash) or _plan_draft.is_empty() or _busy or not _pending_apply.is_empty():
		return
	var current: Variant = JSON.parse_string(_draft.text)
	if typeof(current) != TYPE_DICTIONARY or current != _plan_draft:
		_invalidate_plan()
		return
	var expected := {"plan": _plan_hash, "key": str(_plan_draft.get("designKey", "")), "version": _plan_draft.get("version", -1)}
	var sent := _send("worldApply", {"draft": _plan_draft, "expectedPlanHash": _plan_hash, "confirmation": "APPLY_WORLD_DESIGN"})
	if sent:
		_pending_apply = expected
	# Single-use confirmation even on timeout. A second attempt requires a fresh plan.
	_plan_hash = ""
	_plan_draft.clear()
	if sent:
		_info.text = "Aurion-Apply angefordert. Unabhängigen Readback abwarten."

func _readback() -> void:
	_send("readback")

func _on_completed(kind: String, data: Dictionary) -> void:
	_busy = false
	match kind:
		"catalog":
			if data.get("glbCatalogRevision") is String:
				_info.text = "Admin-Katalog geprüft. Revision: " + data.glbCatalogRevision
				# Show existing confirmed world data without performing any mutation.
				_readback()
			else:
				_info.text = "Admin-Katalog nicht zugelassen."
		"propose":
			var draft: Variant = JSON.parse_string(str(data.get("draftJson", "")))
			if typeof(draft) == TYPE_DICTIONARY:
				_draft.text = JSON.stringify(draft, "\t")
				_invalidate_plan()
				_info.text = "KI-Entwurf ist noch unverbindlich."
			else:
				_info.text = "KI-Entwurf nicht verwendbar."
		"worldPlan":
			var draft: Variant = JSON.parse_string(_draft.text)
			if typeof(draft) == TYPE_DICTIONARY and draft == _plan_requested and _valid_plan_reply(data, _plan_requested):
				_plan_hash = data.planHash
				_plan_draft = _plan_requested.duplicate(true)
				_info.text = "Plan serverseitig geprüft: " + _plan_hash
			else:
				_invalidate_plan()
				_info.text = "Planantwort weicht vom beantragten Entwurf ab."
			_plan_requested.clear()
		"worldApply":
			var matched := _valid_apply_receipt(data, _pending_apply)
			if not matched.is_empty():
				_pending_apply = matched
				_confirmed_revision = str(matched.revision)
				_info.text = "Apply-Receipt passt zum Plan. Prüfe Weltstand unabhängig."
				_readback()
			else:
				_pending_apply.clear()
				_confirmed_revision = ""
				_info.text = "Apply-Ausgang ungeklärt; kein automatischer Retry."
		"readback":
			if ConfirmedWorldDesigns.validate_readback(data):
				if _confirmed_revision.is_empty():
					_info.text = "Vorhandener Aurion-Weltstand gelesen: " + data.revision
					emit_signal("confirmed_world", data)
				elif _confirmed_apply_readback(data, _pending_apply):
					_info.text = "Aurion-Apply unabhängig bestätigt: " + data.revision
					_pending_apply.clear()
					_confirmed_revision = ""
					emit_signal("confirmed_world", data)
				else:
					_info.text = "Apply-Revision nicht bestätigt; Welt bleibt unverändert."
			else:
				_info.text = "Kein gültiger kanonischer Weltstand."

func _on_failed(_kind: String, reason: String) -> void:
	_busy = false
	_plan_hash = ""
	_plan_draft.clear()
	_info.text = "Aurion lehnt diese Aktion ab: " + reason
