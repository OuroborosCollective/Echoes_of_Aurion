extends "res://tests/test_world_table.gd"
const Discovery = preload("res://app/native_discovery.gd")
var messages: Array[String] = []

func verify() -> void:
	var auth := TestAuth.new()
	root.add_child(auth)
	var discovery := Discovery.new()
	root.add_child(discovery)
	discovery.configure(auth, "http://127.0.0.1:3000", true)
	discovery.status_changed.connect(func(message: String): messages.append(message))
	require(discovery.begin("zone_peer_discovery", "player:1", Vector2i.ZERO), "explicit discovery refused")
	require(not discovery.begin("zone_peer_discovery", "player:1", Vector2i.ZERO), "duplicate concurrent intent accepted")
	await settle(discovery)
	require(messages[-1].contains("unabhängig bestätigt"), "success without independent readback or valid receipt")
	require(discovery.begin("zone_peer_discovery", "player:1", Vector2i.ZERO), "second request refused")
	await settle(discovery)
	require(not messages[-1].contains("unabhängig bestätigt"), "foreign actor receipt admitted")
	require(discovery.begin("zone_peer_discovery", "player:1", Vector2i.ZERO), "readback failure request refused")
	await settle(discovery)
	require(not messages[-1].contains("unabhängig bestätigt"), "write reply promoted to success without independent readback")
	require(discovery.begin("zone_peer_discovery", "player:1", Vector2i.ZERO), "cancel request refused")
	await create_timer(0.05).timeout
	discovery.reconcile("different-session", "player:1", Vector2i.ZERO, false)
	var count := messages.size()
	await create_timer(0.35).timeout
	require(not discovery.busy() and messages.size() == count, "cancelled observation continued to command")
	require(discovery.begin("zone_peer_discovery", "player:1", Vector2i.ZERO), "revocation request refused")
	await create_timer(0.05).timeout
	auth.generation = 2
	await settle(discovery)
	require(not messages[-1].contains("unabhängig bestätigt"), "revoked observation committed discovery")
	discovery.queue_free()
	auth.queue_free()
	await process_frame
	if failures.is_empty(): print("NATIVE_DISCOVERY_HTTP_PASS (synthetic HTTP fixtures, no production evidence)")
	else:
		for failure in failures: push_error(failure)
	quit(0 if failures.is_empty() else 1)

func settle(discovery: Node) -> void:
	var started := Time.get_ticks_msec()
	while discovery.busy() and Time.get_ticks_msec() - started < 4000:
		await process_frame
	require(not discovery.busy(), "discovery timed out")
