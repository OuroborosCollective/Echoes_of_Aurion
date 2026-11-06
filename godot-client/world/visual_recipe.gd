extends RefCounted
## Inspects ACTUALLY imported Godot meshes and materials for an approved GLB.
## No gameplay state, asset approval, collision, behavior or world mutation.
## Findings are a read-only presentation recipe, not an Aurion server receipt.
const VERSION := "aurion.godot.visual-recipe.v1"
const MAX_MESH_INSTANCES := 256
const MAX_SURFACES := 512
const MAX_COORDINATE_METERS := 1000000.0
const CHANNEL_ORDER := ["baseColor", "normal", "metallic", "roughness", "occlusion", "emission"]

static func blocked(reason: String) -> Dictionary:
    return {"status": "blocked", "reason": reason}

static func _valid_sha(value: String) -> bool:
    if value.length() != 64:
        return false
    for digit in value:
        if not "0123456789abcdef".contains(digit):
            return false
    return true

static func _bounded(vector: Vector3) -> bool:
    return vector.is_finite() and absf(vector.x) <= MAX_COORDINATE_METERS and absf(vector.y) <= MAX_COORDINATE_METERS and absf(vector.z) <= MAX_COORDINATE_METERS

static func _millimeters(vector: Vector3) -> Array[int]:
    return [roundi(vector.x * 1000.0), roundi(vector.y * 1000.0), roundi(vector.z * 1000.0)]

static func _channels(material: Material) -> Array[String]:
    var result: Array[String] = []
    if not material is BaseMaterial3D:
        return result
    var pbr := material as BaseMaterial3D
    if pbr.albedo_texture != null:
        result.append("baseColor")
    if pbr.normal_texture != null:
        result.append("normal")
    if pbr.metallic_texture != null:
        result.append("metallic")
    if pbr.roughness_texture != null:
        result.append("roughness")
    if pbr.ao_texture != null:
        result.append("occlusion")
    if pbr.emission_texture != null:
        result.append("emission")
    return result

## Uses existing decoded MeshInstance3D surfaces. This never guesses that a
## texture means 'wood' or that a mesh acts as a building/solid obstacle.
static func inspect(model: Node3D, approved_sha: String) -> Dictionary:
    if model == null or not _valid_sha(approved_sha):
        return blocked("approved_asset_identity_invalid")
    if not model.find_children("*", "CollisionObject3D", true, false).is_empty():
        return blocked("untrusted_collision_nodes")
    var meshes: Array[Node] = model.find_children("*", "MeshInstance3D", true, false)
    if meshes.is_empty() or meshes.size() > MAX_MESH_INSTANCES:
        return blocked("mesh_instance_budget_invalid")
    var found := false
    var combined := AABB()
    var surfaces := 0
    var textured_surfaces := 0
    var missing_uv_surfaces := 0
    var material_kinds := {"pbr": 0, "shader": 0, "unassigned": 0}
    var present_channels := {}
    for item in meshes:
        var mesh := item as MeshInstance3D
        if mesh == null or mesh.mesh == null:
            return blocked("mesh_missing")
        var transform := Transform3D.IDENTITY
        var cursor: Node = mesh
        while cursor != model and cursor != null:
            if cursor is Node3D:
                transform = (cursor as Node3D).transform * transform
            cursor = cursor.get_parent()
        if cursor != model:
            return blocked("mesh_hierarchy_invalid")
        var box: AABB = transform * mesh.get_aabb()
        if not _bounded(box.position) or not _bounded(box.end) or not _bounded(box.size) or box.size.x < 0.0 or box.size.y < 0.0 or box.size.z < 0.0:
            return blocked("geometry_bounds_invalid")
        combined = combined.merge(box) if found else box
        found = true
        for surface_index in range(mesh.mesh.get_surface_count()):
            surfaces += 1
            if surfaces > MAX_SURFACES:
                return blocked("surface_budget_exceeded")
            var material: Material = mesh.get_active_material(surface_index)
            if material is BaseMaterial3D:
                material_kinds["pbr"] += 1
            elif material is ShaderMaterial:
                material_kinds["shader"] += 1
            else:
                material_kinds["unassigned"] += 1
            var channels := _channels(material)
            if not channels.is_empty():
                textured_surfaces += 1
                var has_uv0: bool = (mesh.mesh.surface_get_format(surface_index) & Mesh.ARRAY_FORMAT_TEX_UV) != 0
                if not has_uv0:
                    missing_uv_surfaces += 1
                for channel in channels:
                    present_channels[channel] = true
    if not found or surfaces == 0 or not _bounded(combined.position) or not _bounded(combined.end) or combined.size.length_squared() <= 0.0:
        return blocked("geometry_empty_or_invalid")
    var channels_ordered: Array[String] = []
    for channel in CHANNEL_ORDER:
        if present_channels.has(channel):
            channels_ordered.append(channel)
    # The only integer geometry offered to CAG; floats stay in the Godot renderer.
    var min_mm := _millimeters(combined.position)
    var max_mm := _millimeters(combined.end)
    var extent_mm: Array[int] = [max_mm[0] - min_mm[0], max_mm[1] - min_mm[1], max_mm[2] - min_mm[2]]
    return {
        "status": "ready",
        "version": VERSION,
        "source": "decoded-approved-glb",
        "assetSha256": approved_sha,
        "geometry": {"minMm": min_mm, "maxMm": max_mm, "extentMm": extent_mm, "meshInstances": meshes.size(), "surfaces": surfaces},
        "materials": {"channels": channels_ordered, "types": material_kinds, "texturedSurfaces": textured_surfaces, "missingUv0Surfaces": missing_uv_surfaces},
        "collision": {"status": "unbound", "authority": "aurion-server"},
        "behavior": {"status": "unbound", "authority": "aurion-server"},
        "animation": {"status": "unbound", "authority": "aurion-server"},
        "authority": "presentation-only"
    }
