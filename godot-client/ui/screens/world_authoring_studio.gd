extends Control
## Owner-facing drafts are proposals. Only an Aurion-confirmed receipt and a
## later independent GET may certify an apply.
const AuthoringApi = preload("res://net/api/world_authoring_api.gd")
const AuthoringState = preload("res://authoring/world_authoring_state.gd")
const AuthoringJournal = preload("res://authoring/world_authoring_journal.gd")
const WorldProjection = preload("res://world/world_design_projection.gd")
const QuestEditor = preload("res://ui/screens/quest_authoring_editor.gd")
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
var _inspection: Dictionary = {}
var _inspection_panel: VBoxContainer
var _inspection_filter: LineEdit
var _inspection_status: Label
var _inspection_list: ItemList
var _inspection_properties: TextEdit
var _inspection_rows: Array = []
var _catalog_revision := ""
var _catalog_assets: Dictionary = {}
var _asset_choice: OptionButton
var _placement_key: LineEdit
var _placement_fields: Dictionary = {}
var _draft_import: TextEdit
var _new_design_key: LineEdit
var _new_design_title: LineEdit
var _new_design_version: SpinBox
var _quest_editor: VBoxContainer

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
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
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
	_button(stack, "Bestätigte Entitäten und Diagnose", _toggle_inspector)
	_build_inspector(stack)
	_quest_editor = QuestEditor.new()
	_quest_editor.name = "QuestStudio"
	_quest_editor.visible = false
	_button(stack, "Questvorlagen und Graphentwürfe", func(): _quest_editor.visible = not _quest_editor.visible)
	stack.add_child(_quest_editor)
	_brief = TextEdit.new()
	_brief.placeholder_text = "Idee für KI-Entwurf"
	_brief.wrap_mode = TextEdit.LINE_WRAPPING_BOUNDARY
	_brief.custom_minimum_size.y = 90
	stack.add_child(_brief)
	_button(stack, "KI-Entwurf anfordern", _propose)
	_draft = TextEdit.new()
	_draft.placeholder_text = "Aurion-Weltentwurf als JSON prüfen und bearbeiten"
	_draft.wrap_mode = TextEdit.LINE_WRAPPING_BOUNDARY
	_draft.custom_minimum_size.y = 210
	_draft.text_changed.connect(_on_draft_changed)
	stack.add_child(_draft)
	_build_catalog_tools(stack)
	_button(stack, "Entwurf bei Aurion prüfen", _plan)
	_button(stack, "Geprüften Plan ansehen", _request_confirmation)
	_button(stack, "Offenes Receipt bei Aurion suchen", _recover_receipt)
	_button(stack, "Weltstand erneut lesen", _readback)
	_info = Label.new()
	_info.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	stack.add_child(_info)
	_button(stack, "Zurück zum Spiel", _close_requested)
	_confirm = ConfirmationDialog.new()
	_confirm.title = "Plan für Aurion prüfen"
	_confirm.ok_button_text = "Anwenden"
	_confirm.confirmed.connect(_apply)
	_plan_view = TextEdit.new()
	_plan_view.editable = false
	_plan_view.wrap_mode = TextEdit.LINE_WRAPPING_BOUNDARY
	_plan_view.custom_minimum_size = Vector2(200, 200)
	_plan_view.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_confirm.add_child(_plan_view)
	add_child(_confirm)
	_touch_dialog_button(_confirm.get_ok_button())
	_touch_dialog_button(_confirm.get_cancel_button())

func _touch_dialog_button(button: Button) -> void:
	# AcceptDialog resets custom_minimum_size when opened. Theme margins survive
	# that reset and keep both controls comfortably touch-sized.
	var style := button.get_theme_stylebox("normal").duplicate() as StyleBox
	style.set_content_margin(SIDE_TOP, 16)
	style.set_content_margin(SIDE_BOTTOM, 16)
	button.add_theme_stylebox_override("normal", style)

func _button(parent: VBoxContainer, title: String, action: Callable) -> void:
	var button := Button.new()
	button.text = title
	button.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	button.clip_text = true
	button.custom_minimum_size.y = 48
	button.pressed.connect(action)
	parent.add_child(button)

