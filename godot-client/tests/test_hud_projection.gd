extends SceneTree
## Real Godot nodes with synthetic v5 fixtures, not live server/device evidence.
const Fixture = preload("res://tests/fixtures/hud_fixture.gd")
const Actor = preload("res://actors/actor_view.tscn")
var failures: Array[String] = []

func require(ok: bool, message: String) -> void:
	if not ok:
		failures.append(message)

func _init() -> void:
	call_deferred("verify")

func verify() -> void:
	root.size = Vector2i(1340, 800)
	var scene: Control = (load("res://app/main.tscn") as PackedScene).instantiate()
	root.add_child(scene)
	await process_frame
	scene.set_process(false)
	scene._mobile_hud_enabled = true
	var hud: Control = scene.mobile_hud
	hud.reset()
	require(hud.health_label.text == "HP: —" and not hud.health_bar.visible, "missing state fabricated HP")
	require(hud.attack_button.disabled and hud.connection.text == "Nicht verbunden", "offline HUD allowed attack")
	var welcome := Fixture.welcome()
	require(Fixture.Codec.is_valid_welcome(welcome), "HUD fixture violates v5")
	scene._on_zone_welcome(welcome)
	scene._zone_socket.set_process(false)
	scene._zone_socket._state = "connected" # Presentation fixture only.
	scene._show_3d()
	var actor := Actor.instantiate() as Node3D
	actor.entity_id = "mob_1"
	actor.visible = true
	scene.world_actors.add_child(actor)
	scene._selected_target_id = "mob_1"
	scene._refresh_target_hud()
	require(hud.visible and not scene.target_hud.visible and not scene.world_hud.visible, "mobile/desktop HUD switch incorrect")
	require(hud.health_label.text == "HP 17 / 20" and hud.stamina_label.text == "Ausdauer 8 / 10", "confirmed vitals not projected")
	require(hud.target_name.text == "Ziel: mob_1" and hud.target_health.text == "HP 7 / 10", "confirmed selected target not projected")
	require(not hud.attack_button.disabled, "confirmed living target did not enable attack")
	var before: Dictionary = scene._confirmed_zone.current_state()
	var invalid := Fixture.snapshot(welcome, 1)
	invalid["combatants"][0]["health"] = 3
	scene._on_zone_snapshot(invalid)
	scene._refresh_target_hud()
	require(hud.health_label.text == "HP 17 / 20" and scene._confirmed_zone.current_state() == before, "stale snapshot changed HUD or confirmed state")
	var missing := Fixture.snapshot(welcome, 2)
	missing["combatants"] = []
	scene._on_zone_snapshot(missing)
	scene._refresh_target_hud()
	require(hud.health_label.text == "HP: —" and not hud.health_bar.visible, "missing combatant retained old HP")
	var dead := Fixture.snapshot(welcome, 3)
	dead["combatants"][0]["health"] = 0
	dead["combatants"][0]["alive"] = false
	scene._on_zone_snapshot(dead)
	scene._refresh_target_hud()
	require(hud.connection.text == "Besiegt · Aurion" and hud.attack_button.disabled, "confirmed death not distinguished")
	scene._world_is_stale = true
	scene._refresh_target_hud()
	require(hud.connection.text == "Stand veraltet" and hud.attack_button.disabled, "stale data remained actionable")
	scene._world_is_stale = false
	var revived := Fixture.snapshot(welcome, 4)
	scene._on_zone_snapshot(revived)
	scene._refresh_target_hud()
	for sequence in range(1, 11):
		scene._on_zone_combat({"tick": sequence, "sequence": sequence, "attackerEntityId": "player:1", "defenderEntityId": "mob_1", "hit": true, "crit": false, "killed": false, "damage": sequence})
	var latest_expiry: int = scene._combat_notice_expires_at_ms
	scene._expire_combat_notice(latest_expiry - 1)
	scene._refresh_target_hud()
	require(hud.notice.visible and hud.notice_text.text.contains("10 Schaden"), "new combat message lost its own lifetime")
	scene._expire_combat_notice(latest_expiry)
	scene._refresh_target_hud()
	require(not hud.notice.visible, "combat notice did not expire")
	for viewport in [Vector2i(1340, 800), Vector2i(800, 1340), Vector2i(640, 360), Vector2i(360, 640)]:
		root.size = viewport
		await process_frame
		await process_frame
		var safe := Rect2(20, 24, viewport.x - 40, viewport.y - 48)
		hud.fit_layout(Vector2(viewport), safe)
		await process_frame
		for control: Control in [hud.player, hud.target, hud.menu_button, hud.attack_button]:
			var rect: Rect2 = control.get_global_rect()
			require(safe.encloses(rect), "HUD outside safe area at %s: %s" % [viewport, control.name])
		require(not hud.player.get_global_rect().intersects(hud.target.get_global_rect()), "player and target overlap at %s" % viewport)
		require(not hud.menu_button.get_global_rect().intersects(hud.target.get_global_rect()), "menu and target overlap at %s" % viewport)
		for label: Label in [hud.health_label, hud.stamina_label, hud.connection, hud.target_health]:
			var width: float = label.get_theme_font("font").get_string_size(label.text, HORIZONTAL_ALIGNMENT_LEFT, -1, label.get_theme_font_size("font_size")).x
			require(width <= label.size.x, "confirmed value text clipped at %s: %s" % [viewport, label.text])
		require(hud.attack_button.size.x >= 48.0 and hud.attack_button.size.y >= 48.0, "attack touch target too small")
	root.size = Vector2i(1340, 800)
	await process_frame
	await process_frame
	scene._fit_layout()
	hud.fit_layout(Vector2(1340, 800), Rect2(0, 0, 1340, 800), 1.5)
	await process_frame
	require(hud.menu_button.size.y >= 72.0 and hud.attack_button.size.x >= 72.0, "48 dp touch target did not scale with density")
	scene._fit_layout()
	var touch := InputEventScreenTouch.new()
	touch.index = 35
	touch.position = hud.attack_button.get_global_rect().get_center()
	touch.pressed = true
	scene._input(touch)
	require(scene._camera_router.active_finger() == -1, "HUD attack touch captured by camera")
	hud.menu_button.pressed.emit()
	require(hud.menu_is_open() and not scene.mobile_joystick.visible and not scene._world_input_permitted(), "menu failed to suspend gameplay input")
	scene._handle_mobile_back()
	require(not hud.menu_is_open() and scene.mobile_joystick.visible, "Android back did not close menu first")
	scene._handle_mobile_back()
	require(hud.exit_confirmation.visible and not scene._world_input_permitted(), "Android back did not open exit confirmation")
	scene._handle_mobile_back()
	require(not hud.exit_confirmation.visible and scene.mobile_joystick.visible, "Android back did not close confirmation")
	scene._toggle_world_diagnostics()
	require(scene.world_hud.visible and not hud.visible, "diagnostics not reachable from mobile")
	scene._handle_mobile_back()
	require(hud.visible and not scene.world_hud.visible, "Android back did not return from diagnostics")
	scene._reset_projection()
	require(not hud.visible and hud.health_label.text == "HP: —" and hud.attack_button.disabled, "disconnect retained HUD data")
	scene.queue_free()
	await process_frame
	for failure in failures:
		push_error(failure)
	if failures.is_empty():
		print("G22_NATIVE_HUD_PROJECTION_TOUCH_PASS (synthetic fixtures; no physical device)")
	quit(0 if failures.is_empty() else 1)
