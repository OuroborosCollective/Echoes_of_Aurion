extends RefCounted
## Bounded, local documentation retrieval. It never calls Aurion or changes runtime state.

const MAX_FILES := 400
const MAX_DIRECTORIES := 1000
const MAX_FILE_BYTES := 524288
const MAX_TOTAL_BYTES := 8388608
const MAX_DEPTH := 12
const MAX_QUERY_LENGTH := 160
const MAX_DRAFT_BYTES := 262144
const SUPPORTED_EXTENSIONS := ["md", "txt", "rst"]
const OMIT_DIRECTORIES := [".", "..", ".git", ".godot", "node_modules", "build", "dist", "target", "vendor"]

var documents: Array[Dictionary] = []
var indexed_files := 0
var skipped_files := 0
var indexed_bytes := 0
var last_error := ""
var _candidate_count := 0
var _directory_count := 0
var _scan_stopped := false

func index_directory(root_path: String) -> Dictionary:
	documents.clear()
	indexed_files = 0
	skipped_files = 0
	indexed_bytes = 0
	last_error = ""
	_candidate_count = 0
	_directory_count = 0
	_scan_stopped = false
	var root := DirAccess.open(root_path.strip_edges())
	if root == null:
		last_error = "Dokumentationsordner lässt sich nicht öffnen."
		return {"ok": false, "error": last_error, "files": 0, "skipped": 0, "truncated": false}
	_walk(root.get_current_dir(), "", 0)
	documents.sort_custom(func(left: Dictionary, right: Dictionary) -> bool:
		return str(left["path"]) < str(right["path"])
	)
	indexed_files = documents.size()
	return {
		"ok": true,
		"files": indexed_files,
		"skipped": skipped_files,
		"bytes": indexed_bytes,
		"truncated": _scan_stopped or skipped_files > 0
	}

func _walk(folder_path: String, relative_prefix: String, depth: int) -> void:
	if _scan_stopped:
		return
	_directory_count += 1
	if _directory_count > MAX_DIRECTORIES:
		skipped_files += 1
		_scan_stopped = true
		return
	var directory := DirAccess.open(folder_path)
	if directory == null:
		skipped_files += 1
		return
	var folders: Array[String] = []
	var files: Array[String] = []
	directory.list_dir_begin()
	var entry := directory.get_next()
	while not entry.is_empty():
		if not entry.begins_with(".") and not OMIT_DIRECTORIES.has(entry):
			if directory.current_is_dir():
				folders.append(entry)
			elif SUPPORTED_EXTENSIONS.has(entry.get_extension().to_lower()):
				files.append(entry)
		entry = directory.get_next()
	directory.list_dir_end()
	folders.sort()
	files.sort()
	for file_name in files:
		if _scan_stopped:
			break
		_read_document(folder_path.path_join(file_name), _join_relative(relative_prefix, file_name))
	if _scan_stopped:
		return
	for folder_name in folders:
		if _scan_stopped:
			break
		if depth >= MAX_DEPTH:
			skipped_files += 1
			continue
		_walk(folder_path.path_join(folder_name), _join_relative(relative_prefix, folder_name), depth + 1)

func _read_document(file_path: String, relative_path: String) -> void:
	_candidate_count += 1
	if _candidate_count > MAX_FILES:
		skipped_files += 1
		_scan_stopped = true
		return
	var file := FileAccess.open(file_path, FileAccess.READ)
	if file == null:
		skipped_files += 1
		return
	var byte_count := file.get_length()
	if byte_count > MAX_FILE_BYTES:
		file.close()
		skipped_files += 1
		return
	if indexed_bytes + byte_count > MAX_TOTAL_BYTES:
		file.close()
		skipped_files += 1
		_scan_stopped = true
		return
	var content := file.get_as_text().replace("\r\n", "\n").replace("\r", "\n")
	file.close()
	if content.strip_edges().is_empty():
		return
	indexed_bytes += byte_count
	var normalized_path := relative_path.replace("\\", "/")
	documents.append({
		"path": normalized_path,
		"category": _category_for(normalized_path),
		"lines": content.split("\n", true),
		"text": content
	})

func _join_relative(prefix: String, name: String) -> String:
	if prefix.is_empty():
		return name
	return prefix.path_join(name)

func _category_for(path: String) -> String:
	var lower_path := path.to_lower()
	if lower_path.contains("quest") or lower_path.contains("auftrag"):
		return "Quest"
	if lower_path.contains("lore") or lower_path.contains("legende") or lower_path.contains("geschichte"):
		return "Lore"
	if lower_path.contains("projekt") or lower_path.contains("project") or lower_path.contains("roadmap"):
		return "Projekt"
	return "Projekt"

func _tokenize(query: String) -> Array[String]:
	var normalized := query.strip_edges().to_lower()
	if normalized.length() > MAX_QUERY_LENGTH:
		normalized = normalized.substr(0, MAX_QUERY_LENGTH)
	for separator in ["\t", "\n", "\r", ",", ".", ":", ";", "?", "!", "(", ")", "[", "]", "{", "}", "/", "\\", "\"", "'", "…", "—", "–"]:
		normalized = normalized.replace(separator, " ")
	var tokens: Array[String] = []
	for token in normalized.split(" ", false):
		var clean := token.strip_edges()
		if not clean.is_empty() and not tokens.has(clean):
			tokens.append(clean)
	return tokens

