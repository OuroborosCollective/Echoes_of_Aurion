import json
import os
from pathlib import Path
import requests

ledger = json.loads(Path("guardian/tripo_character_job_ledger.json").read_text(encoding="utf-8"))
character = ledger["characters"]["aurion-veilguard"]
if character["generation"]["status"] != "success" or character["rigCheck"]["status"] != "approved_to_submit":
    raise SystemExit("Safety gate closed: generation must be successful and rig-check must be explicitly approved.")
response = requests.post(
    "https://openapi.tripo3d.ai/v3/animations/rig-check",
    headers={"Authorization": f"Bearer {os.environ['TRIPO_API_KEY']}", "Content-Type": "application/json"},
    json={"input": character["generation"]["taskId"]},
    timeout=30,
)
print(json.dumps({"statusCode": response.status_code, "body": response.json()}, ensure_ascii=False))
