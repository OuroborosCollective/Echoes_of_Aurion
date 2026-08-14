import json
import os
from pathlib import Path
import requests

ledger = json.loads(Path("guardian/tripo_character_job_ledger.json").read_text(encoding="utf-8"))
character = ledger["characters"]["aurion-wayfinder"]
if character["rig"]["status"] != "success" or character["retarget"]["status"] != "approved_to_submit":
    raise SystemExit("Safety gate closed: a successful rig and explicit retarget approval are required.")
response = requests.post(
    "https://openapi.tripo3d.ai/v3/animations/retarget",
    headers={"Authorization": f"Bearer {os.environ['TRIPO_API_KEY']}", "Content-Type": "application/json"},
    json={"input": character["rig"]["taskId"], "animations": ["preset:idle", "preset:walk", "preset:run"]},
    timeout=30,
)
print(json.dumps({"statusCode": response.status_code, "body": response.json()}, ensure_ascii=False))
