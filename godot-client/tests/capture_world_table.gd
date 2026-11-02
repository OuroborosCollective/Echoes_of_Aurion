extends "res://tests/test_world_table.gd"
## Explicit synthetic visual fixture; never live world or device evidence.
func verify() -> void:
	var destination := OS.get_environment("AURION_WORLD_TABLE_SCREENSHOT")
	if destination.is_empty():
		quit(1)
		return
	root.size = Vector2i(1280,800)
	var auth := TestAuth.new()
	root.add_child(auth)
	var table := Table.new()
	root.add_child(table)
	await process_frame
	var reply := fixture()
	table.open_table(auth, "http://127.0.0.1:3000", reply.connectionId, reply.slice.actorId, Vector2i.ZERO, true)
	table._api.cancel()
	table._on_slice(reply, reply.connectionId, 1, Vector2i.ZERO)
	table.sketch()
	for i in 4:
		await process_frame
	await RenderingServer.frame_post_draw
	var image := root.get_texture().get_image()
	var result := image.save_png(destination)
	table.close_session()
	table.queue_free()
	auth.queue_free()
	await process_frame
	if result == OK:
		print("WORLD_TABLE_FIXTURE_CAPTURE_PASS (synthetic Linux rendering only)")
	quit(0 if result == OK else 1)
