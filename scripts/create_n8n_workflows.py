#!/usr/bin/env python3
"""Create n8n workflows from an Aurion planner response.

Required environment:
  N8N_API_URL  e.g. https://n8n.example.com/api/v1
  N8N_API_KEY  n8n API key, never commit it

The script creates workflows unpublished by default. Pass --activate only
when the generated workflows have been reviewed.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

DEFAULT_API_URL = "https://n8n-with-ai-assistant-r7uy.srv1491137.hstgr.cloud/api/v1"


def args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Aurion-Vorschläge als n8n-Workflows anlegen")
    p.add_argument("response", help="JSON-Datei mit der Aurion-Webhook-Antwort")
    p.add_argument("--api-url", default=os.environ.get("N8N_API_URL", DEFAULT_API_URL))
    p.add_argument("--activate", action="store_true", help="Workflows nach dem Anlegen veröffentlichen")
    p.add_argument("--dry-run", action="store_true", help="Nur Workflow-JSONs erzeugen, keine API-Aufrufe")
    p.add_argument("--output-dir", default="generated-n8n-workflows")
    return p.parse_args()


def request_json(method: str, url: str, api_key: str, body: dict | None = None) -> tuple[int, object]:
    data = json.dumps(body).encode() if body is not None else None
    req = Request(url, data=data, method=method, headers={
        "Accept": "application/json",
        "Content-Type": "application/json",
        "X-N8N-API-KEY": api_key,
    })
    try:
        with urlopen(req, timeout=30) as res:
            raw = res.read().decode("utf-8")
            return res.status, json.loads(raw) if raw else {}
    except HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"n8n API HTTP {exc.code}: {detail[:600]}") from exc
    except URLError as exc:
        raise RuntimeError(f"n8n API nicht erreichbar: {exc.reason}") from exc


def node_id(prefix: str, index: int) -> str:
    return f"{prefix}-{index:02d}"


def workflow_from_proposal(proposal: dict, index: int, repo: str) -> dict:
    level = proposal.get("level", f"Stufe {index}")
    title = proposal.get("title", f"Aurion Automation {index}")
    safe_name = f"Aurion | {index} | {title}"[:120]
    trigger = node_id("trigger", index)
    prepare = node_id("prepare", index)
    respond = node_id("respond", index)
    return {
        "name": safe_name,
        "nodes": [
            {
                "parameters": {"httpMethod": "POST", "path": f"aurion/generated/{index}", "responseMode": "responseNode", "options": {}},
                "id": trigger,
                "name": "Aurion generated webhook",
                "type": "n8n-nodes-base.webhook",
                "typeVersion": 2,
                "position": [0, 0],
                "webhookId": f"aurion-generated-{index}",
            },
            {
                "parameters": {"jsCode": "const input = $json.body ?? $json;\nreturn [{ json: { ok: true, generatedWorkflow: """ + json.dumps(safe_name) + ", level: """ + json.dumps(level) + ", repo: """ + json.dumps(repo) + ", received: input, automationPlan: """ + json.dumps({"objective": proposal.get("objective", ""), "nodes": proposal.get("nodes", []), "inputs": proposal.get("inputs", []), "outputs": proposal.get("outputs", []), "writeActions": proposal.get("writeActions", []), "approvalRequired": proposal.get("approvalRequired", True)}) + " } }];"},
                "id": prepare,
                "name": "Apply Aurion automation plan",
                "type": "n8n-nodes-base.code",
                "typeVersion": 2,
                "position": [260, 0],
            },
            {
                "parameters": {"respondWith": "json", "responseBody": "={{ $json }}", "options": {}},
                "id": respond,
                "name": "Return generated workflow result",
                "type": "n8n-nodes-base.respondToWebhook",
                "typeVersion": 1.1,
                "position": [520, 0],
            },
        ],
        "connections": {
            "Aurion generated webhook": {"main": [[{"node": "Apply Aurion automation plan", "type": "main", "index": 0}]]},
            "Apply Aurion automation plan": {"main": [[{"node": "Return generated workflow result", "type": "main", "index": 0}]]},
        },
        "settings": {"executionOrder": "v1"},
    }


def main() -> int:
    cfg = args()
    try:
        response = json.loads(Path(cfg.response).read_text(encoding="utf-8"))
        proposals = response.get("proposals")
        if not isinstance(proposals, list) or len(proposals) != 3:
            raise ValueError("Die Antwort muss genau drei proposals enthalten.")
        repo = response.get("repo", "OuroborosCollective/Echoes_of_Aurion")
        workflows = [workflow_from_proposal(p, i, repo) for i, p in enumerate(proposals, 1)]
        output = Path(cfg.output_dir)
        output.mkdir(parents=True, exist_ok=True)
        for i, workflow in enumerate(workflows, 1):
            path = output / f"aurion-generated-{i}.json"
            path.write_text(json.dumps(workflow, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            print(f"Erzeugt: {path}")
        if cfg.dry_run:
            print("Dry-Run: Keine n8n-API-Aufrufe ausgeführt.")
            return 0
        api_key = os.environ.get("N8N_API_KEY")
        if not api_key:
            raise ValueError("N8N_API_KEY fehlt. Kein Workflow wurde an n8n gesendet.")
        base = cfg.api_url.rstrip("/")
        for workflow in workflows:
            status, created = request_json("POST", f"{base}/workflows", api_key, workflow)
            workflow_id = created.get("id") if isinstance(created, dict) else None
            print(f"Angelegt: {workflow['name']} (HTTP {status}, id={workflow_id})")
            if cfg.activate and workflow_id:
                pstatus, published = request_json("POST", f"{base}/workflows/{workflow_id}/publish", api_key, {})
                print(f"Veröffentlicht: {workflow['name']} (HTTP {pstatus})")
        return 0
    except (OSError, ValueError, RuntimeError, json.JSONDecodeError) as exc:
        print(f"FEHLER: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
