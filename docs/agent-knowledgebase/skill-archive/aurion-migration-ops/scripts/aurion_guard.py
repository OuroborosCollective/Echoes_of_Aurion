#!/usr/bin/env python3
"""Loader for the readable split Aurion migration guard source.

The repository stores the guard in bounded text parts so GitHub text-only connector
writes remain reviewable. Packaging/manifest verification covers every part.
"""
from pathlib import Path

_here = Path(__file__).resolve().parent
_parts = sorted(_here.glob("aurion_guard.part[0-9][0-9]"))
if not _parts:
    raise RuntimeError("Aurion guard source parts are missing")
_source = "".join(path.read_text(encoding="utf-8") for path in _parts)
exec(compile(_source, str(_here / "aurion_guard.py<assembled>"), "exec"), globals(), globals())
