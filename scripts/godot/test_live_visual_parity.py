"""Synthetic comparator fixtures. No live runtime or server claim."""
import datetime as dt
import hashlib
import json
from pathlib import Path
import tempfile
import unittest
from types import SimpleNamespace
from PIL import Image
from live_visual_parity import audit, KINDS, SCHEMA

class VisualParityTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root=Path(self.temp.name)
        self.manifests={}
        stamp=dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds").replace("+00:00","Z")
        for role in ("server","godot"):
            image=Image.new("RGB",(80,60))
            for y in range(60):
                for x in range(80):
                    image.putpixel((x,y),(40+x,70+y,120+x//2))
            path=self.root/(role+".png")
            image.save(path)
            p={"schema":SCHEMA,"captureKind":KINDS[role],"authenticated":True,
               "liveProcess":True,"uiState":"gameplay","capturedAt":stamp,
               "worldId":"test-world","zoneId":"observatory_threshold","tick":20,
               "sourceRevision":"a"*40,"runtimeImageDigest":"sha256:"+"b"*64,
               "receiptHash":"sha256:"+"c"*64,"projectionHash":"sha256:"+"d"*64,
               "streamInstance":"unit-fixture","camera":{"position":[0,2,5],"target":[0,1,0],"fov":70},
               "scene":{"entityIds":["player:1","mob_1"],"terrainChunks":1,
                        "skyVisible":True,"horizonVisible":True,"assetDigest":"sha256:"+"e"*64},
               "screenshotSha256":hashlib.sha256(path.read_bytes()).hexdigest()}
            self.manifests[role]=p
            self.save(role)
    def save(self,role):
        (self.root/(role+".json")).write_text(json.dumps(self.manifests[role]))
    def run_audit(self):
        return audit(SimpleNamespace(output=str(self.root/"out"),
            server_image=str(self.root/"server.png"),server_proof=str(self.root/"server.json"),
            godot_image=str(self.root/"godot.png"),godot_proof=str(self.root/"godot.json"),
            capture_desktop=False,bridge_port=0))
    def report(self):
        return json.loads((self.root/"out"/"report.json").read_text())
    def test_matching_synthetic_images_pass_only_unit_scope(self):
        self.assertEqual(self.run_audit(),0)
        self.assertEqual(self.report()["status"],"LIVE_VISUAL_PARITY_VERIFIED")
    def test_missing_server_reference_fails(self):
        (self.root/"server.png").unlink()
        self.assertEqual(self.run_audit(),1)
        self.assertIn("SERVER_CAPTURE_OR_PROOF_MISSING",self.report()["failures"])
    def test_black_godot_screen_fails(self):
        path=self.root/"godot.png"
        Image.new("RGB",(80,60),(0,0,0)).save(path)
        self.manifests["godot"]["screenshotSha256"]=hashlib.sha256(path.read_bytes()).hexdigest()
        self.save("godot")
        self.assertEqual(self.run_audit(),1)
        self.assertIn("GODOT_BLACK_OR_LOGIN",self.report()["failures"])
    def test_wrong_world_tick_and_camera_fail(self):
        p=self.manifests["godot"]
        p.update(worldId="different",tick=21,camera={"position":[0,3,5],"target":[0,1,0],"fov":70})
        self.save("godot")
        self.assertEqual(self.run_audit(),1)
        errors=self.report()["failures"]
        for code in ("IDENTITY_WORLDID_MISMATCH","IDENTITY_TICK_MISMATCH","IDENTITY_CAMERA_MISMATCH"):
            self.assertIn(code,errors)
    def test_missing_sky_terrain_horizon_fail(self):
        self.manifests["godot"]["scene"].update(terrainChunks=0,skyVisible=False,horizonVisible=False)
        self.save("godot")
        self.assertEqual(self.run_audit(),1)
        for code in ("GODOT_TERRAIN_MISSING","GODOT_SKY_MISSING","GODOT_HORIZON_MISSING"):
            self.assertIn(code,self.report()["failures"])
    def test_desktop_does_not_masquerade_as_gameplay(self):
        self.manifests["godot"]["captureKind"]="desktop-only"
        self.save("godot")
        self.assertEqual(self.run_audit(),1)
        self.assertIn("GODOT_NOT_LIVE_GAMEPLAY_VIEWPORT",self.report()["failures"])
    def test_old_capture_fails(self):
        self.manifests["godot"]["capturedAt"]="2024-01-01T00:00:00Z"
        self.save("godot")
        self.assertEqual(self.run_audit(),1)
        self.assertIn("GODOT_CAPTURE_STALE",self.report()["failures"])

if __name__=="__main__":
    unittest.main()
