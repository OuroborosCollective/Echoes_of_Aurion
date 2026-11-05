extends VBoxContainer
## Draft tools inside the existing WorldStudio. Aurion alone validates,
## publishes and evaluates quests; this Control never changes quest progress.
const State = preload("res://authoring/quest_authoring_state.gd")
const Journal = preload("res://authoring/quest_authoring_journal.gd")
var _state := State.new()
var _journal := Journal.new()
var _send: Callable
var _request_in_progress := false
var _request_failure_notified := false
var _failure_reason := ""
var _templates: Array = []
var _next_cursor: Dictionary = {}
var _requested_cursor: Dictionary = {}
var _copying: Dictionary = {}
var _choice: OptionButton
var _json: TextEdit
var _graph: Tree
var _status: Label
var _activation: CheckBox
var _confirm: ConfirmationDialog
var _plan_view: TextEdit
var _faden_source: TextEdit
var _faden_choice: OptionButton
var _faden_version: SpinBox
var _faden_status: Label
var _faden_lines: Array = []
var _faden_source_hash := ""
var _faden_pending: Dictionary = {}
var _quest_title: LineEdit
var _node_title: LineEdit

func _ready() -> void:
	add_theme_constant_override("separation", 8)
	var hint := Label.new()
	hint.text = "Questvorlagen · lokale Entwürfe\nVorlagenveröffentlichung ist kein Questfortschritt. Nur bestätigte Aurion-Ereignisse erfüllen Ziele."
	hint.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	add_child(hint)
	_button("Aurion-Vorlagen lesen", load_templates)
	_button("Nächste Vorlagenseite lesen", load_more_templates)
	_choice = OptionButton.new()
	_choice.fit_to_longest_item = false
	_choice.clip_text = true
	_choice.custom_minimum_size.y = 48
	add_child(_choice)
	_button("Vorlage als neue, inaktive Version kopieren", func(): copy_template(_choice.selected))
	_build_fadenwerk()
	_json = TextEdit.new()
	_json.placeholder_text = "Kanonischer Questgraph: Rollen, Knoten, Kanten, Bedingungen und Ergebnisse"
	_json.wrap_mode = TextEdit.LINE_WRAPPING_BOUNDARY
	_json.custom_minimum_size.y = 240
	_json.text_changed.connect(_draft_changed)
	add_child(_json)
	_graph = Tree.new()
	_graph.columns = 2
	_graph.hide_root = true
	_graph.set_column_title(0, "Questgraph")
	_graph.set_column_title(1, "Typ / Verbindung")
	_graph.column_titles_visible = true
	_graph.custom_minimum_size.y = 180
	add_child(_graph)
	_quest_title = LineEdit.new()
	_quest_title.placeholder_text = "Questtitel"
	_quest_title.custom_minimum_size.y = 48
	add_child(_quest_title)
	_button("Questtitel im Entwurf ändern", func(): rename_quest(_quest_title.text))
	_node_title = LineEdit.new()
	_node_title.placeholder_text = "Knoten im Graph auswählen, dann Titel ändern"
	_node_title.custom_minimum_size.y = 48
	add_child(_node_title)
	_graph.item_selected.connect(func():
		var item := _graph.get_selected()
		if item != null and typeof(item.get_metadata(0)) == TYPE_STRING:
			for node in current_draft().get("nodes", []):
				if node.id == item.get_metadata(0): _node_title.text = node.title)
	_button("Gewählten Knotentitel ändern", func():
		var item := _graph.get_selected()
		if item != null and typeof(item.get_metadata(0)) == TYPE_STRING: rename_node(item.get_metadata(0), _node_title.text))
	_button("Graph aus Entwurf anzeigen", _render_graph)
	_button("Lokalen Questentwurf als JSON kopieren", _copy_json)
	_activation = CheckBox.new()
	_activation.text = "Diese geprüfte Vorlagenversion aktiv veröffentlichen"
	_activation.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_activation.clip_text = true
	_activation.custom_minimum_size.y = 48
	_activation.toggled.connect(set_activation)
	add_child(_activation)
	_button("Questentwurf speichern und bei Aurion prüfen", request_plan)
	_button("Veröffentlichungsplan ansehen", request_confirmation)
	_button("Ungeklärtes Quest-Receipt lesen", recover_receipt)
	_status = Label.new()
	_status.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	add_child(_status)
	_confirm = ConfirmationDialog.new()
	_confirm.title = "Questvorlage veröffentlichen"
	_confirm.ok_button_text = "Vorlage veröffentlichen"
	_confirm.confirmed.connect(_publish)
	_plan_view = TextEdit.new()
	_plan_view.editable = false
	_plan_view.wrap_mode = TextEdit.LINE_WRAPPING_BOUNDARY
	_plan_view.custom_minimum_size = Vector2(240, 240)
	_confirm.add_child(_plan_view)
	add_child(_confirm)
	for button in [_confirm.get_ok_button(), _confirm.get_cancel_button()]:
		var style := button.get_theme_stylebox("normal").duplicate() as StyleBox
		style.set_content_margin(SIDE_TOP, 16)
		style.set_content_margin(SIDE_BOTTOM, 16)
		button.add_theme_stylebox_override("normal", style)
	_show_status()

