extends RefCounted
## Stable read-only entity lookup. Aurion's confirmed snapshot is sole authority.
var _connection := ""
var _seq := -1
var _tables: Dictionary = {}
var _spawns: Dictionary = {}
var _despawns: Dictionary = {}
const CATEGORIES := ["presences", "mobs", "combatants", "resources"]

func reset() -> void:
	_connection = ""
	_seq = -1
	_tables.clear()
	_spawns.clear()
	_despawns.clear()

func sync(world: Variant) -> bool:
	if world == null or not world.has_state():
		return false
	var connection: String = world.connection_id()
	var seq: int = world.last_seq()
	if connection == _connection and seq <= _seq:
		return false
	var state: Dictionary = world.current_state()
	var replacement: Dictionary = {}
	for category in CATEGORIES:
		var records: Array = state["resources"]["nodes"] if category == "resources" else state[category]
		var entries: Dictionary = {}
		for record in records:
			var key: String = record["nodeId"] if category == "resources" else record["entityId"]
			entries[key] = record.duplicate(true)
		replacement[category] = entries
	var changed_session := connection != _connection
	for category in CATEGORIES:
		var previous: Dictionary = {} if changed_session else _tables.get(category, {})
		var next: Dictionary = replacement[category]
		var added: Array[String] = []
		var removed: Array[String] = []
		for key in next:
			if not previous.has(key):
				added.append(key)
		for key in previous:
			if not next.has(key):
				removed.append(key)
		added.sort()
		removed.sort()
		_spawns[category] = added
		_despawns[category] = removed
	_tables = replacement
	_connection = connection
	_seq = seq
	return true

func ids(category: String) -> Array[String]:
	var result: Array[String] = []
	if category not in CATEGORIES:
		return result
	for key in _tables.get(category, {}):
		result.append(key)
	result.sort()
	return result

func record(category: String, id: String) -> Dictionary:
	if category not in CATEGORIES:
		return {}
	var value: Dictionary = _tables.get(category, {}).get(id, {})
	return value.duplicate(true)

func spawned(category: String) -> Array[String]:
	var value: Array[String] = _spawns.get(category, [])
	return value.duplicate()

func despawned(category: String) -> Array[String]:
	var value: Array[String] = _despawns.get(category, [])
	return value.duplicate()
