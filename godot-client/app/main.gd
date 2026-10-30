extends Control

const RuntimeConfig = preload("res://config/runtime_config.gd")
const NativeAuthStart = preload("res://net/auth/native_auth_start.gd")
const AurionApi = preload("res://net/api/aurion_api.gd")
const ZoneSocket = preload("res://net/zone_socket.gd")
const SessionLifecycle = preload("res://app/session_lifecycle.gd")
const TechnicalDiagnostics = preload("res://app/technical_diagnostics.gd")
const ReconnectPolicy = preload("res://net/reconnect_policy.gd")
const ZoneState = preload("res://projection/zone_state.gd")
const EntityRegistry = preload("res://projection/entity_registry.gd")
const SnapshotInterpolator = preload("res://projection/snapshot_interpolator.gd")
const NativeIntentBridge = preload("res://platform/android/native_intent_bridge.gd")
const AppearanceApi = preload("res://net/api/appearance_api.gd")
const AppearanceResolver = preload("res://actors/appearance_resolver.gd")
const ActorScene = preload("res://actors/actor_view.tscn")
const RemoteActorRegistry = preload("res://actors/remote_actor_registry.gd")
const PublicAppearanceApi = preload("res://net/api/public_actor_appearance_api.gd")
const QuestNpcApi = preload("res://net/api/quest_npc_api.gd")
const QuestNpcRegistry = preload("res://actors/quest_npc_registry.gd")
const ChunkSurfaceApi = preload("res://net/api/chunk_surface_api.gd")
const ChunkTerrain = preload("res://world/chunk_terrain.gd")
const WorldDesignProjection = preload("res://world/world_design_projection.gd")
const WorldAssetApi = preload("res://net/api/world_asset_api.gd")
const WorldStudio = preload("res://ui/screens/world_authoring_studio.gd")
const Terrain3DConfirmed = preload("res://world/terrain3d_confirmed.gd")
const InputAdapter = preload("res://app/input_adapter.gd")
const TouchRouter = preload("res://ui/mobile/touch_router.gd")
const PUBLIC_APPEARANCE_REFRESH_MS := 10000
const COMBAT_NOTICE_DURATION_MS := 2000
const WORLD_STALE_AFTER_MS := 1000
const STARS := [Vector2(0.08, 0.13), Vector2(0.19, 0.65), Vector2(0.33, 0.09), Vector2(0.53, 0.85), Vector2(0.67, 0.18), Vector2(0.79, 0.11), Vector2(0.88, 0.38), Vector2(0.94, 0.73), Vector2(0.72, 0.67)]

@onready var card: PanelContainer = %LaunchCard
@onready var title: Label = %Title
@onready var status: Label = %ConnectionStatus
@onready var combat_notice: Label = %CombatNotice
@onready var confirmed_position: Label = %ConfirmedPosition
@onready var confirmed_vitals: Label = %ConfirmedVitals
@onready var confirmed_health_meter: ProgressBar = %ConfirmedHealthMeter
@onready var confirmed_stamina_meter: ProgressBar = %ConfirmedStaminaMeter
@onready var entity_summary: Label = %EntitySummary
@onready var map_panel: VBoxContainer = %MapPanel
@onready var zone_map: Control = %ZoneMap
@onready var map_selection: Label = %MapSelection
@onready var destination: Label = %Destination
@onready var login: Button = %Login
@onready var development_notice: Label = $SafeMargin/Scroll/Center/LaunchCard/Content/DevelopmentNotice
@onready var world_view: SubViewportContainer = %WorldView
@onready var world_hud: MarginContainer = %WorldHUD
@onready var world_status: Label = %WorldStatus
@onready var world_toggle: Button = %WorldToggle
@onready var world_actors: Node3D = %Actors
@onready var quest_npc_root: Node3D = %QuestNPCs
@onready var live_3d_viewport: SubViewport = $WorldView/Live3D
@onready var mobile_joystick: Control = $MobileJoystick
@onready var mobile_hud: Control = $MobileHUD
@onready var world_camera: Camera3D = %WorldCamera
@onready var target_hud: Control = $TargetHUD
@onready var target_label: Label = %TargetLabel
@onready var world_action: Button = %WorldAction
@onready var _initial_world_camera_transform: Transform3D = %WorldCamera.transform
@onready var unassigned_floor: MeshInstance3D = $WorldView/Live3D/World/UnassignedFloor
@onready var confirmed_terrain: Node3D = $WorldView/Live3D/World/ConfirmedTerrain
@onready var confirmed_neighbors: Node3D = $WorldView/Live3D/World/ConfirmedNeighbors
@onready var starter_village_visuals: Node3D = $WorldView/Live3D/World/StarterVillageVisuals
@onready var terrain3d_host: Node3D = $WorldView/Live3D/World/ConfirmedTerrain3D

var _diagnostics = TechnicalDiagnostics.new()
var _movement = InputAdapter.new()
var _camera_router = TouchRouter.new()
var _mobile_hud_enabled := OS.has_feature("mobile")
var _selected_target_id := ""
var _config: Dictionary
var _auth_start: Node
var _api: Node
var _appearance_api: Node
var _chunk_api: Node
var _world_design_api: Node
var _world_asset_api: Node
var _world_design_visuals: Node3D
var _world_studio: Control
var _world_design_readback: Dictionary = {}
var _world_design_surfaces: Dictionary = {}
var _world_design_last_poll_ms := -1
var _world_asset_inflight := ""
var _world_asset_retry_after: Dictionary = {}
var _chunk_last_request_ms := -1
var _chunk_requested := Vector2i.ZERO
var _chunk_center := Vector2i.ZERO
var _chunk_has_request := false
var _neighbor_attempts: Dictionary = {}
var _chunk_diagnostic := "Nicht geladen"
var _self_actor: Node3D
var _monster_api: Node
var _monster_actors = RemoteActorRegistry.new(true)
var _monster_catalog: Dictionary = {}
var _monster_manifest: Dictionary = {}
var _monster_last_poll_ms := -1
var _monster_diagnostic := "Katalog nicht geladen"
var _remote_api: Node
var _remote_actors = RemoteActorRegistry.new()
var _quest_npc_api: Node
var _quest_npc_actors = QuestNpcRegistry.new()
var _quest_npc_diagnostic := "nicht geladen"
var _remote_catalog: Dictionary = {}
var _remote_manifest: Dictionary = {}
var _remote_poll_key := ""
var _remote_last_poll_ms := -1
var _appearance_diagnostic := "Erscheinung nicht geprüft"
var _zone_socket: Node
var _awaiting_callback := false
var _zone_reject_code := ""
var _seen_combat_events: Dictionary = {}
var _seen_combat_order: Array[String] = []
var _seen_telegraph_events: Dictionary = {}
var _seen_telegraph_order: Array[String] = []
var _combat_notice_expires_at_ms := -1
var _last_world_update_ms := -1
var _world_is_stale := false
var _confirmed_zone = ZoneState.new()
var _entities = EntityRegistry.new()
var _visuals = SnapshotInterpolator.new()
var _lifecycle = SessionLifecycle.new()
var _reconnect = ReconnectPolicy.new()
var _recovering_ticket := false
var _ticket_pending := false
var _ticket_abandoned := false
var _intent_bridge: Node
var _discarded_zone_generation_through := -1

func _configuration_valid() -> bool:
	return not _config.server_base_url.is_empty() and not _config.client_build.is_empty() and _config.renderer_profile == "compatibility"

