extends VBoxContainer
## Editor presentation. No provider credentials, apply method or world authority.
const DraftPreview = preload("res://authoring/ai_draft_preview.gd")
const AssetApi = preload("res://net/api/world_asset_api.gd")
signal status_requested
signal history_selected(draft_json: String)
var mode: OptionButton
var model: OptionButton
var chunk_x: SpinBox
var chunk_z: SpinBox
var asset_ids: LineEdit
var improve: CheckBox
var status: Label
var history: OptionButton
var preview: Node3D
var _asset_api: Node
var _server := ""
var _connection := ""
var _generation := -1
var _allow_local := false
var _preview_status: Label
var _history: Array[Dictionary] = []
var _attempted: Dictionary = {}
var _world: Dictionary = {}
var _diff: Label

func _ready() -> void:
	var heading := Label.new()
	heading.text = "Aurion AI World Designer"
	heading.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	add_child(heading)
	mode = OptionButton.new()
	for value in ["Auto", "Local", "Free", "Premium"]: mode.add_item(value)
	mode.set_item_disabled(3, true)
	add_child(mode)
	model = OptionButton.new()
	model.fit_to_longest_item = false
	model.clip_text = true
	model.add_item("Modell gemäß Server-Policy")
	model.set_item_metadata(0, "")
	add_child(model)
	var refresh := Button.new()
	refresh.text = "KI-Status und Budget prüfen"
	refresh.pressed.connect(func(): status_requested.emit())
	add_child(refresh)
	status = Label.new()
	status.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	status.text = "Provider noch nicht geprüft · Premium standardmäßig aus"
	add_child(status)
	var chunk_row := GridContainer.new()
	chunk_row.columns = 2
	add_child(chunk_row)
	for label_text in ["Chunk X", "Chunk Z"]:
		var label := Label.new()
		label.text = label_text
		chunk_row.add_child(label)
		var field := SpinBox.new()
		field.min_value = -100000
		field.max_value = 100000
		field.step = 1
		chunk_row.add_child(field)
		if label_text == "Chunk X": chunk_x = field
		else: chunk_z = field
	asset_ids = LineEdit.new()
	asset_ids.placeholder_text = "Asset-IDs, durch Komma getrennt; leer = geeigneter Katalog"
	add_child(asset_ids)
	improve = CheckBox.new()
	improve.text = "Entwurf verbessern"
	improve.tooltip_text = "Aktuellen Entwurf zur Verbesserung mitsenden"
	add_child(improve)
	history = OptionButton.new()
	history.fit_to_longest_item = false
	history.clip_text = true
	history.add_item("Vorschlagsverlauf (nur diese Sitzung)")
	history.item_selected.connect(func(index: int):
		if index > 0 and index <= _history.size(): history_selected.emit(str(_history[index - 1].draftJson)))
	add_child(history)
	var viewport_container := SubViewportContainer.new()
	viewport_container.custom_minimum_size = Vector2(280, 260)
	viewport_container.stretch = true
	add_child(viewport_container)
	var viewport := SubViewport.new()
	viewport.size = Vector2i(512, 320)
	viewport.own_world_3d = true
	viewport.render_target_update_mode = SubViewport.UPDATE_WHEN_VISIBLE
	viewport_container.add_child(viewport)
	preview = DraftPreview.new()
	preview.name = "AI_PREVIEW_ONLY"
	viewport.add_child(preview)
	var camera := Camera3D.new()
	camera.position = Vector3(42, 62, 58)
	viewport.add_child(camera)
	camera.look_at(Vector3.ZERO)
	camera.current = true
	var light := DirectionalLight3D.new()
	light.rotation_degrees = Vector3(-60, -30, 0)
	viewport.add_child(light)
	_preview_status = Label.new()
	_preview_status.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_preview_status.text = "PREVIEW_ONLY · separate Ansicht, keine gespeicherte Welt"
	add_child(_preview_status)
	_diff = Label.new()
	_diff.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	add_child(_diff)

func configure(auth: Node, server: String, connection: String, allow_local: bool) -> void:
	clear_session()
	_server = server
	_connection = connection
	_generation = auth.session_generation()
	_allow_local = allow_local
	_asset_api = AssetApi.new(auth)
	add_child(_asset_api)
	_asset_api.asset_ready.connect(_asset_ready)
	_asset_api.request_failed.connect(func(_reason: String, connection_id: String, generation: int):
		if connection_id == _connection and generation == _generation: _next_asset())

func clear_session() -> void:
	if is_instance_valid(_asset_api):
		_asset_api.cancel()
		_asset_api.queue_free()
	_asset_api = null
	_connection = ""
	_generation = -1
	_world.clear()
	_history.clear()
	_attempted.clear()
	if is_instance_valid(preview): preview.clear()
	if is_instance_valid(history):
		history.clear()
		history.add_item("Vorschlagsverlauf (nur diese Sitzung)")
	if is_instance_valid(status): status.text = "Provider noch nicht geprüft · Premium standardmäßig aus"
	if is_instance_valid(mode):
		mode.set_item_disabled(3, true)
		mode.select(0)
	if is_instance_valid(model):
		model.clear()
		model.add_item("Modell gemäß Server-Policy")
		model.set_item_metadata(0, "")
	if is_instance_valid(_diff): _diff.text = ""
	if is_instance_valid(_preview_status): _preview_status.text = "PREVIEW_ONLY · keine aktive Vorschau"

