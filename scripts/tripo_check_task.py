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
print(json.dumps({"statusCode": response.status_code, "body": response.json()}, ensure_ascii=False))
