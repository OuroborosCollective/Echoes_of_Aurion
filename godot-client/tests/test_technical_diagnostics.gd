extends SceneTree
const Diagnostic = preload("res://app/technical_diagnostics.gd")
var errors: Array[String] = []
func require(condition: bool, message: String) -> void:
	if not condition: errors.append(message)
func _init() -> void:
	call_deferred("verify")
func verify() -> void:
	var d = Diagnostic.new()
	var partial: String = d.report("a".repeat(40), "https://arelogic.space", "connected", true, true)
	require(partial.contains("Zonenzustand: bestätigt"), "acknowledged zone snapshot layer missing")
	require(not partial.contains("Welt: bestätigt"), "zone snapshot falsely certifies rendered live world")
	require(partial.contains("Weltansicht: Teilprojektion"), "missing explicit visual parity boundary")
	var report: String = d.report("a".repeat(40), "https://arelogic.space", "connected", true, false)
	require(report.contains("Build: " + "a".repeat(40)), "missing exact build")
	require(report.contains("Verbindung: bestätigt"), "welcome is not acknowledged")
	require(report.contains("Zonenzustand: nicht bestätigt"), "world state was falsely claimed")
	require(partial.contains("Terrain: nicht geladen") and partial.contains("Spielerfigur: nicht geladen"), "snapshot concealed missing visual assets")
	var loaded: String = d.report("a".repeat(40), "https://arelogic.space", "connected", true, true, {"terrain":true, "avatar":true, "npcs":true})
	require(loaded.contains("Terrain: geladen") and loaded.contains("Spielerfigur: geladen") and loaded.contains("NPC-Anker: geladen"), "actual visual readback missing")
	require(not loaded.contains("Welt: bestätigt"), "loaded components falsely certify complete migration")
	var stale: String = d.report("a".repeat(40), "https://arelogic.space", "closed", true, true, {"terrain":true, "avatar":true, "npcs":true})
	require(stale.contains("Terrain: nicht geladen") and stale.contains("Spielerfigur: nicht geladen"), "stale models treated as current")
	var untrusted: String = d.report("a".repeat(40), "https://arelogic.space", "connected", true, true, {"terrain":"TOKEN_CANARY", "avatar":1, "npcs":true, "secret":"TOKEN_CANARY"})
	require(not untrusted.contains("TOKEN_CANARY") and untrusted.contains("Terrain: nicht geladen") and untrusted.contains("Spielerfigur: nicht geladen"), "untrusted presentation data leaked or trusted")
	require(not report.contains("TOKEN_CANARY"), "token leaked")
	var suspicious := d.report("TOKEN_CANARY", "https://arelogic.space/?token=TOKEN_CANARY", "connected", true, true)
	require(not suspicious.contains("TOKEN_CANARY"), "untrusted field printed")
	require(suspicious.contains("Build: UNVERIFIED"), "invalid revision was trusted")
	require(suspicious.contains("Server: UNVERIFIED"), "URL with credentials or query was trusted")
	require(d.report("b".repeat(40), "https://arelogic.space", "authenticating", false, false).contains("Verbindung: nicht bestätigt"), "ticket treated as welcome")
	require(d.report("b".repeat(40), "https://arelogic.space", "connected", false, true).contains("Verbindung: nicht bestätigt"), "socket without welcome treated as authorized")
	require(d.report("b".repeat(40), "https://arelogic.space", "closed", true, true).contains("Verbindung: nicht bestätigt"), "stale welcome after closure accepted")
	if errors.is_empty():
		print("Godot G43 safe technical diagnostics verified")
		quit(0)
	else:
		for error in errors: push_error(error)
		quit(1)