func _button(title: String, action: Callable) -> void:
	var button := Button.new()
	button.text = title
	button.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	button.clip_text = true
	button.custom_minimum_size.y = 48
	button.pressed.connect(action)
	add_child(button)

func open_context(connection: String, generation: int, actor: Variant, sender: Callable) -> void:
	close_context()
	if not _state.open(connection, generation, actor): return
	_send = sender
	var pending: Dictionary = _journal.read()
	if not pending.is_empty():
		if not _state.restore_pending(pending):
			_state.phase = "unknown"
			_state.message = "Lokale Questvormerkung gehört zu einem anderen Account oder ist unlesbar. Keine neue Veröffentlichung möglich."
	_show_status()

func close_context() -> void:
	_state.close()
	_failure_reason = ""
	_send = Callable()
	_templates.clear()
	_next_cursor.clear()
	_requested_cursor.clear()
	_copying.clear()
	_faden_pending.clear()
	_faden_lines.clear()
	_faden_source_hash = ""
	if is_instance_valid(_faden_source): _faden_source.text = ""
	if is_instance_valid(_faden_choice): _faden_choice.clear()
	if is_instance_valid(_faden_status): _faden_status.text = ""
	if is_instance_valid(_quest_title): _quest_title.text = ""
	if is_instance_valid(_node_title): _node_title.text = ""
	if is_instance_valid(_choice): _choice.clear()
	if is_instance_valid(_json): _json.text = ""
	if is_instance_valid(_graph): _graph.clear()
	if is_instance_valid(_activation): _activation.set_pressed_no_signal(false)
	if is_instance_valid(_confirm): _confirm.hide()
	_show_status()

func _request(kind: String, payload: Dictionary = {}) -> bool:
	_request_failure_notified = false
	_failure_reason = ""
	_request_in_progress = true
	var started := _state.phase != "closed" and _send.is_valid() and bool(_send.call(kind, payload))
	_request_in_progress = false
	# Native request-start errors emit failed before returning false. Wait for
	# that return before deciding whether publication could have been sent.
	if _request_failure_notified and kind not in ["questFadenInspect", "questFadenDraft"] and (started or kind != "questPublish"):
		_state.failed(kind)
	_show_status()
	if started and not _request_failure_notified:
		_set_message("Aurion-Anfrage läuft.")
	return started

func _can_edit() -> bool:
	return _state.phase in ["ready", "planned", "confirmed"] and _journal.read().is_empty() and _copying.is_empty() and _faden_pending.is_empty()

func current_draft() -> Dictionary:
	## Bound presentation parsing separately; whitespace is not persisted.
	if not is_instance_valid(_json) or _json.text.to_utf8_buffer().size() > 1048576: return {}
	var parser := JSON.new()
	if parser.parse(_json.text) != OK or not State.draft_valid(parser.data): return {}
	if JSON.stringify(parser.data).to_utf8_buffer().size() > 65535: return {}
	return parser.data.duplicate(true)

func load_templates() -> void:
	if _state.phase == "awaiting_readback":
		_readback()
	elif _request("questTemplates", {"limit":20}):
		_requested_cursor.clear()
	else:
		_set_message("Vorlagenanfrage konnte nicht gestartet werden.")

