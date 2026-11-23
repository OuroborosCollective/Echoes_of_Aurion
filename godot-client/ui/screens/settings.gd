extends Control
## Native editor-visible settings screen. The server readback is the only
## source for control values; this screen never persists gameplay settings.

const PlayerUiApi = preload("res://net/api/player_ui_api.gd")
const Preferences = preload("res://app/preferences.gd")

signal close_requested
signal reload_requested
signal save_requested(user_id: int, settings: Dictionary)

@onready var panel: PanelContainer = $Panel
@onready var status_label: Label = $Panel/Content/Status
@onready var revision_label: Label = $Panel/Content/Scroll/Rows/Revision
@onready var master_volume: HSlider = $Panel/Content/Scroll/Rows/MasterVolume
@onready var ui_scale: HSlider = $Panel/Content/Scroll/Rows/UiScale
@onready var movement_mode: OptionButton = $Panel/Content/Scroll/Rows/MovementMode
@onready var auto_loot: CheckBox = $Panel/Content/Scroll/Rows/AutoLoot
@onready var analytics_consent: CheckBox = $Panel/Content/Scroll/Rows/AnalyticsConsent
@onready var hotbar: GridContainer = $Panel/Content/Scroll/Rows/Hotbar
@onready var reload_button: Button = $Panel/Content/Buttons/Reload
@onready var save_button: Button = $Panel/Content/Buttons/Save
@onready var close_button: Button = $Panel/Content/Buttons/Close

var _confirmed: Dictionary = {}
var _user_id := -1
var _pending := false
var _saving := false
var _populating := false
var _hotbar_options: Array[OptionButton] = []
var _preferences = Preferences.new()
var _localizing := false

func _ready() -> void:
	visible = false
	_preferences.load_preferences()
	_localizing = true
	master_volume.value = _preferences.master_volume
	ui_scale.value = _preferences.ui_scale
	_localizing = false
	master_volume.value_changed.connect(_on_master_volume_changed)
	ui_scale.value_changed.connect(_on_ui_scale_changed)
	movement_mode.add_item("Virtueller Stick", 0)
	movement_mode.set_item_metadata(0, "joystick")
	movement_mode.add_item("Touch-to-Move", 1)
	movement_mode.set_item_metadata(1, "touch_to_move")
	for slot in range(5):
		var option := OptionButton.new()
		option.name = "Slot%d" % (slot + 1)
		option.custom_minimum_size = Vector2(54, 48)
		for command in PlayerUiApi.HOTBAR_COMMANDS:
			option.add_item(command)
		_hotbar_options.append(option)
		hotbar.add_child(option)
		option.item_selected.connect(func(_index: int): _on_draft_changed())
	movement_mode.item_selected.connect(func(_index: int): _on_draft_changed())
	auto_loot.toggled.connect(func(_value: bool): _on_draft_changed())
	analytics_consent.toggled.connect(func(_value: bool): _on_draft_changed())
	reload_button.pressed.connect(func(): reload_requested.emit())
	save_button.pressed.connect(_save_draft)
	close_button.pressed.connect(func(): close_requested.emit())
	get_viewport().size_changed.connect(_fit_layout)
	_fit_layout()
	_set_controls_enabled(false)

func open_settings() -> void:
	visible = true
	_confirmed.clear()
	_user_id = -1
	_pending = true
	_saving = false
	status_label.text = "Serverbestätigte Einstellungen werden geladen …"
	_set_controls_enabled(false)
	_fit_layout()
	close_button.grab_focus()

func close_settings() -> void:
	visible = false
	_pending = false
	_saving = false
	_confirmed.clear()
	_user_id = -1

func show_readback(readback: Dictionary, message: String = "Einstellungen serverseitig bestätigt.") -> void:
	var parsed := PlayerUiApi.parse_player_ui_readback(readback)
	if parsed.is_empty():
		show_error("Ungültiger Einstellungs-Readback. Es wurde nichts übernommen.")
		return
	_confirmed = parsed["settings"].duplicate(true)
	_user_id = int(parsed["userId"])
	_pending = false
	_saving = false
	_populating = true
	var current: Dictionary = _confirmed
	movement_mode.select(0 if current["movementMode"] == "joystick" else 1)
	auto_loot.button_pressed = bool(current["autoLoot"])
	analytics_consent.button_pressed = bool(current["analyticsConsent"])
	for slot in range(5):
		var value: String = str(current["hotbar"][slot])
		_hotbar_options[slot].select(int(value) - 1)
	revision_label.text = "Serverrevision: %d" % int(current["revision"])
	status_label.text = message
	_populating = false
	_set_controls_enabled(true)
	_update_save_state()

