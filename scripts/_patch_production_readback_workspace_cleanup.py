from pathlib import Path

workflow = Path(".github/workflows/aurion-production-schema-readback.yml")
text = workflow.read_text(encoding="utf-8")
old = '''          mkdir unpacked
          tar -xzf "aurion-production-reconcile-${EXPECTED_SHA}.tgz" -C unpacked
'''
new = '''          rm -rf unpacked
          mkdir unpacked
          tar -xzf "aurion-production-reconcile-${EXPECTED_SHA}.tgz" -C unpacked
'''
if text.count(old) != 1:
    raise SystemExit(f"expected exactly one unpacked workspace block, found {text.count(old)}")
workflow.write_text(text.replace(old, new, 1), encoding="utf-8")
Path("scripts/_patch_production_readback_workspace_cleanup.py").unlink(missing_ok=True)
Path(".github/workflows/_production-readback-workspace-cleanup.yml").unlink(missing_ok=True)