func _ready() -> void:
	if ClassDB.class_exists("Terrain3D"):
		terrain3d_host.add_child(Terrain3DConfirmed.new())
	live_3d_viewport.render_target_update_mode = SubViewport.UPDATE_WHEN_PARENT_VISIBLE
	Engine.max_fps = 30
	_config = RuntimeConfig.current()
	%BuildIdentity.text = "Build · " + _config.client_build
	_auth_start = NativeAuthStart.new()
	add_child(_auth_start)
	_auth_start.browser_opening.connect(_on_auth_browser_opening)
	_auth_start.start_succeeded.connect(_on_auth_start_succeeded)
	_auth_start.start_failed.connect(_on_auth_start_failed)
	_auth_start.session_succeeded.connect(_on_auth_session_succeeded)
	_auth_start.session_failed.connect(_on_auth_session_failed)
	_auth_start.refresh_failed.connect(_on_auth_session_failed)
	_auth_start.logout_succeeded.connect(_on_auth_logout_terminal)
	_auth_start.logout_failed.connect(_on_auth_logout_terminal)
	_api = AurionApi.new(_auth_start)
	add_child(_api)
	_api.zone_ticket_succeeded.connect(_on_zone_ticket_succeeded)
	_api.request_failed.connect(_on_zone_ticket_failed)
	_appearance_api = AppearanceApi.new(_auth_start)
	add_child(_appearance_api)
	_appearance_api.appearance_ready.connect(_on_appearance_ready)
	_appearance_api.request_failed.connect(_on_appearance_failed)
	_remote_api = PublicAppearanceApi.new(_auth_start)
	add_child(_remote_api)
	_remote_api.appearances_ready.connect(_on_remote_appearance_ready)
	_remote_api.request_failed.connect(_on_remote_appearance_failed)
	_quest_npc_api = QuestNpcApi.new(_auth_start)
	add_child(_quest_npc_api)
	_quest_npc_api.npcs_ready.connect(_on_quest_npc_ready)
	_quest_npc_api.request_failed.connect(_on_quest_npc_failed)
	_monster_api = QuestNpcApi.new(_auth_start, "/api/game/glb-catalog")
	add_child(_monster_api)
	_monster_api.npcs_ready.connect(_on_monster_catalog_ready)
	_monster_api.request_failed.connect(_on_monster_catalog_failed)
	_world_design_api = QuestNpcApi.new(_auth_start, "/api/game/world-design")
	add_child(_world_design_api)
	_world_design_api.npcs_ready.connect(_on_world_design_ready)
	_world_design_api.request_failed.connect(_on_world_design_failed)
	_world_asset_api = WorldAssetApi.new(_auth_start)
	add_child(_world_asset_api)
	_world_asset_api.asset_ready.connect(_on_world_asset_ready)
	_world_asset_api.request_failed.connect(_on_world_asset_failed)
	_world_design_visuals = WorldDesignProjection.new()
	_world_design_visuals.name = "WorldDesignVisuals"
	world_actors.get_parent().add_child(_world_design_visuals)
	_world_studio = WorldStudio.new()
	_world_studio.name = "WorldStudio"
	add_child(_world_studio)
	_world_studio.confirmed_world.connect(_on_world_studio_readback)
	_world_studio.closed.connect(_restore_mobile_joystick)
	_chunk_api = ChunkSurfaceApi.new(_auth_start)
	add_child(_chunk_api)
	_chunk_api.surface_ready.connect(_on_chunk_surface_ready)
	_chunk_api.request_failed.connect(_on_chunk_surface_failed)
	_zone_socket = ZoneSocket.new()
	add_child(_zone_socket)
	_zone_socket.zone_welcome.connect(_on_zone_welcome)
	_zone_socket.zone_snapshot.connect(_on_zone_snapshot)
	_zone_socket.zone_combat.connect(_on_zone_combat)
	_zone_socket.zone_telegraph.connect(_on_zone_telegraph)
	_zone_socket.zone_connected.connect(_on_zone_connected)
	_zone_socket.zone_rejected.connect(_on_zone_rejected)
	_zone_socket.zone_closed_generation.connect(_on_zone_closed)
	_intent_bridge = NativeIntentBridge.new()
	add_child(_intent_bridge)
	_intent_bridge.callback_received.connect(handle_native_auth_callback)
	# A cold App-Link launch can outlive the in-memory PKCE flow after process
	# death. Drain that orphan now; the bridge forwards only live transactions.
	_intent_bridge.poll_for_callback(false)
	login.pressed.connect(_on_login_pressed)
	%CopyDiagnostics.pressed.connect(_on_copy_diagnostics_pressed)
	zone_map.selection_changed.connect(_on_map_selection_changed)
	%PlanA.pressed.connect(func(): zone_map.arm_plan("A"))
	%PlanB.pressed.connect(func(): zone_map.arm_plan("B"))
	%PlanHouse.pressed.connect(func(): zone_map.arm_plan("Haus"))
	world_toggle.pressed.connect(_toggle_world_diagnostics)
	world_action.pressed.connect(_on_world_action_pressed)
	mobile_hud.attack_requested.connect(_on_world_action_pressed)
	mobile_hud.diagnostics_requested.connect(_toggle_world_diagnostics)
	mobile_hud.world_studio_requested.connect(_open_world_studio)
	mobile_hud.menu_changed.connect(_on_mobile_menu_changed)
	mobile_hud.exit_requested.connect(_on_mobile_exit_requested)
	mobile_hud.exit_confirmation.canceled.connect(_restore_mobile_joystick)
	var studio_button := Button.new()
	studio_button.name = "WorldStudioButton"
	studio_button.text = "Weltstudio (Admin)"
	studio_button.custom_minimum_size.y = 48
	studio_button.pressed.connect(_open_world_studio)
	$WorldHUD/WorldBar.add_child(studio_button)
	if _mobile_hud_enabled:
		get_tree().set_quit_on_go_back(false)
	login.disabled = true
	if not _configuration_valid():
		status.text = "Konfiguration ungültig"
		destination.text = "Die Verbindung ist gesperrt. Bitte verwende einen geprüften Client-Build."
	else:
		status.text = "Nicht verbunden"
		destination.text = "Aurion · arelogic.space"
		if _config.native_auth_start_enabled:
			development_notice.text = "Die Anmeldung wird sicher im Systembrowser fortgesetzt."
			login.disabled = false
	set_process(true)
	resized.connect(_fit_layout)
	_fit_layout()

func _on_map_selection_changed(message: String) -> void:
	map_selection.text = message if not message.is_empty() else "Berühre ein bestätigtes Objekt oder skizziere einen Punkt."

func _on_copy_diagnostics_pressed() -> void:
	var readback: String = _diagnostics.report(_config.client_build, _config.server_base_url, _zone_socket.state_name(), _zone_socket.state_name() == "connected", _confirmed_zone.has_state())
	DisplayServer.clipboard_set(readback)
	%CopyDiagnostics.text = "Diagnose kopiert"

func _on_login_pressed() -> void:
	if _awaiting_callback:
		_auth_start.cancel()
		_awaiting_callback = false
		status.text = "Anmeldung abgebrochen"
		login.text = "Anmelden"
		return
	login.disabled = true
	status.text = "Anmeldung wird vorbereitet"
	if not _begin_native_login():
		login.disabled = false

func _begin_native_login() -> bool:
	return _auth_start.begin(_config.server_base_url, _config.client_build)

func _on_auth_browser_opening() -> void:
	# The start request is asynchronous: a cancelled browser can return while it
	# is in flight. Clear that stale callback at the last boundary before the new
	# browser opens; anything delivered afterwards belongs to the new attempt.
	_intent_bridge.reset()

func _on_auth_start_succeeded() -> void:
	_awaiting_callback = true
	status.text = "Systembrowser geöffnet"
	login.text = "Abbrechen"
	login.disabled = _lifecycle.is_suspended()

func _on_auth_start_failed(error_code: String) -> void:
	_awaiting_callback = false
	login.text = "Anmelden"
	login.disabled = _lifecycle.is_suspended() or not _config.native_auth_start_enabled
	if error_code == "NATIVE_AUTH_BUILD_UNSUPPORTED":
		status.text = "Client-Aktualisierung erforderlich"
	elif error_code == "NATIVE_AUTH_TRANSACTION_INVALID":
		status.text = "Anmeldeversuch ungültig oder abgelaufen – bitte erneut anmelden"
	else:
		status.text = "Anmeldung derzeit nicht verfügbar"

## Called only by the verified Android App-Link delivery boundary.
func handle_native_auth_callback(raw_url: Variant) -> bool:
	if not _awaiting_callback:
		return false
	var exchange_started: bool = _auth_start.complete_callback(raw_url)
	if exchange_started:
		status.text = "Anmeldung wird bestätigt"
		login.disabled = true
	elif _auth_start.callback_pending():
		status.text = "Systembrowser geöffnet"
		login.disabled = false
	return exchange_started

func _on_auth_session_succeeded() -> void:
	_zone_socket.close_zone()
	_reset_projection()
	_zone_reject_code = ""
	_awaiting_callback = false
	login.text = "Verbinden"
	login.disabled = true
	if _lifecycle.is_suspended():
		_lifecycle.require_restore()
		_ticket_abandoned = true
		_ticket_pending = false
		return
	status.text = "Zonenticket wird angefordert"
	_ticket_pending = true
	_ticket_abandoned = false
	if not _api.issue_zone_ticket(_config.server_base_url, _config.client_build):
		# A synchronous API failure may already have emitted request_failed.
		if not _ticket_pending:
			return
		_ticket_pending = false
		_on_zone_closed("ticket_start_failed")

func _on_zone_ticket_succeeded(receipt: Dictionary) -> void:
	if _ticket_abandoned or not _ticket_pending:
		return
	_ticket_pending = false
	if _lifecycle.is_suspended():
		return
	_recovering_ticket = false
	login.disabled = true
	if receipt.get("zoneId") != "observatory_threshold" or typeof(receipt.get("ticket")) != TYPE_STRING:
		_on_zone_ticket_failed("AURION_API_RESPONSE_INVALID")
		return
	status.text = "Zonenverbindung wird aufgebaut"
	login.text = "Verbinden"
	if not _zone_socket.connect_zone(_config.server_base_url, receipt["ticket"]):
		_on_zone_closed("socket_open_failed")

