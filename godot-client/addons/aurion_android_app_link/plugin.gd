@tool
extends EditorPlugin

const AndroidAppLinkExport = preload("export_plugin.gd")
var _android_export: EditorExportPlugin

func _enter_tree() -> void:
	_android_export = AndroidAppLinkExport.new()
	add_export_plugin(_android_export)

func _exit_tree() -> void:
	remove_export_plugin(_android_export)
	_android_export = null

