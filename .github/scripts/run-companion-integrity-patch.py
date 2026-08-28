from __future__ import annotations

from pathlib import Path
import runpy

script = Path(__file__).with_name("apply-companion-integrity-patch.py")
source = script.read_text(encoding="utf-8")
needle = '''    count = content.count(old)\n    if count != 1:\n'''
replacement = '''    count = content.count(old)\n    if old == "\\n});\\n" and count >= 1:\n        index = content.rfind(old)\n        write(path, content[:index] + new + content[index + len(old):])\n        return\n    if count != 1:\n'''
if source.count(needle) != 1:
    raise SystemExit("temporary patch runner could not locate replace_once contract")
script.write_text(source.replace(needle, replacement, 1), encoding="utf-8")
try:
    runpy.run_path(str(script), run_name="__main__")
finally:
    Path(__file__).unlink(missing_ok=True)
