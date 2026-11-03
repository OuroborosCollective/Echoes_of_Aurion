#!/usr/bin/env python3
"""Report the one-shot collector's real first-session frames, including failures.

Provenance depends on running capture-live-startup.mjs from the protected default
branch. Arbitrary uploaded sidecars are not accepted by the production workflow.
"""
import argparse
import hashlib
import html
import io
import json
from datetime import datetime, timezone
from pathlib import Path
from PIL import Image, ImageChops, ImageEnhance, ImageOps
from live_view_parity import pixel_difference, _visual_stats, MAX_PNG_BYTES, MAX_PIXELS, SHA256

HINTS = {
    "LIVE_CAPTURE_INCOMPLETE": "Es liegt keine vollständige Live-Paaraufnahme vor. Den konkreten Start-/Verbindungsfehler zuerst beheben; fehlende Bilder sind kein visueller Erfolg.",
    "LIVE_RUNTIME_IDENTITY_UNVERIFIED": "Ohne erfolgreichen Health-Readback ist der aktive Stand unbekannt; daraus wird keine behauptete Versionsabweichung abgeleitet.",
    "LIVE_REVISION_MISMATCH": "Web-Runtime und geprüfter Godot-Checkout haben verschiedene Git-Stände. Erst dieselbe geprüfte Revision ausliefern.",
    "AUTHENTICATED_BROWSER_NOT_CONFIGURED": "Kein erreichbarer, bereits angemeldeter Browser am lokalen CDP-Port. Die Aufnahme erzeugt keine Ersatzsitzung.",
    "BROWSER_AUTH_OR_WORLD_NOT_READY": "Der Browser hat nach dem Start keine authentifizierten Aurion-Snapshots empfangen. Anmeldung, Charakterauswahl und WebSocket prüfen.",
    "BROWSER_GAMEPLAY_NOT_STARTED": "Die echte Spielansicht ist nicht gestartet. Anmeldung und den Einstieg SPIEL BETRETEN prüfen.",
    "GODOT_AUTH_OR_WORLD_NOT_READY": "Godot hat keine aktive Sitzung mit sichtbarem Welt-Viewport und bestätigtem Terrain. Native-Auth, WorldLease und Chunk-Abrufe prüfen.",
    "GODOT_EDITOR_PLUGIN_NOT_STARTED": "Der frische Editor hat den Aufnahme-Einstieg nicht erreicht. Plugin-Aktivierung in der privaten Projektkopie, Importfehler und Editor-Start prüfen.",
    "GODOT_VIEWPORT_NOT_CONFIGURED": "Die gewünschte Original-Auflösung fehlt. AURION_PARITY_VIEWPORT muss aus dem tatsächlichen Browser-Canvas stammen.",
    "GODOT_VIEWPORT_SIZE_MISMATCH": "Godots gerenderte Textur hat andere Maße als der Browser-Canvas. SubViewportContainer, Stretch und Fenster-Skalierung prüfen; PNGs werden nicht nachträglich skaliert.",
    "BROWSER_DOCUMENT_RESTARTED": "Die Browserseite wurde während des ersten Aufnahmeversuchs neu geladen. Navigation oder Wiederherstellung prüfen; ein späterer Start ersetzt den ersten Versuch nicht.",
    "BROWSER_TARGET_TICK_MISSED": "Der Browser hat den gemeinsamen Ziel-Tick nicht gerendert. Verbindungsunterbrechung, Hintergrund-Tab und Renderlatenz prüfen.",
    "GODOT_TARGET_TICK_MISSED": "Godot hat den gemeinsamen Ziel-Tick nicht gerendert. Snapshot-Verarbeitung, Verbindung und Renderlatenz prüfen.",
    "GODOT_RENDER_TICK_CHANGED": "Während Godot das Bild renderte, wurde bereits der nächste Snapshot angewendet. Das Bild lässt sich deshalb nicht demselben bestätigten Tick zuordnen.",
    "CAMERA_PROJECTION_MISMATCH": "Kameraposition, Ziel oder Sichtfeld unterscheiden sich. Beide tatsächlichen Kamera-Readbacks stehen im Bericht; Startabstand, Terrainhöhe und FOV prüfen.",
    "RENDER_VIEWPORT_SIZE_MISMATCH": "Die Original-Viewports haben unterschiedliche Pixelmaße. Fenstergröße und Geräte-Pixelfaktor angleichen; der Test skaliert keine Bilder.",
    "CANONICAL_SNAPSHOT_MISMATCH": "Die Renderer zeigen andere bestätigte Entitäten oder Positionen. Konto, Zone, Snapshot-Tick und Verbindung prüfen.",
    "CAPTURE_TICK_MISMATCH": "Die erste Aufnahme verfehlte den gemeinsamen Tick. Snapshot-Verarbeitung und Renderlatenz prüfen; es wird kein besseres Folgebild ausgewählt.",
    "GODOT_TERRAIN_MISSING": "Godot zeigt keinen bestätigten Terrain-Chunk. Chunk-Download, WorldLease und Import prüfen.",
    "BROWSER_TERRAIN_MISSING": "Die Browseransicht hat keine bestätigte Chunk-Projektion angewendet. Chunk-Abruf und Worker prüfen.",
    "GODOT_ENVIRONMENT_MISSING": "In der aktiven Godot-Spielwelt fehlt ein WorldEnvironment. Himmel und Beleuchtung werden nicht wie im Browser dargestellt.",
    "GODOT_ACTOR_MODELS_MISSING": "In Godot fehlt ein sichtbares bestätigtes GLB-Modell. Katalogzulassung, Download, Import und Ressourcenbudget prüfen.",
    "ASSETS_LOADING_OR_FAILED": "Mindestens ein Renderer lädt noch notwendige Assets oder meldet einen Assetfehler. Katalog, GLB-Downloads und Import-Diagnose prüfen.",
    "CANONICAL_RECEIPT_UNVERIFIED": "Der unabhängig gelesene Aurion-Receipt oder dessen Replay passt nicht zum aufgenommenen Tick. DB-Persistenz und Admin-Leseberechtigung prüfen.",
    "CANONICAL_WORLD_MISMATCH": "Der Receipt und die tatsächlich bestätigten Terrain-Daten gehören nicht zu derselben Aurion-Welt.",
    "REAL_VIEW_VISUAL_MISMATCH": "Mehr als 75% der Originalpixel weichen ab. Das Differenzbild lokalisiert die Unterschiede; Kamera, GLBs, Terrain, Material und Beleuchtung prüfen.",
}


