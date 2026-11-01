extends VBoxContainer
## Draft tools inside the existing WorldStudio. Aurion alone validates,
## publishes and evaluates quests; this Control never changes quest progress.
const State = preload("res://authoring/quest_authoring_state.gd")
const Journal = preload("res://authoring/quest_authoring_journal.gd")
var _state := State.new()
var _journal := Journal.new()
var _send: Callable
var _templates: Array = []
var _choice: OptionButton
var _json: TextEdit
var _graph: Tree
var _status: Label
var _activation: CheckBox
var _confirm: ConfirmationDialog
var _plan_view: TextEdit

func _ready() -> void:
	add_theme_constant_override("separation", 8)
	var hint := Label.new()
	hint.text = "Questvorlagen · lokale Entwürfe\nVorlagenveröffentlichung ist kein Questfortschritt. Nur bestätigte Aurion-Ereignisse erfüllen Ziele."
	hint.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	add_child(hint)
	_button("Aurion-Vorlagen lesen", load_templates)
	_choice = OptionButton.new()
	_choice.fit_to_longest_item = false
	_choice.clip_text = true
	_choice.custom_minimum_size.y = 48
	add_child(_choice)
	_button("Vorlage als neue, inaktive Version kopieren", func(): copy_template(_choice.selected))
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
	_send = Callable()
	_templates.clear()
	if is_instance_valid(_choice): _choice.clear()
	if is_instance_valid(_json): _json.text = ""
	if is_instance_valid(_graph): _graph.clear()
	if is_instance_valid(_activation): _activation.set_pressed_no_signal(false)
	if is_instance_valid(_confirm): _confirm.hide()
	_show_status()

func _request(kind: String, payload: Dictionary = {}) -> bool:
	return _state.phase != "closed" and _send.is_valid() and bool(_send.call(kind, payload))

func _can_edit() -> bool:
	return _state.phase in ["ready", "planned", "confirmed"] and _journal.read().is_empty()

func current_draft() -> Dictionary:
	if not is_instance_valid(_json) or _json.text.to_utf8_buffer().size() > 120000: return {}
	var parser := JSON.new()
	if parser.parse(_json.text) != OK or not State.draft_valid(parser.data): return {}
	return parser.data.duplicate(true)

func load_templates() -> void:
	if not _request("questTemplates"):
		_set_message("Vorlagenanfrage konnte nicht gestartet werden.")

func copy_template(index: int) -> bool:
	if not _can_edit() or index < 0 or index >= _templates.size(): return false
	var value: Dictionary = _templates[index].duplicate(true)
	var next_version := int(value.version) + 1
	for template in _templates:
		if template.templateId == value.templateId: next_version = maxi(next_version, int(template.version) + 1)
	if next_version > 1000000: return false
	value.version = next_version
	value.active = false
	value.quarantined = true
	_json.text = JSON.stringify(value, "\t")
	_activation.set_pressed_no_signal(false)
	_draft_changed()
	_render_graph()
	_set_message("Lokale neue Version kopiert; inaktiv und quarantänisiert. Aurion hat noch nichts veröffentlicht.")
	return true

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
	var root := _graph.create_item()
	for node in value.nodes:
		var item := _graph.create_item(root)
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
	if not _request("questPropose", payload): _state.failed("questPropose")
	_show_status()

func request_confirmation() -> void:
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
	match kind:
		"questTemplates":
			if typeof(data.get("templates")) != TYPE_ARRAY or data.templates.size() > 4096:
				failed(kind)
				return
			for template in data.templates:
				if not State.draft_valid(template):
					failed(kind)
					return
			if _state.phase == "awaiting_readback":
				var pending: Dictionary = _state.pending_identity()
				if _state.accept_readback(data):
					if not _journal.clear_confirmed(pending):
						_state.phase = "unknown"
						_state.message = "Receipt und Vorlage stimmen; lokale Vormerkung konnte nicht entfernt werden."
				else:
					_state.message = "Receipt vorhanden; passende Vorlage im separaten Readback noch nicht bestätigt."
			_templates = data.templates.duplicate(true)
			_choice.clear()
			for template in _templates:
				_choice.add_item(str(template.title).left(120) + " · " + str(template.templateId) + " v" + str(int(template.version)))
		"questPropose":
			if not _state.accept_proposal(data):
				failed(kind)
				return
			var payload: Dictionary = _state.begin_plan()
			if payload.is_empty() or not _request("questPlan", payload): _state.failed("questPlan")
		"questPlan":
			if not _state.accept_plan(data, current_draft()): _state.failed(kind)
		"questPublish":
			if not _state.accept_publish(data):
				_state.failed(kind)
			elif not _request("questTemplates"):
				_state.failed("questTemplates")
		"questReceipt":
			if _state.accept_recovered(_journal.read(), data):
				if not _request("questTemplates"): _state.failed("questTemplates")
			else:
				_state.message = "Kein passendes Receipt bestätigt; Ergebnis bleibt ungeklärt. Publish wird nicht wiederholt."
	_show_status()

func failed(kind: String) -> void:
	_state.failed(kind)
	_show_status()

func _set_message(value: String) -> void:
	_status.text = value

func _show_status() -> void:
	if is_instance_valid(_status):
		_status.text = _state.message if not _state.message.is_empty() else "Admin-Sitzung und Questvorlagen noch nicht geprüft."
	if is_instance_valid(_json): _json.editable = _can_edit()
