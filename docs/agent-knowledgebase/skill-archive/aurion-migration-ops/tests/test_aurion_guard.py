#!/usr/bin/env python3
"""Loader for the readable split Aurion guard regression source."""
from pathlib import Path
_here = Path(__file__).resolve().parent
_parts = sorted(_here.glob("test_aurion_guard.part[0-9][0-9]"))
if not _parts:
    raise RuntimeError("Aurion guard test source parts are missing")
_source = "".join(path.read_text(encoding="utf-8") for path in _parts)
exec(compile(_source, str(_here / "test_aurion_guard.py<assembled>"), "exec"), globals(), globals())
