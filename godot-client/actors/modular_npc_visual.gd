extends RefCounted
## Private MCS 1.0 OPTIONAL presentation bridge. Never creates NPC IDs, positions,
## movement, decisions or receipts. Caller MUST validate Aurion's quest-NPC row.
## No third-party source/assets are checked into the public repository.
const ANIMATION_SCENE := "res://addons/modular_character_system/Animation/ModularAnimationCharacter.tscn"
const MALE_MODEL := "res://addons/modular_character_system/Assets/Models/BaseMale.gltf"
const FEMALE_MODEL := "res://addons/modular_character_system/Assets/Models/BaseFemale.gltf"
const VISUAL_NAMESPACE := "aurion.visual.mcs1|"
const HAIR_COLORS := [
	Color(0.14, 0.07, 0.025), Color(0.38, 0.19, 0.08),
	Color(0.73, 0.50, 0.22), Color(0.09, 0.09, 0.10),
	Color(0.55, 0.27, 0.12), Color(0.78, 0.71, 0.58),
]
const OUTFIT_COLORS := [
	Color(0.76, 0.64, 0.46), Color(0.43, 0.59, 0.37),
	Color(0.53, 0.42, 0.66), Color(0.45, 0.53, 0.62),
]
const SKIN_TONES := [
	Color(0.72, 0.46, 0.32), Color(0.55, 0.31, 0.19),
	Color(0.85, 0.60, 0.43), Color(0.43, 0.24, 0.14),
]

const RECEIPT := "res://addons/modular_character_system/.aurion-mcs-install.json"
const VENDOR_ROOT := "res://addons/modular_character_system/"
const PINNED_ZIP_SHA := "ac72db1a5ff6985e19f1c07e4d1404560684f07aa7b9268382be8bcd2c635788"

## Never trust vendor directory presence or an unsigned/unverified receipt alone.
## Byte-check the complete manifest (including GLTF BIN and texture dependencies).
static func available() -> bool:
	if not FileAccess.file_exists(RECEIPT):
		return false
	var raw: Variant = JSON.parse_string(FileAccess.get_file_as_string(RECEIPT))
	if typeof(raw) != TYPE_DICTIONARY or raw.get("version") != "1.0.0" or raw.get("sha256") != PINNED_ZIP_SHA:
		return false
	var files: Variant = raw.get("files")
	if typeof(files) != TYPE_DICTIONARY or files.size() != raw.get("count") or files.is_empty() or files.size() > 400:
		return false
	var regex := RegEx.new()
	regex.compile("^[A-Za-z0-9_./ -]+$")
	for rel in files.keys():
		if typeof(rel) != TYPE_STRING or rel.is_empty() or rel.begins_with("/") or rel.contains("..") or rel.contains("\\") or regex.search(rel) == null:
			return false
		var expected: Variant = files[rel]
		if typeof(expected) != TYPE_STRING or expected.length() != 64:
			return false
		var absolute := VENDOR_ROOT + rel
		if not FileAccess.file_exists(absolute) or FileAccess.get_sha256(absolute) != expected:
			return false
	return ResourceLoader.exists(ANIMATION_SCENE, "PackedScene") and ResourceLoader.exists(MALE_MODEL, "PackedScene") and ResourceLoader.exists(FEMALE_MODEL, "PackedScene")

## Stable, cosmetic ONLY, independent of iteration, machine time and RNG.
## A profession or economic role must come from Aurion, never this hash.
static func recipe(entity_id: Variant) -> Dictionary:
	if typeof(entity_id) != TYPE_STRING or entity_id.length() < 6 or entity_id.length() > 68:
		return {}
	var pattern := RegEx.new()
	if pattern.compile("^npc:[a-z][a-z0-9_]{1,63}$") != OK or pattern.search(entity_id) == null:
		return {}
	var bytes: PackedByteArray = (VISUAL_NAMESPACE + entity_id).sha256_buffer()
	return {
		"model": "male" if bytes[0] % 2 == 0 else "female",
		"outfit": 1 + int(bytes[1] % 2), # Peasant/Ranger. Never None.
		"hair": int(bytes[2] % 6),
		"hair_color": int(bytes[3] % HAIR_COLORS.size()),
		"outfit_color": int(bytes[4] % OUTFIT_COLORS.size()),
		"skin": int(bytes[5] % SKIN_TONES.size()),
		"beard": int(bytes[6] % 3 == 0),
	}

## Called only AFTER the registry checked a server-confirmed, approved
## 'audited-standard' NPC model and position. This is NOT a spawn API.
static func create(entity_id: String, display_name: String) -> Node3D:
	var look: Dictionary = recipe(entity_id)
	if look.is_empty() or not available():
		return null
	var packed := load(ANIMATION_SCENE) as PackedScene
	var model_scene := load(MALE_MODEL if look.model == "male" else FEMALE_MODEL) as PackedScene
	if packed == null or model_scene == null:
		return null
	var puppet: Node = packed.instantiate()
	if not puppet is Node3D:
		if puppet != null:
			puppet.free()
		return null
	var slot := puppet.get_node_or_null("ModelSlot") as Node3D
	var appearance := puppet.get_node_or_null("Appearance") as Node3D
	if slot == null or appearance == null or slot.get_child_count() != 0:
		puppet.free()
		return null
	var body := model_scene.instantiate()
	if not body is Node3D:
		if body != null:
			body.free()
		puppet.free()
		return null
	slot.add_child(body)
	puppet.set("character_display_name", display_name.substr(0, 80))
	puppet.set("auto_play_idle", true)
	appearance.set("customization_enabled", true)
	appearance.set("outfit", look.outfit)
	appearance.set("hairstyle", look.hair)
	appearance.set("hair_color", HAIR_COLORS[look.hair_color])
	appearance.set("outfit_color", OUTFIT_COLORS[look.outfit_color])
	appearance.set("skin_tone", SKIN_TONES[look.skin])
	appearance.set("facial_hair", look.beard if look.model == "male" else 0)
	puppet.set_meta("aurion_visual_system", "private-mcs-1.0")
	puppet.set_meta("aurion_cosmetic_recipe", look.duplicate(true))
	return puppet as Node3D
