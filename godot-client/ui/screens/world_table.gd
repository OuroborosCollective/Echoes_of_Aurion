extends Control
## Actor-scoped read-only worldtable. Local sketches never call an apply gateway.
signal closed
const Api = preload("res://net/api/chunk_surface_api.gd")
const TableProjection = preload("res://world/world_table_projection.gd")
const Slice = preload("res://projection/world_slice.gd")
const VIEW_TTL_MS := 5000
var _api: Node
var _auth: Node
var _server := ""
var _connection := ""
var _actor := ""
var _generation := -1
var _coordinate := Vector2i.ZERO
var _allow_local := false
var _received_at := -1
var _status: Label
var _view: SubViewportContainer
var _viewport: SubViewport
var _projection: Node3D
var _camera: Camera3D
var _yaw := 0.0
var _pitch := 0.9
var _distance := 80.0
var _focus_height := 0.0
var _fingers: Dictionary = {}
var _reply: Dictionary = {}
var _ghost: MeshInstance3D
var _ghost_x: SpinBox
var _ghost_z: SpinBox
var _turn := false
var _refresh_button: Button
var _sketch_button: Button

func _ready() -> void:
	hide()
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP
	var background := ColorRect.new()
	background.color = Color(0.025, 0.04, 0.055)
	background.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(background)
	var margin := MarginContainer.new()
	margin.name = "SafeArea"
	margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(margin)
	resized.connect(_fit_safe_area)
	var scroll := ScrollContainer.new()
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	margin.add_child(scroll)
	var stack := VBoxContainer.new()
	stack.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	scroll.add_child(stack)
	var heading := Label.new()
	heading.text = "Aurions Weltentisch"
	stack.add_child(heading)
	var actions := HFlowContainer.new()
	stack.add_child(actions)
	_button(actions, "Zur Spielfigur", close)
	_refresh_button = _button(actions, "Erneut lesen", refresh)
	_button(actions, "Flache Karte", func():
		_projection.flat = not _projection.flat
		_clear_ghost()
		_projection.rebuild()
		_update_camera())
	_button(actions, "Strukturpunkte", func():
		_clear_ghost()
		_projection.show_structures = not _projection.show_structures
		_projection.rebuild())
	_button(actions, "Wege", func():
		_clear_ghost()
		_projection.show_roads = not _projection.show_roads
		_projection.rebuild())
	_status = Label.new()
	_status.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	stack.add_child(_status)
	_view = SubViewportContainer.new()
	_view.stretch = true
	_view.custom_minimum_size = Vector2(240, 300)
	_view.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_view.gui_input.connect(_view_input)
	stack.add_child(_view)
	_viewport = SubViewport.new()
	_viewport.size = Vector2i(640, 360)
	_viewport.own_world_3d = true
	_viewport.render_target_update_mode = SubViewport.UPDATE_DISABLED
	_view.add_child(_viewport)
	_projection = TableProjection.new()
	_viewport.add_child(_projection)
	_camera = Camera3D.new()
	_camera.far = 300.0
	_camera.current = true
	_viewport.add_child(_camera)
	var controls := HFlowContainer.new()
	stack.add_child(controls)
	_button(controls, "Drehen links", func(): orbit(Vector2(-60,0)))
	_button(controls, "Drehen rechts", func(): orbit(Vector2(60,0)))
	_button(controls, "Näher", func(): zoom(0.85))
	_button(controls, "Weiter", func(): zoom(1.15))
	var cut_label := Label.new()
	cut_label.text = "Höhenfilter: 100 m"
	controls.add_child(cut_label)
	var cut := HSlider.new()
	cut.min_value = -100
	cut.max_value = 100
	cut.value = 100
	cut.custom_minimum_size = Vector2(180,48)
	cut.tooltip_text = "Nur bestätigte Oberflächen unter der Schnitthöhe zeigen; keine unterirdischen Daten"
	cut.value_changed.connect(func(value: float):
		cut_label.text = "Höhenfilter: %d m" % int(value)
		_projection.cut_height = value
		_clear_ghost()
		_projection.rebuild())
	controls.add_child(cut)
	var draft := HFlowContainer.new()
	stack.add_child(draft)
	var draft_label := Label.new()
	draft_label.text = "Lokale Hausskizze · Kachel X/Z"
	draft.add_child(draft_label)
	_ghost_x = _spin(draft)
	_ghost_z = _spin(draft)
	_button(draft, "Skizze drehen", func():
		_turn = not _turn
		_clear_ghost())
	_sketch_button = _button(draft, "Skizze anzeigen", sketch)
	var apply := _button(draft, "Bauen gesperrt", func(): pass)
	apply.disabled = true
	var limits := Label.new()
	limits.text = "Skizzen sind ungespeichert und ungeprüft. Bauen benötigt einen Spieler-Plan mit Materialbindung. Kreaturenhilfe benötigt einen bestätigten Kooperationsauftrag. Transport benötigt eine berechtigte Route und Reservation. Diese Aktionen sind noch nicht verfügbar."
	limits.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	stack.add_child(limits)
	_fit_safe_area()
	_update_camera()

