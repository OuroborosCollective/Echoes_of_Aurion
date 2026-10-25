extends RefCounted
## Presentation-only registry. Only confirmed presences joined to authenticated
## public appearance replies and byte-verified packaged models may be mounted.
const ActorScene = preload("res://actors/actor_view.tscn")
const AppearanceResolver = preload("res://actors/appearance_resolver.gd")
var _actors: Dictionary = {}
var _resource_paths: Dictionary = {}
var diagnostic := ""
var _monsters: bool

func _init(monsters: bool = false) -> void:
	_monsters = monsters

func _remove(root: Node3D, entity_id: String) -> void:
	var actor: Variant = _actors.get(entity_id)
	if is_instance_valid(actor):
		actor.visible = false
		if actor.get_parent() == root:
			root.remove_child(actor)
		actor.queue_free()
	_actors.erase(entity_id)
	_resource_paths.erase(entity_id)

func clear(root: Node3D) -> void:
	for id in _actors.keys():
		_remove(root, str(id))

func apply(world: Variant, root: Node3D, response: Variant, catalog: Variant, manifest: Variant) -> void:
	if world == null or not world.has_state() or typeof(response) != TYPE_DICTIONARY:
		clear(root)
		return
	var rows: Variant = world.current_state().get("mobs", []) if _monsters else response.get("appearances")
	if typeof(rows) != TYPE_ARRAY or rows.size() > 128:
		clear(root)
		return
	diagnostic = ""
	var resolver = AppearanceResolver.new()
	var accepted: Dictionary = {}
	for row in rows:
		var resolution: Dictionary = resolver.resolve_monster(world, row, catalog, manifest) if _monsters else resolver.resolve_public_presence(world, row, catalog, manifest)
		if resolution.get("reason") == "presence_absent":
			continue # A response for a player who already despawned is stale.
		if resolution.get("status") != "resolved":
			if _monsters:
				diagnostic = str(resolution.get("reason", "monster_unavailable"))
				continue
			clear(root)
			return
		var id: String = resolution.entityId
		if accepted.has(id):
			clear(root) # Ambiguous server reply must not keep an older actor.
			return
		accepted[id] = resolution
	for id in _actors.keys():
		if not accepted.has(id) or _resource_paths.get(id) != accepted[id].resourcePath or _actors[id].asset_id != accepted[id].catalogAssetId:
			_remove(root, str(id))
	for id in accepted:
		if _actors.has(id):
			continue
		var resolved: Dictionary = accepted[id]
		var packed := load(str(resolved.resourcePath)) as PackedScene
		if packed == null:
			continue
		var actor: Node3D = ActorScene.instantiate()
		root.add_child(actor)
		if not actor.bind_confirmed(world, str(id), str(resolved.catalogAssetId), packed):
			root.remove_child(actor)
			actor.queue_free()
			continue
		_actors[id] = actor
		_resource_paths[id] = resolved.resourcePath

func project(world: Variant, interpolation: Variant, now_ms: int, root: Node3D) -> void:
	for id in _actors.keys():
		var actor: Variant = _actors[id]
		if not is_instance_valid(actor):
			_actors.erase(id)
			_resource_paths.erase(id)
			continue
		if not actor.project(world, interpolation, now_ms) and actor.entity_id.is_empty():
			_remove(root, str(id))

func visible_count() -> int:
	var count := 0
	for actor in _actors.values():
		if is_instance_valid(actor) and actor.visible:
			count += 1
	return count
