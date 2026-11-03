extends Control
## Safe-area controls. All signals are presentation choices, never game intents.
signal return_requested
signal zoom_requested(factor: float)
signal category_changed(category: String, enabled: bool)
signal ceiling_changed(height: float)
signal transparency_changed(enabled: bool)
signal fallback_changed(enabled: bool)
signal controls_changed
var _bar := PanelContainer.new()
var _settings := PanelContainer.new()
var _status := Label.new()
var _buttons: Array[Control] = []
var _settings_open := false
func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(_bar)
	var bar := HBoxContainer.new()
	_bar.add_child(bar)
	_status.text = "Lädt Ausschnitt"
	_status.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_status.max_lines_visible = 2
	_status.clip_text = true
	_status.custom_minimum_size = Vector2(80, 48)
	_status.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_status.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	bar.add_child(_status)
	_button(bar, "Ansicht", func():
		_settings_open = not _settings_open
		_settings.visible = _settings_open
		controls_changed.emit())
	_button(bar, "Spieler", func(): return_requested.emit())
	add_child(_settings)
	var scroll := ScrollContainer.new()
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	_settings.add_child(scroll)
	var content := VBoxContainer.new()
	content.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	scroll.add_child(content)
	_button(content, "Näher", func(): zoom_requested.emit(1.25))
	_button(content, "Weiter", func(): zoom_requested.emit(0.8))
	_check(content, "2D-Karte / Render-Fallback", false, func(on: bool): fallback_changed.emit(on))
	for item in [["terrain", "Gelände"], ["structures", "Bauten (Positionsmarker)"], ["roads", "Wege"], ["self", "Eigene Position"]]:
		_check(content, item[1], true, func(on: bool): category_changed.emit(item[0], on))
	_check(content, "Bauten-Marker transparent", false, func(on: bool): transparency_changed.emit(on))
	var cut := CheckButton.new()
	cut.text = "Höhenschnitt aktiv"
	content.add_child(cut)
	_buttons.append(cut)
	var slider := HSlider.new()
	slider.min_value = -100
	slider.max_value = 100
	slider.step = 1
	slider.value = 10
	slider.custom_minimum_size.y = 48
	slider.accessibility_name = "Schnitthöhe in Metern"
	content.add_child(slider)
	_buttons.append(slider)
	var cut_label := Label.new()
	cut_label.text = "Schnitthöhe: 10 m"
	content.add_child(cut_label)
	cut.toggled.connect(func(on: bool): ceiling_changed.emit(slider.value if on else INF))
	slider.value_changed.connect(func(value: float):
		cut_label.text = "Schnitthöhe: %d m" % int(value)
		if cut.button_pressed: ceiling_changed.emit(value))
	var note := Label.new()
	note.text = "Nur der freigegebene Ausschnitt. Bauten sind Positionsmarker. Schnitt blendet bekannte Flächen aus; keine Untergrunddaten."
	note.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	content.add_child(note)
	_settings.visible = false
func _button(parent: Node, text: String, action: Callable) -> void:
	var button := Button.new()
	button.text = text
	parent.add_child(button)
	_buttons.append(button)
	button.pressed.connect(action)
func _check(parent: Node, text: String, pressed: bool, action: Callable) -> void:
	var button := CheckButton.new()
	button.text = text
	button.button_pressed = pressed
	parent.add_child(button)
	_buttons.append(button)
	button.toggled.connect(action)
func set_readback_status(state: String) -> void:
	# Short, complete knowledge states remain legible beside touch buttons on
	# narrow viewports. An unknown state never implies verified geometry.
	_status.text = {"VERIFIED":"Chunk bestätigt", "FOGGED":"Unbekannt", "LOADING":"Lädt Ausschnitt"}.get(state, "Nicht bestätigt")
func fit_layout(safe: Rect2, density: float = 1.0) -> void:
	var scale_factor := clampf(density, 1.0, 2.0)
	var margin := 16.0 * scale_factor
	var width := maxf(160.0, safe.size.x - 2.0 * margin)
	_bar.position = safe.position + Vector2.ONE * margin
	_bar.size = Vector2(width, 64.0 * scale_factor)
	_settings.position = Vector2(safe.end.x - margin - minf(width, 350.0 * scale_factor), _bar.position.y + _bar.size.y + margin)
	_settings.size = Vector2(minf(width, 350.0 * scale_factor), maxf(80.0, safe.end.y - margin - _settings.position.y))
	for button in _buttons:
		button.custom_minimum_size.y = 48.0 * scale_factor
		button.add_theme_font_size_override("font_size", roundi(16.0 * scale_factor))
func exclusions() -> Array[Rect2]:
	var result: Array[Rect2] = [_bar.get_global_rect()]
	if _settings.visible: result.append(_settings.get_global_rect())
	return result
