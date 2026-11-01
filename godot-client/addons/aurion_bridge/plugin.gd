@tool
extends EditorPlugin
## Registriert den Autoload "AurionBridge", einen Editor-Client und das Dock "Aurion".

const AurionClient := preload("res://addons/aurion_bridge/aurion_client.gd")
const EditDock := preload("res://addons/aurion_bridge/edit_dock.gd")

var _client: Node = null
var _dock: Control = null
var _owns_autoload := false

# Only the root-installed editor service receives this systemd credential.
# No synthetic token, process env secret value or public endpoint is accepted.
const PROTECTED_EDITOR_CREDENTIAL := "/run/credentials/serverin-aurion-godot-editor.service/aurion-editor"


static func protected_editor_autoconnect_allowed(credential_path: String, credential: String) -> bool:
    return credential_path == PROTECTED_EDITOR_CREDENTIAL and credential.length() >= 32 and credential.length() <= 256


func _enter_tree() -> void:
    if Engine.has_meta("aurion_editor_client"):
        push_error("Aurion editor client already owned by another plugin instance")
        return
    if not ProjectSettings.has_setting("autoload/AurionBridge"):
        add_autoload_singleton("AurionBridge", "res://addons/aurion_bridge/aurion_bridge.gd")
        _owns_autoload = true

    _client = AurionClient.new()
    _client.name = "AurionEditorClient"
    _client.auto_connect = false
    add_child(_client)
    Engine.set_meta("aurion_editor_client", _client)
    # The scene-tree _ready() has loaded the credential file, if available.
    # This is an editor observer only; Godot gets no gameplay/write authority.
    if protected_editor_autoconnect_allowed(OS.get_environment("AURION_BRIDGE_TOKEN_FILE"), _client.token):
        _client.call_deferred("connect_to_bridge")

    _dock = EditDock.new()
    _dock.bind_client(_client)
    add_control_to_dock(DOCK_SLOT_RIGHT_UL, _dock)


func _exit_tree() -> void:
    if _dock != null:
        remove_control_from_docks(_dock)
        _dock.queue_free()
        _dock = null
    if Engine.has_meta("aurion_editor_client") and Engine.get_meta("aurion_editor_client") == _client:
        Engine.remove_meta("aurion_editor_client")
    if _client != null:
        _client.queue_free()
        _client = null


func _disable_plugin() -> void:
    if _owns_autoload and str(ProjectSettings.get_setting("autoload/AurionBridge", "")).trim_prefix("*") == "res://addons/aurion_bridge/aurion_bridge.gd":
        remove_autoload_singleton("AurionBridge")