func _build_inspector(parent: VBoxContainer) -> void:
	_inspection_panel = VBoxContainer.new()
	_inspection_panel.visible = false
	parent.add_child(_inspection_panel)
	_inspection_status = Label.new()
	_inspection_status.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_inspection_panel.add_child(_inspection_status)
	_inspection_filter = LineEdit.new()
	_inspection_filter.placeholder_text = "Entitäten filtern: Kategorie oder ID"
	_inspection_filter.text_changed.connect(func(_text: String): _render_inspector())
	_inspection_panel.add_child(_inspection_filter)
	_inspection_list = ItemList.new()
	_inspection_list.custom_minimum_size.y = 140
	_inspection_list.item_selected.connect(_inspect_selected)
	_inspection_panel.add_child(_inspection_list)
	_inspection_properties = TextEdit.new()
	_inspection_properties.editable = false
	_inspection_properties.custom_minimum_size.y = 120
	_inspection_properties.wrap_mode = TextEdit.LINE_WRAPPING_BOUNDARY
	_inspection_panel.add_child(_inspection_properties)
	_button(_inspection_panel, "Bestätigte Projektion als JSON kopieren", _copy_inspection)

func _toggle_inspector() -> void:
	_inspection_panel.visible = not _inspection_panel.visible
	_render_inspector()

## This is the existing validated zone projection, not a second world model.
## Zone-v5 does not carry canonical receipt/state hashes: never synthesize them.
func set_inspection_context(world: Variant, registry: Variant, stale: bool) -> void:
	if not _session_valid() or world == null or registry == null or not world.has_state() or world.connection_id() != _connection:
		_inspection.clear()
		_render_inspector()
		return
	if _inspection.get("snapshotSeq") == world.last_seq() and _inspection.get("connectionId") == _connection and _inspection.get("stale") == stale:
		return
	var rows: Array = []
	var count := 0
	for category in ["presences", "mobs", "combatants", "resources"]:
		for id in registry.ids(category):
			count += 1
			if rows.size() < 500:
				rows.append({"category":category, "entityId":id, "properties":registry.record(category, id)})
	_inspection = {"schemaVersion":"aurion.inspection.v1", "protocolVersion":5,
		"connectionId":_connection, "zoneId":world.current_state().get("zoneId"),
		"tick":world.last_tick(), "snapshotSeq":world.last_seq(), "stale":stale,
		"causalProof":"UNVERIFIED", "sourceRevision":null, "receiptHash":null,
		"stateHash":null, "projectionHash":null, "streamInstance":null,
		"totalEntities":count, "truncated":count > rows.size(), "entities":rows}
	_render_inspector()

func inspection_export() -> Dictionary:
	return _inspection.duplicate(true) if _session_valid() else {}

func inspection_entities(query: String = "") -> Array:
	var result: Array = []
	var needle := query.strip_edges().to_lower()
	for row in inspection_export().get("entities", []):
		if needle.is_empty() or (str(row.category) + " " + str(row.entityId)).to_lower().contains(needle):
			result.append(row.duplicate(true))
	return result

func _render_inspector() -> void:
	if not is_instance_valid(_inspection_list) or not _inspection_panel.is_visible_in_tree():
		return
	var selected := ""
	var indices := _inspection_list.get_selected_items()
	if not indices.is_empty() and indices[0] < _inspection_rows.size():
		selected = str(_inspection_rows[indices[0]].category) + ":" + str(_inspection_rows[indices[0]].entityId)
	_inspection_list.clear()
	_inspection_properties.text = ""
	_inspection_rows = inspection_entities(_inspection_filter.text)
	if _inspection.is_empty():
		_inspection_status.text = "Keine bestätigte Zonenprojektion für diese Sitzung."
		return
	_inspection_status.text = "Zone %s · Tick %d · Seq %d · %s\n%d Entitäten%s · nur lesend\nServerrevision / Receipt / State-Hash: im Zonenprotokoll nicht enthalten; Kausalbeweis offen." % [
		_inspection.zoneId, _inspection.tick, _inspection.snapshotSeq,
		"VERALTET" if _inspection.stale else "bestätigte Projektion", _inspection.totalEntities,
		" (Anzeige auf 500 begrenzt)" if _inspection.truncated else ""]
	for row in _inspection_rows:
		var index := _inspection_list.add_item(str(row.category) + " · " + str(row.entityId))
		if str(row.category) + ":" + str(row.entityId) == selected:
			_inspection_list.select(index)
			_inspect_selected(index)

func _inspect_selected(index: int) -> void:
	if index >= 0 and index < _inspection_rows.size():
		_inspection_properties.text = JSON.stringify(_inspection_rows[index].properties, "\t")

