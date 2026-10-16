class_name AurionRuntimeConfig
extends RefCounted

const PRODUCT_SERVER := "https://arelogic.space"
const LOCAL_SERVERS := ["http://localhost:3000", "http://127.0.0.1:3000"]
const DEFAULT_BUILD := "aurion-godot-g06-dev"

static func validated_server_url(value: String, allow_local: bool = false) -> String:
	var candidate := value.strip_edges().trim_suffix("/")
	if candidate == PRODUCT_SERVER:
		return candidate
	if allow_local and candidate in LOCAL_SERVERS:
		return candidate
	return ""

static func validated_build(value: String) -> String:
	if value.length() < 3 or value.length() > 120:
		return ""
	var pattern := RegEx.new()
	pattern.compile("^[A-Za-z0-9._-]+$")
	return value if pattern.search(value) != null else ""

static func current() -> Dictionary:
	return {
		"server_base_url": validated_server_url(str(ProjectSettings.get_setting("aurion/server_base_url", PRODUCT_SERVER))),
		"client_build": validated_build(str(ProjectSettings.get_setting("aurion/client_build", DEFAULT_BUILD))),
		"renderer_profile": str(ProjectSettings.get_setting("aurion/renderer_profile", "compatibility")),
	}
