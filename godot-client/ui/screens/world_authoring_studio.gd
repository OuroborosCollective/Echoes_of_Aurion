extends Control
## Owner-facing drafts are proposals. Only an Aurion-confirmed receipt and a
## later independent GET may certify an apply.
const AuthoringApi = preload("res://net/api/world_authoring_api.gd")
const AuthoringState = preload("res://authoring/world_authoring_state.gd")
const AuthoringJournal = preload("res://authoring/world_authoring_journal.gd")
const WorldProjection = preload("res://world/world_design_projection.gd")
signal confirmed_world(readback: Dictionary, connection_id: String, generation: int)
signal closed

var _auth: Node
var _api: Node
var _state := AuthoringState.new()
var _journal := AuthoringJournal.new()
var _server := ""
var _connection := ""
var _generation := -1
var _allow_local := false
var _brief: TextEdit
var _draft: TextEdit
var _info: Label
var _catalog_info: Label
var _confirm: ConfirmationDialog
var _plan_view: TextEdit

func _ready() -> void:
	visible = false
	mouse_filter = Control.MOUSE_FILTER_STOP
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var backdrop := ColorRect.new()
	backdrop.color = Color(0.025, 0.035, 0.04, 0.97)
	backdrop.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(backdrop)
	var margin := MarginContainer.new()
	margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	for edge in ["margin_left", "margin_top", "margin_right", "margin_bottom"]:
		margin.add_theme_constant_override(edge, 16)
	add_child(margin)
	var scroll := ScrollContainer.new()
	margin.add_child(scroll)
	var stack := VBoxContainer.new()
	stack.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	stack.add_theme_constant_override("separation", 8)
	scroll.add_child(stack)
	var heading := Label.new()
	heading.text = "Aurion Weltstudio · Admin"
	heading.add_theme_font_size_override("font_size", 22)
	stack.add_child(heading)
	_catalog_info = Label.new()
	_catalog_info.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_catalog_info.text = "Admin-Zugang und Katalog noch nicht geprüft."
	stack.add_child(_catalog_info)
	_brief = TextEdit.new()
	_brief.placeholder_text = "Idee für einen unverbindlichen KI-Entwurf"
	_brief.custom_minimum_size.y = 90
	stack.add_child(_brief)
	_button(stack, "KI-Entwurf anfordern", _propose)
	_draft = TextEdit.new()
	_draft.placeholder_text = "Aurion-Weltentwurf als JSON prüfen und bearbeiten"
	_draft.custom_minimum_size.y = 210
	_draft.text_changed.connect(_on_draft_changed)
	stack.add_child(_draft)
	_button(stack, "Entwurf bei Aurion prüfen", _plan)
	_button(stack, "Geprüften Plan ansehen", _request_confirmation)
	_button(stack, "Offenes Receipt bei Aurion suchen", _recover_receipt)
	_button(stack, "Weltstand erneut lesen", _readback)
	_info = Label.new()
	_info.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	stack.add_child(_info)
	_button(stack, "Zurück zum Spiel", _close_requested)
	_confirm = ConfirmationDialog.new()
	_confirm.title = "Weltänderung bei Aurion anwenden?"
	_confirm.ok_button_text = "Diesen Plan anwenden"
	_confirm.confirmed.connect(_apply)
	_plan_view = TextEdit.new()
	_plan_view.editable = false
	_plan_view.wrap_mode = TextEdit.LINE_WRAPPING_BOUNDARY
	_plan_view.custom_minimum_size = Vector2(240, 200)
	_plan_view.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_confirm.add_child(_plan_view)
	add_child(_confirm)

func _button(parent: VBoxContainer, title: String, action: Callable) -> void:
	var button := Button.new()
	button.text = title
	button.custom_minimum_size.y = 48
	button.pressed.connect(action)
	parent.add_child(button)

func configure(auth: Node, server: String, connection: String, allow_local: bool = false) -> void:
	close_session()
	_auth = auth
	_server = server
	_connection = connection
	_allow_local = allow_local
	_generation = auth.session_generation()
	if auth.has_signal("refresh_succeeded") and not auth.refresh_succeeded.is_connected(_on_refresh_succeeded):
		auth.refresh_succeeded.connect(_on_refresh_succeeded)
	_api = AuthoringApi.new(auth)
	add_child(_api)
	_api.completed.connect(_completed)
	_api.failed.connect(_failed)

func open_studio() -> bool:
	if not _session_valid() or _api == null or _api.busy():
		return false
	visible = true
	if _state.session_matches(_connection, _generation):
		_info.text = _state.message
		return true
	_info.text = "Admin-Sitzung wird bei Aurion geprüft."
	_send("identity")
	return true