func _copy_inspection() -> void:
	var value := inspection_export()
	if not value.is_empty():
		DisplayServer.clipboard_set(JSON.stringify(value, "\t"))

func _build_catalog_tools(parent: VBoxContainer) -> void:
	var panel := VBoxContainer.new()
	panel.visible = false
	parent.add_child(panel)
	_button(parent, "Katalog-Platzierung und JSON-Import", func(): panel.visible = not panel.visible)
	var hint := Label.new()
	hint.text = "Platzierungen ergänzen nur den Entwurf oben. Erst Aurion prüfen und den Plan bestätigen."
	hint.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	panel.add_child(hint)
	_new_design_key = LineEdit.new()
	_new_design_key.placeholder_text = "Entwurfsschlüssel, z. B. village.owner"
	panel.add_child(_new_design_key)
	_new_design_title = LineEdit.new()
	_new_design_title.placeholder_text = "Titel des Weltentwurfs"
	panel.add_child(_new_design_title)
	_new_design_version = SpinBox.new()
	_new_design_version.prefix = "Version "
	_new_design_version.min_value = 1
	_new_design_version.max_value = 1000000
	_new_design_version.custom_minimum_size.y = 48
	panel.add_child(_new_design_version)
	_button(panel, "Leeren lokalen Weltentwurf anlegen", func():
		if not new_world_draft(_new_design_key.text.strip_edges(), _new_design_title.text.strip_edges(), int(_new_design_version.value)):
			_info.text = "Entwurfsschlüssel, Titel, Katalog und Sitzung prüfen.")
	_asset_choice = OptionButton.new()
	_asset_choice.fit_to_longest_item = false
	_asset_choice.clip_text = true
	panel.add_child(_asset_choice)
	_placement_key = LineEdit.new()
	_placement_key.placeholder_text = "Eindeutiger Platzierungsschlüssel, z. B. village.barrel-2"
	panel.add_child(_placement_key)
	for spec in [["chunkX", -100000, 100000, 0], ["chunkZ", -100000, 100000, 0], ["xMm", 0, 63999, 32000], ["zMm", 0, 63999, 32000], ["rotationQuarterTurns", 0, 3, 0], ["scalePermille", 250, 4000, 1000]]:
		var row := HBoxContainer.new()
		var label := Label.new()
		label.text = str(spec[0])
		label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		row.add_child(label)
		var number := SpinBox.new()
		number.min_value = spec[1]
		number.max_value = spec[2]
		number.value = spec[3]
		number.step = 1
		number.custom_minimum_size.y = 48
		row.add_child(number)
		panel.add_child(row)
		_placement_fields[spec[0]] = number
	_button(panel, "Platzierung zum Entwurf hinzufügen", _stage_catalog_form)
	_draft_import = TextEdit.new()
	_draft_import.placeholder_text = "Aurion-Weltentwurf als JSON einfügen (nur lokaler Entwurf)"
	_draft_import.custom_minimum_size.y = 100
	_draft_import.wrap_mode = TextEdit.LINE_WRAPPING_BOUNDARY
	panel.add_child(_draft_import)
	_button(panel, "JSON als Entwurf übernehmen", func():
		if not import_world_draft(_draft_import.text): _info.text = "Import abgelehnt: Entwurf, Katalogrevision oder Sitzung passen nicht.")
	_button(panel, "Entwurf als JSON kopieren", func():
		var candidate: Variant = _current_draft()
		if _catalog_draft_valid(candidate): DisplayServer.clipboard_set(JSON.stringify(candidate, "\t")))

func _draft_editable() -> bool:
	return _session_valid() and _state.phase in ["ready", "planned", "confirmed"] and _api != null and not _api.busy() and _journal.read().is_empty()

func _catalog_draft_valid(candidate: Variant) -> bool:
	if not AuthoringState._draft_valid(candidate) or _catalog_revision.is_empty() or candidate.expectedCatalogRevision != _catalog_revision:
		return false
	for placement in candidate.placements:
		if not _catalog_assets.has(placement.assetId): return false
	return true

