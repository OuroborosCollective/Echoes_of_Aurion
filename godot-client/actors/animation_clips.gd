extends RefCounted
## Same presentation aliases as the browser actor; authored names stay intact.
const ALIASES := {
	"Idle":["idle","standingidle","standidle","breathingidle","breathidle"],
	"Walk":["walk","walking","walkforward","locomotionwalk","run"],
	"Death":["death","die","dying"],
}

static func normalized(value: String) -> String:
	var result := ""
	for character in value.to_lower():
		if "abcdefghijklmnopqrstuvwxyz0123456789".contains(character):
			result += character
	return result

static func resolve(player: AnimationPlayer, pose: String) -> String:
	var names := player.get_animation_list()
	for alias in ALIASES.get(pose, []):
		for name in names:
			if normalized(str(name)) == alias:
				return str(name)
	for alias in ALIASES.get(pose, []):
		for name in names:
			if normalized(str(name)).contains(alias):
				return str(name)
	return ""
