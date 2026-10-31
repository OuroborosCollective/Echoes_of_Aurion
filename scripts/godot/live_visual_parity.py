#!/usr/bin/env python3
"""Fail-closed read-only comparison. Never synthesize a server-world image."""
import argparse
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import socket
import sys
from PIL import Image, ImageChops, ImageGrab, ImageStat

SCHEMA = "aurion.live-visual-parity.v1"
KINDS = {"server":"aurion-live-gameplay-viewport","godot":"godot-live-gameplay-viewport"}
IDENTITY = ("worldId","zoneId","tick","sourceRevision","runtimeImageDigest","receiptHash","projectionHash","streamInstance","camera")

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def stats(im):
    sample=im.convert("RGB").resize((min(im.width,640),min(im.height,400)))
    pixels=list(sample.getdata())
    return {"dimensions":list(im.size),
        "meanRGB":[round(n,2) for n in ImageStat.Stat(sample).mean],
        "darkFraction":round(sum(max(p)<36 for p in pixels)/len(pixels),4),
        "greenFraction":round(sum(p[1]>p[0]*1.4 and p[1]>p[2]*1.2 and p[1]>45 for p in pixels)/len(pixels),4),
        "paletteBins":len({tuple(v//16 for v in p) for p in pixels})}

def utc(value):
    if not isinstance(value,str) or not value.endswith("Z"):
        raise ValueError("UTC ISO timestamp required")
    return dt.datetime.fromisoformat(value.replace("Z","+00:00"))

def validate(role,image,manifest,errors):
    label=role.upper()
    if not image.is_file() or not manifest.is_file():
        errors.append(label+"_CAPTURE_OR_PROOF_MISSING")
        return None
    try:
        if image.stat().st_size>25000000 or manifest.stat().st_size>100000:
            raise ValueError("oversize")
        p=json.loads(manifest.read_text(encoding="utf-8"))
        if not isinstance(p,dict) or p.get("schema")!=SCHEMA or p.get("captureKind")!=KINDS[role]:
            errors.append(label+"_NOT_LIVE_GAMEPLAY_VIEWPORT")
            return None
        if p.get("authenticated") is not True or p.get("liveProcess") is not True or p.get("uiState")!="gameplay":
            errors.append(label+"_GAMEPLAY_UNVERIFIED")
        seconds=(dt.datetime.now(dt.timezone.utc)-utc(p.get("capturedAt"))).total_seconds()
        if seconds>120 or seconds < -10:
            errors.append(label+"_CAPTURE_STALE")
        if any(k not in p for k in IDENTITY):
            errors.append(label+"_IDENTITY_INCOMPLETE")
        if type(p.get("tick")) is not int or p["tick"]<1:
            errors.append(label+"_TICK_INVALID")
        revision=p.get("sourceRevision")
        if not isinstance(revision,str) or len(revision)!=40 or any(c not in "0123456789abcdef" for c in revision):
            errors.append(label+"_SOURCE_REVISION_INVALID")
        for key in ("runtimeImageDigest","receiptHash","projectionHash"):
            h=p.get(key)
            if not isinstance(h,str) or len(h)!=71 or not h.startswith("sha256:") or any(c not in "0123456789abcdef" for c in h[7:]):
                errors.append(label+"_"+key.upper()+"_INVALID")
        if p.get("screenshotSha256")!=sha(image):
            errors.append(label+"_SCREENSHOT_HASH_MISMATCH")
        cam=p.get("camera")
        if not isinstance(cam,dict) or not all(k in cam for k in ("position","target","fov")):
            errors.append(label+"_CAMERA_UNVERIFIED")
        scene=p.get("scene")
        if not isinstance(scene,dict) or not isinstance(scene.get("entityIds"),list) or type(scene.get("terrainChunks")) is not int:
            errors.append(label+"_SCENE_CENSUS_MISSING")
        else:
            if scene["terrainChunks"]<1: errors.append(label+"_TERRAIN_MISSING")
            if scene.get("skyVisible") is not True: errors.append(label+"_SKY_MISSING")
            if scene.get("horizonVisible") is not True: errors.append(label+"_HORIZON_MISSING")
        return p
    except (OSError,ValueError,TypeError,KeyError):
        errors.append(label+"_PROOF_INVALID")
        return None

def audit(a):
    out=Path(a.output)
    out.mkdir(parents=True,exist_ok=True)
    errors=[]
    report={"schema":SCHEMA,"workflowSha":os.environ.get("GITHUB_SHA","UNVERIFIED"),
            "environment":"owner-vps","mutationPerformed":False}
    if a.capture_desktop:
        try:
            im=ImageGrab.grab()
            dest=out/"godot-workspace-desktop.png"
            im.save(dest)
            report["actualGodotDesktop"]={"sha256":sha(dest),"metrics":stats(im),
              "captureKind":"diagnostic-desktop-only-not-live-viewport"}
            if report["actualGodotDesktop"]["metrics"]["darkFraction"]>.82:
                errors.append("GODOT_DESKTOP_DARK_OR_LOGIN")
        except Exception as exc:
            errors.append("GODOT_DESKTOP_CAPTURE_FAILED_"+type(exc).__name__)
    if a.bridge_port:
        try:
            with socket.create_connection(("127.0.0.1",a.bridge_port),timeout=2):
                report["bridgeTcp"]="reachable-not-authenticated"
        except OSError:
            report["bridgeTcp"]="no-listener"
            errors.append("GODOT_EDITOR_BRIDGE_NOT_LISTENING")
    s,g=Path(a.server_image),Path(a.godot_image)
    server=validate("server",s,Path(a.server_proof),errors)
    godot=validate("godot",g,Path(a.godot_proof),errors)
    if server is not None and godot is not None:
        for key in IDENTITY:
            if server.get(key)!=godot.get(key):
                errors.append("IDENTITY_"+key.upper()+"_MISMATCH")
        if server.get("scene")!=godot.get("scene"):
            errors.append("SCENE_CENSUS_MISMATCH")
        try:
            if abs((utc(server["capturedAt"])-utc(godot["capturedAt"])).total_seconds())>2:
                errors.append("CAPTURE_TIME_SKEW")
        except (KeyError,TypeError,ValueError):
            errors.append("CAPTURE_TIME_UNVERIFIED")
    comparison={}
    if s.is_file() and g.is_file():
        try:
            with Image.open(s) as sa, Image.open(g) as ga:
                if sa.width*sa.height>3840*2160 or ga.width*ga.height>3840*2160:
                    errors.append("IMAGE_TOO_LARGE")
                else:
                    p,q=sa.convert("RGB"),ga.convert("RGB")
                    comparison={"aurion":stats(p),"godot":stats(q)}
                    if comparison["godot"]["darkFraction"]>.82: errors.append("GODOT_BLACK_OR_LOGIN")
                    if comparison["godot"]["greenFraction"]>.65: errors.append("GODOT_GREEN_PLACEHOLDER")
                    if p.size!=q.size:
                        errors.append("VIEWPORT_DIMENSIONS_MISMATCH")
                    else:
                        diff=ImageChops.difference(p,q)
                        diff.save(out/"difference.png")
                        mean=sum(ImageStat.Stat(diff).mean)/(3*255)
                        hist=diff.convert("L").histogram()
                        comparison["similarity"]=round(1-mean,5)
                        comparison["changedFraction"]=round(sum(hist[24:])/sum(hist),5)
                        if comparison["similarity"]<.92 or comparison["changedFraction"]>.22:
                            errors.append("VISIBLE_SCENE_MISMATCH")
        except (OSError,ValueError):
            errors.append("IMAGE_DECODING_FAILED")
    report["imageComparison"]=comparison
    report["failures"]=list(dict.fromkeys(errors))
    helptext={
      "GODOT_EDITOR_BRIDGE_NOT_LISTENING":"No live bridge listener on 127.0.0.1:8765. Inspect release opt-in, feed and bridge systemd unit.",
      "GODOT_DESKTOP_DARK_OR_LOGIN":"Actual Godot desktop shows mostly dark pixels or authentication, not a confirmed game scene.",
      "GODOT_BLACK_OR_LOGIN":"Godot viewport is black or shows login instead of actual gameplay.",
      "GODOT_GREEN_PLACEHOLDER":"Godot shows unassigned green plane. Check authenticated chunk API and terrain mesh validation.",
      "GODOT_TERRAIN_MISSING":"Godot has no server-confirmed terrain chunks.",
      "GODOT_SKY_MISSING":"Godot has no verified Sky/WorldEnvironment.",
      "GODOT_HORIZON_MISSING":"Godot has no verified horizon.",
      "VISIBLE_SCENE_MISMATCH":"Inspect source viewports and difference.png for missing sky, terrain, models, camera, lighting.",
      "SERVER_CAPTURE_OR_PROOF_MISSING":"Independent authenticated Aurion gameplay screenshot and proof absent. A fixture is not a reference.",
      "GODOT_CAPTURE_OR_PROOF_MISSING":"Authenticated Godot live-gameplay viewport and corresponding snapshot proof absent."}
    report["diagnosis"]=list(dict.fromkeys(helptext.get(e,"Compare world/tick/receipt, asset digest, camera and screenshot provenance.") for e in report["failures"]))
    report["status"]="FAIL_CLOSED" if errors else "LIVE_VISUAL_PARITY_VERIFIED"
    (out/"report.json").write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    (out/"report.md").write_text("# Aurion to Godot live visual parity\n\n"+report["status"]+"\n\n"+
       "## Diagnostics\n"+"\n".join("- "+s for s in report["diagnosis"])+
       "\n\n## Failures\n"+"\n".join("- "+s for s in report["failures"])+
       "\n\nOriginal desktop capture is diagnostic only, never gameplay evidence.\n",encoding="utf-8")
    print("AURION_LIVE_VISUAL_PARITY="+report["status"])
    print("AURION_LIVE_VISUAL_ERRORS="+",".join(report["failures"]))
    return 1 if errors else 0

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--server-image",default="/srv/serverin/evidence/aurion-visual/source/server.png")
    ap.add_argument("--server-proof",default="/srv/serverin/evidence/aurion-visual/source/server.json")
    ap.add_argument("--godot-image",default="/srv/serverin/evidence/aurion-visual/source/godot.png")
    ap.add_argument("--godot-proof",default="/srv/serverin/evidence/aurion-visual/source/godot.json")
    ap.add_argument("--output",required=True)
    ap.add_argument("--capture-desktop",action="store_true")
    ap.add_argument("--bridge-port",type=int,default=8765)
    return audit(ap.parse_args())

if __name__=="__main__":
    sys.exit(main())
