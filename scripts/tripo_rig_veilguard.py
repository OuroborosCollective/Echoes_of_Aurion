import json
import os
from pathlib import Path
import requests

ledger = json.loads(Path("guardian/tripo_character_job_ledger.json").read_text(encoding="utf-8"))
character = ledger["characters"]["aurion-veilguard"]
if character["rigCheck"].get("riggable") is not True or character["rig"]["status"] != "approved_to_submit":
    raise SystemExit("Safety gate closed: a successful biped rig-check is required before rig submission.")
response = requests.post(
    "https://openapi.tripo3d.ai/v3/animations/rig",
    headers={"Authorization": f"Bearer {os.environ['TRIPO_API_KEY']}", "Content-Type": "application/json"},
    json={"input": character["generation"]["taskId"], "model": "v1.0-20240301", "rig_type": character["rigCheck"]["rigType"], "spec": "tripo", "out_format": "glb"},
    timeout=30,
)
print(json.dumps({"statusCode": response.status_code, "body": response.json()}, ensure_ascii=False))
