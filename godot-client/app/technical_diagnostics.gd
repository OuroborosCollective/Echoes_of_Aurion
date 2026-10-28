extends RefCounted
## G43 owner-facing read-only diagnostic summary. Never inspect or print credentials.
const RELEASE_SHA := "^[a-f0-9]{40}$"
func report(build: String, server: String, socket_state: String, welcome_confirmed: bool, world_confirmed: bool, native_auth_start_enabled: bool = false) -> String:
	var pattern := RegEx.new()
	pattern.compile(RELEASE_SHA)
	var safe_build := build if pattern.search(build) != null and build.length() == 40 else "UNVERIFIED"
	var safe_server := "arelogic.space" if server == "https://arelogic.space" or server == "https://arelogic.space/" else "UNVERIFIED"
	var connected := socket_state == "connected" and welcome_confirmed
	var confirmed_world := connected and world_confirmed
	# Client configuration only; not a verified server login or device test.
	var auth_start_gate := "im Build freigegeben" if native_auth_start_enabled else "im Build gesperrt"
	return "Aurion · Technische Diagnose\nBuild: %s\nServer: %s\nVerbindung: %s\nWelt: %s\nAnmelde-Start: %s" % [
		safe_build, safe_server,
		"bestätigt" if connected else "nicht bestätigt",
		"bestätigt" if confirmed_world else "nicht bestätigt",
		auth_start_gate,
	]
