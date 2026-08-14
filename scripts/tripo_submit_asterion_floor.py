import json
import os
from pathlib import Path

import requests

ledger_path = Path("guardian/tripo_environment_job_ledger.json")
ledger = json.loads(ledger_path.read_text(encoding="utf-8"))
entry = ledger["assets"]["env_asterion_floor_kit_a01"]["generation"]

if entry["status"] != "approved_to_submit" or entry["taskId"] is not None or entry["submissionCount"] != 0:
    raise SystemExit("Safety gate closed: the Asterion floor kit was already submitted or is not approved.")

prompt = "One isolated modular game-ready environment asset: a square 2 meter by 2 meter ancient celestial observatory floor tile for Echoes of Aurion. Semi-stylized premium browser-game PBR design, deep petrol obsidian stone slabs, thin aged bronze inlay around the border, subtle engraved circular cyan rune in the center, a few clean shallow cracks, low profile and perfectly flat walkable top surface. Strict grid-aligned square silhouette, no stairs, no walls, no arch, no base, no surrounding terrain, no scenery, no character, no text, no logos. One complete centered floor module only. Watertight geometry, clean non-overlapping UVs, PBR base color roughness metallic normal maps, real-time optimized topology, 3500 triangles maximum, 1 to 2 materials, 1024 texture atlas maximum."

response = requests.post(
    "https://openapi.tripo3d.ai/v3/generation/text-to-model",
    headers={"Authorization": f"Bearer {os.environ['TRIPO_API_KEY']}", "Content-Type": "application/json"},
    json={"prompt": prompt, "model": entry["model"], "texture": True, "pbr": True, "face_limit": entry["faceLimit"]},
    timeout=45,
)
response.raise_for_status()
print(json.dumps({"statusCode": response.status_code, "body": response.json()}, ensure_ascii=False))
