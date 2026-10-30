@tool
extends VBoxContainer
## Editor-Dock "Aurion": Verbindung, Entity-Liste, Verschieben/Entfernen/Spawnen,
## Quest-Kopplung (Fadenwerk) und Ack-Log. Alles läuft über Commands an den Server.

const CONFIG_PATH := "user://aurion_bridge.cfg"

var _client = null
var _status: Label
var _url: LineEdit
var _token: LineEdit
var _btn_connect: Button
var _filter: LineEdit
var _list: ItemList
var _x: SpinBox
var _y: SpinBox
var _z: SpinBox
var _kind: LineEdit
var _def_id: LineEdit
var _strand: LineEdit
var _log: RichTextLabel
var _ids: Array = []
var _dirty := true
var _refresh_left := 0.0


func _init() -> void:
    name = "Aurion"
    custom_minimum_size = Vector2(270, 420)
    _build_ui()


func _build_ui() -> void:
    _status = Label.new()
    _status.text = "Getrennt"
    _status.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
    add_child(_status)

    _url = LineEdit.new()
    _url.placeholder_text = "ws://127.0.0.1:8765/godot"
    add_child(_url)

    _token = LineEdit.new()
    _token.placeholder_text = "Bridge-Token"
    _token.secret = true
    add_child(_token)

    _btn_connect = Button.new()
    _btn_connect.text = "Verbinden"
    _btn_connect.pressed.connect(_on_connect_pressed)
    add_child(_btn_connect)

    var studio := Button.new()
    studio.text = "Echte Welt bearbeiten (Aurion-Anmeldung)"
    studio.pressed.connect(func(): EditorInterface.play_custom_scene("res://addons/aurion_bridge/authoring_entry.tscn"))
    add_child(studio)

    add_child(HSeparator.new())

    _filter = LineEdit.new()
    _filter.placeholder_text = "Filter (kind / id / name)"
    _filter.text_changed.connect(_on_filter_changed)
    add_child(_filter)

    _list = ItemList.new()
    _list.custom_minimum_size = Vector2(0, 150)
    _list.size_flags_vertical = Control.SIZE_EXPAND_FILL
    _list.item_selected.connect(_on_item_selected)
    add_child(_list)

    var row := HBoxContainer.new()
    _x = _spin(row, "x")
    _y = _spin(row, "y")
    _z = _spin(row, "z")
    add_child(row)

    var row2 := HBoxContainer.new()
    var b_move := Button.new()
    b_move.text = "Verschieben"
    b_move.pressed.connect(_on_move)
    row2.add_child(b_move)
    var b_del := Button.new()
    b_del.text = "Entfernen"
    b_del.pressed.connect(_on_remove)
    row2.add_child(b_del)
    add_child(row2)

    add_child(HSeparator.new())

    var row3 := HBoxContainer.new()
    _kind = LineEdit.new()
    _kind.text = "npc"
    _kind.placeholder_text = "kind"
    _kind.size_flags_horizontal = Control.SIZE_EXPAND_FILL
    row3.add_child(_kind)
    _def_id = LineEdit.new()
    _def_id.placeholder_text = "defId"
    _def_id.size_flags_horizontal = Control.SIZE_EXPAND_FILL
    row3.add_child(_def_id)
    add_child(row3)

    var b_spawn := Button.new()
    b_spawn.text = "Spawnen an x / y / z"
    b_spawn.pressed.connect(_on_spawn)
    add_child(b_spawn)

    _strand = LineEdit.new()
    _strand.placeholder_text = "strandKey (Fadenwerk)"
    add_child(_strand)
    var b_quest := Button.new()
    b_quest.text = "Quest an Auswahl hängen"
    b_quest.pressed.connect(_on_quest)
    add_child(b_quest)

    _log = RichTextLabel.new()
    _log.bbcode_enabled = true
    _log.scroll_following = true
    _log.custom_minimum_size = Vector2(0, 90)
    add_child(_log)


func _spin(parent: Control, label_text: String) -> SpinBox:
    var l := Label.new()
    l.text = label_text
    parent.add_child(l)
    var s := SpinBox.new()
    s.min_value = -100000.0
    s.max_value = 100000.0
    s.step = 0.01
    s.size_flags_horizontal = Control.SIZE_EXPAND_FILL
    parent.add_child(s)
    return s


func bind_client(c) -> void:
    _client = c
    var cfg := ConfigFile.new()
    if cfg.load(CONFIG_PATH) == OK:
        _url.text = str(cfg.get_value("bridge", "url", c.url))
        _token.text = c.token
    else:
        _url.text = c.url
        _token.text = c.token
    c.snapshot_received.connect(_mark_dirty)
    c.entity_upserted.connect(_mark_dirty.unbind(1))
    c.entity_removed.connect(_mark_dirty.unbind(1))
    c.ack_received.connect(_on_ack)
    c.log_message.connect(_log_line)
    c.disconnected.connect(_on_disconnected)
    c.connected.connect(_on_connected)


func _mark_dirty() -> void:
    _dirty = true