func _reset_projection() -> void:
	# An old HTTP completion/actor must not survive a new authenticated zone.
	if _world_studio != null:
		_world_studio.close_session()
	if _appearance_api != null:
		_appearance_api.cancel()
	if _remote_api != null:
		_remote_api.cancel()
	if _quest_npc_api != null:
		_quest_npc_api.cancel()
	_quest_npc_diagnostic = "nicht geladen"
	if _monster_api != null:
		_monster_api.cancel()
	if _world_design_api != null:
		_world_design_api.cancel()
	if _world_asset_api != null:
		_world_asset_api.cancel()
	if _world_design_visuals != null:
		_world_design_visuals.clear()
		_world_design_visuals.visible = true
	_world_design_readback.clear()
	_world_design_surfaces.clear()
	_world_design_last_poll_ms = -1
	_world_asset_inflight = ""
	_world_asset_retry_after.clear()
	if _chunk_api != null:
		_chunk_api.cancel()
	confirmed_terrain.clear()
	starter_village_visuals.clear()
	_clear_neighbor_chunks()
	_clear_terrain3d_presentation()
	unassigned_floor.visible = true
	_chunk_last_request_ms = -1
	_chunk_has_request = false
	_chunk_requested = Vector2i.ZERO
	_chunk_center = Vector2i.ZERO
	_neighbor_attempts.clear()
	_chunk_diagnostic = "Nicht geladen"
	_monster_catalog.clear()
	_monster_manifest.clear()
	_monster_last_poll_ms = -1
	_monster_diagnostic = "Katalog nicht geladen"
	_remote_catalog.clear()
	_remote_manifest.clear()
	_remote_poll_key = ""
	_remote_last_poll_ms = -1
	_clear_3d_actors()
	unassigned_floor.position = Vector3.ZERO
	world_camera.reset_view()
	world_camera.transform = _initial_world_camera_transform
	_camera_router.cancel()
	_selected_target_id = ""
	target_hud.visible = false
	mobile_hud.reset()
	mobile_hud.visible = false
	target_label.text = "Ziel: keines"
	world_action.disabled = true
	world_view.visible = false
	world_hud.visible = false
	mobile_joystick.visible = false
	mobile_joystick.call("_reset")
	_movement.cancel(_zone_socket, false)
	$SafeMargin.visible = true
	world_toggle.text = "Diagnose"
	_appearance_diagnostic = "Erscheinung nicht geprüft"
	_confirmed_zone.reset()
	_entities.reset()
	_visuals.reset()
	_seen_combat_events.clear()
	_seen_combat_order.clear()
	_seen_telegraph_events.clear()
	_seen_telegraph_order.clear()
	_combat_notice_expires_at_ms = -1
	_last_world_update_ms = -1
	_world_is_stale = false
	combat_notice.text = ""
	combat_notice.visible = false
	confirmed_position.text = ""
	confirmed_position.visible = false
	_clear_vitals_presentation()
	entity_summary.text = ""
	entity_summary.visible = false
	zone_map.clear()
	map_panel.visible = false

func _on_zone_welcome(welcome: Dictionary) -> void:
	if _lifecycle.is_suspended():
		return
	_reconnect.reset()
	_reset_projection()
	if not _confirmed_zone.apply_welcome(welcome):
		_zone_socket.close_zone()
		return
	_entities.sync(_confirmed_zone)
	var now_ms := Time.get_ticks_msec()
	_last_world_update_ms = now_ms
	_world_is_stale = false
	_visuals.capture(_confirmed_zone, now_ms)
	zone_map.set_confirmed(_confirmed_zone, _entities)
	zone_map.set_visual_positions(_visuals, now_ms)
	map_panel.visible = zone_map.visible
	_update_entity_presentation()
	_update_vitals_presentation()
	_update_position_presentation(now_ms)

func _on_zone_snapshot(snapshot: Dictionary) -> void:
	if _lifecycle.is_suspended():
		return
	if _confirmed_zone.apply_snapshot(snapshot):
		_entities.sync(_confirmed_zone)
		var now_ms := Time.get_ticks_msec()
		_last_world_update_ms = now_ms
		_world_is_stale = false
		_world_design_visuals.visible = true
		_visuals.capture(_confirmed_zone, now_ms)
		zone_map.set_confirmed(_confirmed_zone, _entities)
		zone_map.set_visual_positions(_visuals, now_ms)
		map_panel.visible = zone_map.visible
		_update_entity_presentation()
		_update_vitals_presentation()
		_update_position_presentation(now_ms)
		_sync_monsters()
		_project_3d(now_ms)
		_request_remote_appearances(now_ms)

func _on_zone_combat(event: Dictionary) -> void:
	if not _confirmed_zone.has_state():
		return
	var self_id := _confirmed_zone.self_entity_id()
	if event.get("attackerEntityId") != self_id and event.get("defenderEntityId") != self_id:
		return
	var event_id := "%d:%d:%s:%s" % [
		int(event.get("tick", -1)),
		int(event.get("sequence", -1)),
		str(event.get("attackerEntityId")),
		str(event.get("defenderEntityId")),
	]
	if _seen_combat_events.has(event_id):
		return
	_seen_combat_events[event_id] = true
	_seen_combat_order.append(event_id)
	if _seen_combat_order.size() > 128:
		_seen_combat_events.erase(_seen_combat_order.pop_front())
	combat_notice.visible = true
	_combat_notice_expires_at_ms = Time.get_ticks_msec() + COMBAT_NOTICE_DURATION_MS
	if event.get("killed", false):
		combat_notice.text = ("Du wurdest besiegt" if event.get("defenderEntityId") == self_id else "Gegner besiegt") + " · %d Schaden" % int(event.get("damage", 0))
	elif not event.get("hit", false):
		combat_notice.text = "Angriff verfehlt"
	elif event.get("crit", false):
		combat_notice.text = ("Kritischer Treffer erhalten" if event.get("defenderEntityId") == self_id else "Kritischer Treffer bestätigt") + " · %d Schaden" % int(event.get("damage", 0))
	elif event.get("defenderEntityId") == self_id:
		combat_notice.text = "Treffer erhalten · %d Schaden" % int(event.get("damage", 0))
	else:
		combat_notice.text = "Treffer bestätigt · %d Schaden" % int(event.get("damage", 0))

func _on_zone_telegraph(event: Dictionary) -> void:
	if not _confirmed_zone.has_state() or event.get("targetEntityId") != _confirmed_zone.self_entity_id():
		return
	var event_id := str(event.get("id", ""))
	if event_id.is_empty() or _seen_telegraph_events.has(event_id):
		return
	_seen_telegraph_events[event_id] = true
	_seen_telegraph_order.append(event_id)
	if _seen_telegraph_order.size() > 128:
		_seen_telegraph_events.erase(_seen_telegraph_order.pop_front())
	combat_notice.text = "Angriff angekündigt"
	combat_notice.visible = true
	_combat_notice_expires_at_ms = Time.get_ticks_msec() + COMBAT_NOTICE_DURATION_MS

func _on_zone_connected() -> void:
	if not _confirmed_zone.has_state():
		_on_zone_ticket_failed("AURION_ZONE_WELCOME_PROJECTION_MISSING")
		return
	status.text = "Sicher mit Aurion verbunden"
	login.text = "Verbunden"
	login.disabled = true
	_show_3d()
	_world_studio.configure(_auth_start, _config.server_base_url, _confirmed_zone.connection_id())
	# The authenticated optional reader cannot invalidate the v5 zone transport.
	if _appearance_api != null and not _appearance_api.request_self(_config.server_base_url, _confirmed_zone.connection_id()):
		_appearance_diagnostic = "Erscheinung derzeit nicht abrufbar"
	if _quest_npc_api != null and not _quest_npc_api.request_npcs(_config.server_base_url, _confirmed_zone.connection_id()):
		_quest_npc_diagnostic = "NPC-Leser nicht verfügbar"
	_request_chunk_surface(Time.get_ticks_msec())
	_update_3d_status()

func _on_zone_rejected(code: String) -> void:
	# Command-level rejection is recoverable after a verified welcome.
	if _zone_socket.state_name() == "connected":
		status.text = "Sicher mit Aurion verbunden"
		combat_notice.text = "Aktion abgelehnt · " + code
		combat_notice.visible = true
		_combat_notice_expires_at_ms = Time.get_ticks_msec() + COMBAT_NOTICE_DURATION_MS
		return
	_zone_reject_code = code
	status.text = "Zonenverbindung abgelehnt"

func _on_zone_closed(_reason: String, generation: int = -1) -> void:
	# Suspension discards one exact socket generation. Its terminal callback may
	# arrive after resume or a successor welcome and must not touch that session.
	if generation >= 0 and generation <= _discarded_zone_generation_through:
		return
	_reset_projection()
	if _reason == "client_close":
		return
	if _lifecycle.is_suspended():
		return
	var was_reconnecting: bool = _reconnect.active()
	var retryable_handshake_end := _reason in ["closed", "hello_timeout", "hello_send_failed", "socket_open_failed", "ticket_start_failed"]
	# A reconnect attempt remains reserved until the first verified welcome.
	# Only transport/timeout endings consume that budget; rejected protocol
	# frames fail closed immediately and cannot race another ticket request.
	if _reconnect.active() and not _lifecycle.is_suspended():
		_recovering_ticket = false
		if retryable_handshake_end and _zone_reject_code.is_empty() and _auth_start.protected_response_allowed() and _reconnect.retry_after_failure(Time.get_ticks_msec()):
			status.text = "Verbindung wird erneut versucht"
			return
		_reconnect.reset()
	if retryable_handshake_end and not was_reconnecting and _zone_reject_code.is_empty() and not _lifecycle.is_suspended() and not _awaiting_callback and _auth_start.protected_response_allowed():
		if _reconnect.begin(Time.get_ticks_msec()):
			_recovering_ticket = false
			status.text = "Verbindung wird erneut versucht"
			login.disabled = true
			return
	if _zone_reject_code.is_empty():
		status.text = "Zonenverbindung getrennt"
	login.disabled = true
	if _auth_start.logout_in_flight():
		return
	if not _auth_start.logout():
		_on_auth_logout_terminal()

func _on_zone_ticket_failed(_error_code: String) -> void:
	if _ticket_abandoned:
		return
	_ticket_pending = false
	if _reconnect.active() and not _lifecycle.is_suspended():
		_recovering_ticket = false
		if _error_code == "AURION_API_REQUEST_FAILED" and _reconnect.retry_after_failure(Time.get_ticks_msec()):
			status.text = "Verbindung wird erneut versucht"
			return
		_reconnect.reset()
	_reset_projection()
	_zone_socket.close_zone()
	status.text = "Verbindung derzeit nicht verfügbar"
	login.text = "Anmelden"
	login.disabled = true
	if _auth_start.logout_in_flight():
		return
	if not _auth_start.logout():
		_on_auth_logout_terminal()

