extends RefCounted
## G17 presentation-only materials. Actual game-world placement is a separate,
## server-confirmed projection; these tiles never decide geometry or collisions.
const ATLAS_PATH := "res://assets/world/aurion-surface-atlas.webp"
const META_PATH := "res://assets/world/aurion-surface-atlas.json"
const IMAGE_SIZE := 1024
const TILE_SIZE := 512
const NAMES := ["paving", "forest", "wood", "rock"]
## One presentation mapping for confirmed Aurion tile surfaces. This does not
## create or amend the server's world, terrain, collision or asset identities.
const TERRAIN_SURFACE_TO_MATERIAL := {
	"grass": "forest", "forest_floor": "forest",
	"riverbank": "rock", "stone": "rock", "ash": "rock",
	"ruin_path": "paving",
}
## Terrain3D's imported texture order (forest, rock, paving) is fixed and
## resolved through the same names as the G18 native mesh path.
const TERRAIN3D_MATERIAL_TO_ID := {"forest": 0, "rock": 1, "paving": 2}

func terrain3d_id_for_surface(surface: String) -> int:
	var material: String = str(TERRAIN_SURFACE_TO_MATERIAL.get(surface, ""))
	return int(TERRAIN3D_MATERIAL_TO_ID.get(material, -1))
const EXPECTED_SHA256 := "f329e8e1224416e38967f888d40d4459bf8b359001370a432cb270c13f1f3f35"

static func blocked(reason: String) -> Dictionary:
	return {"status": "blocked", "reason": reason}

## The source WebP bytes are separately SHA256-verified during the Godot CI
## build. Engine runtime uses the imported texture bytes (not a parallel fetch).
func build() -> Dictionary:
	var metadata: Variant = JSON.parse_string(FileAccess.get_file_as_string(META_PATH))
	if typeof(metadata) != TYPE_DICTIONARY:
		return blocked("atlas_metadata_missing")
	if metadata.get("version") != 1 or metadata.get("sha256") != EXPECTED_SHA256 or metadata.get("bytes") != 439340 or metadata.get("width") != IMAGE_SIZE or metadata.get("height") != IMAGE_SIZE or metadata.get("runtimeTileSize") != TILE_SIZE or metadata.get("quadrants") != NAMES or metadata.get("colorSpace") != "sRGB" or metadata.get("maps") != ["baseColor"]:
		return blocked("atlas_metadata_invalid")
	var source: Texture2D = load(ATLAS_PATH) as Texture2D
	if source == null:
		return blocked("atlas_texture_missing")
	if source.get_width() != IMAGE_SIZE or source.get_height() != IMAGE_SIZE:
		return blocked("atlas_dimensions_invalid")
	return build_from_image(source.get_image())

## Explicit image input is a test seam for malformed local resource rejection.
## It never performs a world-state, seed, combat, collision or DB operation.
func build_from_image(image: Image) -> Dictionary:
	if image == null or image.get_width() != IMAGE_SIZE or image.get_height() != IMAGE_SIZE:
		return blocked("atlas_dimensions_invalid")
	var pixels: Image = image.duplicate() as Image
	if pixels == null:
		return blocked("atlas_image_unavailable")
	if pixels.is_compressed() and pixels.decompress() != OK:
		return blocked("atlas_decompression_failed")
	var materials: Dictionary = {}
	for i in range(NAMES.size()):
		var region := Rect2i((i % 2) * TILE_SIZE, (i / 2) * TILE_SIZE, TILE_SIZE, TILE_SIZE)
		var tile: Image = pixels.get_region(region)
		if tile == null or tile.get_width() != TILE_SIZE or tile.get_height() != TILE_SIZE:
			return blocked("atlas_tile_invalid")
		if tile.generate_mipmaps() != OK:
			return blocked("atlas_mipmap_failed")
		var texture: ImageTexture = ImageTexture.create_from_image(tile)
		if texture == null:
			return blocked("atlas_texture_failed")
		var material := StandardMaterial3D.new()
		material.albedo_color = Color.WHITE
		material.albedo_texture = texture
		material.roughness = 0.88 if NAMES[i] == "paving" else 0.96
		material.metallic = 0.0
		material.texture_filter = BaseMaterial3D.TEXTURE_FILTER_LINEAR_WITH_MIPMAPS_ANISOTROPIC
		materials[NAMES[i]] = material
	return {"status": "resolved", "materials": materials, "surfaceIds": NAMES.duplicate(), "sourceSha256": EXPECTED_SHA256, "authority": "presentation-only"}
