import json
import os
import sys
import requests

task_id = sys.argv[1]
response = requests.get(
    f"https://openapi.tripo3d.ai/v3/tasks/{task_id}",
    headers={"Authorization": f"Bearer {os.environ['TRIPO_API_KEY']}"},
    timeout=30,
)
payload = response.json()
if response.status_code != 200 or payload.get("data", {}).get("status") != "success":
    raise SystemExit("Task output is not ready.")
url = payload["data"].get("output", {}).get("model_url")
if not url:
    raise SystemExit("Task did not provide a model URL.")
print(url)