func new_world_draft(key: String, title: String, version: int) -> bool:
	if not _draft_editable() or _catalog_revision.is_empty() or not WorldProjection._id(key) or title.strip_edges() != title or title.length() < 3 or title.length() > 160 or version < 1 or version > 1000000:
		return false
	_draft.text = JSON.stringify({"schemaVersion":"aurion.world-design.v1", "designKey":key, "version":version,
		"title":title, "expectedCatalogRevision":_catalog_revision, "placements":[]}, "\t")
	_on_draft_changed()
	_info.text = "Leerer lokaler Entwurf; mindestens eine Katalog-Platzierung ergänzen."
	return true

func import_world_draft(text: String) -> bool:
	if not _draft_editable() or text.to_utf8_buffer().size() > 1024 * 1024:
		return false
	var parser := JSON.new()
	if parser.parse(text) != OK: return false
	var candidate: Variant = parser.data
	if not _catalog_draft_valid(candidate): return false
	_draft.text = JSON.stringify(candidate, "\t")
	_on_draft_changed()
	_info.text = "Lokaler Entwurf übernommen; noch keine Weltänderung."
	return true

func stage_catalog_placement(placement: Dictionary) -> bool:
	if not _draft_editable(): return false
	var candidate: Variant = _current_draft()
	if typeof(candidate) != TYPE_DICTIONARY or typeof(candidate.get("placements")) != TYPE_ARRAY:
		return false
	candidate = candidate.duplicate(true)
	candidate.placements.append(placement.duplicate(true))
	if not _catalog_draft_valid(candidate): return false
	_draft.text = JSON.stringify(candidate, "\t")
	_on_draft_changed()
	_info.text = "Platzierung im lokalen Entwurf; bei Aurion prüfen und Plan bestätigen."
	return true

func _stage_catalog_form() -> void:
	if _asset_choice.selected < 0:
		_info.text = "Zuerst einen bestätigten Katalog laden."
		return
	var placement := {"placementKey":_placement_key.text.strip_edges(), "assetId":_asset_choice.get_item_metadata(_asset_choice.selected)}
	for key in _placement_fields:
		placement[key] = int(_placement_fields[key].value)
	if not stage_catalog_placement(placement):
		_info.text = "Platzierung abgelehnt: Entwurf, Schlüssel, Asset, Katalogrevision oder Sitzung prüfen."

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
	if is_instance_valid(_quest_editor): _quest_editor.close_context()
	_catalog_revision = ""
	_catalog_assets.clear()
	if is_instance_valid(_asset_choice): _asset_choice.clear()
	if is_instance_valid(_draft_import): _draft_import.text = ""
	_inspection.clear()
	if is_instance_valid(_inspection_list): _inspection_list.clear()
	_inspection_rows.clear()
	if is_instance_valid(_inspection_properties): _inspection_properties.text = ""
	if is_instance_valid(_inspection_status): _inspection_status.text = "Keine bestätigte Zonenprojektion für diese Sitzung."
	if is_instance_valid(_inspection_filter):
		_inspection_filter.text = ""
	_render_inspector()
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
	_confirm.popup_centered_ratio(0.9)
	_confirm.get_cancel_button().text = "Abbrechen"

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
	if kind.begins_with("quest"):
		_quest_editor.completed(kind, data)
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
			_quest_editor.open_context(connection, generation, data.get("id"), _send)
			_send("catalog")
		"catalog":
			_catalog_revision = ""
			_catalog_assets.clear()
			_asset_choice.clear()
			if not WorldProjection._hex(data.get("glbCatalogRevision"), 64) or typeof(data.get("assets")) != TYPE_ARRAY:
				_catalog_info.text = "Katalogantwort ungültig."
				return
			var eligible: Array[String] = []
			for asset in data.assets:
				if typeof(asset) == TYPE_DICTIONARY and asset.has("targetKey") and asset.targetKey == null and asset.get("assetType") == "arena" and asset.get("purpose") in ["world-environment", "world-nature"] and WorldProjection._id(asset.get("assetId"), true) and WorldProjection._hex(asset.get("sha256"), 64):
					eligible.append(asset.assetId)
					_catalog_assets[asset.assetId] = asset.duplicate(true)
			_catalog_revision = data.glbCatalogRevision
			eligible.sort()
			for id in eligible:
				_asset_choice.add_item(str(_catalog_assets[id].get("displayName", id)).left(160) + " · " + id)
				_asset_choice.set_item_metadata(_asset_choice.item_count - 1, id)
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
	if kind.begins_with("quest"):
		_quest_editor.failed(kind)
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

func quest_editor() -> Control:
	return _quest_editor
