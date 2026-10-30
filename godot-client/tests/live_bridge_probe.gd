extends SceneTree
## Verbindungstest ohne Display (z. B. direkt auf dem VPS):
##   AURION_BRIDGE_TOKEN=… godot --headless --path godot --script res://demo/headless_probe.gd
## Exit-Code 0 = Snapshot empfangen, 1 = Timeout/Auth-Fehler.

var _t := 0.0
var _done := false


func _initialize() -> void:
    print("[probe] verbinde …")


func _process(delta: float) -> bool:
    if _done:
        return true
    _t += delta
    var b = root.get_node_or_null("AurionBridge")
    if b == null and _t > 1.0:
        # Fallback, falls Autoloads im --script-Modus nicht geladen wurden
        b = load("res://addons/aurion_bridge/aurion_client.gd").new()
        b.name = "AurionBridge"
        root.add_child(b)
    if b != null and b.is_authed and b.upstream_up and b.has_snapshot:
        print("[probe] OK · Welt=%s Tick=%d Entities=%d Edit=%s" % [b.world_id, b.tick, b.entities.size(), str(b.edit_enabled)])
        var shown := 0
        for id in b.entities.keys():
            print("   %s  (%s)" % [id, str(b.entities[id].get("kind", "?"))])
            shown += 1
            if shown >= 5:
                break
        _done = true
        quit(0)
        return true
    if _t > 10.0:
        var why := "kein Autoload/Client"
        if b != null:
            why = "Token abgelehnt" if b.auth_failed else "keine Antwort von der Bridge"
        print("[probe] FEHLER nach 10 s: %s" % why)
        _done = true
        quit(1)
        return true
    return false