func load_more_templates() -> void:
	if _next_cursor.is_empty():
		_set_message("Keine weitere Vorlagenseite vorhanden.")
	elif _request("questTemplates", {"limit":20, "after":_next_cursor}):
		_requested_cursor = _next_cursor.duplicate(true)
	else:
		_set_message("Nächste Vorlagenseite konnte nicht angefordert werden.")

static func _summary_valid(value: Variant) -> bool:
	return typeof(value) == TYPE_DICTIONARY and value.size() == 5 and State._text(value.get("templateId"), 1, 96) and State.Guard._whole(value.get("version"), 1, 2147483647) and State.title_valid(value.get("title")) and typeof(value.get("active")) == TYPE_BOOL and typeof(value.get("quarantined")) == TYPE_BOOL

static func _cursor_valid(value: Variant) -> bool:
	return typeof(value) == TYPE_DICTIONARY and value.size() == 2 and State._text(value.get("templateId"), 1, 96) and State.Guard._whole(value.get("version"), 1, 2147483647)

func copy_template(index: int) -> bool:
	if not _can_edit() or index < 0 or index >= _templates.size(): return false
	var summary: Dictionary = _templates[index]
	var payload := {"templateId":summary.templateId, "version":int(summary.version)}
	_copying = payload
	if not _request("questTemplate", payload):
		_copying.clear()
		_show_status()
		return false
	return true

func _accept_copy(data: Dictionary) -> void:
	var expected := _copying.duplicate(true)
	_copying.clear()
	if expected.is_empty() or not _can_edit() or typeof(data.get("templates")) != TYPE_ARRAY or data.templates.size() != 1 or not State.draft_valid(data.templates[0]):
		_show_status()
		_set_message("Die gewählte Vorlage konnte nicht bestätigt werden.")
		return
	var value: Dictionary = data.templates[0].duplicate(true)
	if value.templateId != expected.templateId or value.version != expected.version or not State.Guard._whole(data.get("nextVersion"), int(value.version) + 1, 1000000):
		_show_status()
		_set_message("Keine passende neue Vorlagenversion verfügbar.")
		return
	value.version = int(data.nextVersion)
	value.active = false
	value.quarantined = true
	_json.text = JSON.stringify(value, "\t")
	_activation.set_pressed_no_signal(false)
	_draft_changed()
	_render_graph()
	_set_message("Lokale neue Version kopiert; inaktiv und quarantänisiert. Aurion hat noch nichts veröffentlicht.")

func _readback() -> void:
	var pending: Dictionary = _state.pending_identity()
	if _state.phase != "awaiting_readback" or not State.pending_valid(pending): return
	if not _request("questReadback", {"templateId":pending.templateId, "version":int(pending.version)}):
		if not _request_failure_notified:
			_state.failed("questReadback")
		_show_status()

func set_activation(enabled: bool) -> void:
	if not _can_edit():
		_activation.set_pressed_no_signal(false)
		return
	var value := current_draft()
	if value.is_empty(): return
	value.active = enabled
	value.quarantined = not enabled
	_json.text = JSON.stringify(value, "\t")
	_activation.set_pressed_no_signal(enabled)
	_draft_changed()

func _draft_changed() -> void:
	_failure_reason = ""
	_state.draft_changed()
	if is_instance_valid(_confirm): _confirm.hide()
	var value := current_draft()
	if is_instance_valid(_activation): _activation.set_pressed_no_signal(not value.is_empty() and value.active and not value.quarantined)
	_show_status()

func _render_graph() -> void:
	_graph.clear()
	var value := current_draft()
	if value.is_empty():
		_set_message("Entwurf ungültig. Vorheriger Serverplan kann nicht verwendet werden.")
		return
	_quest_title.text = value.title
	_node_title.text = ""
	var root := _graph.create_item()
	for node in value.nodes:
		var item := _graph.create_item(root)
		item.set_metadata(0, str(node.id))
		item.set_text(0, str(node.id) + " · " + str(node.title))
		item.set_text(1, str(node.type))
		if typeof(node.get("objective")) == TYPE_DICTIONARY:
			var objective := _graph.create_item(item)
			objective.set_text(0, str(node.objective.get("key", "")))
			objective.set_text(1, "Ziel: " + str(node.objective.get("targetValue", "")))
	for edge in value.edges:
		var item := _graph.create_item(root)
		item.set_text(0, str(edge.id))
		item.set_text(1, str(edge.fromNodeId) + " → " + str(edge.toNodeId))