func _on_auth_logout_terminal(_error_code: String = "") -> void:
	_lifecycle.cancel_restore()
	_ticket_abandoned = true
	_ticket_pending = false
	_reconnect.reset()
	_recovering_ticket = false
	_reset_projection()
	_api.cancel()
	_zone_socket.close_zone()
	login.text = "Anmelden"
	login.disabled = _lifecycle.is_suspended() or not _config.native_auth_start_enabled

func _on_auth_session_failed(error_code: String) -> void:
	_lifecycle.cancel_restore()
	_ticket_abandoned = true
	_ticket_pending = false
	_reset_projection()
	_api.cancel()
	_zone_socket.close_zone()
	_awaiting_callback = false
	status.text = "Anmeldung derzeit nicht verfügbar"
	if error_code in ["NATIVE_AUTH_TRANSACTION_INVALID", "NATIVE_AUTH_CODE_EXPIRED", "NATIVE_AUTH_CODE_CONSUMED"]:
		status.text = "Anmelderückgabe ungültig oder abgelaufen – bitte erneut anmelden"
	login.text = "Anmelden"
	login.disabled = _lifecycle.is_suspended() or not _config.native_auth_start_enabled

func _notification(what: int) -> void:
	if what == NOTIFICATION_APPLICATION_PAUSED:
		_on_app_suspended()
	elif what == NOTIFICATION_APPLICATION_RESUMED:
		_on_app_resumed()
	elif what == NOTIFICATION_WM_GO_BACK_REQUEST and _mobile_hud_enabled and is_node_ready():
		_handle_mobile_back()

func _process(_delta: float) -> void:
	var now_ms := Time.get_ticks_msec()
	# The socket cannot outlive the authenticated session. Token expiry can
	# clear credentials without emitting refresh_failed, so check it as well.
	if _zone_socket.state_name() == "connected" and _confirmed_zone.has_state() and not _auth_start.protected_response_allowed():
		_on_auth_session_failed("NATIVE_AUTH_SESSION_EXPIRED")
		return
	if _confirmed_zone.has_state():
		zone_map.set_visual_positions(_visuals, now_ms)
		_project_3d(now_ms)
		_request_remote_appearances(now_ms)
		_request_chunk_surface(now_ms)
	_expire_combat_notice(now_ms)
	_update_position_presentation(now_ms)
	_update_world_freshness(now_ms)
	_request_world_design(now_ms)
	_request_world_asset(now_ms)
	_poll_move_intent(now_ms)
	if not _world_input_permitted():
		_camera_router.cancel()
	_refresh_target_hud()
	if _awaiting_callback:
		_intent_bridge.poll_for_callback(true)
	if _reconnect.active() and not _lifecycle.is_suspended():
		_poll_reconnect(Time.get_ticks_msec())

## G16: The viewport displays only a confirmed session. The neutral floor is
## explicitly unassigned presentation; it is not Aurion world geometry.
func _show_3d() -> void:
	world_view.visible = true
	world_hud.visible = not _mobile_hud_enabled
	target_hud.visible = not _mobile_hud_enabled
	mobile_hud.visible = _mobile_hud_enabled
	mobile_joystick.visible = true
	$SafeMargin.visible = false
	world_toggle.text = "Diagnose"
	_fit_layout()
	_refresh_target_hud()
	_update_3d_status()

func _toggle_world_diagnostics() -> void:
	if not world_view.visible:
		return
	$SafeMargin.visible = not $SafeMargin.visible
	mobile_joystick.visible = not $SafeMargin.visible
	target_hud.visible = not $SafeMargin.visible and not _mobile_hud_enabled
	if _mobile_hud_enabled:
		mobile_hud.visible = not $SafeMargin.visible
		world_hud.visible = $SafeMargin.visible
		mobile_hud.set_menu_open(false)
	_camera_router.cancel()
	if $SafeMargin.visible:
		_cancel_move_intent()
	world_toggle.text = "3D-Ansicht" if $SafeMargin.visible else "Diagnose"

func _on_mobile_menu_changed(open: bool) -> void:
	if open:
		_camera_router.cancel()
		_cancel_move_intent()
	_restore_mobile_joystick()

func _restore_mobile_joystick() -> void:
	if _mobile_hud_enabled:
		mobile_joystick.visible = world_view.visible and not $SafeMargin.visible and not mobile_hud.menu_is_open() and not mobile_hud.exit_confirmation.visible and not _world_studio.visible

func _handle_mobile_back() -> void:
	if _world_studio.visible:
		_world_studio._close_requested()
		_restore_mobile_joystick()
		return
	if mobile_hud.close_transient():
		_restore_mobile_joystick()
		return
	if world_view.visible and $SafeMargin.visible:
		_toggle_world_diagnostics()
		return
	if world_view.visible:
		_camera_router.cancel()
		_cancel_move_intent()
		mobile_hud.request_exit_confirmation()
		_restore_mobile_joystick()
	else:
		get_tree().quit()

func _on_mobile_exit_requested() -> void:
	_cancel_move_intent()
	get_tree().quit()


## G21: camera-only gestures never send move/attack or alter confirmed state.
## The existing G20 joystick still exclusively owns its own finger index.
func _world_input_permitted() -> bool:
	return _zone_socket != null and _zone_socket.state_name() == "connected" and _confirmed_zone.has_state() and not _lifecycle.is_suspended() and not _world_is_stale and not _world_studio.visible and world_view.visible and not $SafeMargin.visible and (not _mobile_hud_enabled or (not mobile_hud.menu_is_open() and not mobile_hud.exit_confirmation.visible))

func _open_world_studio() -> void:
	if not _confirmed_zone.has_state() or _zone_socket.state_name() != "connected" or _lifecycle.is_suspended() or _world_is_stale or not _auth_start.protected_response_allowed():
		return
	_camera_router.cancel()
	_cancel_move_intent()
	_world_studio.open_studio()
	_restore_mobile_joystick()

func _on_world_studio_readback(readback: Dictionary, connection: String, generation: int) -> void:
	if not _confirmed_zone.has_state() or _confirmed_zone.connection_id() != connection or _zone_socket.state_name() != "connected" or _lifecycle.is_suspended() or _world_is_stale:
		return
	if not _auth_start.protected_response_allowed() or _auth_start.session_generation() != generation:
		return
	# An older polling GET must not overwrite this later independent readback.
	_world_design_api.cancel()
	_world_design_last_poll_ms = Time.get_ticks_msec()
	_world_design_readback = readback.duplicate(true)
	_sync_world_design()

func _camera_exclusions() -> Array[Rect2]:
	var blocked: Array[Rect2] = []
	if mobile_joystick.visible:
		blocked.append(mobile_joystick.get_global_rect())
	if world_hud.visible:
		blocked.append(world_hud.get_global_rect())
	if target_hud.visible:
		blocked.append(target_hud.get_global_rect())
	if mobile_hud.visible:
		blocked.append_array(mobile_hud.touch_exclusions())
	return blocked

func _input(event: InputEvent) -> void:
	if not (event is InputEventScreenTouch or event is InputEventScreenDrag):
		return
	var area := Rect2(
		world_view.global_position + Vector2(world_view.size.x * 0.5, 0.0),
		Vector2(world_view.size.x * 0.5, world_view.size.y))
	var event_result: Dictionary = _camera_router.route(event, _world_input_permitted(), area, _camera_exclusions())
	match str(event_result.get("kind", "")):
		"drag":
			world_camera.drag_orbit(event_result["delta"])
		"tap":
			_select_visible_target_at(event_result["position"])

func _is_visible_confirmed_entity(id: String) -> bool:
	if id.is_empty():
		return false
	if _entities.record("mobs", id).is_empty() and _entities.record("presences", id).is_empty():
		return false
	for actor in world_actors.get_children():
		if actor is Node3D and actor.visible and actor.has_method("confirmed_mm") and str(actor.get("entity_id")) == id:
			return true
	return false

func _select_visible_target_at(screen_point: Vector2) -> void:
	if not _world_input_permitted():
		return
	_selected_target_id = ""
	var view_rect: Rect2 = world_view.get_global_rect()
	if view_rect.size.x <= 0.0 or view_rect.size.y <= 0.0:
		_refresh_target_hud()
		return
	# SubViewport coordinates can differ from Control coordinates on tablet
	# rotation; the click and projected model point must share one basis.
	var relative := screen_point - view_rect.position
	var projected_click := Vector2(
		relative.x * float(live_3d_viewport.size.x) / view_rect.size.x,
		relative.y * float(live_3d_viewport.size.y) / view_rect.size.y)
	var best_distance := maxf(45.0, minf(view_rect.size.x, view_rect.size.y) * 0.075)
	for actor in world_actors.get_children():
		if not (actor is Node3D) or not actor.visible or not actor.has_method("confirmed_mm"):
			continue
		var id := str(actor.get("entity_id"))
		if not _is_visible_confirmed_entity(id):
			continue
		var model_point: Vector3 = actor.global_position + Vector3(0.0, 1.0, 0.0)
		if world_camera.is_position_behind(model_point):
			continue
		var distance := world_camera.unproject_position(model_point).distance_to(projected_click)
		if distance < best_distance:
			best_distance = distance
			_selected_target_id = id
	_refresh_target_hud()

func _refresh_target_hud() -> void:
	if not _is_visible_confirmed_entity(_selected_target_id):
		_selected_target_id = ""
	target_label.text = "Ziel: keines" if _selected_target_id.is_empty() else "Aurion bestätigt · " + _selected_target_id
	var mob: Dictionary = _entities.record("mobs", _selected_target_id)
	world_action.disabled = not _world_input_permitted() or mob.is_empty() or mob.get("state", "dead") == "dead"
	if mobile_hud.visible:
		mobile_hud.render_projection(_confirmed_zone, _entities, _selected_target_id, _world_is_stale, not world_action.disabled, combat_notice.text if combat_notice.visible else "")

