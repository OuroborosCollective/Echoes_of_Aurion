extends SceneTree
const Diagnostic = preload("res://app/technical_diagnostics.gd")
var errors: Array[String] = []
func require(condition: bool, message: String) -> void:
	if not condition: errors.append(message)
func _init() -> void:
	call_deferred("verify")
func verify() -> void:
	var d = Diagnostic.new()
	var report: String = d.report("a".repeat(40), "https://arelogic.space", "connected", true, false)
	require(report.contains("Build: " + "a".repeat(40)), "missing exact build")
	require(report.contains("Verbindung: bestätigt"), "welcome is not acknowledged")
	require(report.contains("Welt: nicht bestätigt"), "world state was falsely claimed")
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
