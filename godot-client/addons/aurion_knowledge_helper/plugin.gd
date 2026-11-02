@tool
extends EditorPlugin
## Read-only retrieval and local draft authoring; never a gameplay authority.

const KnowledgeIndex = preload("res://addons/aurion_knowledge_helper/knowledge_index.gd")

var _dock: VBoxContainer
var _folder_dialog: EditorFileDialog
var _root_field: LineEdit
var _query_field: LineEdit
var _category: OptionButton
var _results_view: RichTextLabel
var _draft_field: TextEdit
var _filename_field: LineEdit
var _status: Label
var _index
var _last_results: Array[Dictionary] = []
var _indexed_root := ""
var _last_query := ""
var _last_category := ""
var _has_index := false

func _enter_tree() -> void:
	_index = KnowledgeIndex.new()
	_build_dock()
	add_control_to_dock(DOCK_SLOT_RIGHT_UL, _dock)

func _build_dock() -> void:
	_dock = VBoxContainer.new()
	_dock.name = "Aurion Dokumentation"
	_dock.custom_minimum_size = Vector2(360, 560)

	var heading := Label.new()
	heading.text = "Aurion Dokumentation"
	_dock.add_child(heading)

	var description := Label.new()
	description.text = "Lokale Fundstellen für Lore, Quests und Projekttexte. Keine Netzwerk- oder Spielzustandsänderungen."
	description.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_dock.add_child(description)

	var root_row := HBoxContainer.new()
	_root_field = LineEdit.new()
	_root_field.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_root_field.text = _default_root()
	root_row.add_child(_root_field)
	var browse_button := Button.new()
	browse_button.text = "Ordner…"
	browse_button.pressed.connect(_choose_folder)
	root_row.add_child(browse_button)
	_dock.add_child(root_row)

	_folder_dialog = EditorFileDialog.new()
	_folder_dialog.file_mode = EditorFileDialog.FILE_MODE_OPEN_DIR
	_folder_dialog.access = EditorFileDialog.ACCESS_FILESYSTEM
	_folder_dialog.dir_selected.connect(_on_folder_selected)
	add_child(_folder_dialog)

	var query_row := HBoxContainer.new()
	_query_field = LineEdit.new()
	_query_field.placeholder_text = "Frage oder Stichwörter"
	_query_field.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_query_field.text_submitted.connect(_on_query_submitted)
	query_row.add_child(_query_field)
	_category = OptionButton.new()
	for category_name in ["Alle", "Lore", "Quest", "Projekt"]:
		_category.add_item(category_name)
	_category.item_selected.connect(_on_category_selected)
	query_row.add_child(_category)
	_dock.add_child(query_row)

	var action_row := HBoxContainer.new()
	var index_button := Button.new()
	index_button.text = "Index aktualisieren"
	index_button.pressed.connect(_refresh_index)
	action_row.add_child(index_button)
	var search_button := Button.new()
	search_button.text = "Suchen"
	search_button.pressed.connect(_search)
	action_row.add_child(search_button)
	_dock.add_child(action_row)

	_status = Label.new()
	_status.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_status.text = "Index noch nicht erstellt."
	_dock.add_child(_status)

	_results_view = RichTextLabel.new()
	_results_view.bbcode_enabled = false
	_results_view.selection_enabled = true
	_results_view.custom_minimum_size = Vector2(0, 190)
	_results_view.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_dock.add_child(_results_view)

	var copy_button := Button.new()
	copy_button.text = "Quellenkontext kopieren"
	copy_button.pressed.connect(_copy_context)
	_dock.add_child(copy_button)

	var draft_heading := Label.new()
	draft_heading.text = "Dokumentationsentwurf"
	_dock.add_child(draft_heading)
	_draft_field = TextEdit.new()
	_draft_field.placeholder_text = "Lore-, Quest- oder Projektdokumentation formulieren…"
	_draft_field.custom_minimum_size = Vector2(0, 120)
	_draft_field.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_dock.add_child(_draft_field)

	var save_row := HBoxContainer.new()
	_filename_field = LineEdit.new()
	_filename_field.text = "neuer-entwurf.md"
	_filename_field.placeholder_text = "Dateiname.md"
	_filename_field.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	save_row.add_child(_filename_field)
	var save_button := Button.new()
	save_button.text = "Neu speichern"
	save_button.pressed.connect(_save_draft)
	save_row.add_child(save_button)
	_dock.add_child(save_row)

