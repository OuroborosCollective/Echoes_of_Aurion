@tool
extends EditorPlugin
## Editor-side export only. Server validation and apply stay in Aurion.
const DraftExport = preload("res://addons/aurion_world_bridge/world_draft_export.gd")
const WorldMarker = preload("res://addons/aurion_world_bridge/world_marker.gd")
var _dock: VBoxContainer
var _key: LineEdit
var _title: LineEdit
var _revision: LineEdit
var _version: SpinBox
var _status: Label

func _enter_tree() -> void:
	add_custom_type("AurionWorldMarker", "Node3D", WorldMarker, EditorInterface.get_editor_theme().get_icon("Node3D", "EditorIcons"))
	_dock = VBoxContainer.new()
	_dock.name = "Aurion Weltentwurf"
	var heading := Label.new()
	heading.text = "Aurion Weltentwurf"
	_dock.add_child(heading)
	_key = _field("Entwurfsschlüssel, z. B. village.main")
	_title = _field("Titel")
	_revision = _field("Bestätigte Katalogrevision (SHA-256)")
	_version = SpinBox.new()
	_version.min_value = 1
	_version.max_value = 1000000
	_version.value = 1
	_dock.add_child(_version)
	var button := Button.new()
	button.text = "Szenenentwurf kopieren"
	button.pressed.connect(_copy_draft)
	_dock.add_child(button)
	_status = Label.new()
	_status.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_status.text = "Marker in der Szene platzieren; Aurion prüft den kopierten Entwurf."
	_dock.add_child(_status)
	add_control_to_dock(DOCK_SLOT_RIGHT_UL, _dock)

func _field(placeholder: String) -> LineEdit:
	var field := LineEdit.new()
	field.placeholder_text = placeholder
	_dock.add_child(field)
	return field

func _copy_draft() -> void:
	var result := DraftExport.build(EditorInterface.get_edited_scene_root(), _key.text, int(_version.value), _title.text.strip_edges(), _revision.text.strip_edges())
	if result.has("error"):
		_status.text = str(result.error)
		return
	DisplayServer.clipboard_set(JSON.stringify(result.draft, "\t"))
	_status.text = "%d Platzierungen kopiert. Im Weltstudio serverseitig prüfen." % result.draft.placements.size()

func _exit_tree() -> void:
	remove_custom_type("AurionWorldMarker")
	if is_instance_valid(_dock):
		remove_control_from_docks(_dock)
		_dock.queue_free()