func show_error(message: String) -> void:
	_pending = false
	_saving = false
	status_label.text = message
	_set_controls_enabled(not _confirmed.is_empty())
	_update_save_state()

func require_reload(message: String) -> void:
	_confirmed.clear()
	_user_id = -1
	_pending = false
	_saving = false
	status_label.text = message
	_set_controls_enabled(false)

func set_loading(message: String = "Warte auf Aurion …") -> void:
	_pending = true
	_saving = false
	status_label.text = message
	_set_controls_enabled(false)

func user_id() -> int:
	return _user_id

func _on_master_volume_changed(value: float) -> void:
	if _localizing:
		return
	if not _preferences.set_master_volume(value):
		status_label.text = "Lautstärke wirkt sofort; lokales Speichern war nicht möglich."

func _on_ui_scale_changed(value: float) -> void:
	if _localizing:
		return
	if not _preferences.set_ui_scale(value):
		status_label.text = "UI-Größe wird beim nächsten Öffnen angewandt; lokales Speichern war nicht möglich."
	else:
		_apply_ui_scale(value)

func _apply_ui_scale(value: float) -> void:
	var font_size := int(round((16 if get_viewport_rect().size.x >= 520.0 else 14) * value))
	for control in [status_label, revision_label, movement_mode, auto_loot, analytics_consent, reload_button, save_button, close_button]:
		control.add_theme_font_size_override("font_size", font_size)

func is_pending() -> bool:
	return _pending

func is_saving() -> bool:
	return _saving

func _collect_draft() -> Dictionary:
	var commands: Array[String] = []
	for option in _hotbar_options:
		commands.append(option.get_item_text(option.selected))
	return {
		"revision": int(_confirmed.get("revision", -1)),
		"autoLoot": auto_loot.button_pressed,
		"analyticsConsent": analytics_consent.button_pressed,
		"hotbar": commands,
		"movementMode": str(movement_mode.get_item_metadata(movement_mode.selected)),
	}

func _on_draft_changed() -> void:
	if _populating or _pending or _confirmed.is_empty():
		return
	status_label.text = "Nicht gespeichert – Aurion speichert erst nach Bestätigung."
	_update_save_state()

func _save_draft() -> void:
	if _pending or _confirmed.is_empty() or _user_id <= 0:
		return
	var draft := _collect_draft()
	if not PlayerUiApi.valid_control_settings(draft):
		status_label.text = "Ungültige Belegung: fünf verschiedene Skills von 1 bis 9 wählen."
		return
	if _same_settings(draft, _confirmed):
		return
	_pending = true
	_saving = true
	status_label.text = "Änderungen werden serverseitig gespeichert und zurückgelesen …"
	_set_controls_enabled(false)
	save_requested.emit(_user_id, draft)

func _same_settings(left: Dictionary, right: Dictionary) -> bool:
	return (
		left.get("autoLoot") == right.get("autoLoot")
		and left.get("analyticsConsent") == right.get("analyticsConsent")
		and left.get("movementMode") == right.get("movementMode")
		and left.get("hotbar") == right.get("hotbar")
		and left.get("revision") == right.get("revision")
	)

func _update_save_state() -> void:
	if _confirmed.is_empty() or _pending:
		save_button.disabled = true
		return
	save_button.disabled = int(_confirmed.get("revision", 2000000000)) >= 2000000000 or _same_settings(_collect_draft(), _confirmed)

func _set_controls_enabled(enabled: bool) -> void:
	movement_mode.disabled = not enabled
	auto_loot.disabled = not enabled
	analytics_consent.disabled = not enabled
	for option in _hotbar_options:
		option.disabled = not enabled
	reload_button.disabled = _pending
	save_button.disabled = not enabled
	close_button.disabled = _saving

func _fit_layout() -> void:
	if not is_node_ready():
		return
	var viewport_size := get_viewport_rect().size
	var panel_size := Vector2(minf(640.0, maxf(300.0, viewport_size.x - 24.0)), minf(720.0, maxf(300.0, viewport_size.y - 24.0)))
	panel.size = panel_size
	panel.position = (viewport_size - panel_size) * 0.5
	var font_size := 16 if viewport_size.x >= 520.0 else 14
	for control in [status_label, revision_label, movement_mode, auto_loot, analytics_consent, reload_button, save_button, close_button]:
		control.add_theme_font_size_override("font_size", font_size)
	_apply_ui_scale(_preferences.ui_scale)

func _unhandled_input(event: InputEvent) -> void:
	if visible and event.is_action_pressed("ui_cancel"):
		if not _saving:
			close_requested.emit()
		get_viewport().set_input_as_handled()
