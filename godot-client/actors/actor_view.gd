extends Node3D
## Presentation only. The caller resolves an approved catalog model; this module
## never selects/equips assets, sends commands or changes confirmed Aurion state.
const Registry = preload("res://projection/entity_registry.gd")
var entity_id := ""
var asset_id := ""
var diagnostic := "unbound"
var _connection := ""
var _model: Node3D
var _player: AnimationPlayer
var _confirmed: Dictionary = {}
var _seq := -1
var _dead := false
var _pose := ""

func bind_confirmed(world: Variant, id: String, catalog_asset_id: String, packed: PackedScene) -> bool:
	if not entity_id.is_empty() or world == null or not world.has_state() or packed == null or catalog_asset_id.is_empty():
		return false
	var registry := Registry.new()
	registry.sync(world)
	if registry.record("presences", id).is_empty() and registry.record("mobs", id).is_empty():
		return false
	var instance := packed.instantiate()
	if not instance is Node3D:
		instance.free()
		return false
	var model: Node3D = instance
	var players := model.find_children("*", "AnimationPlayer", true, false)
	if players.size() != 1:
		model.free()
		diagnostic = "animation_player_missing_or_ambiguous"
		return false
	_model = model
	_player = players[0]
	# Per-instance libraries: loop configuration cannot mutate shared imports.
	for library_name in _player.get_animation_library_list():
		var library := _player.get_animation_library(library_name).duplicate(true) as AnimationLibrary
		_player.remove_animation_library(library_name)
		_player.add_animation_library(library_name, library)
		for clip in library.get_animation_list():
			library.get_animation(clip).loop_mode = Animation.LOOP_LINEAR if clip in ["Idle", "Walk"] else Animation.LOOP_NONE
	entity_id = id
	asset_id = catalog_asset_id
	_connection = world.connection_id()
	add_child(_model)
	visible = false
	diagnostic = "awaiting_projection"
	return true

func project(world: Variant, interpolation: Variant, now_ms: int) -> bool:
	if entity_id.is_empty():
		return false
	if world == null or not world.has_state() or world.connection_id() != _connection:
		clear()
		return false
	if world.last_seq() < _seq or interpolation == null or not interpolation.matches(world) or now_ms < 0:
		visible = false
		diagnostic = "projection_mismatch"
		return false
	var record: Dictionary = {}
	if world.last_seq() > _seq:
		var registry := Registry.new()
		registry.sync(world)
		record = registry.record("presences", entity_id)
		if record.is_empty():
			record = registry.record("mobs", entity_id)
		if record.is_empty():
			clear()
			return false
		record["_combatant"] = registry.record("combatants", entity_id)
	var confirmed: Dictionary = record["position"] if not record.is_empty() else _confirmed
	if interpolation.confirmed_mm(entity_id) != confirmed:
		visible = false
		diagnostic = "projection_mismatch"
		return false
	var point: Variant = interpolation.visual_mm(entity_id, now_ms)
	if not point is Vector2 or not point.is_finite():
		visible = false
		return false
	if world.last_seq() > _seq:
		var combatant: Dictionary = record["_combatant"]
		_dead = record.get("state", "") == "dead" or combatant.get("alive", true) == false
		_confirmed = confirmed.duplicate(true)
		_seq = world.last_seq()
	var moving: bool = point.distance_to(Vector2(confirmed["x"], confirmed["z"])) > 0.5
	var clip := "Death" if _dead else ("Walk" if moving else "Idle")
	diagnostic = "" if _player.has_animation(clip) else "missing_clip:" + clip
	if _pose != clip:
		if not _player.has_animation(clip):
			_player.stop()
		else:
			_player.play(clip)
		_pose = clip
	# Imported root/bone animation remains below this world-position wrapper.
	position = Vector3(point.x / 1000.0, 0.0, point.y / 1000.0)
	visible = true
	return true

func confirmed_mm() -> Dictionary:
	return _confirmed.duplicate(true)

func clear() -> void:
	if is_instance_valid(_model):
		remove_child(_model)
		_model.free()
	_model = null
	_player = null
	entity_id = ""
	asset_id = ""
	_connection = ""
	_confirmed.clear()
	_seq = -1
	_dead = false
	_pose = ""
	visible = false
	diagnostic = "unbound"