func _on_filter_changed(_t: String) -> void:
    _dirty = true


func _on_connected() -> void:
    _log_line("Verbunden mit Welt '%s'" % _client.world_id)


func _on_disconnected(reason: String) -> void:
    _log_line("Getrennt: %s" % reason)


func _on_connect_pressed() -> void:
    if _client == null:
        return
    if _client.want_connection:
        _client.disconnect_from_bridge()
        return
    _client.url = _url.text.strip_edges()
    _client.token = _token.text
    var cfg := ConfigFile.new()
    cfg.set_value("bridge", "url", _client.url)
    # Do not persist credentials in user:// or project/scene files.
    cfg.save(CONFIG_PATH)
    _client.connect_to_bridge()


func _process(delta: float) -> void:
    if _client == null:
        return
    _refresh_left -= delta
    if _refresh_left > 0.0:
        return
    _refresh_left = 0.25
    _update_status()
    if _dirty:
        _dirty = false
        _refresh_list()


func _update_status() -> void:
    var s := "Getrennt"
    if _client.is_authed:
        s = "Verbunden · Tick %d · %d Entities · Edit %s" % [_client.tick, _client.entities.size(), "AN" if _client.edit_enabled else "AUS"]
        if _client.has_snapshot:
            s += " · Quelle %s · flache X/Z-Projektion" % str(_client.identity.get("sourceRevision", "UNVERIFIED")).left(12)
        else:
            s += " · wartet auf bestätigten Aurion-Tick"
        if not _client.upstream_up:
            s += " · Game-Server offline"
    elif _client.auth_failed:
        s = "Auth fehlgeschlagen (Token prüfen)"
    elif _client.want_connection:
        s = "Verbinde …"
    _status.text = s
    _btn_connect.text = "Trennen" if _client.want_connection else "Verbinden"


func _refresh_list() -> void:
    var f := _filter.text.strip_edges().to_lower()
    var keep := _selected_id()
    _list.clear()
    _ids.clear()
    var rows: Array = []
    for id in _client.entities.keys():
        var e: Dictionary = _client.entities[id]
        var label := "%s · %s · %s" % [str(e.get("kind", "?")), str(id), str(e.get("name", ""))]
        if f != "" and label.to_lower().find(f) == -1:
            continue
        rows.append([label, str(id)])
    rows.sort_custom(func(a, b): return a[0] < b[0])
    var shown := mini(rows.size(), 500)
    for i in range(shown):
        var idx := _list.add_item(rows[i][0])
        _ids.append(rows[i][1])
        if rows[i][1] == keep:
            _list.select(idx)


func _selected_id() -> String:
    var sel := _list.get_selected_items()
    if sel.is_empty() or sel[0] >= _ids.size():
        return ""
    return str(_ids[sel[0]])


func _on_item_selected(idx: int) -> void:
    if idx >= _ids.size() or _client == null:
        return
    var e: Dictionary = _client.entities.get(_ids[idx], {})
    var p: Dictionary = e.get("pos", {})
    _x.value = float(p.get("x", 0.0))
    _y.value = float(p.get("y", 0.0))
    _z.value = float(p.get("z", 0.0))


func _edit_allowed() -> bool:
    if _client == null or not _client.is_authed or not _client.has_snapshot or not _client.upstream_up:
        _log_line("[color=orange]Nicht verbunden.[/color]")
        return false
    if not _client.edit_enabled:
        _log_line("[color=orange]Kein freigegebener Entity-Schreibhandler. Weltänderungen über das kanonische Weltstudio ausführen.[/color]")
        return false
    return true


func _pos() -> Vector3:
    return Vector3(_x.value, _y.value, _z.value)


func _on_move() -> void:
    var id := _selected_id()
    if id == "":
        _log_line("[color=orange]Keine Entity gewählt.[/color]")
        return
    if _edit_allowed():
        _client.cmd_move(id, _pos())


func _on_remove() -> void:
    var id := _selected_id()
    if id == "":
        _log_line("[color=orange]Keine Entity gewählt.[/color]")
        return
    if _edit_allowed():
        _client.cmd_remove(id)


func _on_spawn() -> void:
    if _edit_allowed():
        _client.cmd_spawn(_kind.text.strip_edges(), _def_id.text.strip_edges(), _pos())


func _on_quest() -> void:
    var id := _selected_id()
    var strand := _strand.text.strip_edges()
    if id == "" or strand == "":
        _log_line("[color=orange]Entity wählen und strandKey eintragen.[/color]")
        return
    if _edit_allowed():
        _client.cmd_quest_attach(strand, id)


func _on_ack(cmd_id: String, ok: bool, error: String, tick: int) -> void:
    if ok:
        _log_line("[color=yellow]%s angenommen; frühester Tick %d. Ausführung/Receipt noch offen.[/color]" % [cmd_id, tick])
    else:
        _log_line("[color=red]✘ %s – %s[/color]" % [cmd_id, error])


func _log_line(text: String) -> void:
    if _log != null:
        _log.append_text(text + "\n")