def build_report(directory: Path, now=None):
    now = now or datetime.now(timezone.utc)
    issues, frames, observations = [], {}, {}
    def fail(code):
        if code not in issues: issues.append(code)
    def load(name):
        try:
            data = (directory / name).read_bytes()
            if len(data) > 2_000_000: raise ValueError()
            value = json.loads(data)
            if not isinstance(value, dict): raise ValueError()
            return value, data
        except (OSError, ValueError):
            fail(name.upper().replace(".", "_").replace("-", "_") + "_MISSING_OR_INVALID")
            return {}, b""
    index, _ = load("capture-index.json")
    if index.get("status") != "CAPTURED": fail("LIVE_CAPTURE_INCOMPLETE")
    for issue in index.get("issues", []) if isinstance(index.get("issues"), list) else []:
        if isinstance(issue, str) and len(issue) <= 100: fail(issue)
    if index.get("schema") != "aurion.startup-capture-index.v1": fail("CAPTURE_INDEX_INVALID")
    nonce = index.get("nonce")
    if not isinstance(nonce, str) or len(nonce) != 32 or any(c not in "0123456789abcdef" for c in nonce): fail("CAPTURE_NONCE_INVALID")
    revision = index.get("sourceRevision")
    runtime = index.get("runtime", {})
    after = index.get("runtimeAfter", {})
    if not isinstance(runtime, dict): runtime = {}
    if not isinstance(after, dict): after = {}
    image = runtime.get("runtimeImageDigest")
    if not runtime or not after:
        fail("LIVE_RUNTIME_IDENTITY_UNVERIFIED")
    else:
        if runtime.get("status") != "ok" or after.get("status") != "ok": fail("LIVE_RUNTIME_NOT_HEALTHY")
        if not isinstance(revision, str) or len(revision) != 40 or any(c not in "0123456789abcdef" for c in revision) or runtime.get("revision") != revision or after.get("revision") != revision: fail("LIVE_REVISION_MISMATCH")
        if not isinstance(image, str) or len(image) != 71 or not image.startswith("sha256:") or any(c not in "0123456789abcdef" for c in image[7:]) or after.get("runtimeImageDigest") != image: fail("LIVE_IMAGE_MISMATCH")
    hashes = index.get("files", {})
    if not isinstance(hashes, dict): hashes = {}
    captured = []
    for source, filename in (("aurion-web", "aurion"), ("godot-live-editor", "godot")):
        metadata_name = filename + "-observation.json"
        observation, raw = load(metadata_name)
        observations[filename] = observation
        if not observation:
            continue
        if hashlib.sha256(raw).hexdigest() != hashes.get(metadata_name): fail(filename.upper() + "_OBSERVATION_HASH_MISMATCH")
        if observation.get("schema") != "aurion.startup-view.observation.v1" or observation.get("source") != source or observation.get("nonce") != nonce or observation.get("captureIndex") != 1: fail(filename.upper() + "_FIRST_START_UNVERIFIED")
        if observation.get("connected") is not True: fail(filename.upper() + "_NOT_AUTHENTICATED_WORLD")
        try:
            stamp = datetime.fromisoformat(observation["capturedAtUtc"].replace("Z", "+00:00"))
            started = datetime.fromisoformat(observation["startedAtUtc"].replace("Z", "+00:00"))
            if stamp.tzinfo is None or started.tzinfo is None or not 0 <= (stamp - started).total_seconds() <= 180 or not -5 <= (now - stamp).total_seconds() <= 120: raise ValueError()
            captured.append(stamp)
        except (KeyError, TypeError, ValueError, AttributeError): fail(filename.upper() + "_CAPTURE_NOT_FRESH")
        try:
            path = directory / (filename + ".png")
            if path.stat().st_size > MAX_PNG_BYTES: raise ValueError()
            data = path.read_bytes()
            if hashlib.sha256(data).hexdigest() != hashes.get(path.name): fail(filename.upper() + "_IMAGE_HASH_MISMATCH")
            with Image.open(io.BytesIO(data)) as img:
                if img.format != "PNG" or img.width * img.height > MAX_PIXELS or img.width < 320 or img.height < 240: raise ValueError()
                frames[filename] = img.convert("RGB")
            if observation.get("viewportPx") != list(frames[filename].size): fail("RENDER_VIEWPORT_SIZE_MISMATCH")
            stats = _visual_stats(frames[filename])
            if stats["quantizedColors"] < 15 or stats["contrast"] < 0.045: fail(filename.upper() + "_NEARLY_BLANK_VIEW")
        except (OSError, ValueError, SyntaxError, Image.DecompressionBombError): fail(filename.upper() + "_IMAGE_MISSING_OR_INVALID")
    if len(captured) == 2 and abs((captured[0] - captured[1]).total_seconds()) > 2: fail("CAPTURE_TIME_SKEW")
    web, godot = observations["aurion"], observations["godot"]
    tick = index.get("targetTick")
    if web and godot:
        ws, gs = web.get("snapshot", {}), godot.get("snapshot", {})
        if not isinstance(ws, dict): ws = {}
        if not isinstance(gs, dict): gs = {}
        tick = index.get("targetTick")
        if type(tick) is not int or tick < 1 or any(s.get("tick") != tick for s in (ws, gs)): fail("CAPTURE_TICK_MISMATCH")
        # The trusted collector hashes real presence/mob/combat state in memory
        # with an ephemeral run key. Player IDs and combat records stay private.
        for field in ("zoneId", "projectionDigest", "presenceCount", "mobCount"):
            if ws.get(field) is None or ws.get(field) != gs.get(field): fail("CANONICAL_SNAPSHOT_MISMATCH")
        if not SHA256.fullmatch(str(ws.get("projectionDigest", ""))): fail("CANONICAL_SNAPSHOT_MISMATCH")
        if web.get("camera") != godot.get("camera"): fail("CAMERA_PROJECTION_MISMATCH")
        for camera in (web.get("camera"), godot.get("camera")):
            if not isinstance(camera, dict) or set(camera) != {"positionMm", "targetMm", "fovMilliDeg"}:
                fail("CAMERA_READBACK_MISSING")
                continue
            if any(not isinstance(camera[k], list) or len(camera[k]) != 3 or any(type(n) is not int or abs(n) > 10**10 for n in camera[k]) for k in ("positionMm", "targetMm")) or type(camera["fovMilliDeg"]) is not int or not 10000 <= camera["fovMilliDeg"] <= 150000: fail("CAMERA_READBACK_MISSING")
        chunks = web.get("chunks")
        if not isinstance(chunks, dict) or chunks.get("status") != "APPLIED" or not isinstance(chunks.get("count"), int) or chunks["count"] < 1: fail("BROWSER_TERRAIN_MISSING")
        native_chunks = godot.get("chunks")
        if not isinstance(native_chunks, list) or not native_chunks: fail("GODOT_TERRAIN_MISSING")
        if godot.get("environmentPresent") is not True: fail("GODOT_ENVIRONMENT_MISSING")
        actors = godot.get("actors")
        if not isinstance(actors, list) or not actors or any(not isinstance(a, dict) or not a.get("assetId") for a in actors): fail("GODOT_ACTOR_MODELS_MISSING")
        if godot.get("worldVisible") is not True or godot.get("stale") is not False: fail("GODOT_WORLD_NOT_VISIBLE_OR_STALE")
        if web.get("worldVisible") is not True: fail("BROWSER_WORLD_OBSCURED_BY_LOADING_SCREEN")
        for value, keys in ((web.get("assets"), ("loading", "failed")), (godot.get("actorCache"), ("pending",)), (godot.get("worldAssets"), ("pending",))):
            if not isinstance(value, dict) or any(type(value.get(k)) is not int or value[k] != 0 for k in keys): fail("ASSETS_LOADING_OR_FAILED")
        for value in (web.get("assets"), godot.get("worldAssets")):
            if not isinstance(value, dict) or type(value.get("rendered")) is not int or value["rendered"] < 1: fail("WORLD_ASSET_MODELS_MISSING")
        editor = index.get("editor", {})
        if not isinstance(editor, dict) or editor.get("editor") is not True or editor.get("nonce") != nonce or editor.get("scene") != "res://addons/aurion_bridge/authoring_entry.tscn" or type(editor.get("pid")) is not int or type(godot.get("pid")) is not int or editor.get("pid") == godot.get("pid") or index.get("editorGameParentPid") != editor.get("pid"): fail("EDITOR_GAME_LAUNCH_UNVERIFIED")
        receipt, oracle = index.get("receipt", {}), index.get("oracle", {})
        if not isinstance(receipt, dict): receipt = {}
        if not isinstance(oracle, dict): oracle = {}
        if not isinstance(receipt.get("worldId"), str) or receipt.get("worldId") != web.get("worldId") or not isinstance(native_chunks, list) or any(not isinstance(c, dict) or c.get("worldId") != receipt.get("worldId") for c in native_chunks): fail("CANONICAL_WORLD_MISMATCH")
        if not all(SHA256.fullmatch(str(receipt.get(k, ""))) for k in ("receiptHash", "postStateHash")): fail("CANONICAL_RECEIPT_UNVERIFIED")
        if not receipt or not oracle or receipt.get("tick") != tick or receipt.get("zoneId") != ws.get("zoneId") or receipt.get("sourceRevision") != revision or oracle.get("sourceRevision") != revision or oracle.get("zoneId") != ws.get("zoneId") or oracle.get("status") != "MATCH" or oracle.get("requestedRange") != {"fromTick":tick,"toTick":tick} or oracle.get("terminalReceiptHash") != receipt.get("receiptHash") or oracle.get("finalStateHash") != receipt.get("postStateHash") or not receipt.get("receiptHash") or not receipt.get("postStateHash"): fail("CANONICAL_RECEIPT_UNVERIFIED")
    visual = {}
    if len(frames) == 2:
        if frames["aurion"].size != frames["godot"].size: fail("RENDER_VIEWPORT_SIZE_MISMATCH")
        else:
            visual = pixel_difference(frames["aurion"], frames["godot"])
            difference = ImageChops.difference(frames["aurion"], frames["godot"])
            ImageOps.colorize(ImageEnhance.Contrast(ImageOps.grayscale(difference)).enhance(2), "#07131c", "#ff5348").save(directory / "difference.png")
            if visual["exceedsThreshold"]: fail("REAL_VIEW_VISUAL_MISMATCH")
    report = {"schema":"aurion.startup-view.report.v1", "status":"FAIL" if issues else "PASS", "issues":issues,
              "diagnosis":[HINTS.get(code, code + ": Capture- und Laufzeit-Readback prüfen.") for code in issues],
              "visual":visual, "sourceRevision":revision, "runtimeImageDigest":image, "tick":tick,
              "observations":observations, "evidenceScope":"First editor-launched authenticated game viewport; not the legacy primitive bridge preview."}
    (directory / "parity.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    color, label = ("#a71d2a", "ROT") if issues else ("#18794e", "GRÜN")
    percent = str(visual["differencePercent"]) + "%" if "differencePercent" in visual else "nicht messbar"
    rows = [f"# Aurion / Godot Erststart: {label}", "", f"Bildabweichung: **{percent}**. Rot bei **mehr als 75%**; Pixeltoleranz 24/255 je Farbkanal. Keine Skalierung, Maskierung oder Auswahl eines späteren Bildes.", "", f"Revision: `{revision}` · Tick: `{tick}`", "", "## Ursachen", ""]
    rows += [f"- **{code}**: {hint}" for code, hint in zip(issues, report["diagnosis"])] or ["- Erststart-Aufnahmen, Live-Readback und Pixelvergleich bestanden."]
    rows += ["", "Die Artefakte enthalten beide Originalbilder, difference.png, den vollständigen JSON-Readback und report.html."]
    (directory / "report.md").write_text("\n".join(rows) + "\n")
    pictures = "".join(f'<figure><figcaption>{name}</figcaption><img src="{name}.png"></figure>' for name in ("aurion", "godot", "difference") if (directory / (name + ".png")).exists())
    (directory / "report.html").write_text('<!doctype html><meta charset="utf-8"><title>Aurion / Godot Erststart</title><style>body{font:16px system-ui;background:#101923;color:#eee;margin:32px}h1{color:' + color + '}figure{margin:24px 0}img{max-width:100%;height:auto}pre{white-space:pre-wrap}</style>' + f'<h1>{label} · Bildabweichung {html.escape(percent)}</h1><p>Rot bei mehr als 75%. Originalpixel, Pixeltoleranz 24/255. Fehlende oder nicht verifizierte Erststart-Aufnahmen bleiben rot.</p><pre>' + html.escape("\n".join(rows)) + '</pre>' + pictures + '<details><summary>Kamera, Assets und Terrain</summary><pre>' + html.escape(json.dumps(observations, ensure_ascii=False, indent=2)) + '</pre></details>')
    return report


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--directory", type=Path, required=True)
    args = parser.parse_args()
    args.directory.mkdir(parents=True, exist_ok=True)
    result = build_report(args.directory)
    print(json.dumps({k:result[k] for k in ("status", "issues", "visual")}, ensure_ascii=False))
    raise SystemExit(0 if result["status"] == "PASS" else 1)