func _on_world_action_pressed() -> void:
	# Only the existing v5 send_attack typed command; Aurion decides all
	# reachability, damage, cooldown, and final action outcome.
	if not _world_input_permitted():
		return
	_refresh_target_hud()
	if world_action.disabled or _selected_target_id.is_empty():
		return
	_zone_socket.send_attack(_selected_target_id)

## G20: InputMap and the pinned native Godot joystick are presentation inputs.
## Only a verified v5 session may send digital intents, max once per 100 ms.
## No client-side motion, velocity, coordinates or gameplay simulation.
func _poll_move_intent(now_ms: int) -> void:
	if _zone_socket == null:
		return
	var connected: bool = _zone_socket.state_name() == "connected"
	var permitted: bool = _world_input_permitted()
	if not permitted:
		_movement.cancel(_zone_socket, connected)
		return
	var axes: Vector2 = Input.get_vector("move_left", "move_right", "move_forward", "move_backward", 0.2)
	if mobile_joystick.visible and bool(mobile_joystick.get("is_pressed")):
		axes = mobile_joystick.get("output")
	_movement.send_if_due(now_ms, axes, _zone_socket, true)

func _cancel_move_intent() -> void:
	if mobile_joystick != null:
		mobile_joystick.call("_reset")
	if _zone_socket != null:
		_movement.cancel(_zone_socket, _zone_socket.state_name() == "connected")
	else:
		_movement.reset()

func _clear_3d_actors() -> void:
	_remote_actors.clear(world_actors)
	_monster_actors.clear(world_actors)
	_quest_npc_actors.clear(quest_npc_root)
	_self_actor = null
	for actor in world_actors.get_children():
		actor.visible = false
		world_actors.remove_child(actor)
		actor.queue_free()

func _on_appearance_failed(reason: String, connection_id: String) -> void:
	if not _confirmed_zone.has_state() or _confirmed_zone.connection_id() != connection_id:
		return
	_appearance_diagnostic = reason
	_update_3d_status()

func _on_appearance_ready(response: Dictionary, connection_id: String, generation: int) -> void:
	if not _confirmed_zone.has_state() or _confirmed_zone.connection_id() != connection_id or _lifecycle.is_suspended():
		return
	if not _auth_start.protected_response_allowed() or _auth_start.session_generation() != generation:
		return
	if _zone_socket.state_name() != "connected":
		return
	var manifest: Variant = JSON.parse_string(FileAccess.get_file_as_string("res://assets/generated/manifest.json"))
	_remote_catalog = response.duplicate(true)
	_remote_manifest = manifest.duplicate(true) if typeof(manifest) == TYPE_DICTIONARY else {}
	_request_remote_appearances(Time.get_ticks_msec())
	var resolution: Dictionary = AppearanceResolver.new().resolve_self(_confirmed_zone, response, manifest)
	if resolution.get("status") != "resolved":
		_appearance_diagnostic = str(resolution.get("reason", "appearance_invalid"))
		_update_3d_status()
		return
	_mount_resolved_self(resolution)

## Caller must first validate the authenticated response through AppearanceResolver.
## Kept separate so actual scene/actor composition has an independent render test.
func _mount_resolved_self(resolution: Dictionary) -> bool:
	if not _confirmed_zone.has_state() or resolution.get("status") != "resolved" or resolution.get("entityId") != _confirmed_zone.self_entity_id():
		return false
	var packed: PackedScene = load(str(resolution.resourcePath)) as PackedScene
	if packed == null:
		_appearance_diagnostic = "packed_model_unavailable"
		_update_3d_status()
		return false
	if is_instance_valid(_self_actor):
		world_actors.remove_child(_self_actor)
		_self_actor.queue_free()
		_self_actor = null
	var actor: Node3D = ActorScene.instantiate()
	world_actors.add_child(actor)
	if not actor.bind_confirmed(_confirmed_zone, str(resolution.entityId), str(resolution.catalogAssetId), packed):
		world_actors.remove_child(actor)
		actor.queue_free()
		_appearance_diagnostic = "model_bind_rejected"
		_update_3d_status()
		return false
	_self_actor = actor
	_appearance_diagnostic = ""
	_project_3d(Time.get_ticks_msec())
	return true

func _project_3d(now_ms: int) -> void:
	if not _confirmed_zone.has_state():
		return
	_remote_actors.project(_confirmed_zone, _visuals, now_ms, world_actors)
	_monster_actors.project(_confirmed_zone, _visuals, now_ms, world_actors)
	if is_instance_valid(_self_actor):
		var valid: bool = _self_actor.project(_confirmed_zone, _visuals, now_ms)
		if not valid:
			_appearance_diagnostic = str(_self_actor.diagnostic)
			if _self_actor.entity_id.is_empty():
				world_actors.remove_child(_self_actor)
				_self_actor.queue_free()
				_self_actor = null
		else:
			_appearance_diagnostic = str(_self_actor.diagnostic)
	# Camera tracking is independent of asset availability: it can follow only
	# a current projection of the server-confirmed self, never a guessed model.
	if _visuals.matches(_confirmed_zone):
		var point: Dictionary = _visuals.visual_precise_mm(_confirmed_zone.self_entity_id(), now_ms)
		if not point.is_empty():
			var x: float = float(point["x"]) / 1000.0
			var z: float = float(point["z"]) / 1000.0
			if is_finite(x) and is_finite(z):
				# The neutral plane and camera are presentation only.
				unassigned_floor.position = Vector3(x, 0.0, z)
				world_camera.follow_confirmed(Vector3(x, 1.0, z))
	_update_3d_status()
func _update_3d_status() -> void:
	if not _confirmed_zone.has_state():
		world_status.text = "3D · Keine bestätigte Sitzung"
		return
	var visible_count := 1 if is_instance_valid(_self_actor) and _self_actor.visible else 0
	var remote_count := _remote_actors.visible_count()
	var other_count: int = maxi(_entities.ids("presences").size() + _entities.ids("mobs").size() - 1 - remote_count - _monster_actors.visible_count(), 0)
	var model_message := "Spielerfigur sichtbar" if visible_count == 1 else "Spielerfigur: " + _appearance_diagnostic
	var npc_count: int = _quest_npc_actors.visible_count()
	var surface_text := ("bestätigtes Chunk-Mesh · %d Nachbarn" % confirmed_neighbors.get_child_count()) if confirmed_terrain.get_child_count() > 0 else "Neutralboden · Terrain: " + _chunk_diagnostic
	world_status.text = "Aurion 3D · %s · %d weitere Spieler sichtbar · %d Quest-NPC-Anker (statisch)%s · %d Monster (%s) · %d ungeklärte Entitäten · %s%s" % [model_message, remote_count, npc_count, (" · NPC: " + _quest_npc_diagnostic) if not _quest_npc_diagnostic.is_empty() else "", _monster_actors.visible_count(), _monster_diagnostic, other_count, surface_text, _world_freshness_suffix()]

## Only server-confirmed v5 presence IDs may be queried. HTTP is read-only;
## a response never creates additional gameplay state or enables interactions.
func _current_remote_ids() -> Array[int]:
	var ids: Array[int] = []
	for id in _entities.ids("presences"):
		if id == _confirmed_zone.self_entity_id():
			continue
		var record: Dictionary = _entities.record("presences", id)
		ids.append(int(record["userId"]))
	ids.sort()
	return ids

func _current_remote_ids_csv() -> String:
	var parts: PackedStringArray = []
	for user_id in _current_remote_ids():
		parts.append(str(user_id))
	return ",".join(parts)

func _request_remote_appearances(now_ms: int) -> void:
	_request_monster_catalog(now_ms)
	if _remote_catalog.is_empty() or not _confirmed_zone.has_state() or _lifecycle.is_suspended() or _zone_socket.state_name() != "connected":
		return
	var ids: Array[int] = _current_remote_ids()
	if ids.is_empty():
		_remote_actors.clear(world_actors)
		_remote_poll_key = ""
		return
	var key := _current_remote_ids_csv()
	if _remote_api.busy() or (key == _remote_poll_key and _remote_last_poll_ms >= 0 and now_ms - _remote_last_poll_ms < PUBLIC_APPEARANCE_REFRESH_MS):
		return
	if _remote_api.request_public(_config.server_base_url, _confirmed_zone.connection_id(), ids):
		_remote_poll_key = key
		_remote_last_poll_ms = now_ms

func _on_remote_appearance_ready(response: Dictionary, connection_id: String, generation: int, requested_ids: String) -> void:
	if not _confirmed_zone.has_state() or _confirmed_zone.connection_id() != connection_id or _lifecycle.is_suspended():
		return
	if not _auth_start.protected_response_allowed() or _auth_start.session_generation() != generation or _zone_socket.state_name() != "connected":
		return
	if requested_ids != _current_remote_ids_csv():
		_request_remote_appearances(Time.get_ticks_msec())
		return
	_apply_remote_appearances(response, _remote_catalog, _remote_manifest)
	_project_3d(Time.get_ticks_msec())

func _on_remote_appearance_failed(_reason: String, connection_id: String) -> void:
	if not _confirmed_zone.has_state() or _confirmed_zone.connection_id() != connection_id:
		return
	_remote_actors.clear(world_actors)
	_update_3d_status()

