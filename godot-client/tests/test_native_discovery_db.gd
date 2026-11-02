extends "res://tests/test_world_table.gd"
## Isolated real MariaDB / SDK native-auth test. No token appears in output.
const Discovery = preload("res://app/native_discovery.gd")
class NativeFixtureAuth extends TestAuth:
	var token := ""
	func access_token() -> String: return token

func verify() -> void:
	var session_path := OS.get_environment("AURION_NATIVE_DISCOVERY_SESSION")
	var session: Variant = JSON.parse_string(FileAccess.get_file_as_string(session_path))
	if typeof(session) != TYPE_DICTIONARY:
		push_error("Private isolated session fixture missing")
		quit(1)
		return
	var auth := NativeFixtureAuth.new()
	auth.token = session.token
	root.add_child(auth)
	var discovery := Discovery.new()
	root.add_child(discovery)
	discovery.configure(auth, "http://127.0.0.1:3000", true)
	var messages: Array[String] = []
	discovery.status_changed.connect(func(message: String): messages.append(message))
	for attempt in range(2):
		require(discovery.begin(session.connection, session.actor, Vector2i.ZERO), "Native discovery did not start")
		var started := Time.get_ticks_msec()
		while discovery.busy() and Time.get_ticks_msec() - started < 8000:
			await process_frame
		require(not discovery.busy(), "Native discovery timeout")
		require(not messages.is_empty() and messages[-1].contains("unabhängig bestätigt"), "Native discovery not independently confirmed")
	var stock_api := preload("res://net/api/world_authoring_api.gd").new(auth)
	root.add_child(stock_api)
	var stocks: Array[Dictionary] = []
	stock_api.completed.connect(func(kind: String, reply: Dictionary, _connection: String, _generation: int):
		if kind == "ownedStock": stocks.append(reply))
	require(stock_api.request("ownedStock", "http://127.0.0.1:3000", session.connection, {}, true), "Stock HTTP did not start")
	var stock_started := Time.get_ticks_msec()
	while stock_api.busy() and Time.get_ticks_msec() - stock_started < 8000:
		await process_frame
	require(stocks.size() == 1, "Stock HTTP readback missing")
	if stocks.size() == 1:
		require(preload("res://projection/world_table_inventory.gd").valid(stocks[0], session.actor), "Real stock DTO rejected")
		require(stocks[0].stacks == [{"id": session.stockId, "version": "legacy", "definitionId": "oakwood", "quantityExact": "17"}], "Stock quantity or actor scope differs from DB fixture")
	stock_api.queue_free()
	auth.token = ""
	discovery.queue_free()
	auth.queue_free()
	await process_frame
	if failures.is_empty(): print("NATIVE_DISCOVERY_DB_PASS")
	else:
		for failure in failures: push_error(failure)
	quit(0 if failures.is_empty() else 1)