func _fit_safe_area() -> void:
	var safe := Rect2(DisplayServer.get_display_safe_area())
	var bounds := Rect2(Vector2.ZERO, size)
	if safe.size.x <= 0 or safe.size.y <= 0 or DisplayServer.get_name() == "headless":
		safe = bounds
	else:
		var screen := Vector2(DisplayServer.screen_get_size())
		if screen.x > 0 and screen.y > 0:
			safe = Rect2(safe.position * size / screen, safe.size * size / screen).intersection(bounds)
	var margin := get_node_or_null("SafeArea") as MarginContainer
	if margin == null:
		return
	margin.add_theme_constant_override("margin_left", int(maxf(12, safe.position.x)))
	margin.add_theme_constant_override("margin_top", int(maxf(12, safe.position.y)))
	margin.add_theme_constant_override("margin_right", int(maxf(12, size.x - safe.end.x)))
	margin.add_theme_constant_override("margin_bottom", int(maxf(12, size.y - safe.end.y)))

func _button(parent: Node, text: String, callback: Callable) -> Button:
	var button := Button.new()
	button.text = text
	button.custom_minimum_size = Vector2(0,48)
	button.pressed.connect(callback)
	parent.add_child(button)
	return button

func _spin(parent: Node) -> SpinBox:
	var field := SpinBox.new()
	field.min_value = 1
	field.max_value = 14
	field.value = 8
	field.custom_minimum_size = Vector2(85,48)
	field.value_changed.connect(func(_value: float): _clear_ghost())
	parent.add_child(field)
	return field

func open_table(auth: Node, server: String, connection: String, actor: String, coordinate: Vector2i, allow_local: bool = false) -> void:
	close_session()
	_auth = auth
	_server = server
	_connection = connection
	_actor = actor
	_coordinate = coordinate
	_allow_local = allow_local
	_generation = auth.session_generation()
	_api = Api.new(auth, "/api/game/world-slice")
	add_child(_api)
	_api.surface_ready.connect(_on_slice)
	_api.request_failed.connect(func(_reason: String, _id: String):
		_clear_data()
		_status.text = "Weltstand derzeit nicht belegbar. Erneut lesen oder zur Spielfigur zurückkehren.")
	show()
	_refresh_button.grab_focus()
	_viewport.render_target_update_mode = SubViewport.UPDATE_WHEN_VISIBLE
	refresh()

func refresh() -> void:
	_clear_data()
	_status.text = "Aurion-Weltstand wird gelesen …"
	if _api != null:
		_api.cancel()
	if _api == null or not _api.request_surface(_server, _connection, _coordinate, _allow_local):
		_status.text = "Weltstand nicht verfügbar."

func _on_slice(reply: Dictionary, connection: String, generation: int, coordinate: Vector2i) -> void:
	if not visible:
		return
	if not _session_valid():
		close()
		return
	if connection != _connection or coordinate != _coordinate or generation != _generation:
		return
	if not _projection.apply_confirmed(reply, _actor, _connection, _coordinate):
		_clear_data()
		_status.text = "Weltstand abgelehnt."
		return
	_reply = reply.duplicate(true)
	_received_at = Time.get_ticks_msec()
	_focus_height = 0.0
	if reply.status == "VERIFIED":
		for tile in reply.slice.chunks[0].tiles:
			_focus_height += float(tile.heightMm) / 256000.0
	_update_camera()
	_sketch_button.disabled = reply.status != "VERIFIED"
	_status.text = "Noch keine bestätigte Entdeckung an dieser Position." if reply.status == "FOGGED" else "Bestätigte Entdeckung · Tick %d · Geländeflächen, goldene Strukturpunkte, Wege und eigene Position. Ziehen: drehen · zwei Finger: zoomen." % int(reply.slice.observedAtTick)

func _session_valid() -> bool:
	return _auth != null and _auth.protected_response_allowed() and _auth.session_generation() == _generation

func reconcile(connection: String, actor: String, coordinate: Vector2i, stale: bool) -> void:
	if visible and (stale or connection != _connection or actor != _actor or coordinate != _coordinate or not _session_valid()):
		close()

func _process(_delta: float) -> void:
	if not visible:
		return
	if not _session_valid():
		close()
	else:
		_expire_view(Time.get_ticks_msec())

