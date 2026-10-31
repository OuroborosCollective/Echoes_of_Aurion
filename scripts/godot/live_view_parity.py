#!/usr/bin/env python3
"""Read-only, fail-closed comparison of two *externally captured* live world viewports.

The tool neither captures a runtime nor manufactures an Aurion receipt. Synthetic
images are permitted in unit tests only. Real CI must acquire independent, fresh
Aurion and Godot captures with matching canonical receipt and camera identity.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from PIL import Image, ImageChops, ImageEnhance, ImageFilter, ImageOps, ImageStat

SCHEMA = "aurion.live-view.capture.v1"
SHA40 = re.compile(r"^[a-f0-9]{40}$")
SHA256 = re.compile(r"^(?:sha256:)?[a-f0-9]{64}$")
HEX64 = re.compile(r"^[a-f0-9]{64}$")
REQUIRED_SKY = {"physical", "procedural", "panorama"}
MAX_AGE_SECONDS = 120
MAX_CAPTURE_SKEW_SECONDS = 2
MAX_PIXELS = 4096 * 2160


def digest(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def _fail(issues: list[str], code: str) -> None:
    if code not in issues:
        issues.append(code)


def _load_json(path: Path, issues: list[str], name: str) -> dict[str, Any]:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        _fail(issues, f"{name}_MANIFEST_MISSING_OR_INVALID")
        return {}
    if not isinstance(data, dict):
        _fail(issues, f"{name}_MANIFEST_NOT_OBJECT")
        return {}
    return data


def _valid_utc(value: Any, issues: list[str], name: str, now: datetime) -> datetime | None:
    if not isinstance(value, str) or not value.endswith("Z"):
        _fail(issues, f"{name}_CAPTURE_TIME_UNVERIFIED")
        return None
    try:
        t = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        _fail(issues, f"{name}_CAPTURE_TIME_UNVERIFIED")
        return None
    age = (now - t).total_seconds()
    if age < -5 or age > MAX_AGE_SECONDS:
        _fail(issues, f"{name}_CAPTURE_NOT_FRESH")
    return t


def _is_str(v: Any) -> bool:
    return isinstance(v, str) and bool(v)


def _capture_checks(
    meta: dict[str, Any], expected_source: str, expected_revision: str,
    expected_image_id: str, now: datetime, issues: list[str]
) -> datetime | None:
    prefix = expected_source.upper().replace("-", "_")
    if meta.get("schema") != SCHEMA or meta.get("source") != expected_source:
        _fail(issues, f"{prefix}_SOURCE_SCHEMA_INVALID")
    if meta.get("captureKind") != "world-viewport" or meta.get("captureMode") != "authenticated-live":
        _fail(issues, f"{prefix}_NOT_LIVE_WORLD_VIEWPORT")
    if meta.get("observedScreen") == "login":
        _fail(issues, f"{prefix}_LOGIN_SCREEN_NOT_WORLD")
    elif meta.get("observedScreen") != "gameplay-world":
        _fail(issues, f"{prefix}_SCREEN_STATE_UNVERIFIED")
    t = _valid_utc(meta.get("capturedAtUtc"), issues, prefix, now)
    ident = meta.get("identity", {})
    if not isinstance(ident, dict):
        ident = {}
    if not _is_str(ident.get("worldId")) or not _is_str(ident.get("zoneId")):
        _fail(issues, f"{prefix}_WORLD_ID_UNVERIFIED")
    if ident.get("sourceRevision") != expected_revision or not SHA40.fullmatch(str(ident.get("sourceRevision", ""))):
        _fail(issues, f"{prefix}_ACTIVE_REVISION_MISMATCH")
    if ident.get("runtimeImageId") != expected_image_id or not SHA256.fullmatch(str(ident.get("runtimeImageId", ""))):
        _fail(issues, f"{prefix}_ACTIVE_IMAGE_MISMATCH")
    if isinstance(ident.get("tick"), bool) or not isinstance(ident.get("tick"), int) or ident.get("tick", -1) < 1:
        _fail(issues, f"{prefix}_TICK_UNVERIFIED")
    if not SHA256.fullmatch(str(ident.get("receiptHash", ""))):
        _fail(issues, f"{prefix}_RECEIPT_UNVERIFIED")
    if not SHA256.fullmatch(str(ident.get("stateHash", ""))):
        _fail(issues, f"{prefix}_STATE_UNVERIFIED")
    camera = meta.get("camera", {})
    if not isinstance(camera, dict) or set(camera) != {"positionMm", "targetMm", "fovMilliDeg", "viewportPx"}:
        _fail(issues, f"{prefix}_CAMERA_INVALID")
    else:
        for k in ("positionMm", "targetMm"):
            if not isinstance(camera[k], list) or len(camera[k]) != 3 or any(type(v) is not int or abs(v) > 10**10 for v in camera[k]):
                _fail(issues, f"{prefix}_CAMERA_INVALID")
        if type(camera["fovMilliDeg"]) is not int or not 10000 <= camera["fovMilliDeg"] <= 150000:
            _fail(issues, f"{prefix}_CAMERA_INVALID")
        if not isinstance(camera["viewportPx"], list) or len(camera["viewportPx"]) != 2 or any(type(v) is not int or v < 320 or v > 4096 for v in camera["viewportPx"]):
            _fail(issues, f"{prefix}_CAMERA_INVALID")
    proj = meta.get("projection", {})
    if not isinstance(proj, dict):
        proj = {}
    chunks = proj.get("confirmedChunks")
    assets = proj.get("renderedAssetIds")
    entities = proj.get("visibleEntityIds")
    if not isinstance(chunks, list) or not chunks or len(chunks) > 9 or any(not _is_str(c) for c in chunks):
        _fail(issues, f"{prefix}_NO_CONFIRMED_TERRAIN")
    if not isinstance(assets, list) or len(assets) < 2 or len(assets) > 500 or any(not _is_str(a) for a in assets):
        _fail(issues, f"{prefix}_ONLY_PLACEHOLDERS_OR_SINGLE_MODEL")
    if not isinstance(entities, list) or not entities or len(entities) > 2048 or any(not _is_str(e) for e in entities):
        _fail(issues, f"{prefix}_NO_CONFIRMED_ACTORS")
    if proj.get("skyType") not in REQUIRED_SKY or proj.get("skyVisible") is not True:
        _fail(issues, f"{prefix}_SKY_MISSING")
    return t


def _visual_stats(image: Image.Image) -> dict[str, float | int]:
    small = image.convert("RGB").resize((160, 90), Image.Resampling.BICUBIC)
    data = list(small.get_flattened_data()) if hasattr(small, "get_flattened_data") else list(small.getdata())
    w, h = small.size
    top = [p for i, p in enumerate(data) if (i // w) < h // 4]
    bottom = [p for i, p in enumerate(data) if (i // w) >= int(h * 0.55)]
    dark_top = sum((r + g + b) < 45 for r, g, b in top) / len(top)
    green_bottom = sum(g > r * 1.15 and g > b * 1.05 and g > 30 for r, g, b in bottom) / len(bottom)
    palette = len(set((r // 24, g // 24, b // 24) for r, g, b in data))
    edges = small.convert("L").filter(ImageFilter.FIND_EDGES)
    edge_values = edges.get_flattened_data() if hasattr(edges, "get_flattened_data") else edges.getdata()
    edge_fraction = sum(v > 42 for v in edge_values) / len(data)
    contrast = sum(ImageStat.Stat(small).stddev) / (3 * 255)
    return {
        "topBlackFraction": round(dark_top, 4),
        "bottomGreenFraction": round(green_bottom, 4),
        "quantizedColors": palette,
        "edgeFraction": round(edge_fraction, 4),
        "contrast": round(contrast, 4),
    }


def _tile_ssim(a: Image.Image, b: Image.Image) -> float:
    xa = a.convert("L").resize((160, 90), Image.Resampling.BICUBIC)
    ya = b.convert("L").resize((160, 90), Image.Resampling.BICUBIC)
    x = list(xa.get_flattened_data() if hasattr(xa, "get_flattened_data") else xa.getdata())
    y = list(ya.get_flattened_data() if hasattr(ya, "get_flattened_data") else ya.getdata())
    width, height = 160, 90
    values = []
    for ty in range(0, height, 15):
        for tx in range(0, width, 16):
            aa, bb = [], []
            for j in range(ty, ty + 15):
                aa.extend(x[j * width + tx:j * width + tx + 16])
                bb.extend(y[j * width + tx:j * width + tx + 16])
            n = len(aa)
            ma, mb = sum(aa) / n, sum(bb) / n
            va = sum((v - ma)**2 for v in aa) / n
            vb = sum((v - mb)**2 for v in bb) / n
            covariance = sum((va_ - ma) * (vb_ - mb) for va_, vb_ in zip(aa, bb)) / n
            c1, c2 = (0.01 * 255)**2, (0.03 * 255)**2
            ssim = ((2 * ma * mb + c1) * (2 * covariance + c2)) / ((ma**2 + mb**2 + c1) * (va + vb + c2))
            values.append(ssim)
    return round(sum(values) / len(values), 5)


def compare(
    capture_dir: Path, out_dir: Path, expected_revision: str, expected_image_id: str,
    bridge_up: bool, editor_up: bool, now: datetime | None = None,
) -> dict[str, Any]:
    now = now or datetime.now(timezone.utc)
    out_dir.mkdir(parents=True, exist_ok=True)
    issues: list[str] = []
    if not SHA40.fullmatch(expected_revision):
        _fail(issues, "LIVE_SERVER_REVISION_UNVERIFIED")
    if not SHA256.fullmatch(expected_image_id):
        _fail(issues, "LIVE_SERVER_IMAGE_UNVERIFIED")
    if not bridge_up:
        _fail(issues, "GODOT_LIVE_BRIDGE_NOT_LISTENING")
    if not editor_up:
        _fail(issues, "GODOT_EDITOR_NOT_RUNNING")

    meta_paths = {"aurion-web": capture_dir / "aurion.json", "godot-live-editor": capture_dir / "godot.json"}
    image_paths = {"aurion-web": capture_dir / "aurion.png", "godot-live-editor": capture_dir / "godot.png"}
    manifests = {key: _load_json(p, issues, key.upper().replace("-", "_")) for key, p in meta_paths.items()}
    dates: dict[str, datetime | None] = {}
    frames: dict[str, Image.Image] = {}
    stats: dict[str, dict[str, float | int]] = {}
    for key, meta in manifests.items():
        dates[key] = _capture_checks(meta, key, expected_revision, expected_image_id, now, issues)
        src = image_paths[key]
        try:
            if src.stat().st_size > 24_000_000:
                raise ValueError("oversized PNG")
            with Image.open(src) as raw:
                if raw.format != "PNG" or raw.width * raw.height > MAX_PIXELS or raw.width < 320 or raw.height < 240:
                    raise ValueError("unsupported PNG")
                frame = raw.convert("RGB")
            frames[key] = frame
            hash_value = meta.get("imageSha256")
            if not isinstance(hash_value, str) or not HEX64.fullmatch(hash_value) or hash_value != digest(src):
                _fail(issues, f"{key.upper().replace('-', '_')}_IMAGE_HASH_MISMATCH")
            camera = meta.get("camera")
            if isinstance(camera, dict) and camera.get("viewportPx") != [frame.width, frame.height]:
                _fail(issues, f"{key.upper().replace('-', '_')}_VIEWPORT_PIXELS_MISMATCH")
            stats[key] = _visual_stats(frame)
            # A neutral flat canvas cannot be truth, even if both renderers agree.
            if stats[key]["quantizedColors"] < 15 or stats[key]["contrast"] < 0.045:
                _fail(issues, f"{key.upper().replace('-', '_')}_NEARLY_BLANK_VIEW")
            if stats[key]["topBlackFraction"] > 0.80:
                _fail(issues, f"{key.upper().replace('-', '_')}_BLACK_SKY_VISIBLE")
            if stats[key]["bottomGreenFraction"] > 0.80 and stats[key]["edgeFraction"] < 0.065:
                _fail(issues, f"{key.upper().replace('-', '_')}_NEUTRAL_GREEN_FLOOR_DOMINANT")
            preview = frame.copy()
            preview.thumbnail((960, 540), Image.Resampling.LANCZOS)
            preview.save(out_dir / f"{key}-preview.png")
        except (OSError, ValueError, SyntaxError):
            _fail(issues, f"{key.upper().replace('-', '_')}_SCREENSHOT_MISSING_OR_INVALID")
    web, godot = manifests["aurion-web"], manifests["godot-live-editor"]
    wa, ga = web.get("identity", {}), godot.get("identity", {})
    if isinstance(wa, dict) and isinstance(ga, dict) and wa and ga:
        for field in ("worldId", "zoneId", "sourceRevision", "runtimeImageId", "tick", "receiptHash", "stateHash"):
            if wa.get(field) != ga.get(field):
                _fail(issues, f"CANONICAL_{field.upper()}_MISMATCH")
    if web.get("camera") != godot.get("camera"):
        _fail(issues, "CAMERA_PROJECTION_MISMATCH")
    wp, gp = web.get("projection", {}), godot.get("projection", {})
    if isinstance(wp, dict) and isinstance(gp, dict):
        for field in ("confirmedChunks", "visibleEntityIds", "renderedAssetIds"):
            a, b = wp.get(field), gp.get(field)
            if isinstance(a, list) and isinstance(b, list) and sorted(a) != sorted(b):
                _fail(issues, f"WORLD_{field.upper()}_MISMATCH")
    if dates["aurion-web"] and dates["godot-live-editor"] and abs((dates["aurion-web"] - dates["godot-live-editor"]).total_seconds()) > MAX_CAPTURE_SKEW_SECONDS:
        _fail(issues, "CAPTURE_TIME_SKEW")

    visual: dict[str, float | int] = {}
    if len(frames) == 2:
        a, b = frames["aurion-web"], frames["godot-live-editor"]
        if a.size != b.size:
            _fail(issues, "RENDER_VIEWPORT_SIZE_MISMATCH")
        else:
            diff = ImageChops.difference(a, b)
            grayscale = ImageOps.grayscale(diff)
            heat = ImageOps.colorize(ImageEnhance.Contrast(grayscale).enhance(2.0), black="#07131c", white="#ff5348")
            heat.save(out_dir / "difference.png")
            mean_rgb = ImageStat.Stat(diff).mean
            mae = sum(mean_rgb) / (3 * 255)
            ssim = _tile_ssim(a, b)
            visual = {"normalizedPixelError": round(mae, 5), "tileSsim": ssim, "width": a.width, "height": a.height}
            if mae > 0.22 or ssim < 0.62:
                _fail(issues, "REAL_VIEW_VISUAL_MISMATCH")
    if not frames:
        _fail(issues, "LIVE_VISUAL_EVIDENCE_MISSING")

    status = "PASS" if not issues else "FAIL"
    diagnosis = []
    if "GODOT_LIVE_BRIDGE_NOT_LISTENING" in issues:
        diagnosis.append("Die lokale Godot-Bridge ist nicht erreichbar. Der Editor kann keine aktuelle kanonische Weltprojektion beziehen.")
    if "GODOT_LIVE_EDITOR_LOGIN_SCREEN_NOT_WORLD" in issues:
        diagnosis.append("Godot zeigte einen Anmeldedialog anstelle des authentifizierten Spielwelt-Viewports. Kein Live-Weltbild nachgewiesen.")
    elif "GODOT_LIVE_EDITOR_SCREEN_STATE_UNVERIFIED" in issues or "GODOT_LIVE_EDITOR_NOT_LIVE_WORLD_VIEWPORT" in issues:
        diagnosis.append("Der tatsächlich aufgenommene Godot-Bildschirm ist nicht als aktiver, authentifizierter Welt-Viewport nachgewiesen.")
    if any(x in issues for x in ("GODOT_LIVE_EDITOR_NO_CONFIRMED_TERRAIN", "WORLD_CONFIRMEDCHUNKS_MISMATCH")):
        diagnosis.append("Godot hat keine oder andere bestätigte Terrain-Chunks. Wahrscheinlicher Neutralboden statt Aurion-Weltgeometrie.")
    if "GODOT_LIVE_EDITOR_ONLY_PLACEHOLDERS_OR_SINGLE_MODEL" in issues:
        diagnosis.append("Godot zeigt laut Render-Manifest höchstens ein bestätigtes Modell bzw. nur Platzhalter. Weitere Welt-Assets fehlen.")
    if any("BLACK_SKY" in x or "SKY_MISSING" in x for x in issues):
        diagnosis.append("Der Godot-Himmel ist schwarz, leer oder ohne dokumentierte Sky-Projektion.")
    if "CAMERA_PROJECTION_MISMATCH" in issues:
        diagnosis.append("Kameras oder Sichtfelder stimmen nicht überein. Ein Bildvergleich wäre hier unzulässig.")
    if "REAL_VIEW_VISUAL_MISMATCH" in issues:
        diagnosis.append("Beide Viewports zeigen sichtbar unterschiedliche Pixelinhalte. difference.png lokalisiert die Abweichungen.")
    if not diagnosis and issues:
        diagnosis.append("Live-Vergleich nicht zulässig: siehe konkrete Identitäts-, Capture- oder Bildfehler.")

    report = {
        "schema": "aurion.live-view.parity-report.v1", "status": status,
        "evidenceKind": "real-live-pair-required", "expectedRuntimeRevision": expected_revision,
        "expectedRuntimeImageId": expected_image_id, "issues": issues,
        "diagnosis": diagnosis, "stats": stats, "visual": visual,
        "captureNames": {k: p.name for k, p in image_paths.items()},
        "metadataSummary": {
            k: {"capturedAtUtc": v.get("capturedAtUtc"), "observedScreen": v.get("observedScreen"), "worldId": v.get("identity", {}).get("worldId") if isinstance(v.get("identity"), dict) else None,
                "zoneId": v.get("identity", {}).get("zoneId") if isinstance(v.get("identity"), dict) else None,
                "tick": v.get("identity", {}).get("tick") if isinstance(v.get("identity"), dict) else None,
                "confirmedChunks": len(v.get("projection", {}).get("confirmedChunks", [])) if isinstance(v.get("projection"), dict) and isinstance(v.get("projection", {}).get("confirmedChunks"), list) else 0,
                "renderedAssets": len(v.get("projection", {}).get("renderedAssetIds", [])) if isinstance(v.get("projection"), dict) and isinstance(v.get("projection", {}).get("renderedAssetIds"), list) else 0}
            for k, v in manifests.items()
        },
    }
    (out_dir / "parity.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    rows = [f"# Aurion ↔ Godot echter Live-Bildvergleich: {status}", "", f"- Aurion Runtime-SHA: `{expected_revision}`", f"- Runtime-Image-ID: `{expected_image_id}`", "- Nachweisgrenze: echte Bildpaare **und** derselbe serverbestätigte Receipt, kein Mock/Fixture", ""]
    rows.append("## Ursachen / Blocker")
    rows.extend([f"- `{x}`" for x in issues] or ["- Keine"])  # Never declare live without the complete gate.
    rows.extend(["", "## Diagnose der Godot-Ansicht"] + [f"- {x}" for x in diagnosis])
    rows.extend(["", "## Sichtbarkeitsmetriken", "```json", json.dumps({"stats": stats, "visual": visual, "metadata": report["metadataSummary"]}, ensure_ascii=False, indent=2), "```", "", "Aufnahmen: `aurion-web-preview.png`, `godot-live-editor-preview.png`; soweit verfügbar `difference.png`."])
    (out_dir / "report.md").write_text("\n".join(rows) + "\n", encoding="utf-8")
    return report


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--captures", type=Path, required=True)
    ap.add_argument("--output", type=Path, required=True)
    ap.add_argument("--expected-revision", required=True)
    ap.add_argument("--expected-image-id", required=True)
    ap.add_argument("--bridge-up", choices=("true", "false"), default="false")
    ap.add_argument("--editor-up", choices=("true", "false"), default="false")
    args = ap.parse_args()
    result = compare(args.captures, args.output, args.expected_revision, args.expected_image_id, args.bridge_up == "true", args.editor_up == "true")
    print(json.dumps({"status": result["status"], "issues": result["issues"], "visual": result["visual"], "report": str(args.output / "report.md")}, ensure_ascii=False))
    return 0 if result["status"] == "PASS" else 1


if __name__ == "__main__":
    sys.exit(main())