func _copy_json() -> void:
	var value := current_draft()
	if not value.is_empty(): DisplayServer.clipboard_set(JSON.stringify(value, "\t"))

func request_plan() -> void:
	if not _can_edit():
		_set_message("Bitte zuerst die laufende oder ungeklärte Veröffentlichung abschließen.")
		return
	var payload: Dictionary = _state.begin_proposal(current_draft())
	if payload.is_empty():
		_set_message("Vollständigen kanonischen Questentwurf angeben.")
		return
	if not _request("questPropose", payload) and not _request_failure_notified: _state.failed("questPropose")
	_show_status()

func request_confirmation() -> void:
	if not _faden_pending.is_empty(): return
	var plan: Dictionary = _state.planned_summary()
	var draft := current_draft()
	if plan.is_empty() or not State.same_json(plan.template, draft) or not _journal.read().is_empty():
		_set_message("Aktuellen Questentwurf zuerst bei Aurion prüfen.")
		return
	if not draft.active or draft.quarantined:
		_set_message("Veröffentlichung erfordert die ausdrückliche Aktivierung und einen neuen Serverplan.")
		return
	_plan_view.text = "Vorlagenveröffentlichung; kein Questabschluss und keine Belohnung.\n" + JSON.stringify(plan, "\t")
	_confirm.popup_centered_ratio(0.9)
	_confirm.get_cancel_button().text = "Abbrechen"

func _publish() -> void:
	if not _faden_pending.is_empty(): return
	var plan: Dictionary = _state.planned_summary()
	if plan.is_empty() or not State.same_json(plan.template, current_draft()): return
	var pending: Dictionary = _state.pending_identity()
	if not _journal.reserve(pending):
		_set_message("Keine sichere lokale Vormerkung; es wurde nichts veröffentlicht.")
		return
	var payload: Dictionary = _state.begin_publish(current_draft())
	if payload.is_empty():
		_journal.release_unsubmitted(pending)
		return
	if not _request("questPublish", payload):
		if _journal.release_unsubmitted(pending):
			_state.publish_not_started()
		else:
			_state.failed("questPublish")
	_show_status()

func recover_receipt() -> void:
	var pending: Dictionary = _journal.read()
	if _state.phase != "unknown" or not State.pending_valid(pending) or int(pending.actorUserId) != _state.actor_id:
		_set_message("Keine passende, lesbare Questvormerkung für diesen Account.")
		return
	if not _request("questReceipt", {"proposalId":pending.proposalId, "planHash":pending.planHash}):
		_set_message("Receipt-Suche konnte nicht gestartet werden.")

func completed(kind: String, data: Dictionary) -> void:
	if _state.phase == "closed": return
	_failure_reason = ""
	if kind in ["questFadenInspect", "questFadenDraft"]:
		_accept_fadenwerk(kind, data)
		return
	match kind:
		"questTemplates":
			if data.get("schemaVersion") != "aurion.quest-template-page.v1" or typeof(data.get("items")) != TYPE_ARRAY or data.items.size() > 20 or not data.has("nextCursor"):
				failed(kind)
				return
			for template in data.items:
				if not _summary_valid(template):
					failed(kind)
					return
			if data.nextCursor != null and (not _cursor_valid(data.nextCursor) or State.same_json(data.nextCursor, _requested_cursor)):
				failed(kind)
				return
			_templates = data.items.duplicate(true)
			_next_cursor = {} if data.nextCursor == null else data.nextCursor.duplicate(true)
			_choice.clear()
			for template in _templates:
				_choice.add_item(str(template.title).left(120) + " · " + str(template.templateId) + " v" + str(int(template.version)))
		"questTemplate":
			_accept_copy(data)
			return
		"questReadback":
			if _state.phase == "awaiting_readback":
				var pending: Dictionary = _state.pending_identity()
				if _state.accept_readback(data):
					if not _journal.clear_confirmed(pending):
						_state.phase = "unknown"
						_state.message = "Receipt und Vorlage stimmen; lokale Vormerkung konnte nicht entfernt werden."
				else:
					_state.message = "Receipt vorhanden; passende Vorlage im separaten Readback noch nicht bestätigt."
		"questPropose":
			if not _state.accept_proposal(data):
				failed(kind)
				return
			var payload: Dictionary = _state.begin_plan()
			if payload.is_empty():
				_state.failed("questPlan")
			elif not _request("questPlan", payload) and not _request_failure_notified:
				_state.failed("questPlan")
		"questPlan":
			if not _state.accept_plan(data, current_draft()): _state.failed(kind)
		"questPublish":
			if not _state.accept_publish(data):
				_state.failed(kind)
			else:
				_readback()
		"questReceipt":
			if _state.accept_recovered(_journal.read(), data):
				_readback()
			else:
				_state.message = "Kein passendes Receipt bestätigt; Ergebnis bleibt ungeklärt. Publish wird nicht wiederholt."
	_show_status()

