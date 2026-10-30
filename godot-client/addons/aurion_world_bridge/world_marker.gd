@tool
extends Node3D
## Place this marker in the edited scene and attach a local visual as a child.
## Only the asset ID and bounded transform are exported; children/scripts are not.
@export var placement_key := ""
@export var asset_id := ""
