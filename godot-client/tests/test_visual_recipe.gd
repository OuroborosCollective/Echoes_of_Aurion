extends SceneTree
## Isolated Godot geometry/material inspection using a real repository GLB.
## Synthesized negative controls are NOT Aurion live-world evidence.
const VisualRecipe = preload("res://world/visual_recipe.gd")
const SHA := "dbec78ee8f51587db4247186a44b75bc0cd639f5e3f0ea54803deaba95e4a17d"
var failures: Array[String] = []

func require(condition: bool, reason: String) -> void:
    if not condition:
        failures.append(reason)

func _init() -> void:
    call_deferred("verify")

func verify() -> void:
    var bytes := FileAccess.get_file_as_bytes("res://assets/starter_village/Barrel.glb")
    var digest := HashingContext.new()
    require(digest.start(HashingContext.HASH_SHA256) == OK, "hashing unavailable")
    require(digest.update(bytes) == OK, "hash update unavailable")
    require(digest.finish().hex_encode() == SHA, "real CC0 GLB bytes do not match approved SHA")
    var state := GLTFState.new()
    var document := GLTFDocument.new()
    var result := document.append_from_buffer(bytes, "", state)
    require(result == OK, "real GLB was not accepted by native GLTFDocument")
    if result != OK:
        finish()
        return
    var model := document.generate_scene(state) as Node3D
    require(model != null, "native GLB scene missing")
    if model == null:
        finish()
        return
    var before := model.find_children("*", "CollisionObject3D", true, false).size()
    var recipe: Dictionary = VisualRecipe.inspect(model, SHA)
    require(recipe.get("status") == "ready", "genuine imported GLB refused by recipe inspector")
    if recipe.get("status") == "ready":
        require(recipe.get("version") == VisualRecipe.VERSION and recipe.get("assetSha256") == SHA, "recipe provenance missing")
        require(recipe.geometry.meshInstances > 0 and recipe.geometry.surfaces > 0, "real mesh geometry not described")
        require(recipe.geometry.extentMm.max() > 0, "actual GLB bounds were not measured")
        require(recipe.materials.texturedSurfaces >= 1 and "baseColor" in recipe.materials.channels, "actual embedded PBR albedo map not detected")
        require(recipe.behavior.authority == "aurion-server" and recipe.collision.status == "unbound", "client invented gameplay semantics")
        require(VisualRecipe.inspect(model, SHA) == recipe, "same decoded GLB generated a nonrepeatable recipe")
    require(model.find_children("*", "CollisionObject3D", true, false).size() == before, "inspector created collision nodes")
    require(VisualRecipe.inspect(model, "NOT-A-HASH").get("status") == "blocked", "unapproved asset identifier admitted")
    var foreign_body := StaticBody3D.new()
    model.add_child(foreign_body)
    require(VisualRecipe.inspect(model, SHA).get("reason") == "untrusted_collision_nodes", "untrusted gameplay physics node admitted")
    model.remove_child(foreign_body)
    foreign_body.free()
    model.free()
    var empty := Node3D.new()
    require(VisualRecipe.inspect(empty, SHA).get("status") == "blocked", "empty mesh admitted")
    empty.free()
    var untextured := Node3D.new()
    var display := MeshInstance3D.new()
    var st := SurfaceTool.new()
    st.begin(Mesh.PRIMITIVE_TRIANGLES)
    for vertex in [Vector3(0,0,0), Vector3(1,0,0), Vector3(0,0,1)]:
        st.set_normal(Vector3.UP)
        st.add_vertex(vertex)
    display.mesh = st.commit()
    var image := Image.create(2, 2, false, Image.FORMAT_RGBA8)
    image.fill(Color.WHITE)
    var pbr := StandardMaterial3D.new()
    pbr.albedo_texture = ImageTexture.create_from_image(image)
    display.material_override = pbr
    untextured.add_child(display)
    var warning: Dictionary = VisualRecipe.inspect(untextured, SHA)
    require(warning.get("status") == "ready" and warning.materials.missingUv0Surfaces == 1, "textured surface without UV0 was not reported")
    untextured.free()
    finish()

func finish() -> void:
    for failure in failures:
        push_error(failure)
    if failures.is_empty():
        print("AURION_VISUAL_RECIPE_GLTF_PASS")
    quit(0 if failures.is_empty() else 1)