func options() -> Dictionary:
	var result := {"mode":["auto","local","free","premium"][mode.selected], "chunkX":int(chunk_x.value), "chunkZ":int(chunk_z.value), "assetIds":[]}
	var selected: String = str(model.get_item_metadata(model.selected))
	if not selected.is_empty(): result.modelId = selected
	for id in asset_ids.text.split(",", false):
		if not id.strip_edges().is_empty(): result.assetIds.append(id.strip_edges())
	return result

func provider_status(data: Dictionary) -> void:
	status.text = "Local: %s · OpenRouter: %s\nFree-Anfragen heute: %s / %s · letzte Minute: %s / 20\nPremium-Restbudget: %s · %s" % [data.get("local", {}).get("status", "OFFLINE"), data.get("openRouter", {}).get("status", data.get("status", "UNVERIFIED")), data.get("budget", {}).get("freeAttempts", "?"), data.get("freeDailyLimit", "?"), data.get("budget", {}).get("freeMinuteAttempts", "?"), _money(data.get("budget", {}).get("remainingMicros")), "gesperrt" if data.get("budget", {}).get("blocked", true) else "gemäß Serverfreigabe"]
	model.clear()
	model.add_item("Modell gemäß Server-Policy")
	model.set_item_metadata(0, "")
	for item in data.get("models", []):
		if typeof(item) == TYPE_DICTIONARY and typeof(item.get("id")) == TYPE_STRING:
			model.add_item(str(item.id) + " · " + str(item.get("tier", "unknown")))
			model.set_item_metadata(model.item_count - 1, item.id)
	mode.set_item_disabled(3, data.get("premiumEnabled") != true)
	if mode.selected == 3 and data.get("premiumEnabled") != true: mode.select(0)

func proposal(data: Dictionary) -> void:
	var audit: Dictionary = data.get("audit", {})
	status.text = "%s · %s · %s\nReserviert: %s · gemeldet: %s · Tokens: %s\nRestbudget: %s" % [data.get("status", "UNRESOLVED"), audit.get("route", "keine Route"), audit.get("actualModel", audit.get("model", "kein Modell")), _money(audit.get("reservedMicros")), _money(audit.get("actualMicros")), audit.get("tokens", "unbekannt"), _money(data.get("budget", {}).get("remainingMicros"))]
	for failure in data.get("failures", []): status.text += "\n%s: %s" % [failure.get("route", ""), failure.get("code", "UNRESOLVED")]
	for note in data.get("reviewNotes", []): status.text += "\n" + str(note)
	if data.get("status") == "AI_DRAFT" and not str(data.get("draftJson", "")).is_empty():
		_history.append({"draftJson":data.draftJson})
		if _history.size() > 20:
			_history.pop_front()
			history.remove_item(1)
		history.add_item(str(data.get("title", "KI-Entwurf")).left(100))

func set_world(world: Dictionary) -> void:
	_world = world.duplicate(true)

func stage(draft: Variant, assets: Dictionary, revision: String) -> void:
	if not is_instance_valid(preview): return
	if is_instance_valid(_asset_api): _asset_api.cancel()
	_attempted.clear()
	if not preview.stage(draft, assets, revision, _connection):
		_preview_status.text = "PREVIEW_ONLY · Entwurf oder Asset-Katalog noch ungültig"
		return
	var existing: Dictionary = {}
	for design in _world.get("designs", []):
		if design.get("designKey") == draft.designKey:
			for placement in design.get("placements", []): existing[placement.placementKey] = placement
	var added := 0
	var changed := 0
	for placement in draft.placements:
		if not existing.has(placement.placementKey): added += 1
		elif existing[placement.placementKey] != placement: changed += 1
		existing.erase(placement.placementKey)
	_diff.text = "Differenz zu gelesenem Weltstand: +%d neu · %d geändert · -%d entfernt\nPhysische Kollisionen und Passierbarkeit: UNVERIFIED" % [added, changed, existing.size()]
	_next_asset()

func _next_asset() -> void:
	_preview_status.text = preview.diagnostic
	if not is_instance_valid(_asset_api) or _asset_api.busy(): return
	for request in preview.needed_assets():
		if not _attempted.has(request.sha256):
			_attempted[request.sha256] = true
			if _asset_api.request_asset(_server, request, _connection, _allow_local): return
	_preview_status.text = preview.diagnostic

func _asset_ready(sha: String, bytes: PackedByteArray, connection: String, generation: int) -> void:
	if connection != _connection or generation != _generation: return
	preview.supply_asset(sha, bytes, connection)
	_next_asset()

func _money(micros: Variant) -> String:
	return "unbekannt" if micros == null else "%.6f USD" % (float(micros) / 1000000.0)
