#!/usr/bin/env python3
"""Revision-bound public Aurion health probe; read-only and credential-free."""
from __future__ import annotations
import argparse
import hashlib
import json
import time
import urllib.error
import urllib.request

parser = argparse.ArgumentParser()
parser.add_argument("--url", required=True)
parser.add_argument("--expected-revision", required=True)
parser.add_argument("--timeout", type=float, default=10.0)
args = parser.parse_args()

if not (len(args.expected_revision) == 40 and all(c in "0123456789abcdef" for c in args.expected_revision)):
    raise SystemExit("expected revision must be 40 lowercase hex characters")
if not args.url.startswith("https://"):
    raise SystemExit("health URL must use https://")

started = time.monotonic()
status = None
content_type = None
body = b""
error = None
try:
    req = urllib.request.Request(args.url, headers={"Accept": "application/json", "User-Agent": "aurion-migration-ops/2"})
    with urllib.request.urlopen(req, timeout=args.timeout) as response:
        status = response.status
        content_type = response.headers.get("content-type")
        body = response.read(65536)
except (urllib.error.URLError, TimeoutError, OSError) as exc:
    error = type(exc).__name__

elapsed_ms = int((time.monotonic() - started) * 1000)
payload = None
if body:
    try:
        payload = json.loads(body)
    except json.JSONDecodeError:
        payload = None
observed_revision = payload.get("revision") if isinstance(payload, dict) else None
verdict = "IN_SYNC" if status == 200 and observed_revision == args.expected_revision else ("OUT_OF_SYNC" if observed_revision and observed_revision != args.expected_revision else "UNVERIFIED")
receipt = {
    "recordType": "aurion_public_runtime_health_probe",
    "schemaVersion": 1,
    "status": verdict,
    "httpStatus": status,
    "contentType": content_type,
    "elapsedMs": elapsed_ms,
    "expectedRevision": args.expected_revision,
    "observedRevision": observed_revision,
    "bodySha256": hashlib.sha256(body).hexdigest(),
    "bodyBytes": len(body),
    "errorClass": error,
    "credentialUsed": False,
    "mutationPerformed": False,
}
print(json.dumps(receipt, indent=2))
raise SystemExit(0 if verdict == "IN_SYNC" else 1)
