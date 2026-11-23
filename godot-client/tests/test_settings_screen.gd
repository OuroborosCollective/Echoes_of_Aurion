extends SceneTree

const SettingsScene = preload("res://ui/screens/settings.tscn")

var failures: Array[String] = []
var saved_user_id := -1
var saved_settings: Dictionary = {}
var save_count := 0

func require(condition: bool, message: String) -> void:
	if not condition:
		failures.append(message)

func _init() -> void:
	call_deferred("verify")

func verify() -> void:
	var screen: Control = SettingsScene.instantiate()
	root.add_child(screen)
	await process_frame
	screen.open_settings()
	require(screen.visible, "settings screen did not open")
	var readback := {
		"version": "aurion-ax1-ui.v1",
		"userId": 42,
		"settings": {
			"revision": 7,
			"autoLoot": true,
			"analyticsConsent": false,
			"hotbar": ["1", "2", "3", "4", "5"],
			"movementMode": "joystick",
		},
		"items": [],
		"equipment": [],
	}
	screen.save_requested.connect(_on_save_requested)
	screen.show_readback(readback)
	require(screen.user_id() == 42, "readback identity was not retained")
	require(screen.revision_label.text == "Serverrevision: 7", "confirmed revision not displayed")
	require(screen.save_button.disabled, "unchanged settings were enabled for saving")

	screen.auto_loot.button_pressed = false
	screen._on_draft_changed()
	require(not screen.save_button.disabled, "changed server control did not enable save")
	screen._save_draft()
	require(save_count == 1 and saved_user_id == 42, "save intent did not preserve readback identity")
	require(saved_settings.get("revision") == 7 and saved_settings.get("autoLoot") == false, "save intent omitted optimistic server revision or draft")
	require(screen._pending, "settings were shown as confirmed before server readback")
	require(screen.close_button.disabled, "in-flight server mutation could be closed and made ambiguous")
	require(screen.revision_label.text == "Serverrevision: 7", "revision advanced optimistically")

	var confirmed_after_save := readback.duplicate(true)
	confirmed_after_save["settings"]["revision"] = 8
	confirmed_after_save["settings"]["autoLoot"] = false
	screen.show_readback(confirmed_after_save)
	require(not screen._pending and screen.revision_label.text == "Serverrevision: 8", "new server readback did not confirm mutation")

	var before_invalid := save_count
	screen._hotbar_options[4].select(0)
	screen._on_draft_changed()
	screen._save_draft()
	require(save_count == before_invalid, "duplicate hotbar intent escaped UI validation")
	require(screen.status_label.text.contains("Ungültige Belegung"), "invalid hotbar did not explain rejection")
	screen.require_reload("Save unconfirmed")
	require(screen.user_id() == -1 and screen.save_button.disabled and not screen.reload_button.disabled, "unconfirmed state allowed a stale replay instead of requiring readback")
	screen.queue_free()
	await process_frame
	if failures.is_empty():
		print("Godot native settings screen readback and revision flow verified")
		quit(0)
	else:
		for failure in failures:
			push_error(failure)
		quit(1)

func _on_save_requested(user_id: int, settings: Dictionary) -> void:
	save_count += 1
	saved_user_id = user_id
	saved_settings = settings.duplicate(true)
