from pathlib import Path

path = Path(".github/workflows/aurion-root-reconciliation-artifact-proof.yml")
text = path.read_text(encoding="utf-8")
old = "'docker.io/library/node@sha256:f5a0871ab03b035c58bdb3007c3d177b001c2145c18e81817b71624dcf7d8bff'"
new = "'sha256:f5a0871ab03b035c58bdb3007c3d177b001c2145c18e81817b71624dcf7d8bff'"
if text.count(old) != 1:
    raise SystemExit(f"expected exactly one stale fake image-inspect response, found {text.count(old)}")
path.write_text(text.replace(old, new, 1), encoding="utf-8")
