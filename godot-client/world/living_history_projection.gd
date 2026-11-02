extends RefCounted
## Presentation only. The server owns history and receipt truth.

const SCHEMA := "aurion.public-collapse-history.v1"
const MAX_EVENTS := 20

static func _bounded_string(value: Variant, max_length: int) -> bool:
	return typeof(value) == TYPE_STRING and not value.is_empty() and value.length() <= max_length

static func _whole(value: Variant, minimum: int) -> bool:
	if typeof(value) not in [TYPE_INT, TYPE_FLOAT]:
		return false
	var number := float(value)
	return not is_nan(number) and not is_inf(number) and number >= minimum and number <= 2147483647 and number == floor(number)

static func _sha256(value: Variant) -> bool:
	if typeof(value) != TYPE_STRING or value.length() != 64:
		return false
	for ch in value:
		if not "0123456789abcdef".contains(ch):
			return false
	return true

static func present(response: Variant, world_id: String) -> Dictionary:
	if world_id.is_empty() or typeof(response) != TYPE_DICTIONARY or response.get("schema") != SCHEMA or response.get("worldId") != world_id or response.get("disclosureScope") != "public-history-events":
		return {"ok": false}
	var events: Variant = response.get("events")
	if typeof(events) != TYPE_ARRAY or events.size() > MAX_EVENTS:
		return {"ok": false}
	var seen := {}
	var lines: Array[String] = []
	for event in events:
		if typeof(event) != TYPE_DICTIONARY or event.get("worldId") != world_id or event.get("eventType") != "CIVILIZATION_COLLAPSE":
			return {"ok": false}
		for key in ["civilizationId", "sourceReceiptId", "sourceRevision"]:
			if not _bounded_string(event.get(key), 64):
				return {"ok": false}
		if not _whole(event.get("worldEpoch"), 1) or not _whole(event.get("sourceEpoch"), 1) or not _whole(event.get("occurredSequence"), 0):
			return {"ok": false}
		for key in ["eventId", "eventPayloadHash", "sourceReactionHash"]:
			if not _sha256(event.get(key)):
				return {"ok": false}
		if seen.has(event.eventId):
			return {"ok": false}
		seen[event.eventId] = true
		lines.append("%s · Kollapsereignis · Epoche %d · Folge %d\nQuelle %s · Regelwerk %s" % [event.civilizationId, int(event.worldEpoch), int(event.occurredSequence), event.sourceReceiptId, event.sourceRevision])
	var heading := "Weltgeschichte · gespeicherte Ereignisse (Qualifikation nicht unabhängig geprüft)"
	return {"ok": true, "text": heading + ("\nKeine Ereignisse in diesem Auszug" if lines.is_empty() else "\n" + "\n".join(lines)), "count": events.size()}