func close_session() -> void:
	var was_visible := visible
	visible = false
	if is_instance_valid(_confirm):
		_confirm.hide()
	if is_instance_valid(_api):
		_api.cancel()
		_api.queue_free()
	if is_instance_valid(_auth) and _auth.has_signal("refresh_succeeded") and _auth.refresh_succeeded.is_connected(_on_refresh_succeeded):
		_auth.refresh_succeeded.disconnect(_on_refresh_succeeded)
	_api = null
	_state.close()
	_connection = ""
	_server = ""
	_generation = -1
	if is_instance_valid(_draft):
		_draft.text = ""
	if is_instance_valid(_brief):
		_brief.text = ""
	if was_visible:
		closed.emit()

func _session_valid() -> bool:
	return _auth != null and not _connection.is_empty() and _generation >= 0 and _auth.protected_response_allowed() and _auth.session_generation() == _generation

func _ensure_access() -> bool:
	if not _session_valid():
		return false
	if not _auth.access_token().is_empty():
		return true
	if not _auth.refresh_in_flight():
		_auth.refresh()
	_info.text = "Sitzung wird erneuert. Danach bitte die Aktion erneut auswählen."
	return false

func _on_refresh_succeeded() -> void:
	if not visible or not _session_valid() or _api == null or _api.busy():
		return
	if _state.phase == "closed":
		_send("identity")
	else:
		_info.text = "Sitzung erneuert. Bitte die gewünschte Aktion erneut auswählen."

func _send(kind: String, payload: Dictionary = {}) -> bool:
	if not _ensure_access() or _api == null or _api.busy():
		return false
	return _api.request(kind, _server, _connection, payload, _allow_local)

func _on_draft_changed() -> void:
	_state.draft_changed()
	if is_instance_valid(_confirm):
		_confirm.hide()

func _current_draft() -> Variant:
	return JSON.parse_string(_draft.text)

func _propose() -> void:
	var brief := _brief.text.strip_edges()
	if _state.phase == "closed" or brief.length() < 12 or brief.length() > 4000:
		_info.text = "Admin-Zugang und ein Text mit 12 bis 4000 Zeichen sind erforderlich."
		return
	if _send("propose", {"kind":"world", "request":brief}):
		_info.text = "Unverbindlicher Entwurf wird angefordert."

func _plan() -> void:
	# A journal entry for this session's in-flight apply is not an unknown
	# earlier operation. Repeated taps must not discard the receipt state.
	if _state.phase in ["planning", "applying", "awaiting_readback"] or (_api != null and _api.busy()):
		_info.text = "Bitte zuerst das Ergebnis der laufenden Anfrage prüfen."
		return
	if not _journal.read().is_empty():
		_state.mark_unresolved()
		_info.text = _state.message
		return
	var draft: Variant = _current_draft()
	var operation_id := Crypto.new().generate_random_bytes(16).hex_encode()
	if not _state.begin_plan(draft, operation_id):
		_info.text = "Entwurf unvollständig oder Ergebnis einer früheren Änderung noch unklar."
		return
	if not _send("worldPlan", {"draft":draft, "operationId":operation_id}):
		_state.failed("worldPlan")
	_info.text = _state.message

func _request_confirmation() -> void:
	var plan: Dictionary = _state.planned_summary()
	var draft: Variant = _current_draft()
	if plan.is_empty() or typeof(draft) != TYPE_DICTIONARY or JSON.stringify(draft) != JSON.stringify(plan.draft) or _api.busy():
		_info.text = "Bitte den aktuellen Entwurf zuerst prüfen."
		return
	_plan_view.text = JSON.stringify(plan.plan, "\t")
	_confirm.dialog_text = "%s · Version %d · %d Platzierungen\nPlan-SHA256: %s" % [plan.draft.designKey, int(plan.draft.version), plan.draft.placements.size(), plan.planHash]
	_confirm.popup_centered_ratio(0.9)

func _apply() -> void:
	# Refresh before consuming confirmation; never retry a sent apply.
	if not _ensure_access():
		return
	var plan: Dictionary = _state.planned_summary()
	if plan.is_empty():
		_info.text = "Der Plan ist nicht mehr gültig."
		return
	if not _journal.read().is_empty():
		_state.mark_unresolved()
		_info.text = _state.message
		return
	var reserved_actor: int = _state.actor_id
	var operation_id: String = plan.plan.operationId
	if not _journal.reserve(plan.draft, reserved_actor, plan.planHash, operation_id):
		_info.text = "Die Änderung konnte nicht sicher vorgemerkt werden; es wurde nichts gesendet."
		if not _journal.read().is_empty():
			_info.text += " Die lokale Vormerkung muss geklärt werden."
		return
	var payload: Dictionary = _state.begin_apply(_current_draft())
	if payload.is_empty():
		_journal.release_unsubmitted(plan.draft, reserved_actor, plan.planHash, operation_id)
		_info.text = "Der Plan ist nicht mehr gültig; es wurde nichts gesendet."
		return
	if not _send("worldApply", payload):
		# request() returns false only when this HTTP request never started.
		if _journal.release_unsubmitted(plan.draft, reserved_actor, plan.planHash, operation_id):
			_state.not_submitted()
		else:
			_state.mark_unresolved()
	_info.text = _state.message

func _readback() -> void:
	if not _send("readback"):
		_info.text = "Weltstand konnte nicht angefordert werden."

