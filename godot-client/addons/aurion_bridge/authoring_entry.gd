extends Control
## Editor launch adapter for Aurion's existing REAL game client and WorldStudio.
## Same native App-Link/PKCE protocol; workstation callback delivery is manual.
## No fabricated session, second authoring API, or saved credentials.
const MainScene = preload("res://app/main.tscn")
var _main: Control
var _auth: Node
var _dialog: Window
var _status: Label
var _link: LinkButton
var _callback: LineEdit
var _login_url := ""
var _previous_login_setting: Variant

func _ready() -> void:
    # Presentation opt-in for this explicit editor launch, in this GAME process only.
    # No ProjectSettings.save(): the tracked/client release configuration is untouched.
    _previous_login_setting = ProjectSettings.get_setting("aurion/native_auth_start_enabled", false)
    ProjectSettings.set_setting("aurion/native_auth_start_enabled", true)
    _main = MainScene.instantiate()
    add_child(_main)
    _main.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
    _auth = _main.get("_auth_start")
    if _auth == null or not _auth.has_method("complete_callback"):
        push_error("Aurion native auth contract unavailable")
        return
    _dialog = Window.new()
    _dialog.title = "Aurion · manueller Browser-Rückkanal für den Editor"
    _dialog.size = Vector2i(680, 400)
    _dialog.min_size = Vector2i(320, 280)
    _dialog.close_requested.connect(_dialog.hide)
    add_child(_dialog)
    var margin := MarginContainer.new()
    margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
    for edge in ["margin_left", "margin_right", "margin_top", "margin_bottom"]:
        margin.add_theme_constant_override(edge, 18)
    _dialog.add_child(margin)
    var stack := VBoxContainer.new()
    stack.add_theme_constant_override("separation", 12)
    margin.add_child(stack)
    _status = Label.new()
    _status.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
    _status.text = "Im Hauptfenster Anmelden wählen. Aurion prüft die echte Sitzung und Adminrolle."
    stack.add_child(_status)
    _link = LinkButton.new()
    _link.text = "Anmeldeseite im eigenen Browser öffnen"
    _link.visible = false
    stack.add_child(_link)
    _button(stack, "Anmeldelink kopieren", _copy_url)
    _callback = LineEdit.new()
    _callback.secret = true
    _callback.max_length = 2048
    _callback.placeholder_text = "HTTPS-Rückgabe-Link nach der Browser-Anmeldung einfügen"
    _callback.text_submitted.connect(func(_text: String): _complete())
    stack.add_child(_callback)
    _button(stack, "Rückgabe durch den echten Aurion-Client prüfen", _complete)
    _button(stack, "Zurück zum Client", _dialog.hide)
    _auth.browser_opener = Callable(self, "_present_browser_handoff")
    _auth.start_succeeded.connect(func(): _main.status.text = "Browser-Anmeldung für Editor vorbereitet")
    _auth.session_succeeded.connect(_clear_handoff)
    _auth.session_failed.connect(func(_reason: String): _clear_handoff())
    _auth.start_failed.connect(func(_reason: String): _clear_handoff())
    var toolbar := Button.new()
    toolbar.text = "Browser-Rückgabe für Editor"
    toolbar.position = Vector2(12, 12)
    toolbar.custom_minimum_size = Vector2(260, 48)
    toolbar.pressed.connect(func(): _dialog.popup_centered())
    add_child(toolbar)

func _button(parent: VBoxContainer, title: String, callback: Callable) -> void:
    var button := Button.new()
    button.text = title
    button.custom_minimum_size.y = 48
    button.pressed.connect(callback)
    parent.add_child(button)

func _present_browser_handoff(url: String) -> int:
    var pattern := RegEx.new()
    pattern.compile("^https://arelogic\\.space/api/native-auth/browser/[A-Za-z0-9_-]{32,128}$")
    if pattern.search(url) == null:
        return ERR_INVALID_PARAMETER
    _login_url = url
    _link.uri = url
    _link.visible = true
    _status.text = "Im eigenen Browser anmelden. Danach den HTTPS-Rückgabe-Link hier einfügen. Der Client prüft State/PKCE und fordert erst danach WorldLease und Weltdaten an."
    _dialog.popup_centered()
    return OK # Handoff displayed; not a claim that browser login succeeded.

func _copy_url() -> void:
    if not _login_url.is_empty() and _auth.callback_pending():
        DisplayServer.clipboard_set(_login_url)

func _complete() -> void:
    var callback := _callback.text.strip_edges()
    _callback.clear()
    if callback.is_empty() or not _auth.callback_pending():
        _status.text = "Zuerst im Hauptfenster einen Aurion-Anmeldeversuch starten."
        return
    if _main.handle_native_auth_callback(callback):
        _clear_handoff()
    else:
        _status.text = "Aurion hat diese Rückgabe nicht bestätigt. Der Client vergibt keine Sitzung."

func _clear_handoff() -> void:
    _login_url = ""
    _link.uri = ""
    _link.visible = false
    _callback.clear()
    _dialog.hide()

func _exit_tree() -> void:
    ProjectSettings.set_setting("aurion/native_auth_start_enabled", _previous_login_setting)
