import json
import os
from pathlib import Path
import requests

ledger = json.loads(Path("guardian/tripo_character_job_ledger.json").read_text(encoding="utf-8"))
entry = ledger["characters"]["aurion-veilguard"]["generation"]
if entry["status"] != "approved_to_submit" or entry["taskId"] is not None:
    raise SystemExit("Safety gate closed: the Veilguard generation was already submitted or is not approved.")

prompt = "Full-body single humanoid game character in a neutral upright A-pose, front-facing, compact human Aurion veilguard. Semi-stylized premium browser-game PBR design: oxidized bronze defensive plate mantle, midnight teal fabric joints, restrained amber energy insets, asymmetric left shoulder guard, segmented waist armor. No weapon, no cape, no floating parts, no backdrop, no scene, no base. One complete centered character only. Proportions suitable for biped rigging, separate readable arms and legs, watertight geometry, tight topology with no intersecting geometry, uniform vertex density, non-overlapping UV layout, optimized real-time topology, 5k triangles maximum, 1–3 PBR materials, 1024 texture atlas maximum. Do not include text, logos, other characters, or dramatic pose."
response = requests.post(
    "https://openapi.tripo3d.ai/v3/generation/text-to-model",
    headers={"Authorization": f"Bearer {os.environ['TRIPO_API_KEY']}", "Content-Type": "application/json"},
    json={"prompt": prompt, "model": "P1-20260311", "texture": True, "pbr": True, "face_limit": 5000},
    timeout=45,
)
print(json.dumps({"statusCode": response.status_code, "body": response.json()}, ensure_ascii=False))
