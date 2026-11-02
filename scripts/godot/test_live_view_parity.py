"""Unit-only negative controls; these generated PNGs are NEVER live-world evidence."""
from __future__ import annotations

import json
import sys
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).parent))
from live_view_parity import compare, digest

NOW = datetime(2026, 10, 31, 20, 30, tzinfo=timezone.utc)
REV = "a" * 40
IMAGE_ID = "sha256:" + "b" * 64
RECEIPT = "sha256:" + "c" * 64
STATE_HASH = "sha256:" + "d" * 64


def colored_world(image_path: Path, *, alternate: bool = False, dark_sky: bool = False) -> None:
    img = Image.new("RGB", (640, 360))
    draw = ImageDraw.Draw(img)
    for y in range(360):
        if y < 135:
            if dark_sky:
                color = (3, 4, 6)
            else:
                color = (12 + y // 5, 46 + y // 2, 96 + y // 3)
        else:
            color = (75 + (y - 135) // 9, 56 + (y - 135) // 14, 36 + (y - 135) // 18)
        draw.line((0, y, 639, y), fill=color)
    for i in range(7):
        x = i * 92 + 18
        if alternate:
            x = 639 - x
        draw.rectangle((x, 116, x + 12, 275), fill=(49, 34, 22))
        draw.ellipse((x - 23, 67, x + 34, 147), fill=(45 + i*10, 105+i*4, 55 + i*3))
    draw.polygon([(220, 310), (310, 200), (410, 210), (530, 360)], fill=(142, 127, 114))
    if alternate:
        draw.rectangle((65, 42, 575, 310), fill=(154, 30, 74))
        draw.ellipse((202, 86, 436, 315), fill=(245, 180, 22))
    img.save(image_path)


def manifest(source: str, image_hash: str) -> dict:
    return {
        "schema": "aurion.live-view.capture.v1", "source": source,
        "captureKind": "world-viewport", "captureMode": "authenticated-live", "observedScreen": "gameplay-world",
        "capturedAtUtc": NOW.isoformat().replace("+00:00", "Z"),
        "identity": {"worldId": "echoes-of-aurion-global", "zoneId": "observatory_threshold",
                     "sourceRevision": REV, "runtimeImageId": IMAGE_ID, "tick": 1025,
                     "receiptHash": RECEIPT, "stateHash": STATE_HASH,
                     "projectionHash": "sha256:" + "e" * 64, "streamInstance": "live-stream-1"},
        "camera": {"positionMm": [0, 2200, 6000], "targetMm": [0, 1400, 0], "fovMilliDeg": 60000, "viewportPx": [640, 360]},
        "projection": {"confirmedChunks": ["0:0:fnv1a-1234abcd"],
                       "visibleEntityIds": ["player:1", "mob_clockwork_2"],
                       "renderedAssetIds": ["terrain-grass", "castle-wall", "clockwork-stalker"],
                       "skyType": "procedural", "skyVisible": True, "horizonVisible": True},
        "imageSha256": image_hash,
    }


class ParityNegativeControls(unittest.TestCase):
    def setUp(self) -> None:
        self.dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.dir.cleanup)
        self.base = Path(self.dir.name)
        self.capture_dir = self.base / "captures"
        self.capture_dir.mkdir()
        self.output = self.base / "report"
        for key in ("aurion", "godot"):
            colored_world(self.capture_dir / (key + ".png"))
            src = "aurion-web" if key == "aurion" else "godot-live-editor"
            (self.capture_dir / (key + ".json")).write_text(json.dumps(manifest(src, digest(self.capture_dir / (key + ".png")))))

    def update_json(self, name: str, transform) -> None:
        path = self.capture_dir / (name + ".json")
        data = json.loads(path.read_text())
        transform(data)
        path.write_text(json.dumps(data))

    def check(self, *, bridge: bool = True, editor: bool = True):
        return compare(self.capture_dir, self.output, REV, IMAGE_ID, bridge, editor, now=NOW)

    def test_matching_verified_viewports_are_allowed_in_unit_test_only(self):
        result = self.check()
        self.assertEqual(result["status"], "PASS", result["issues"])
        self.assertEqual(result["liveAcceptance"], "UNVERIFIED")
        self.assertFalse(result["captureProvenanceVerified"])
        self.assertEqual(result["evidenceKind"], "diagnostic-sidecar-comparison")
        self.assertAlmostEqual(result["visual"]["tileSsim"], 1.0)
        self.assertTrue((self.output / "difference.png").is_file())

    def test_no_screenshots_fails_with_diagnostic_artifact(self):
        (self.capture_dir / "godot.png").unlink()
        result = self.check()
        self.assertEqual(result["status"], "FAIL")
        self.assertIn("GODOT_LIVE_EDITOR_SCREENSHOT_MISSING_OR_INVALID", result["issues"])
        self.assertTrue((self.output / "report.md").is_file())

    def test_bridge_down_cannot_go_green_even_with_identical_pixels(self):
        result = self.check(bridge=False)
        self.assertIn("GODOT_LIVE_BRIDGE_NOT_LISTENING", result["issues"])

    def test_unchanged_pixels_but_missing_confirmed_terrain_fails(self):
        self.update_json("godot", lambda m: m["projection"].update(confirmedChunks=[]))
        result = self.check()
        self.assertIn("GODOT_LIVE_EDITOR_NO_CONFIRMED_TERRAIN", result["issues"])
        self.assertIn("WORLD_CONFIRMEDCHUNKS_MISMATCH", result["issues"])

    def test_godot_login_dialog_is_not_accepted_as_live_world(self):
        self.update_json("godot", lambda m: m.update(captureKind="login-dialog", observedScreen="login"))
        result = self.check()
        self.assertEqual(result["status"], "FAIL")
        self.assertIn("GODOT_LIVE_EDITOR_LOGIN_SCREEN_NOT_WORLD", result["issues"])
        self.assertIn("Anmeldedialog", " ".join(result["diagnosis"]))

    def test_unhashable_sky_type_is_a_diagnostic_fail_not_a_crash(self):
        for malformed in ([], {}):
            with self.subTest(skyType=malformed):
                self.update_json("godot", lambda m, value=malformed: m["projection"].update(skyType=value))
                result = self.check()
                self.assertEqual(result["status"], "FAIL")
                self.assertIn("GODOT_LIVE_EDITOR_SKY_MISSING", result["issues"])
                self.assertTrue((self.output / "report.md").is_file())

    def test_non_object_projection_generates_failure_report_instead_of_crashing(self):
        for malformed in ([], ["untrusted"]):
            with self.subTest(projection=malformed):
                self.update_json("godot", lambda m, value=malformed: m.update(projection=value))
                result = self.check()
                self.assertEqual(result["status"], "FAIL")
                self.assertIn("GODOT_LIVE_EDITOR_NO_CONFIRMED_TERRAIN", result["issues"])
                self.assertTrue((self.output / "report.md").is_file())

    def test_mixed_type_projection_lists_generate_failure_report(self):
        self.update_json("godot", lambda m: m["projection"].update(confirmedChunks=["1:0:hash", 3]))
        result = self.check()
        self.assertEqual(result["status"], "FAIL")
        self.assertIn("GODOT_LIVE_EDITOR_NO_CONFIRMED_TERRAIN", result["issues"])
        self.assertTrue((self.output / "parity.json").is_file())

    def test_single_stalker_model_and_missing_sky_are_detected(self):
        self.update_json("godot", lambda m: m["projection"].update(renderedAssetIds=["clockwork-stalker"], skyType="none", skyVisible=False))
        result = self.check()
        self.assertIn("GODOT_LIVE_EDITOR_ONLY_PLACEHOLDERS_OR_SINGLE_MODEL", result["issues"])
        self.assertIn("GODOT_LIVE_EDITOR_SKY_MISSING", result["issues"])

    def test_camera_mismatch_invalidates_image_comparison(self):
        self.update_json("godot", lambda m: m["camera"].update(positionMm=[1000, 2200, 6000]))
        self.assertIn("CAMERA_PROJECTION_MISMATCH", self.check()["issues"])

    def test_different_live_stream_instance_fails_even_with_identical_images(self):
        self.update_json("godot", lambda m: m["identity"].update(streamInstance="other-stream"))
        result = self.check()
        self.assertEqual(result["status"], "FAIL")
        self.assertIn("CANONICAL_STREAMINSTANCE_MISMATCH", result["issues"])

    def test_missing_projection_hash_fails_closed(self):
        self.update_json("godot", lambda m: m["identity"].pop("projectionHash"))
        result = self.check()
        self.assertEqual(result["status"], "FAIL")
        self.assertIn("GODOT_LIVE_EDITOR_PROJECTION_UNVERIFIED", result["issues"])

    def test_horizon_missing_fails_even_with_equal_pixels(self):
        self.update_json("godot", lambda m: m["projection"].update(horizonVisible=False))
        result = self.check()
        self.assertEqual(result["status"], "FAIL")
        self.assertIn("GODOT_LIVE_EDITOR_HORIZON_MISSING", result["issues"])

    def test_different_sky_projection_fails_even_if_both_sky_types_are_valid(self):
        self.update_json("godot", lambda m: m["projection"].update(skyType="physical"))
        result = self.check()
        self.assertEqual(result["status"], "FAIL")
        self.assertIn("WORLD_SKYTYPE_MISMATCH", result["issues"])

    def test_not_same_causal_receipt_fails(self):
        self.update_json("godot", lambda m: m["identity"].update(receiptHash="sha256:" + "f" * 64))
        self.assertIn("CANONICAL_RECEIPTHASH_MISMATCH", self.check()["issues"])

    def test_different_live_server_revision_fails(self):
        self.update_json("godot", lambda m: m["identity"].update(sourceRevision="e" * 40))
        result = self.check()
        self.assertIn("GODOT_LIVE_EDITOR_ACTIVE_REVISION_MISMATCH", result["issues"])

    def test_stale_capture_is_not_live_evidence(self):
        old = (NOW - timedelta(minutes=5)).isoformat().replace("+00:00", "Z")
        self.update_json("godot", lambda m: m.update(capturedAtUtc=old))
        self.assertIn("GODOT_LIVE_EDITOR_CAPTURE_NOT_FRESH", self.check()["issues"])

    def test_altered_image_content_invalidates_hash(self):
        colored_world(self.capture_dir / "godot.png", alternate=True)
        result = self.check()
        self.assertIn("GODOT_LIVE_EDITOR_IMAGE_HASH_MISMATCH", result["issues"])
        self.assertIn("REAL_VIEW_VISUAL_MISMATCH", result["issues"])

    def test_two_flat_green_images_must_not_report_live_world(self):
        for key in ("aurion", "godot"):
            path = self.capture_dir / (key + ".png")
            Image.new("RGB", (640, 360), (35, 78, 41)).save(path)
            self.update_json(key, lambda m, p=path: m.update(imageSha256=digest(p)))
        result = self.check()
        self.assertEqual(result["status"], "FAIL")
        self.assertIn("GODOT_LIVE_EDITOR_NEARLY_BLANK_VIEW", result["issues"])

    def test_renderer_disagreement_generates_real_diff_artifact(self):
        path = self.capture_dir / "godot.png"
        colored_world(path, alternate=True)
        self.update_json("godot", lambda m: m.update(imageSha256=digest(path)))
        result = self.check()
        self.assertEqual(result["status"], "FAIL")
        self.assertIn("REAL_VIEW_VISUAL_MISMATCH", result["issues"])
        self.assertTrue((self.output / "difference.png").is_file())
        self.assertIn("Godot", (self.output / "report.md").read_text())


if __name__ == "__main__":
    unittest.main()