## Deliberately callable by the real-Godot scene regression with a separately
## labeled server protocol fixture; production only calls it after authenticated
## API, connection-generation, and currently confirmed presence checks.
func _apply_remote_appearances(response: Dictionary, catalog: Dictionary, manifest: Dictionary) -> void:
	_remote_actors.apply(_confirmed_zone, world_actors, response, catalog, manifest)
	_update_3d_status()

## Static Aurion quest anchors are NOT dynamic v5 gameplay NPCs.
func _on_quest_npc_ready(response: Dictionary, connection_id: String, generation: int) -> void:
	if not _confirmed_zone.has_state() or _confirmed_zone.connection_id() != connection_id or _lifecycle.is_suspended():
		return
	if not _auth_start.protected_response_allowed() or _auth_start.session_generation() != generation or _zone_socket.state_name() != "connected":
		return
	var manifest: Variant = JSON.parse_string(FileAccess.get_file_as_string("res://assets/generated/manifest.json"))
	_apply_quest_npc_visuals(response, manifest)

func _on_quest_npc_failed(reason: String, connection_id: String) -> void:
	if not _confirmed_zone.has_state() or _confirmed_zone.connection_id() != connection_id:
		return
	_quest_npc_actors.clear(quest_npc_root)
	_quest_npc_diagnostic = reason
	_update_3d_status()

## Test-only fixture entry; production enters via the authenticated callback above.
func _apply_quest_npc_visuals(response: Dictionary, manifest: Variant) -> bool:
	if not _confirmed_zone.has_state() or _confirmed_zone.current_state().get("zoneId") != "observatory_threshold":
		_quest_npc_actors.clear(quest_npc_root)
		_quest_npc_diagnostic = "NPC-Zone nicht bestätigt"
		_update_3d_status()
		return false
	var accepted: bool = _quest_npc_actors.apply(quest_npc_root, response, manifest)
	_quest_npc_diagnostic = "" if accepted else _quest_npc_actors.diagnostic
	_update_3d_status()
	return accepted

func _update_entity_presentation() -> void:
	if not _confirmed_zone.has_state():
		entity_summary.text = ""
		entity_summary.visible = false
		return
	var travellers := maxi(_entities.ids("presences").size() - 1, 0)
	var creatures := _entities.ids("mobs").size()
	var traveller_word := "Reisender" if travellers == 1 else "Reisende"
	var creature_word := "Kreatur" if creatures == 1 else "Kreaturen"
	entity_summary.text = "In der Nähe · %d %s · %d %s%s" % [travellers, traveller_word, creatures, creature_word, _world_freshness_suffix()]
	entity_summary.visible = true

func _update_world_freshness(now_ms: int) -> void:
	if not _confirmed_zone.has_state() or _last_world_update_ms < 0:
		return
	var stale := now_ms - _last_world_update_ms >= WORLD_STALE_AFTER_MS
	if stale == _world_is_stale:
		return
	_world_is_stale = stale
	_world_design_visuals.visible = not stale
	if stale and _world_asset_api != null:
		_world_asset_api.cancel()
		_world_asset_inflight = ""
	zone_map.set_stale(stale)
	_update_entity_presentation()
	_update_vitals_presentation()
	_update_position_presentation(now_ms)
	_update_3d_status()

func _world_freshness_suffix() -> String:
	return " · Stand veraltet" if _world_is_stale else ""

func _clear_vitals_presentation() -> void:
	confirmed_vitals.text = ""
	confirmed_vitals.visible = false
	confirmed_health_meter.value = 0
	confirmed_health_meter.visible = false
	confirmed_stamina_meter.value = 0
	confirmed_stamina_meter.visible = false

func _update_vitals_presentation() -> void:
	if not _confirmed_zone.has_state():
		_clear_vitals_presentation()
		return
	var self_combatant := _entities.record("combatants", _confirmed_zone.self_entity_id())
	if self_combatant.is_empty():
		_clear_vitals_presentation()
		return
	confirmed_vitals.text = "Zustand · HP %d/%d · Ausdauer %d/%d%s" % [
		int(self_combatant["health"]),
		int(self_combatant["maxHealth"]),
		int(self_combatant["stamina"]),
		int(self_combatant["maxStamina"]),
		_world_freshness_suffix(),
	]
	confirmed_vitals.visible = true
	confirmed_health_meter.max_value = int(self_combatant["maxHealth"])
	confirmed_health_meter.value = int(self_combatant["health"])
	confirmed_health_meter.visible = true
	confirmed_stamina_meter.max_value = int(self_combatant["maxStamina"])
	confirmed_stamina_meter.value = int(self_combatant["stamina"])
	confirmed_stamina_meter.visible = true

func _update_position_presentation(now_ms: int) -> void:
	if not _confirmed_zone.has_state():
		confirmed_position.text = ""
		confirmed_position.visible = false
		return
	var visual: Dictionary = _visuals.visual_precise_mm(_confirmed_zone.self_entity_id(), now_ms)
	if visual.is_empty():
		confirmed_position.text = ""
		confirmed_position.visible = false
		return
	confirmed_position.text = "Position · X %.2f m · Z %.2f m%s" % [float(visual["x"]) / 1000.0, float(visual["z"]) / 1000.0, _world_freshness_suffix()]
	confirmed_position.visible = true

func _expire_combat_notice(now_ms: int) -> void:
	if _combat_notice_expires_at_ms < 0 or now_ms < _combat_notice_expires_at_ms:
		return
	_combat_notice_expires_at_ms = -1
	combat_notice.text = ""
	combat_notice.visible = false

func _on_app_suspended() -> void:
	var socket_active: bool = _zone_socket.state_name() != "closed"
	var must_restore: bool = _confirmed_zone.has_state() or socket_active or _ticket_pending or _reconnect.active() or _auth_start.protected_response_allowed()
	if not _lifecycle.suspend(must_restore):
		return
	_reconnect.reset()
	_recovering_ticket = false
	_api.cancel()
	_ticket_abandoned = true
	_ticket_pending = false
	_cancel_move_intent()
	if socket_active:
		_discarded_zone_generation_through = maxi(_discarded_zone_generation_through, _zone_socket.connection_generation())
	_zone_socket.close_zone()
	_reset_projection()
	if not _awaiting_callback:
		status.text = "App pausiert – Verbindung getrennt"
		login.disabled = true

func _on_app_resumed() -> void:
	if not _lifecycle.is_suspended():
		return
	if _lifecycle.resume():
		_reconnect.begin(Time.get_ticks_msec())
		status.text = "Sitzung wird neu bestätigt"
	elif _awaiting_callback:
		login.text = "Abbrechen"
		login.disabled = _auth_start.request_in_flight()
	else:
		login.text = "Anmelden"
		if not _configuration_valid():
			status.text = "Konfiguration ungültig"
			login.disabled = true
		elif _auth_start.request_in_flight():
			login.disabled = true
		else:
			status.text = "Nicht verbunden"
			login.disabled = not _config.native_auth_start_enabled

func _poll_reconnect(now_ms: int) -> void:
	if not _reconnect.active() or _lifecycle.is_suspended() or _recovering_ticket:
		return
	if not _reconnect.take_if_due(now_ms):
		return
	if not _auth_start.protected_response_allowed():
		_reconnect.reset()
		_on_auth_session_failed("NATIVE_AUTH_SESSION_EXPIRED")
		return
	_recovering_ticket = true
	_ticket_abandoned = false
	_ticket_pending = true
	status.text = "Neues Zonenticket wird angefordert"
	if not _api.issue_zone_ticket(_config.server_base_url, _config.client_build):
		_recovering_ticket = false
		# The API may synchronously emit request_failed before returning false.
		# In that case its callback already classified the failure.
		if not _ticket_pending:
			return
		_ticket_pending = false
		if _reconnect.active() and _reconnect.retry_after_failure(now_ms):
			status.text = "Verbindung wird erneut versucht"
			return
		_on_zone_ticket_failed("AURION_API_REQUEST_FAILED")

func _fit_layout() -> void:
	if not is_node_ready():
		return
	# Rotations-/resize-cancel cannot resurrect a captured camera finger.
	_camera_router.cancel()
	_cancel_move_intent()
	card.custom_minimum_size.x = minf(600.0, maxf(240.0, size.x - 48.0))
	title.add_theme_font_size_override("font_size", 32 if size.x < 600 else 44)
	if _mobile_hud_enabled:
		var safe := _mobile_safe_rect()
		var density := clampf(float(DisplayServer.screen_get_dpi()) / 160.0, 1.0, 2.0) if OS.has_feature("mobile") else 1.0
		mobile_hud.fit_layout(size, safe, density)
		mobile_hud.style_joystick(mobile_joystick)
		var joystick_scale := clampf(safe.size.y / 800.0, 0.5, 1.0)
		mobile_joystick.scale = Vector2.ONE * joystick_scale
		mobile_joystick.offset_left = safe.position.x + 16.0 * density
		mobile_joystick.offset_right = mobile_joystick.offset_left + 220.0
		mobile_joystick.offset_top = safe.end.y - size.y - 16.0 * density - 220.0 * joystick_scale
		mobile_joystick.offset_bottom = mobile_joystick.offset_top + 220.0
	queue_redraw()

func _mobile_safe_rect() -> Rect2:
	var fallback := Rect2(Vector2.ZERO, size)
	if not OS.has_feature("mobile"):
		return fallback
	var window_size := Vector2(DisplayServer.window_get_size())
	if window_size.x <= 0.0 or window_size.y <= 0.0:
		return fallback
	var window_rect := Rect2(Vector2(DisplayServer.window_get_position()), window_size)
	var display_safe := Rect2(DisplayServer.get_display_safe_area())
	var intersection := window_rect.intersection(display_safe)
	if intersection.size.x <= 0.0 or intersection.size.y <= 0.0:
		return fallback
	return Rect2((intersection.position - window_rect.position) * size / window_size, intersection.size * size / window_size)

