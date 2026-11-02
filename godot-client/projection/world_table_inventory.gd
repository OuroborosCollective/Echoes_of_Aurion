extends RefCounted
## Decimal quantities stay strings; a stock read is not a construction permit.
const Slice = preload("res://projection/world_slice.gd")
static func exact(value: Variant) -> bool:
	if typeof(value) != TYPE_STRING or value.is_empty() or value.length() > 128:
		return false
	if value.length() > 1 and value[0] == "0": return false
	for character in value:
		if character < "0" or character > "9": return false
	return true

static func valid(reply: Variant, actor: String) -> bool:
	if not Slice._keys(reply, ["schema", "actorId", "revisionExact", "stockHash", "stacks", "mutationAuthority"]): return false
	if reply.schema != "aurion.worldtable-owned-stock.v1" or reply.actorId != actor or not Slice._actor(actor) or reply.mutationAuthority != "none" or not exact(reply.revisionExact) or not Slice._sha(reply.stockHash): return false
	if JSON.stringify(reply).to_utf8_buffer().size() > 65536 or typeof(reply.stacks) != TYPE_ARRAY or reply.stacks.size() > 256: return false
	var seen: Dictionary = {}
	for stack in reply.stacks:
		if not Slice._keys(stack, ["id", "version", "definitionId", "quantityExact"]): return false
		if typeof(stack.id) != TYPE_STRING or stack.id.is_empty() or stack.id.length() > 64 or seen.has(stack.id): return false
		if stack.version not in ["legacy", "aurion_v2"] or typeof(stack.definitionId) != TYPE_STRING or stack.definitionId.is_empty() or stack.definitionId.length() > 96 or not exact(stack.quantityExact) or stack.quantityExact == "0": return false
		seen[stack.id] = true
	return true