func _default_root() -> String:
	var docs_path := ProjectSettings.globalize_path("res://../docs")
	if DirAccess.open(docs_path) != null:
		return docs_path
	return ProjectSettings.globalize_path("res://")

func _choose_folder() -> void:
	_folder_dialog.current_dir = _root_field.text.strip_edges()
	_folder_dialog.popup_centered_ratio(0.75)

func _on_folder_selected(path: String) -> void:
	_root_field.text = path
	_has_index = false
	_last_results.clear()
	_results_view.clear()
	_status.text = "Ordner gewählt. Index aktualisieren oder suchen."

func _refresh_index() -> void:
	var response: Dictionary = _index.index_directory(_root_field.text.strip_edges())
	_has_index = bool(response.get("ok", false))
	_indexed_root = _root_field.text.strip_edges() if _has_index else ""
	_last_results.clear()
	_last_query = ""
	_last_category = ""
	_results_view.clear()
	if not _has_index:
		_status.text = str(response.get("error", "Index konnte nicht erstellt werden."))
		return
	var limit_note := " Größenlimit erreicht." if bool(response.get("truncated", false)) else ""
	_status.text = "%d Dateien indexiert, %d übersprungen.%s" % [
		int(response.get("files", 0)),
		int(response.get("skipped", 0)),
		limit_note
	]

func _ensure_index() -> bool:
	var current_root := _root_field.text.strip_edges()
	if not _has_index or _indexed_root != current_root:
		_refresh_index()
	return _has_index

func _search() -> void:
	if not _ensure_index():
		return
	var query := _query_field.text.strip_edges()
	var selected_category := _category.get_item_text(_category.selected)
	_last_query = query
	_last_category = selected_category
	_last_results.clear()
	if query.is_empty():
		_results_view.text = "Frage oder Stichwörter eingeben."
		_last_results.clear()
		return
	_last_results = _index.search(query, selected_category, 8)
	if _last_results.is_empty():
		_results_view.text = "Keine passenden Fundstellen."
		_status.text = "Keine Fundstellen für diese Wörter und Kategorie."
		return
	_results_view.clear()
	for result in _last_results:
		_results_view.append_text("%s · %s · Relevanz %d\n%s\n\n" % [
			str(result["category"]),
			str(result["citation"]),
			int(result["score"]),
			str(result["snippet"])
		])
	_status.text = "%d Fundstellen. Quelle vor Übernahme im Dokument prüfen." % _last_results.size()

func _on_query_submitted(_query: String) -> void:
	_search()

func _on_category_selected(_index_number: int) -> void:
	_search()

func _copy_context() -> void:
	if not _ensure_index():
		return
	if _query_field.text.strip_edges() != _last_query or _category.get_item_text(_category.selected) != _last_category:
		_search()
	DisplayServer.clipboard_set(_index.context_bundle(_query_field.text, _last_results, 6))
	_status.text = "Frage und angezeigte Fundstellen in die Zwischenablage kopiert."

func _save_draft() -> void:
	if not _ensure_index():
		return
	if _query_field.text.strip_edges() != _last_query or _category.get_item_text(_category.selected) != _last_category:
		_search()
	var response: Dictionary = _index.save_new_draft(
		_root_field.text.strip_edges(),
		_filename_field.text,
		_draft_field.text,
		_last_results
	)
	if not bool(response.get("ok", false)):
		_status.text = str(response.get("error", "Entwurf konnte nicht gespeichert werden."))
		return
	_status.text = "Neue Markdown-Datei angelegt: %s" % str(response.get("path", ""))

func _exit_tree() -> void:
	if is_instance_valid(_dock):
		remove_control_from_docks(_dock)
		_dock.queue_free()
	if is_instance_valid(_folder_dialog):
		_folder_dialog.queue_free()