func _recover_receipt() -> void:
	var pending: Dictionary = _journal.read()
	if _state.phase != "unknown" or pending.is_empty() or pending.has("invalid") or int(pending.get("actorUserId", -1)) != _state.actor_id:
		_info.text = "Keine passende, lesbare Vormerkung für diesen Aurion-Account."
		return
	if _send("worldReceipt", {"designKey":pending.designKey, "version":pending.version, "planHash":pending.planHash, "operationId":pending.operationId}):
		_info.text = "Aurion sucht das Receipt; es wird kein Apply wiederholt."
	else:
		_info.text = "Receipt-Suche konnte nicht gestartet werden."

func _completed(kind: String, data: Dictionary, connection: String, generation: int) -> void:
	if not visible or not _session_valid() or connection != _connection or generation != _generation:
		return
	match kind:
		"identity":
			if data.get("role") != "admin" or not _state.open(connection, generation, data.get("id")):
				_info.text = "Für das Weltstudio ist eine bestätigte Aurion-Adminrolle erforderlich."
				return
			if not _journal.read().is_empty():
				_state.mark_unresolved()
				_info.text = _state.message
			_catalog_info.text = "Adminrolle bestätigt; Katalog wird geladen."
			_send("catalog")
		"catalog":
			if not WorldProjection._hex(data.get("glbCatalogRevision"), 64) or typeof(data.get("assets")) != TYPE_ARRAY:
				_catalog_info.text = "Katalogantwort ungültig."
				return
			var eligible: Array[String] = []
			for asset in data.assets:
				if typeof(asset) == TYPE_DICTIONARY and asset.get("assetType") == "arena" and asset.get("purpose") in ["world-environment", "world-nature"] and WorldProjection._id(asset.get("assetId"), true):
					eligible.append(asset.assetId)
			_catalog_info.text = "Katalog %s · %d mögliche Weltassets\n%s" % [data.glbCatalogRevision, eligible.size(), ", ".join(eligible.slice(0, 12))]
		"propose":
			var draft: Variant = JSON.parse_string(str(data.get("draftJson", "")))
			if data.get("kind") == "world" and data.get("requiresHumanReview") == true and typeof(draft) == TYPE_DICTIONARY:
				_draft.text = JSON.stringify(draft, "\t")
				_state.draft_changed()
				_info.text = "Unverbindlicher KI-Entwurf; bitte prüfen."
			else:
				_info.text = "Aurion lieferte keinen verwendbaren Entwurf."
		"worldPlan":
			if not _state.accept_plan(data, _current_draft()):
				_state.failed("worldPlan")
				_info.text = "Plan passt nicht mehr zum aktuellen Entwurf."
			else:
				_info.text = _state.message
		"worldApply":
			if not _state.accept_apply(data):
				_state.failed("worldApply")
				_info.text = _state.message
			elif not _send("readback"):
				_state.failed("readback")
				_info.text = _state.message
			else:
				_info.text = _state.message
		"worldReceipt":
			if data.get("status") == "unresolved":
				_info.text = "Kein Receipt gefunden; das Ergebnis bleibt ungeklärt."
			elif not _state.accept_recovered(_journal.read(), data):
				_info.text = "Receipt und Weltstand konnten nicht sicher zugeordnet werden."
			elif not _send("readback"):
				_state.failed("readback")
				_info.text = _state.message
			else:
				_info.text = _state.message
		"readback":
			if _state.phase == "awaiting_readback":
				if not _state.accept_readback(data):
					_info.text = "Receipt erhalten, aber der separate Weltstand ist ungültig oder unvollständig."
					return
				var applied: Dictionary = _state.applying_identity()
				if not _journal.clear_confirmed(applied.draft, _state.actor_id, applied.planHash, applied.plan.operationId):
					_state.mark_unresolved()
					_info.text = "Receipt und Weltstand stimmen; die lokale Vormerkung konnte nicht entfernt werden."
				else:
					_info.text = _state.message
			else:
				_info.text = "Weltstand gelesen; ein vorheriges unbekanntes Apply wird dadurch nicht bewiesen."
			if data.get("schemaVersion") == "aurion.world-design.v1" and WorldProjection._hex(data.get("revision"), 64) and typeof(data.get("designs")) == TYPE_ARRAY:
				confirmed_world.emit(data, connection, generation)

func _failed(kind: String, _reason: String, connection: String, generation: int) -> void:
	if not visible or not _session_valid() or connection != _connection or generation != _generation:
		return
	_state.failed(kind)
	_info.text = _state.message if not _state.message.is_empty() else "Aurion-Anfrage konnte nicht bestätigt werden."

func _close_requested() -> void:
	# A hidden response is deliberately ignored, so do not hide while any
	# request is active. Otherwise a planning response could strand the state.
	if _state.phase == "applying" or (_api != null and _api.busy()):
		_info.text = "Bitte auf das Ergebnis der laufenden Anfrage warten."
		return
	visible = false
	closed.emit()
