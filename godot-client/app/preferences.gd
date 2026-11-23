extends RefCounted
## Device-local preferences. These values never represent or authorize server gameplay state.

const CONFIG_PATH := "user://aurion_preferences.cfg"
const DEFAULT_MASTER_VOLUME := 0.78
const DEFAULT_UI_SCALE := 1.0
const MIN_UI_SCALE := 0.85
const MAX_UI_SCALE := 1.25

var master_volume: float = DEFAULT_MASTER_VOLUME
var ui_scale: float = DEFAULT_UI_SCALE

func load_preferences() -> void:
	var config := ConfigFile.new()
	if config.load(CONFIG_PATH) != OK:
		_apply_audio()
		return
	master_volume = clampf(float(config.get_value("audio", "master_volume", DEFAULT_MASTER_VOLUME)), 0.0, 1.0)
	ui_scale = clampf(float(config.get_value("display", "ui_scale", DEFAULT_UI_SCALE)), MIN_UI_SCALE, MAX_UI_SCALE)
	_apply_audio()

func set_master_volume(value: float) -> bool:
	if not is_finite(value):
		return false
	master_volume = clampf(value, 0.0, 1.0)
	_apply_audio()
	return _save()

func set_ui_scale(value: float) -> bool:
	if not is_finite(value):
		return false
	ui_scale = clampf(value, MIN_UI_SCALE, MAX_UI_SCALE)
	return _save()

func _apply_audio() -> void:
	var bus_index := AudioServer.get_bus_index("Master")
	if bus_index >= 0:
		AudioServer.set_bus_volume_db(bus_index, linear_to_db(maxf(master_volume, 0.0001)))

func _save() -> bool:
	var config := ConfigFile.new()
	config.set_value("audio", "master_volume", master_volume)
	config.set_value("display", "ui_scale", ui_scale)
	return config.save(CONFIG_PATH) == OK
