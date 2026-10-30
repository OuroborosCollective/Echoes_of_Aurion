extends Control
## Mobile presentation of validated Aurion zone records. No gameplay state is
## predicted here; buttons emit intents to the existing main scene.
signal attack_requested
signal diagnostics_requested
signal menu_changed(open: bool)
signal exit_requested

@onready var player: Control = $Player
@onready var player_name: Label = $Player/Content/PlayerName
@onready var health_label: Label = $Player/Content/HealthLabel
@onready var health_bar: ProgressBar = $Player/Content/HealthBar
@onready var stamina_label: Label = $Player/Content/StaminaLabel
@onready var connection: Label = $Player/Content/Connection
@onready var target: Control = $Target
@onready var target_name: Label = $Target/Content/TargetName
@onready var target_health: Label = $Target/Content/TargetHealth
@onready var menu_button: Button = $MenuButton
@onready var attack_button: Button = $AttackButton
@onready var menu_panel: Control = $MenuPanel
@onready var notice: Control = $Notice
@onready var notice_text: Label = $Notice/Text
@onready var exit_confirmation: ConfirmationDialog = $ExitConfirmation

func _ready() -> void:
	menu_button.pressed.connect(func(): set_menu_open(not menu_panel.visible))
	attack_button.pressed.connect(func(): attack_requested.emit())
	$MenuPanel/Content/Close.pressed.connect(func(): set_menu_open(false))
	$MenuPanel/Content/Diagnostics.pressed.connect(func():
		set_menu_open(false)
		diagnostics_requested.emit())
	exit_confirmation.confirmed.connect(func(): exit_requested.emit())

func set_menu_open(open: bool) -> void:
	if menu_panel.visible == open:
		return
	menu_panel.visible = open
	menu_changed.emit(open)

func menu_is_open() -> bool:
	return menu_panel.visible

func close_transient() -> bool:
	if exit_confirmation.visible:
		exit_confirmation.hide()
		return true
	if menu_is_open():
		set_menu_open(false)
		return true
	return false

func request_exit_confirmation() -> void:
	exit_confirmation.popup_centered()

func reset() -> void:
	set_menu_open(false)
	exit_confirmation.hide()
	player_name.text = "Spieler: —"
	health_label.text = "HP: —"
	stamina_label.text = "Ausdauer: —"
	health_bar.visible = false
	connection.text = "Nicht verbunden"
	target_name.text = "Ziel: keines"
	target_health.text = ""
	attack_button.disabled = true
	notice.visible = false

func render_projection(zone: Variant, entities: Variant, selected: String, stale: bool, attack_enabled: bool, message: String) -> void:
	if zone == null or not zone.has_state():
		reset()
		return
	var self_id: String = zone.self_entity_id()
	var self_record: Dictionary = entities.record("combatants", self_id)
	player_name.text = "Spieler: " + self_id
	if self_record.is_empty():
		health_label.text = "HP: —"
		stamina_label.text = "Ausdauer: —"
		health_bar.visible = false
	else:
		player_name.text += " · Stufe %d" % int(self_record["combatLevel"])
		health_label.text = "HP %d / %d" % [int(self_record["health"]), int(self_record["maxHealth"])]
		stamina_label.text = "Ausdauer %d / %d" % [int(self_record["stamina"]), int(self_record["maxStamina"])]
		health_bar.max_value = int(self_record["maxHealth"])
		health_bar.value = int(self_record["health"])
		health_bar.visible = true
	connection.text = "Stand veraltet" if stale else ("Besiegt · Aurion" if not self_record.is_empty() and not bool(self_record["alive"]) else "Aurion verbunden")
	var selected_record: Dictionary = entities.record("mobs", selected)
	if selected_record.is_empty():
		selected_record = entities.record("combatants", selected)
	if selected.is_empty() or (selected_record.is_empty() and entities.record("presences", selected).is_empty()):
		target_name.text = "Ziel: keines"
		target_health.text = ""
	else:
		target_name.text = "Ziel: " + selected
		target_health.text = "HP %d / %d" % [int(selected_record["health"]), int(selected_record["maxHealth"])] if selected_record.has("health") else ""
	attack_button.disabled = not attack_enabled or stale or menu_is_open() or (not self_record.is_empty() and not bool(self_record["alive"]))
	notice_text.text = message
	notice.visible = not message.is_empty()

