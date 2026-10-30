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
var _remaining: Label
var _copy: Button
var _submit: Button
var _retry: Button
var _login_url := ""
var _previous_login_setting: Variant
const RETURN_HELP := "Nach der Browser-Bestätigung den vollständigen HTTPS-Rückgabe-Link innerhalb von 60 Sekunden hier einfügen und prüfen lassen. Bei Ablauf einen neuen Versuch starten."

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
    _dialog.size = Vector2i(680, 520)
    _dialog.min_size = Vector2i(320, 280)
    _dialog.close_requested.connect(_dialog.hide)
    add_child(_dialog)
    var margin := MarginContainer.new()
    margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
    for edge in ["margin_left", "margin_right", "margin_top", "margin_bottom"]:
        margin.add_theme_constant_override(edge, 18)
    _dialog.add_child(margin)
    var scroll := ScrollContainer.new()
    scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
    margin.add_child(scroll)
    var stack := VBoxContainer.new()
    stack.size_flags_horizontal = Control.SIZE_EXPAND_FILL
    stack.add_theme_constant_override("separation", 12)
    scroll.add_child(stack)
    _status = Label.new()
    _status.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
    _status.text = "Im Hauptfenster Anmelden wählen. Aurion prüft die echte Sitzung und Adminrolle."
    stack.add_child(_status)
    _link = LinkButton.new()
    _link.text = "Anmeldeseite im eigenen Browser öffnen"
    _link.visible = false
    stack.add_child(_link)
    _copy = _button(stack, "Anmeldelink kopieren", _copy_url)
    _remaining = Label.new()
    _remaining.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
    stack.add_child(_remaining)
    _callback = LineEdit.new()
    _callback.secret = true
    _callback.max_length = 2048
    _callback.placeholder_text = "HTTPS-Rückgabe-Link nach der Browser-Anmeldung einfügen"
    _callback.text_submitted.connect(func(_text: String): _complete())
    stack.add_child(_callback)
    _submit = _button(stack, "Rückgabe durch den echten Aurion-Client prüfen", _complete)
    _retry = _button(stack, "Neuen Anmeldeversuch starten", _retry_login)
    _button(stack, "Zurück zum Client", _dialog.hide)
    _auth.browser_opener = Callable(self, "_present_browser_handoff")
    _auth.start_succeeded.connect(func(): _main.status.text = "Browser-Anmeldung für Editor vorbereitet")
    _auth.session_succeeded.connect(_clear_handoff)
    _auth.session_failed.connect(_on_auth_failure)
    _auth.start_failed.connect(_on_auth_failure)
    var toolbar := Button.new()
    toolbar.text = "Browser-Rückgabe für Editor"
    toolbar.position = Vector2(12, 12)
    toolbar.custom_minimum_size = Vector2(260, 48)
    toolbar.pressed.connect(func(): _dialog.popup_centered())
    add_child(toolbar)

func _button(parent: VBoxContainer, title: String, callback: Callable) -> Button:
    var button := Button.new()
    button.text = title
    button.custom_minimum_size.y = 48
    button.pressed.connect(callback)
    parent.add_child(button)
    return button

func _process(_delta: float) -> void:
    if _auth == null or not is_instance_valid(_retry):
        return
    var pending: bool = _auth.callback_pending()
    var busy: bool = _auth.request_in_flight()
    _retry.disabled = busy or _auth.protected_response_allowed() or _main._lifecycle.is_suspended()
    _copy.disabled = not pending
    _submit.disabled = not pending
    _callback.editable = pending
    if pending:
        var seconds := int(ceil(float(_auth.callback_remaining_ms()) / 1000.0))
        _remaining.text = "Anmeldeversuch: noch %d:%02d bis zum Ablauf. Rückgabe nach Bestätigung: höchstens 60 Sekunden." % [seconds / 60, seconds % 60]
    elif not _login_url.is_empty() and not busy:
        _clear_handoff()
        _status.text = "Anmeldeversuch beendet. Für die Anmeldung einen neuen Versuch starten. " + RETURN_HELP

func _retry_login() -> void:
    if _auth.request_in_flight() or _auth.protected_response_allowed() or _main._lifecycle.is_suspended():
        return
    # One explicit user action, through the existing client owner. Never retry
    # automatically or reuse a former verifier, transaction or callback.
    if _main._awaiting_callback:
        _main._on_login_pressed()
    _clear_handoff()
    _main._on_login_pressed()

func _on_auth_failure(reason: String) -> void:
    var was_visible := _dialog.visible
    _clear_handoff()
    if reason in ["NATIVE_AUTH_TRANSACTION_INVALID", "NATIVE_AUTH_CODE_EXPIRED", "NATIVE_AUTH_CODE_CONSUMED"]:
        _status.text = "Anmeldeversuch oder Rückgabe ungültig oder abgelaufen. Bitte einen neuen Versuch starten. " + RETURN_HELP
    else:
        _status.text = "Aurion hat die Anmeldung nicht bestätigt. Bitte einen neuen Versuch starten. " + RETURN_HELP
    if was_visible:
        _dialog.popup_centered()

func _present_browser_handoff(url: String) -> int:
    var pattern := RegEx.new()
    pattern.compile("^https://arelogic\\.space/api/native-auth/browser/[A-Za-z0-9_-]{32,128}$")
    if pattern.search(url) == null:
        return ERR_INVALID_PARAMETER
    _login_url = url
    _link.uri = url
    _link.visible = true
    _status.text = "Im eigenen Browser anmelden. " + RETURN_HELP + " Aurion prüft Sitzung und Berechtigungen; erst danach fordert der Client WorldLease und Weltdaten an."
    _dialog.popup_centered()
    return OK # Handoff displayed; not a claim that browser login succeeded.

func _copy_url() -> void:
    if not _login_url.is_empty() and _auth.callback_pending():
        DisplayServer.clipboard_set(_login_url)

func _complete() -> void:
    var callback := _callback.text.strip_edges()
    _callback.clear()
    if callback.is_empty() or not _auth.callback_pending():
        _status.text = "Kein gültiger Anmeldeversuch oder keine Rückgabe vorhanden. Bitte einen neuen Versuch starten. " + RETURN_HELP
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
    _callback.editable = false
    _copy.disabled = true
    _submit.disabled = true
    _remaining.text = ""
    _dialog.hide()

func _exit_tree() -> void:
    ProjectSettings.set_setting("aurion/native_auth_start_enabled", _previous_login_setting)

