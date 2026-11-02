extends SceneTree
## Local fixture coverage for retrieval, source lines, bounds and no-overwrite drafts.

const KnowledgeIndex = preload("res://addons/aurion_knowledge_helper/knowledge_index.gd")
const FIXTURE_ROOT := "user://aurion_knowledge_helper_fixture"

var failures: Array[String] = []

func _init() -> void:
	call_deferred("verify")

func require(condition: bool, reason: String) -> void:
	if not condition:
		failures.append(reason)

func _absolute(path: String) -> String:
	return ProjectSettings.globalize_path(path)

func _write(relative_path: String, content: String) -> void:
	var path := FIXTURE_ROOT.path_join(relative_path)
	var directory_path := path.get_base_dir()
	if DirAccess.open(directory_path) == null:
		var mkdir_result := DirAccess.make_dir_recursive_absolute(_absolute(directory_path))
		if mkdir_result != OK and DirAccess.open(directory_path) == null:
			require(false, "fixture directory could not be created: " + relative_path)
			return
	var file := FileAccess.open(path, FileAccess.WRITE)
	if file == null:
		require(false, "fixture file could not be written: " + relative_path)
		return
	file.store_string(content)
	file.close()

func _remove_tree(path: String) -> void:
	var directory := DirAccess.open(path)
	if directory == null:
		return
	directory.list_dir_begin()
	var entry := directory.get_next()
	while not entry.is_empty():
		if entry != "." and entry != "..":
			var child_path := path.path_join(entry)
			if directory.current_is_dir():
				_remove_tree(child_path)
				DirAccess.remove_absolute(_absolute(child_path))
			else:
				DirAccess.remove_absolute(_absolute(child_path))
		entry = directory.get_next()
	directory.list_dir_end()
	DirAccess.remove_absolute(_absolute(path))

func _read(relative_path: String) -> String:
	return FileAccess.get_file_as_string(FIXTURE_ROOT.path_join(relative_path))

func verify() -> void:
	_remove_tree(FIXTURE_ROOT)
	_write("lore/creation.md", "## The old archive\nThe silver oath binds Aurion to the moon archive.\nA quiet witness records the seal.\n")
	_write("quests/river.md", "## River quest\nAurion follows the river keeper.\nThe quest rewards a bronze key.\n")
	_write("project/roadmap.txt", "Aurion project roadmap\nA project milestone follows.\n")
	_write("too-large.md", "x".repeat(KnowledgeIndex.MAX_FILE_BYTES + 1))

	var index = KnowledgeIndex.new()
	var indexed: Dictionary = index.index_directory(FIXTURE_ROOT)
	require(bool(indexed.get("ok", false)), "fixture root was rejected")
	require(int(indexed.get("files", 0)) == 3, "supported text files were not indexed")
	require(int(indexed.get("skipped", 0)) == 1, "oversized file was not skipped")
	var lore: Array[Dictionary] = index.search("silver oath", "Lore", 8)
	require(lore.size() == 1, "Lore category or all-token matching failed")
	if lore.size() == 1:
		require(str(lore[0]["citation"]) == "lore/creation.md#L2", "citation line number is wrong")
		require(str(lore[0]["snippet"]).contains("2: The silver oath"), "snippet does not include its source line")
	var wrong_category: Array[Dictionary] = index.search("silver oath", "Quest", 8)
	require(wrong_category.is_empty(), "category filter returned an unrelated document")
	var tied: Array[Dictionary] = index.search("Aurion", "Alle", 8)
	require(tied.size() == 3, "search did not retrieve all matching fixture documents")
	if tied.size() == 3:
		require(str(tied[0]["path"]) == "lore/creation.md", "equal-score results are not path-stable")

	var bundle := index.context_bundle("silver oath", lore, 6)
	require(bundle.contains("lore/creation.md#L2"), "copied context omitted its citation")
	require(bundle.contains("2: The silver oath"), "copied context omitted its excerpt")
	var saved: Dictionary = index.save_new_draft(FIXTURE_ROOT, "evidence-note.md", "## Draft\nA proposed note.", lore)
	require(bool(saved.get("ok", false)), "new draft was not saved")
	var saved_path := str(saved.get("path", ""))
	var before := FileAccess.get_file_as_string(saved_path)
	require(before.contains("lore/creation.md#L2"), "saved draft omitted retrieved source citations")
	var overwrite: Dictionary = index.save_new_draft(FIXTURE_ROOT, "evidence-note.md", "## Changed", [])
	require(not bool(overwrite.get("ok", false)), "existing file was overwritten")
	require(FileAccess.get_file_as_string(saved_path) == before, "existing draft content changed")
	var unsafe_name: Dictionary = index.save_new_draft(FIXTURE_ROOT, "../outside.md", "## Unsafe", [])
	require(not bool(unsafe_name.get("ok", false)), "path traversal filename was accepted")

	_remove_tree(FIXTURE_ROOT)
	if failures.is_empty():
		print("AURION_KNOWLEDGE_DOC_INDEX_PASS (temporary local fixtures only)")
	else:
		for failure in failures:
			push_error(failure)
	quit(0 if failures.is_empty() else 1)