func _count_occurrences(line: String, token: String) -> int:
	var count := 0
	var offset := 0
	while true:
		var position := line.find(token, offset)
		if position < 0:
			break
		count += 1
		offset = position + token.length()
	return count

func search(query: String, category: String = "Alle", limit: int = 8) -> Array[Dictionary]:
	var tokens := _tokenize(query)
	var ranked: Array[Dictionary] = []
	if tokens.is_empty() or limit <= 0:
		return ranked
	for document in documents:
		if category != "Alle" and str(document["category"]) != category:
			continue
		var lines = document["lines"]
		var found_tokens: Dictionary = {}
		var total_occurrences := 0
		var best_line_index := 0
		var best_line_hits := -1
		for line_index in range(lines.size()):
			var line := str(lines[line_index])
			var lowered := line.to_lower()
			var line_hits := 0
			for token in tokens:
				var occurrences := _count_occurrences(lowered, token)
				if occurrences > 0:
					found_tokens[token] = true
					line_hits += 1
					total_occurrences += occurrences
			if line_hits > best_line_hits:
				best_line_hits = line_hits
				best_line_index = line_index
		if found_tokens.size() != tokens.size():
			continue
		var snippet_lines: Array[String] = []
		var first_line := maxi(0, best_line_index - 1)
		var last_line := mini(lines.size() - 1, best_line_index + 1)
		for line_index in range(first_line, last_line + 1):
			snippet_lines.append("%d: %s" % [line_index + 1, str(lines[line_index]).strip_edges()])
		var snippet := "\n".join(snippet_lines)
		if snippet.length() > 420:
			snippet = snippet.substr(0, 417).strip_edges() + "..."
		var citation := "%s#L%d" % [document["path"], best_line_index + 1]
		ranked.append({
			"path": document["path"],
			"category": document["category"],
			"line": best_line_index + 1,
			"citation": citation,
			"snippet": snippet,
			"score": total_occurrences + best_line_hits * 5
		})
	ranked.sort_custom(func(left: Dictionary, right: Dictionary) -> bool:
		var left_score := int(left["score"])
		var right_score := int(right["score"])
		if left_score == right_score:
			return str(left["path"]) < str(right["path"])
		return left_score > right_score
	)
	var limited: Array[Dictionary] = []
	for position in range(mini(limit, ranked.size())):
		limited.append(ranked[position])
	return limited

func context_bundle(query: String, results: Array[Dictionary], limit: int = 6) -> String:
	var output := "Frage oder Stichwörter: %s\n" % query.strip_edges()
	output += "Lokale Stichwortsuche; bitte jede Fundstelle im Dokument prüfen.\n"
	if results.is_empty():
		output += "\nKeine passenden Fundstellen im ausgewählten Index."
		return output
	output += "\nFundstellen:\n"
	for position in range(mini(limit, results.size())):
		var result: Dictionary = results[position]
		output += "\n[%d] %s (%s)\n%s\n" % [
			position + 1,
			str(result["citation"]),
			str(result["category"]),
			str(result["snippet"])
		]
	return output

func _source_lines(results: Array[Dictionary]) -> String:
	var lines: Array[String] = []
	for result in results:
		lines.append("- " + str(result["citation"]))
	if lines.is_empty():
		return "- Keine abgerufenen Fundstellen."
	return "\n".join(lines)

func _valid_filename(file_name: String) -> bool:
	if not file_name.ends_with(".md") or file_name.length() > 83:
		return false
	var stem := file_name.substr(0, file_name.length() - 3)
	if stem.is_empty():
		return false
	var first := stem.substr(0, 1)
	if not "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789".contains(first):
		return false
	var allowed := "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_."
	for position in range(stem.length()):
		if not allowed.contains(stem.substr(position, 1)):
			return false
	return true

func save_new_draft(root_path: String, file_name: String, draft_text: String, results: Array[Dictionary]) -> Dictionary:
	if not _valid_filename(file_name.strip_edges()):
		return {"ok": false, "error": "Dateiname: Buchstaben/Ziffern, Bindestrich oder Unterstrich und .md verwenden."}
	var body := draft_text.strip_edges()
	if body.is_empty():
		return {"ok": false, "error": "Der Entwurf ist leer."}
	var folder := DirAccess.open(root_path.strip_edges())
	if folder == null:
		return {"ok": false, "error": "Dokumentationsordner lässt sich nicht öffnen."}
	var target_path := folder.get_current_dir().path_join(file_name.strip_edges())
	if FileAccess.file_exists(target_path):
		return {"ok": false, "error": "Datei existiert bereits; vorhandene Dokumente werden nicht überschrieben."}
	var output := body + "\n\n## Verwendete Fundstellen\n" + _source_lines(results) + "\n"
	if output.to_utf8_buffer().size() > MAX_DRAFT_BYTES:
		return {"ok": false, "error": "Entwurf überschreitet das Größenlimit."}
	var file := FileAccess.open(target_path, FileAccess.WRITE)
	if file == null:
		return {"ok": false, "error": "Neue Markdown-Datei konnte nicht angelegt werden."}
	file.store_string(output)
	file.close()
	return {"ok": true, "path": target_path}
