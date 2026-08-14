import json
import os
from pathlib import Path

import requests

ledger_path = Path("guardian/tripo_environment_job_ledger.json")
ledger = json.loads(ledger_path.read_text(encoding="utf-8"))
entry = ledger["assets"]["env_asterion_archway_a01"]["generation"]

if entry["status"] != "approved_to_submit" or entry["taskId"] is not None or entry["submissionCount"] != 0:
    raise SystemExit("Safety gate closed: the Asterion archway was already submitted or is not approved.")

prompt = "One isolated game-ready environment prop: a compact freestanding ancient celestial observatory archway for Echoes of Aurion. Semi-stylized premium browser-game PBR design, weathered dark petrol stone, aged bronze capstones and thin inlaid cyan celestial rune lines, tall elegant pointed arch with a clear empty opening, no door, no floor tile, no stairs, no wall segment, no background, no terrain, no character, no text, no logo. One complete centered prop only. Clean readable silhouette for a dungeon landmark, watertight geometry, non-overlapping UVs, PBR base color roughness metallic normal maps, optimized real-time topology, 3200 triangles maximum, 1 to 2 materials, 1024 texture atlas maximum."

response = requests.post(
    "https://openapi.tripo3d.ai/v3/generation/text-to-model",
    headers={"Authorization": f"Bearer {os.environ['TRIPO_API_KEY']}", "Content-Type": "application/json"},
    json={"prompt": prompt, "model": entry["model"], "texture": True, "pbr": True, "face_limit": entry["faceLimit"]},
    timeout=45,
)
response.raise_for_status()
print(json.dumps({"statusCode": response.status_code, "body": response.json()}, ensure_ascii=False))
