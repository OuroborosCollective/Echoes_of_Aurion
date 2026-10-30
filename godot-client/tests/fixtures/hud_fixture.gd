extends RefCounted
## Synthetic, protocol-shaped test input. Never a live Aurion readback.
const Codec = preload("res://net/zone_codec.gd")

static func welcome() -> Dictionary:
	var nodes: Array = []
	for id in Codec.NODE_IDS:
		nodes.append({"nodeId": id, "remaining": 5, "depleted": false, "respawnAtTick": null})
	return {"type": "welcome", "protocolVersion": 5, "zoneId": "observatory_threshold",
		"connectionId": "zone_peer_hud_test_123456789", "selfEntityId": "player:1", "snapshotSeq": 1, "tick": 1,
		"presences": [{"entityId": "player:1", "userId": 1, "position": {"x": 0, "z": 0}, "lastAcceptedClientSeq": 0}],
		"mobs": [{"entityId": "mob_1", "archetype": "clockwork_stalker", "level": 1, "state": "idle", "position": {"x": 2000, "z": 0}, "targetEntityId": null, "isBoss": false, "isElite": false, "health": 7, "maxHealth": 10}],
		"combatants": [{"entityId": "player:1", "health": 17, "maxHealth": 20, "stamina": 8, "maxStamina": 10, "alive": true, "combatLevel": 2, "lastCombatSequence": 0}],
		"resources": {"contractVersion": 1, "contentSourceRevision": Codec.FIXED_CONTENT, "revision": 1, "nodes": nodes}}

static func snapshot(welcome_data: Dictionary, sequence: int) -> Dictionary:
	var result := welcome_data.duplicate(true)
	for key in ["protocolVersion", "connectionId", "selfEntityId"]:
		result.erase(key)
	result["type"] = "snapshot"
	result["snapshotSeq"] = sequence
	result["tick"] = sequence
	return result