func _draw() -> void:
	draw_rect(Rect2(Vector2.ZERO, size), Color("07131c"))
	var center := Vector2(size.x * 0.78, size.y * 0.38)
	var radius := minf(size.x, size.y) * 0.42
	for ring in range(1, 4):
		draw_arc(center, radius * float(ring) / 3.0, 0, TAU, 96, Color(0.40, 0.56, 0.60, 0.12), 1.0, true)
	draw_line(center - Vector2(radius, 0), center + Vector2(radius, 0), Color(0.40, 0.56, 0.60, 0.10), 1.0, true)
	draw_line(center - Vector2(0, radius), center + Vector2(0, radius), Color(0.40, 0.56, 0.60, 0.10), 1.0, true)
	for star in STARS:
		draw_circle(star * size, 2.0, Color(0.77, 0.69, 0.46, 0.6))

func _request_monster_catalog(now_ms: int) -> void:
	if not _confirmed_zone.has_state() or _lifecycle.is_suspended() or _zone_socket.state_name() != "connected":
		return
	# Preserve monster refresh behavior without downloading the full asset
	# catalog for a world that has no published authored designs.
	if _entities.ids("mobs").is_empty():
		var designs: Variant = _world_design_readback.get("designs", [])
		if typeof(designs) != TYPE_ARRAY or designs.is_empty():
			return
	if _monster_last_poll_ms >= 0 and now_ms - _monster_last_poll_ms < PUBLIC_APPEARANCE_REFRESH_MS:
		return
	_monster_last_poll_ms = now_ms
	_monster_api.request_npcs(_config.server_base_url, _confirmed_zone.connection_id())

func _on_monster_catalog_ready(response: Dictionary, connection_id: String, generation: int) -> void:
	if not _confirmed_zone.has_state() or _confirmed_zone.connection_id() != connection_id or _lifecycle.is_suspended():
		return
	if not _auth_start.protected_response_allowed() or _auth_start.session_generation() != generation or _zone_socket.state_name() != "connected":
		return
	var manifest: Variant = JSON.parse_string(FileAccess.get_file_as_string("res://assets/generated/manifest.json"))
	_apply_monster_catalog(response, manifest if manifest is Dictionary else {})
	_sync_world_design()

func _on_monster_catalog_failed(reason: String, connection_id: String) -> void:
	if not _confirmed_zone.has_state() or _confirmed_zone.connection_id() != connection_id:
		return
	_monster_actors.clear(world_actors)
	_monster_catalog.clear()
	_world_design_visuals.clear()
	_world_asset_api.cancel()
	_world_asset_inflight = ""
	_monster_diagnostic = reason
	_update_3d_status()

## Explicit-fixture test seam; authenticated callback is the production caller.
func _apply_monster_catalog(catalog: Dictionary, manifest: Dictionary) -> void:
	_monster_catalog = catalog.duplicate(true)
	_monster_manifest = manifest.duplicate(true)
	_sync_monsters()
	_project_3d(Time.get_ticks_msec())

func _request_world_design(now_ms: int) -> void:
	if not _confirmed_zone.has_state() or _world_is_stale or _lifecycle.is_suspended() or _zone_socket.state_name() != "connected" or not _auth_start.protected_response_allowed():
		return
	if _world_design_last_poll_ms >= 0 and now_ms - _world_design_last_poll_ms < PUBLIC_APPEARANCE_REFRESH_MS:
		return
	_world_design_last_poll_ms = now_ms
	_world_design_api.request_npcs(_config.server_base_url, _confirmed_zone.connection_id())

func _on_world_design_ready(response: Dictionary, connection_id: String, generation: int) -> void:
	if not _confirmed_zone.has_state() or _confirmed_zone.connection_id() != connection_id or _lifecycle.is_suspended():
		return
	if not _auth_start.protected_response_allowed() or _auth_start.session_generation() != generation or _zone_socket.state_name() != "connected":
		return
	_world_design_readback = response.duplicate(true)
	_sync_world_design()

func _on_world_design_failed(_reason: String, connection_id: String) -> void:
	if not _confirmed_zone.has_state() or _confirmed_zone.connection_id() != connection_id:
		return
	_world_design_readback.clear()
	_world_design_visuals.clear()
	_world_asset_api.cancel()
	_world_asset_inflight = ""

## The callback above is the production entry point; tests may use this seam
## only with explicitly synthetic source data and a confirmed fixture zone.
func _sync_world_design() -> void:
	if not _confirmed_zone.has_state():
		return
	if _world_design_readback.is_empty() or _monster_catalog.is_empty():
		_world_design_visuals.clear()
		_world_asset_api.cancel()
		_world_asset_inflight = ""
		return
	var connection_id: String = _confirmed_zone.connection_id()
	var center: Variant = _current_confirmed_chunk()
	if typeof(center) != TYPE_VECTOR2I:
		return
	if not _world_design_visuals.bind_confirmed(_world_design_readback, _monster_catalog, connection_id):
		_world_asset_api.cancel()
		_world_asset_inflight = ""
		return
	for coordinate in _world_design_surfaces:
		_world_design_visuals.accept_surface(_world_design_surfaces[coordinate], connection_id, center)

func _remember_world_design_surface(readback: Dictionary, connection_id: String, coordinate: Vector2i, center: Vector2i) -> void:
	_world_design_surfaces[coordinate] = readback.duplicate(true)
	_world_design_visuals.accept_surface(readback, connection_id, center)

func _request_world_asset(now_ms: int) -> void:
	if not _confirmed_zone.has_state() or _world_is_stale or _lifecycle.is_suspended() or _zone_socket.state_name() != "connected" or not _auth_start.protected_response_allowed() or _world_asset_api.busy():
		return
	for request in _world_design_visuals.needed_assets():
		var sha: String = request.sha256
		if _world_asset_retry_after.has(sha) and now_ms < int(_world_asset_retry_after[sha]):
			continue
		_world_asset_inflight = sha
		if not _world_asset_api.request_asset(_config.server_base_url, request, _confirmed_zone.connection_id()):
			_world_asset_retry_after[sha] = now_ms + 30000
			_world_asset_inflight = ""
		return

func _on_world_asset_ready(sha: String, bytes: PackedByteArray, connection_id: String, generation: int) -> void:
	_world_asset_inflight = ""
	if not _confirmed_zone.has_state() or _confirmed_zone.connection_id() != connection_id or _lifecycle.is_suspended() or _world_is_stale:
		return
	if not _auth_start.protected_response_allowed() or _auth_start.session_generation() != generation or _zone_socket.state_name() != "connected":
		return
	if not _world_design_visuals.supply_asset(sha, bytes, connection_id):
		_world_asset_retry_after[sha] = Time.get_ticks_msec() + 30000
		_world_design_visuals.try_next_asset(sha, connection_id)

func _on_world_asset_failed(_reason: String, connection_id: String) -> void:
	if not _confirmed_zone.has_state() or _confirmed_zone.connection_id() != connection_id:
		return
	if not _world_asset_inflight.is_empty():
		_world_asset_retry_after[_world_asset_inflight] = Time.get_ticks_msec() + 30000
		_world_design_visuals.try_next_asset(_world_asset_inflight, connection_id)
	_world_asset_inflight = ""

func _sync_monsters() -> void:
	_monster_actors.apply(_confirmed_zone, world_actors, {}, _monster_catalog, _monster_manifest)
	_monster_diagnostic = _monster_actors.diagnostic

## Aurion-acknowledged self position; chunk partition follows the existing
## server 64m center-shift rule, not a second world-generation pipeline.
func _current_confirmed_chunk() -> Variant:
	if not _confirmed_zone.has_state():
		return null
	var point: Dictionary = _visuals.confirmed_mm(_confirmed_zone.self_entity_id())
	if point.is_empty():
		return null
	var x: Variant = point.get("x")
	var z: Variant = point.get("z")
	if typeof(x) not in [TYPE_INT, TYPE_FLOAT] or typeof(z) not in [TYPE_INT, TYPE_FLOAT]:
		return null
	if not is_finite(float(x)) or not is_finite(float(z)):
		return null
	var ix := floori((float(x) + 32000.0) / 64000.0)
	var iz := floori((float(z) + 32000.0) / 64000.0)
	if absi(ix) > 1000000 or absi(iz) > 1000000:
		return null
	return Vector2i(ix, iz)

## Only one protected GET is in flight. The center is loaded first; adjacent
## readbacks are bounded to eight visual meshes and never change gameplay.

## Terrain3D is optional in ordinary CI/export; original G18 mesh stays the
## checked fallback. Only already-authenticated, G18-validated readbacks reach it.
func _terrain3d_bridge() -> Node3D:
	if terrain3d_host.get_child_count() == 0:
		return null
	return terrain3d_host.get_child(0) as Node3D

func _sync_terrain3d_presentation() -> void:
	var bridge := _terrain3d_bridge()
	var drawn: bool = bridge != null and bridge.terrain_node() != null and bridge.active_chunk_count() > 0
	confirmed_terrain.visible = not drawn
	confirmed_neighbors.visible = not drawn

func _clear_terrain3d_presentation() -> void:
	var bridge := _terrain3d_bridge()
	if bridge != null:
		bridge.clear()
	_sync_terrain3d_presentation()

func _apply_terrain3d_presentation(readback: Dictionary, connection_id: String) -> void:
	var bridge := _terrain3d_bridge()
	if bridge != null:
		bridge.apply_confirmed(readback, connection_id)
	_sync_terrain3d_presentation()

