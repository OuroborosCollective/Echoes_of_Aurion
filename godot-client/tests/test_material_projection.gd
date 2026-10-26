extends SceneTree
## Real imported WebP atlas evidence and independently rendered Godot materials.
## An isolated local material test is not a live-world or Android-GPU proof.
var failures: Array[String] = []
const KINDS := ["paving", "forest", "wood", "rock"]

func require(condition: bool, message: String) -> void:
	if not condition:
		failures.append(message)

func _init() -> void:
	call_deferred("verify")

func colors_match(a: Color, b: Color) -> bool:
	return absf(a.r - b.r) < 0.025 and absf(a.g - b.g) < 0.025 and absf(a.b - b.b) < 0.025 and absf(a.a - b.a) < 0.025

func verify() -> void:
	var source: Texture2D = load("res://assets/world/aurion-surface-atlas.webp") as Texture2D
	var catalog_script: Script = load("res://world/material_catalog.gd") as Script
	if source == null or catalog_script == null:
		push_error("G17 missing real atlas resource or material catalog")
		quit(1)
		return
	var atlas_image: Image = source.get_image()
	require(atlas_image.get_width() == 1024 and atlas_image.get_height() == 1024, "original atlas dimensions differ from provenance")
	var catalog = catalog_script.new()
	var result: Dictionary = catalog.build()
	require(result.get("status") == "resolved", "G17 real atlas cannot produce four native materials")
	if result.get("status") == "resolved":
		var materials: Dictionary = result.materials
		require(materials.size() == 4, "G17 must have exactly four named surface materials")
		for i in range(KINDS.size()):
			var kind: String = KINDS[i]
			var material: StandardMaterial3D = materials.get(kind) as StandardMaterial3D
			require(material != null, "G17 missing material " + kind)
			if material == null:
				continue
			require(is_equal_approx(material.metallic, 0.0), "G17 basecolor atlas cannot invent metal maps")
			require(is_equal_approx(material.roughness, 0.88 if kind == "paving" else 0.96), "G17 roughness differs from web source")
			var tile: Texture2D = material.albedo_texture
			require(tile != null, "G17 albedo texture missing for " + kind)
			if tile == null:
				continue
			var image: Image = tile.get_image()
			require(image.get_width() == 512 and image.get_height() == 512, "G17 quadrant not isolated for " + kind)
			require(image.has_mipmaps(), "G17 tile lacks independent mipmaps for " + kind)
			var offset := Vector2i((i % 2) * 512, (i / 2) * 512)
			for point in [Vector2i(16, 16), Vector2i(256, 256), Vector2i(496, 496)]:
				require(colors_match(image.get_pixel(point.x, point.y), atlas_image.get_pixel(point.x + offset.x, point.y + offset.y)), "G17 pixel quadrant mismatch for " + kind)
	var too_small := Image.create(16, 16, false, Image.FORMAT_RGBA8)
	require(catalog.build_from_image(too_small).get("status") == "blocked", "G17 malformed image was silently accepted")
	for error in failures:
		push_error(error)
	if failures.is_empty():
		print("G17 atlas material projection verified")
	quit(0 if failures.is_empty() else 1)
