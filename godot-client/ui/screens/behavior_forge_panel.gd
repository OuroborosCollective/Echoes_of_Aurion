extends VBoxContainer
## Authoring and server-returned comparison only; no NPC execution in Godot.
var _send := Callable()
var _actors: Array = []
var _edit_version := 0
var _pending_edit := 0
var _pending := ""
var _pending_draft := ""
var _pending_actor := ""
var _pending_observation := ""
var _choice: OptionButton
var _role: OptionButton
var _mode: OptionButton
var _brief: TextEdit
var _draft: TextEdit
var _result: TextEdit
var _status: Label
var _graph: Tree

func _ready() -> void:
	var heading := Label.new()
	heading.text = "NPC Behavior Forge · Experiment"
	add_child(heading)
	_status = Label.new()
	_status.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	add_child(_status)
	_choice = OptionButton.new()
	_choice.fit_to_longest_item = false
	_choice.clip_text = true
	_choice.item_selected.connect(func(_i: int): _invalidate())
	add_child(_choice)
	_button("Bestätigte NPCs erneut lesen", func(): _request("behaviorActors"))
	_role = OptionButton.new()
	for value in ["blacksmith", "questgiver", "guard", "animal"]: _role.add_item(value)
	_role.item_selected.connect(func(_i: int): _invalidate())
	add_child(_role)
	_mode = OptionButton.new()
	for value in ["tree", "utility", "micro-shadow"]: _mode.add_item(value)
	_mode.item_selected.connect(func(_i: int): _invalidate())
	add_child(_mode)
	_brief = TextEdit.new()
	_brief.placeholder_text = "Verhaltensbeschreibung für Entwurf und externen Analyse-Prompt"
	_brief.wrap_mode = TextEdit.LINE_WRAPPING_BOUNDARY
	_brief.custom_minimum_size.y = 80
	_brief.text_changed.connect(_invalidate)
	add_child(_brief)
	_button("Vorlage und Analyse-Prompt vorbereiten", _prepare)
	_draft = TextEdit.new()
	_draft.wrap_mode = TextEdit.LINE_WRAPPING_BOUNDARY
	_draft.custom_minimum_size.y = 140
	_draft.text_changed.connect(_invalidate)
	add_child(_draft)
	_graph = Tree.new()
	_graph.custom_minimum_size.y = 140
	_graph.hide_root = false
	add_child(_graph)
	_button("Außerhalb der Welt mit Baseline vergleichen", _test)
	_result = TextEdit.new()
	_result.editable = false
	_result.wrap_mode = TextEdit.LINE_WRAPPING_BOUNDARY
	_result.custom_minimum_size.y = 180
	add_child(_result)
	_button("Entwurf kopieren", func(): DisplayServer.clipboard_set(_draft.text))
	close_context()

func _button(title: String, callback: Callable) -> void:
	var b := Button.new()
	b.text = title
	b.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	b.custom_minimum_size.y = 48
	b.pressed.connect(callback)
	add_child(b)

func open_context(send: Callable) -> void:
	close_context()
	_send = send
	_status.text = "DRAFT · NPCs lesen. Aktivierung BLOCKED: Receipt-/Replay-Anbindung und Live-3D-Nachweis fehlen."

func close_context() -> void:
	_send = Callable()
	_actors.clear()
	_pending = ""
	_pending_draft = ""
	_pending_actor = ""
	_pending_observation = ""
	if is_instance_valid(_choice): _choice.clear()
	if is_instance_valid(_draft): _draft.text = ""
	if is_instance_valid(_brief): _brief.text = ""
	if is_instance_valid(_result): _result.text = ""
	if is_instance_valid(_graph): _graph.clear()
	if is_instance_valid(_status): _status.text = "Keine bestätigte Admin-Sitzung."

func _invalidate() -> void:
	_edit_version += 1
	if is_instance_valid(_status): _status.text = "DRAFT · Änderungen sind nicht getestet; keine Live-Aktivierung."
	if is_instance_valid(_result): _result.text = ""
	if is_instance_valid(_graph): _graph.clear()

func _request(kind: String, payload: Dictionary = {}) -> bool:
	if not _send.is_valid() or not _pending.is_empty(): return false
	_pending_edit = _edit_version
	_pending = kind
	if not _send.call(kind, payload):
		_pending = ""
		_status.text = "Anfrage nicht gestartet. Sitzung oder laufende Anfrage prüfen."
		return false
	return true

func _prepare() -> void:
	if not _pending.is_empty(): return
	if _brief.text.strip_edges().length() < 12: return
	_pending_draft = _brief.text
	_request("behaviorDraft", {"role":_role.get_item_text(_role.selected), "mode":_mode.get_item_text(_mode.selected), "brief":_brief.text})