func failed(kind: String, reason: String = "") -> void:
	_request_failure_notified = true
	_failure_reason = reason
	if kind == "questTemplate": _copying.clear()
	if kind in ["questFadenInspect", "questFadenDraft"]:
		_faden_pending.clear()
		if not _request_in_progress:
			_show_status()
			_set_message("Fadenwerk-Anfrage fehlgeschlagen; bestehender Questplan bleibt unverändert.")
		return
	if _request_in_progress: return
	_state.failed(kind)
	_show_status()

func _set_message(value: String) -> void:
	_status.text = value + (" · " + _failure_reason if not _failure_reason.is_empty() else "")

func _show_status() -> void:
	if is_instance_valid(_status):
		_set_message(_state.message if not _state.message.is_empty() else "Admin-Sitzung und Questvorlagen noch nicht geprüft.")
	if is_instance_valid(_json): _json.editable = _can_edit()

func _build_fadenwerk() -> void:
	var heading := Label.new()
	heading.text = "Fadenwerk · Stränge prüfen und als lokalen Questentwurf übernehmen"
	heading.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	add_child(heading)
	_faden_source = TextEdit.new()
	_faden_source.placeholder_text = "Fadenwerk-v1-JSON"
	_faden_source.wrap_mode = TextEdit.LINE_WRAPPING_BOUNDARY
	_faden_source.custom_minimum_size.y = 120
	_faden_source.text_changed.connect(_faden_source_changed)
	add_child(_faden_source)
	_button("Fadenwerk bei Aurion prüfen", inspect_fadenwerk)
	_faden_choice = OptionButton.new()
	_faden_choice.fit_to_longest_item = false
	_faden_choice.clip_text = true
	_faden_choice.custom_minimum_size.y = 48
	_faden_choice.item_selected.connect(func(_index: int): _show_faden_issues())
	add_child(_faden_choice)
	var version_label := Label.new()
	version_label.text = "Entwurfsversion (Aurion prüft Konflikte im Plan)"
	version_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	add_child(version_label)
	_faden_version = SpinBox.new()
	_faden_version.min_value = 1
	_faden_version.max_value = 1000000
	_faden_version.step = 1
	_faden_version.value = 1
	_faden_version.custom_minimum_size.y = 48
	add_child(_faden_version)
	_faden_status = Label.new()
	_faden_status.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	add_child(_faden_status)
	_button("Gewählten Fadenwerk-Strang als inaktiven Entwurf übernehmen", import_fadenwerk)

func _faden_source_changed() -> void:
	_faden_lines.clear()
	_faden_source_hash = ""
	_faden_choice.clear()
	_faden_status.text = "Quelle geändert; erneut prüfen."

func _show_faden_issues() -> void:
	var index := _faden_choice.selected
	if index < 0 or index >= _faden_lines.size(): return
	var lines: Array[String] = []
	for issue in _faden_lines[index].issues:
		lines.append(str(issue.code) + " · " + str(issue.path))
	_faden_status.text = "\n".join(lines) if not lines.is_empty() else "Struktur geprüft. Übernahme bleibt inaktiv und quarantänisiert."

func inspect_fadenwerk() -> bool:
	if not _can_edit(): return false
	var source := _faden_source.text
	if source.to_utf8_buffer().size() < 2 or source.to_utf8_buffer().size() > 120000:
		_set_message("Fadenwerk-JSON muss zwischen 2 und 120000 UTF-8-Bytes enthalten.")
		return false
	_faden_source_changed()
	return _request_fadenwerk("questFadenInspect", {"sourceJson":source})