func _expire_view(now_ms: int) -> void:
	if _received_at >= 0 and now_ms - _received_at > VIEW_TTL_MS:
		_clear_data()
		_status.text = "Ansicht abgelaufen. Erneut lesen."

func _clear_data() -> void:
	_received_at = -1
	_reply.clear()
	_fingers.clear()
	_clear_ghost()
	if _projection != null:
		_projection.clear()
	if _sketch_button != null:
		_sketch_button.disabled = true

func _clear_ghost() -> void:
	if is_instance_valid(_ghost):
		if _ghost.get_parent() != null:
			_ghost.get_parent().remove_child(_ghost)
		_ghost.queue_free()
	_ghost = null

func sketch() -> void:
	_clear_ghost()
	if _reply.is_empty() or _reply.status != "VERIFIED" or _received_at < 0 or Time.get_ticks_msec() - _received_at > VIEW_TTL_MS:
		return
	var x := int(_ghost_x.value)
	var z := int(_ghost_z.value)
	var tile: Dictionary = {}
	for candidate in _reply.slice.chunks[0].tiles:
		if int(candidate.x) == x and int(candidate.z) == z:
			tile = candidate
			break
	if tile.is_empty() or float(tile.heightMm) / 1000.0 > _projection.cut_height:
		return
	_ghost = MeshInstance3D.new()
	var box := BoxMesh.new()
	# Homestead footprint from aurionOpenWorldPlaceProtocol, presentation only.
	box.size = Vector3(5.0 if _turn else 6.0, 0.08, 6.0 if _turn else 5.0)
	_ghost.mesh = box
	var material := StandardMaterial3D.new()
	material.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	material.albedo_color = Color(0.3,0.8,1,0.4)
	material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	_ghost.material_override = material
	_ghost.position = Vector3(float(x)*4.0-30.0, 0.2 if _projection.flat else float(tile.heightMm)/1000.0+0.2, float(z)*4.0-30.0)
	_projection.add_child(_ghost)

func orbit(delta: Vector2) -> void:
	if not delta.is_finite():
		return
	_yaw = wrapf(_yaw - delta.x * 0.006, -PI, PI)
	_pitch = clampf(_pitch - delta.y * 0.006, 0.25, 1.5)
	_update_camera()

func zoom(factor: float) -> void:
	if is_nan(factor) or is_inf(factor) or factor <= 0:
		return
	_distance = clampf(_distance * factor, 25.0, 180.0)
	_update_camera()

func _update_camera() -> void:
	if _camera == null:
		return
	_camera.projection = Camera3D.PROJECTION_ORTHOGONAL if _projection.flat else Camera3D.PROJECTION_PERSPECTIVE
	_camera.size = _distance
	var focus := Vector3(0, 0 if _projection.flat else _focus_height, 0)
	_camera.position = focus + (Vector3(0, _distance, 0.01) if _projection.flat else Vector3(sin(_yaw)*cos(_pitch), sin(_pitch), cos(_yaw)*cos(_pitch))*_distance)
	_camera.look_at(focus, Vector3.UP)

func _view_input(event: InputEvent) -> void:
	if event is InputEventScreenTouch:
		if event.pressed and (_fingers.has(event.index) or _fingers.size() < 2):
			_fingers[event.index] = event.position
		else:
			_fingers.erase(event.index)
	elif event is InputEventScreenDrag and _fingers.has(event.index):
		if _fingers.size() == 1:
			orbit(event.relative)
		else:
			var other: int = _fingers.keys()[0] if _fingers.keys()[0] != event.index else _fingers.keys()[1]
			var previous: float = (_fingers[event.index] as Vector2).distance_to(_fingers[other])
			var current: float = event.position.distance_to(_fingers[other])
			if current > 1.0:
				zoom(previous/current)
		_fingers[event.index] = event.position
	elif event is InputEventMouseMotion and event.button_mask & MOUSE_BUTTON_MASK_LEFT:
		orbit(event.relative)
	elif event is InputEventMouseButton and event.pressed:
		if event.button_index == MOUSE_BUTTON_WHEEL_UP:
			zoom(0.9)
		elif event.button_index == MOUSE_BUTTON_WHEEL_DOWN:
			zoom(1.1)
	_view.accept_event()

func close() -> void:
	close_session()
	closed.emit()

func close_session() -> void:
	if _api != null:
		_api.cancel()
		_api.queue_free()
		_api = null
	_clear_data()
	_connection = ""
	_actor = ""
	_generation = -1
	if _viewport != null:
		_viewport.render_target_update_mode = SubViewport.UPDATE_DISABLED
	hide()