func _clear_neighbor_chunks() -> void:
	for child in confirmed_neighbors.get_children():
		confirmed_neighbors.remove_child(child)
		child.queue_free()

## An invalid or failed authenticated refresh must not leave old visual
## terrain masquerading as the latest readback. Presentation only.
func _evict_neighbor_chunk(coordinate: Vector2i) -> void:
	_world_design_surfaces.erase(coordinate)
	if _confirmed_zone.has_state():
		_world_design_visuals.remove_surface(coordinate, _confirmed_zone.connection_id())
	var key := "Chunk_%d_%d" % [coordinate.x, coordinate.y]
	var existing: Node3D = confirmed_neighbors.get_node_or_null(key) as Node3D
	if existing != null:
		confirmed_neighbors.remove_child(existing)
		existing.queue_free()
	var bridge := _terrain3d_bridge()
	if bridge != null:
		bridge.remove_chunk(coordinate)
	_sync_terrain3d_presentation()

func _request_chunk_surface(now_ms: int) -> void:
	if _chunk_api == null or not _confirmed_zone.has_state() or _lifecycle.is_suspended() or _zone_socket.state_name() != "connected":
		return
	var value: Variant = _current_confirmed_chunk()
	if typeof(value) != TYPE_VECTOR2I:
		return
	var coordinate: Vector2i = value
	if _chunk_center != coordinate:
		_chunk_api.cancel()
		_world_asset_api.cancel()
		_world_asset_inflight = ""
		_world_design_surfaces.clear()
		_world_design_visuals.reset_surfaces(_confirmed_zone.connection_id())
		confirmed_terrain.clear()
		starter_village_visuals.clear()
		_clear_neighbor_chunks()
		_clear_terrain3d_presentation()
		_neighbor_attempts.clear()
		_chunk_center = coordinate
		_chunk_last_request_ms = -1
		_chunk_has_request = false
		unassigned_floor.visible = true
		_chunk_diagnostic = "Chunk-Wechsel · serverseitiger Readback erforderlich"
	if _chunk_api.busy():
		return
	# First prove the center on Aurion's existing protected read-model route.
	if confirmed_terrain.get_child_count() == 0:
		if _chunk_last_request_ms >= 0 and now_ms - _chunk_last_request_ms < 10000:
			return
		_chunk_requested = coordinate
		_chunk_last_request_ms = now_ms
		_chunk_has_request = _chunk_api.request_surface(_config.server_base_url, _confirmed_zone.connection_id(), coordinate)
		if not _chunk_has_request:
			_chunk_diagnostic = "Chunk-Leser nicht verfügbar"
		return
	# No parallel requests or unbounded per-frame retries. Only confirmed
	# adjacent chunks may enter the presentation cache.
	for dz in range(-1, 2):
		for dx in range(-1, 2):
			if dx == 0 and dz == 0:
				continue
			var neighbor := coordinate + Vector2i(dx, dz)
			if absi(neighbor.x) > 1000000 or absi(neighbor.y) > 1000000:
				continue
			if _neighbor_attempts.has(neighbor) and now_ms - int(_neighbor_attempts[neighbor]) < 10000:
				continue
			_neighbor_attempts[neighbor] = now_ms
			_chunk_requested = neighbor
			if not _chunk_api.request_surface(_config.server_base_url, _confirmed_zone.connection_id(), neighbor):
				_chunk_diagnostic = "Nachbar-Chunk derzeit nicht verfügbar"
			return
			return
	# Refresh the center only after neighboring positions have been queried.
	if now_ms - _chunk_last_request_ms >= 10000:
		_chunk_requested = coordinate
		_chunk_last_request_ms = now_ms
		_chunk_api.request_surface(_config.server_base_url, _confirmed_zone.connection_id(), coordinate)

## Production enters only via a native authenticated GET and exact zone,
## token-generation and current confirmed self-position reconciliation.
func _on_chunk_surface_ready(response: Dictionary, connection_id: String, generation: int, coordinate: Vector2i) -> void:
	if _lifecycle.is_suspended() or not _confirmed_zone.has_state() or _confirmed_zone.connection_id() != connection_id:
		return
	if not _auth_start.protected_response_allowed() or _auth_start.session_generation() != generation or _zone_socket.state_name() != "connected":
		return
	var center: Variant = _current_confirmed_chunk()
	if typeof(center) != TYPE_VECTOR2I or coordinate != _chunk_requested or maxi(absi(coordinate.x - center.x), absi(coordinate.y - center.y)) > 1:
		return
	var base: Variant = response.get("base")
	if typeof(base) != TYPE_DICTIONARY or typeof(base.get("coordinate")) != TYPE_DICTIONARY or base.coordinate.get("x") != coordinate.x or base.coordinate.get("z") != coordinate.y:
		_on_chunk_surface_failed("CHUNK_COORDINATE_MISMATCH", connection_id)
		return
	if coordinate == center:
		_apply_chunk_surface(response, connection_id)
	else:
		if not _apply_neighbor_chunk_surface(response, connection_id):
			_chunk_diagnostic = "Nachbar-Chunk abgelehnt"
		_update_3d_status()

func _on_chunk_surface_failed(reason: String, connection_id: String) -> void:
	if not _confirmed_zone.has_state() or _confirmed_zone.connection_id() != connection_id:
		return
	var center: Variant = _current_confirmed_chunk()
	if _chunk_requested == center:
		_world_design_surfaces.clear()
		_world_design_visuals.reset_surfaces(connection_id)
		_world_asset_api.cancel()
		_world_asset_inflight = ""
		confirmed_terrain.clear()
		starter_village_visuals.clear()
		_clear_neighbor_chunks()
		_clear_terrain3d_presentation()
		unassigned_floor.visible = true
	elif typeof(center) == TYPE_VECTOR2I and maxi(absi(_chunk_requested.x - center.x), absi(_chunk_requested.y - center.y)) == 1:
		_evict_neighbor_chunk(_chunk_requested)
	_chunk_diagnostic = reason
	_update_3d_status()

## An authenticated response can only be presented inside the current
## 3x3 neighborhood. Test fixtures call this method directly without HTTP.
func _apply_neighbor_chunk_surface(readback: Dictionary, connection_id: String) -> bool:
	if not _confirmed_zone.has_state() or _confirmed_zone.connection_id() != connection_id:
		return false
	var center: Variant = _current_confirmed_chunk()
	var base: Variant = readback.get("base")
	if typeof(center) != TYPE_VECTOR2I or typeof(base) != TYPE_DICTIONARY or typeof(base.get("coordinate")) != TYPE_DICTIONARY:
		return false
	var coordinates: Dictionary = base.coordinate
	if not ChunkTerrain._whole(coordinates.get("x"), -1000000, 1000000) or not ChunkTerrain._whole(coordinates.get("z"), -1000000, 1000000):
		return false
	var coordinate := Vector2i(int(coordinates.x), int(coordinates.z))
	if coordinate == center or maxi(absi(coordinate.x - center.x), absi(coordinate.y - center.y)) > 1:
		return false
	var key := "Chunk_%d_%d" % [coordinate.x, coordinate.y]
	var existing: Node3D = confirmed_neighbors.get_node_or_null(key) as Node3D
	if existing == null and confirmed_neighbors.get_child_count() >= 8:
		return false
	var painter: Node3D = ChunkTerrain.new()
	painter.name = key
	if not painter.apply_confirmed(readback, connection_id):
		painter.free()
		_evict_neighbor_chunk(coordinate)
		return false
	if existing != null:
		# Replace an accepted mesh atomically. Evicting the matching design
		# surface here would discard its loaded models on every refresh.
		confirmed_neighbors.remove_child(existing)
		existing.queue_free()
	confirmed_neighbors.add_child(painter)
	_apply_terrain3d_presentation(readback, connection_id)
	_remember_world_design_surface(readback, connection_id, coordinate, center)
	return true

## Fixture seam for the real Godot active-scene test only. Runtime callers
## must pass _on_chunk_surface_ready's protected session and coordinate gate.
func _apply_chunk_surface(readback: Dictionary, connection_id: String) -> bool:
	if not _confirmed_zone.has_state() or _confirmed_zone.connection_id() != connection_id:
		return false
	var coordinate: Variant = _current_confirmed_chunk()
	var base: Variant = readback.get("base")
	if typeof(coordinate) != TYPE_VECTOR2I or typeof(base) != TYPE_DICTIONARY or typeof(base.get("coordinate")) != TYPE_DICTIONARY:
		return false
	if base.coordinate.get("x") != coordinate.x or base.coordinate.get("z") != coordinate.y:
		return false
	if not confirmed_terrain.apply_confirmed(readback, connection_id):
		_world_design_surfaces.clear()
		_world_design_visuals.reset_surfaces(connection_id)
		_world_asset_api.cancel()
		_world_asset_inflight = ""
		starter_village_visuals.clear()
		unassigned_floor.visible = true
		_clear_terrain3d_presentation()
		_chunk_diagnostic = confirmed_terrain.diagnostic
		_update_3d_status()
		return false
	unassigned_floor.visible = false
	_apply_terrain3d_presentation(readback, connection_id)
	_remember_world_design_surface(readback, connection_id, coordinate, coordinate)
	# The authenticated chunk contains an optional server-owned visual plan.
	# A missing or invalid plan never fabricates a client-owned settlement.
	var village_ok: bool = starter_village_visuals.apply_confirmed(readback, connection_id)
	_chunk_diagnostic = "" if village_ok else starter_village_visuals.diagnostic
	_update_3d_status()
	return true

