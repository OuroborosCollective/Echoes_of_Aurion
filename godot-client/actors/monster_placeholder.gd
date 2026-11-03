extends RefCounted
## Presentation-only stand-in for a server-confirmed mob whose archetype has no
## prepared, byte-verified model yet. It is a clearly labeled primitive, NEVER
## another archetype's, a character's or an unverified downloaded model, and it
## carries no gameplay state: position, life and death stay Aurion-confirmed.
const NAMES := {
	"clockwork_stalker": "Clockwork Stalker",
	"corrupted_golem": "Corrupted Golem",
	"aether_wisp": "Aether Wisp",
	"steam_drake": "Steam Drake",
	"centurion_elite": "Brass Centurion",
	"titan_boss": "The Aether Titan",
}
const COLORS := {
	"clockwork_stalker": Color(0.72, 0.55, 0.32),
	"corrupted_golem": Color(0.45, 0.42, 0.50),
	"aether_wisp": Color(0.45, 0.85, 1.0),
	"steam_drake": Color(0.85, 0.42, 0.25),
	"centurion_elite": Color(0.85, 0.68, 0.25),
	"titan_boss": Color(0.62, 0.35, 0.90),
}
const PATH_PREFIX := "placeholder://"
const ASSET_PREFIX := "placeholder:"

## Only a confirmed mob row with a known archetype can receive a placeholder.
static func resolution(mob: Variant) -> Dictionary:
	if typeof(mob) != TYPE_DICTIONARY or typeof(mob.get("entityId")) != TYPE_STRING or str(mob.entityId).is_empty():
		return {"status": "blocked", "reason": "monster_not_confirmed"}
	var archetype := str(mob.get("archetype", ""))
	if not NAMES.has(archetype):
		return {"status": "blocked", "reason": "monster_archetype_unknown"}
	return {"status": "resolved", "placeholder": true, "archetype": archetype, "entityId": mob.entityId,
		"catalogAssetId": ASSET_PREFIX + archetype, "resourcePath": PATH_PREFIX + archetype}

static func _shape(archetype: String) -> Dictionary:
	match archetype:
		"aether_wisp":
			var wisp := SphereMesh.new()
			wisp.radius = 0.45
			wisp.height = 0.9
			return {"mesh": wisp, "lift": 1.4}
		"corrupted_golem":
			var golem := BoxMesh.new()
			golem.size = Vector3(1.4, 2.0, 1.0)
			return {"mesh": golem, "lift": 1.0}
		"steam_drake":
			var drake := PrismMesh.new()
			drake.size = Vector3(1.6, 1.2, 2.4)
			return {"mesh": drake, "lift": 0.6}
		"titan_boss":
			var titan := CapsuleMesh.new()
			titan.radius = 1.1
			titan.height = 4.4
			return {"mesh": titan, "lift": 2.2}
		"centurion_elite":
			var centurion := CapsuleMesh.new()
			centurion.radius = 0.5
			centurion.height = 2.2
			return {"mesh": centurion, "lift": 1.1}
	var stalker := CylinderMesh.new()
	stalker.top_radius = 0.2
	stalker.bottom_radius = 0.55
	stalker.height = 1.4
	return {"mesh": stalker, "lift": 0.7}

static func _clip(name: String, track_path: String, from: Vector3, to: Vector3, length: float) -> Animation:
	var animation := Animation.new()
	animation.length = length
	var track := animation.add_track(Animation.TYPE_VALUE)
	animation.track_set_path(track, track_path)
	animation.track_insert_key(track, 0.0, from)
	animation.track_insert_key(track, length, to)
	return animation

## Builds a self-contained scene with exactly one AnimationPlayer and the
## Idle/Walk/Death clip names used by actor_view.gd.
static func packed(archetype: String) -> PackedScene:
	var root := Node3D.new()
	root.name = "MonsterPlaceholder"
	var shape: Dictionary = _shape(archetype)
	var material := StandardMaterial3D.new()
	material.albedo_color = COLORS.get(archetype, Color(0.8, 0.3, 0.3))
	material.roughness = 0.8
	var primitive: PrimitiveMesh = shape.mesh
	primitive.material = material
	var body := MeshInstance3D.new()
	body.name = "Body"
	body.mesh = primitive
	body.position.y = float(shape.lift)
	root.add_child(body)
	body.owner = root
	var label := Label3D.new()
	label.name = "Label"
	label.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	label.pixel_size = 0.008
	label.font_size = 32
	label.text = "%s · Platzhalter (kein Godot-Modell)" % NAMES.get(archetype, archetype)
	label.position.y = float(shape.lift) * 2.0 + 0.4
	root.add_child(label)
	label.owner = root
	var player := AnimationPlayer.new()
	player.name = "AnimationPlayer"
	var library := AnimationLibrary.new()
	library.add_animation("Idle", _clip("Idle", "Body:scale", Vector3.ONE, Vector3.ONE, 1.0))
	library.add_animation("Walk", _clip("Walk", "Body:scale", Vector3(1.0, 0.92, 1.0), Vector3.ONE, 0.4))
	library.add_animation("Death", _clip("Death", "Body:scale", Vector3.ONE, Vector3(1.0, 0.15, 1.0), 0.6))
	player.add_animation_library("", library)
	root.add_child(player)
	player.owner = root
	var scene := PackedScene.new()
	var error := scene.pack(root)
	root.free()
	return scene if error == OK else null