func fit_layout(view_size: Vector2, safe_area: Rect2, density: float = 1.0) -> void:
	var bounds := Rect2(Vector2.ZERO, view_size)
	var safe := bounds.intersection(safe_area)
	if safe.size.x < 160.0 or safe.size.y < 160.0:
		safe = bounds
	var scale_factor := clampf(density, 1.0, 2.0)
	var font_size := roundi(16.0 * scale_factor)
	for label: Control in [player_name, health_label, stamina_label, connection, target_name, target_health, menu_button, attack_button, $MenuPanel/Content/Diagnostics, $MenuPanel/Content/QuestAvailability, $MenuPanel/Content/Close, notice_text]:
		label.add_theme_font_size_override("font_size", font_size)
	$MenuPanel/Content/Diagnostics.custom_minimum_size.y = 48.0 * scale_factor
	$MenuPanel/Content/Close.custom_minimum_size.y = 48.0 * scale_factor
	var margin := 16.0 * scale_factor
	var usable_width := maxf(0.0, safe.size.x - 2.0 * margin)
	var menu_width := 64.0 * scale_factor
	var card_space := maxf(0.0, usable_width - menu_width - 16.0 * scale_factor)
	var player_width := minf(330.0 * scale_factor, card_space * 0.52)
	var target_width := minf(260.0 * scale_factor, card_space - player_width)
	var top := safe.position.y + margin
	_place(player, Rect2(safe.position.x + margin, top, player_width, 110.0 * scale_factor))
	_place(menu_button, Rect2(safe.end.x - margin - menu_width, top, menu_width, 48.0 * scale_factor))
	_place(target, Rect2(safe.end.x - margin - menu_width - 8.0 * scale_factor - target_width, top, target_width, 60.0 * scale_factor))
	var action_size := clampf(safe.size.y * 0.12, 64.0 * scale_factor, 96.0 * scale_factor)
	_place(attack_button, Rect2(safe.end.x - margin - action_size, safe.end.y - margin - action_size, action_size, action_size))
	var menu_panel_width := minf(240.0 * scale_factor, usable_width)
	_place(menu_panel, Rect2(safe.end.x - margin - menu_panel_width, top + 56.0 * scale_factor, menu_panel_width, 155.0 * scale_factor))
	var notice_width := minf(360.0 * scale_factor, usable_width * 0.55)
	_place(notice, Rect2(safe.position.x + (safe.size.x - notice_width) * 0.5, top + 120.0 * scale_factor, notice_width, 40.0 * scale_factor))

func _place(control: Control, rect: Rect2) -> void:
	control.position = rect.position
	control.size = rect.size

func style_joystick(joystick: Control) -> void:
	var base := StyleBoxFlat.new()
	base.bg_color = Color(0.035, 0.07, 0.075, 0.82)
	base.border_color = Color(0.69, 0.53, 0.25, 0.9)
	base.set_border_width_all(2)
	base.set_corner_radius_all(64)
	var tip := StyleBoxFlat.new()
	tip.bg_color = Color(0.14, 0.21, 0.20, 0.95)
	tip.border_color = Color(0.9, 0.69, 0.32, 1)
	tip.set_border_width_all(2)
	tip.set_corner_radius_all(28)
	joystick.get_node("Base").add_theme_stylebox_override("panel", base)
	joystick.get_node("Base/Tip").add_theme_stylebox_override("panel", tip)

func touch_exclusions() -> Array[Rect2]:
	var result: Array[Rect2] = []
	for control: Control in [player, target, menu_button, attack_button, menu_panel]:
		if control.visible:
			result.append(control.get_global_rect())
	return result