func import_fadenwerk() -> bool:
	if not _can_edit() or _faden_source_hash != _faden_source.text.sha256_text(): return false
	var index := _faden_choice.selected
	if index < 0 or index >= _faden_lines.size(): return false
	for issue in _faden_lines[index].issues:
		if issue.severity == "blocker":
			_set_message("Fadenwerk enthält nicht zugeordnete Semantik; keine Übernahme.")
			return false
	return _request_fadenwerk("questFadenDraft", {"sourceJson":_faden_source.text, "questlineIndex":index, "version":int(_faden_version.value)})

func _request_fadenwerk(kind: String, payload: Dictionary) -> bool:
	_faden_pending = {"kind":kind, "sourceHash":str(payload.sourceJson).sha256_text(), "draft":_json.text,
		"index":_faden_choice.selected, "version":int(_faden_version.value)}
	if not _request(kind, payload):
		_faden_pending.clear()
		_show_status()
		return false
	return true

func _accept_fadenwerk(kind: String, data: Dictionary) -> void:
	var pending := _faden_pending.duplicate(true)
	_faden_pending.clear()
	_show_status()
	if pending.is_empty() or pending.kind != kind or not _can_edit() or pending.draft != _json.text or pending.sourceHash != _faden_source.text.sha256_text() or data.get("sourceHash") != pending.sourceHash or data.get("previewOnly") != true:
		_set_message("Fadenwerk-Antwort passt nicht mehr zur Quelle oder zum Entwurf; erneut prüfen.")
		return
	_set_message("Fadenwerk-Antwort ungültig; keine Übernahme.")
	if kind == "questFadenInspect":
		var lines: Variant = data.get("questlines")
		if typeof(lines) != TYPE_ARRAY or lines.is_empty() or lines.size() > 100: return
		var ids := {}
		for line in lines:
			if typeof(line) != TYPE_DICTIONARY or not State._text(line.get("id"), 1, 48) or not State._text(line.get("title"), 1, 160) or typeof(line.get("issues")) != TYPE_ARRAY or line.issues.size() > 4096 or ids.has(line.id): return
			ids[line.id] = true
			for issue in line.issues:
				if typeof(issue) != TYPE_DICTIONARY or issue.get("severity") not in ["blocker", "note"] or not State._text(issue.get("code"), 1, 128) or not State._text(issue.get("path"), 1, 1024): return
		_faden_lines = lines.duplicate(true)
		_faden_source_hash = pending.sourceHash
		_faden_choice.clear()
		for line in _faden_lines: _faden_choice.add_item(str(line.title) + " · " + str(line.id))
		_faden_choice.select(0)
		_show_faden_issues()
		_set_message("Fadenwerk geprüft; gewünschten Strang zur lokalen Übernahme auswählen.")
	else:
		var index: int = pending.index
		var value: Variant = data.get("template")
		if index < 0 or index >= _faden_lines.size() or index != _faden_choice.selected or pending.version != int(_faden_version.value) or data.get("questlineId") != _faden_lines[index].id or not State.draft_valid(value) or value.templateId != "fadenwerk_" + str(_faden_lines[index].id) or value.version != pending.version or value.active or not value.quarantined or JSON.stringify(value).to_utf8_buffer().size() > 64000:
			_set_message("Fadenwerk-Entwurf ungültig oder Auswahl geändert; keine Übernahme.")
			return
		_json.text = JSON.stringify(value, "\t")
		_draft_changed()
		_render_graph()
		_set_message("PREVIEW_ONLY · Fadenwerk-Struktur übernommen; inaktiv und quarantänisiert. Kein Plan, keine Veröffentlichung.")

func rename_quest(title: String) -> bool:
	return _rename_title("", title)

func rename_node(node_id: String, title: String) -> bool:
	if node_id.is_empty(): return false
	return _rename_title(node_id, title)

func _rename_title(node_id: String, title: String) -> bool:
	if not _can_edit() or title.strip_edges().is_empty() or title.length() > 255: return false
	var value := current_draft()
	if value.is_empty(): return false
	if node_id.is_empty():
		value.title = title
	else:
		var matches := 0
		for node in value.nodes:
			if node.id == node_id:
				node.title = title
				matches += 1
		if matches != 1: return false
	_json.text = JSON.stringify(value, "\t")
	_draft_changed()
	_render_graph()
	return true