func _test() -> void:
	if not _pending.is_empty(): return
	if _choice.selected < 0 or _choice.selected >= _actors.size(): return
	var artifact: Variant = JSON.parse_string(_draft.text)
	if typeof(artifact) != TYPE_DICTIONARY: return
	var actor: Dictionary = _actors[_choice.selected]
	_pending_draft = _draft.text
	_pending_actor = str(actor.npcId)
	_pending_observation = str(actor.observationHash)
	_request("behaviorTest", {"npcId":actor.npcId, "expectedObservationHash":actor.observationHash, "artifact":artifact})

func completed(kind: String, data: Dictionary) -> void:
	if kind != _pending: return
	_pending = ""
	if kind == "behaviorActors":
		_actors.clear()
		_choice.clear()
		_invalidate()
		if data.get("schemaVersion") != "aurion.behavior-actors.v1" or typeof(data.get("actors")) != TYPE_ARRAY: return
		for actor in data.actors:
			if typeof(actor) != TYPE_DICTIONARY or typeof(actor.get("npcId")) != TYPE_STRING or typeof(actor.get("observationHash")) != TYPE_STRING: continue
			_actors.append(actor.duplicate(true))
			_choice.add_item(actor.npcId)
		_status.text = "Bestätigte NPC-Beobachtungen: %d. Controller und 3D-Sichtbarkeit UNVERIFIED; kein Apply." % _actors.size()
	elif kind == "behaviorDraft":
		if _edit_version != _pending_edit: return
		if _brief.text != _pending_draft or data.get("status") != "DRAFT" or typeof(data.get("artifact")) != TYPE_DICTIONARY: return
		_draft.text = JSON.stringify(data.artifact, "\t")
		_result.text = JSON.stringify(data, "\t")
		_render_graph(data.artifact)
		_status.text = "DRAFT · Explizite Vorlage, keine KI-Inferenz. Analyse-Prompt im Ergebnis; JSON bleibt editierbar."
	elif kind == "behaviorTest":
		if _edit_version != _pending_edit: return
		if _draft.text != _pending_draft or _choice.selected < 0 or _choice.selected >= _actors.size(): return
		var actor: Dictionary = _actors[_choice.selected]
		if actor.npcId != _pending_actor or actor.observationHash != _pending_observation or data.get("npcId") != _pending_actor or data.get("observationHash") != _pending_observation or data.get("status") != "TESTED": return
		var artifact: Dictionary = JSON.parse_string(_draft.text)
		if typeof(data.get("artifact")) != TYPE_DICTIONARY or JSON.stringify(data.artifact) != JSON.stringify(artifact): return
		var comparison: Variant = data.get("comparison")
		if typeof(comparison) != TYPE_DICTIONARY: return
		if comparison.get("schemaVersion") != "aurion.behavior-comparison.v1" or comparison.get("mutationAuthority") != "none" or comparison.get("execution") != "offline": return
		if comparison.get("controllerId") != artifact.get("controllerId") or comparison.get("controllerVersion") != artifact.get("version"): return
		for field in ["controllerHash", "observationHash", "comparisonHash"]:
			if not _hash_valid(comparison.get(field)): return
		_result.text = JSON.stringify(data, "\t")
		_render_graph(artifact)
		_status.text = "TESTED · Nur Offline-Vergleich. PROPOSED / VALIDATED / APPLIED / LIVE_VERIFIED: nicht erreicht."

func _render_graph(artifact: Dictionary) -> void:
	_graph.clear()
	var root := _graph.create_item()
	root.set_text(0, str(artifact.get("mode", "")) + " · Empfehlung")
	if artifact.get("mode") != "tree":
		var formula := _graph.create_item(root)
		formula.set_text(0, "Score = Bias %s + Gewichte %s × [Bedarf, Nutzen, Risiko, Kosten]" % [str(artifact.get("bias", "?")), str(artifact.get("weights", []))])
		if artifact.get("mode") == "micro-shadow":
			var activation := _graph.create_item(formula)
			activation.set_text(0, "ReLU: max(0, Score) · nur Forschung")
		for action in artifact.get("allowedActions", []):
			var offer := _graph.create_item(formula)
			offer.set_text(0, str(action))
		return
	for rule in artifact.get("rules", []):
		if typeof(rule) != TYPE_DICTIONARY: continue
		var condition := _graph.create_item(root)
		condition.set_text(0, "Risiko ≤ %s" % str(rule.get("maxRiskBps", "?")))
		var leaf := _graph.create_item(condition)
		leaf.set_text(0, str(rule.get("action", "?")))

func failed(kind: String, reason: String) -> void:
	if kind != _pending: return
	_pending = ""
	_status.text = "UNVERIFIED · " + reason + " · Keine automatische Wiederholung."

func _hash_valid(value: Variant) -> bool:
	if typeof(value) != TYPE_STRING or value.length() != 71 or not value.begins_with("sha256:"): return false
	for character in value.substr(7):
		if not character in "0123456789abcdef": return false
	return true
