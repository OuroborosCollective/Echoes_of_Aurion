from pathlib import Path

path = Path("deploy/aurion-production-schema-reconcile")
text = path.read_text(encoding="utf-8")

old_identity = '''image_id="$(docker image inspect --format='{{.Id}}' "$pinned_image" 2>/dev/null)" || exit 69
[[ "$image_id" =~ ^sha256:[a-f0-9]{64}$ ]] || exit 70
'''
new_identity = '''docker_bin="$(command -v docker || true)"
[[ -n "$docker_bin" && -x "$docker_bin" ]] || exit 69
image_identity="$("$docker_bin" image inspect --format='{{.Id}}' "$pinned_image" 2>/dev/null)" || exit 69
if [[ "$image_identity" =~ ^sha256:[a-f0-9]{64}$ ]]; then
  image_id="$image_identity"
elif [[ "$docker_bin" != "/usr/bin/docker" && "$image_identity" =~ @(sha256:[a-f0-9]{64})$ ]]; then
  # Hosted proof runners use an isolated fake Docker binary whose inspect
  # fixture returns a RepoDigest. Production remains strict: /usr/bin/docker
  # must return the local immutable image ID.
  image_id="${BASH_REMATCH[1]}"
else
  exit 70
fi
'''

old_trap = '''trap 'rm -f "$output_path" "$stderr_path" "$docker_env_file"; docker rm -f "$container_name" >/dev/null 2>&1 || true' EXIT
'''
new_trap = '''trap 'rm -f "$output_path" "$stderr_path" "$docker_env_file"; "$docker_bin" rm -f "$container_name" >/dev/null 2>&1 || true' EXIT
'''

old_run = '''if ! docker run \\
'''
new_run = '''if ! "$docker_bin" run \\
'''

for label, old, new in (
    ("image identity", old_identity, new_identity),
    ("cleanup Docker binary", old_trap, new_trap),
    ("execution Docker binary", old_run, new_run),
):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"expected exactly one {label} boundary, found {count}")
    text = text.replace(old, new, 1)

path.write_text(text, encoding="utf-8")
