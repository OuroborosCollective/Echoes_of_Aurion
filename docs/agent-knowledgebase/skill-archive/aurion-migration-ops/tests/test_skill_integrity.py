#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def copy_skill(tmp: str) -> Path:
    target = Path(tmp) / "skill"
    shutil.copytree(ROOT, target, ignore=shutil.ignore_patterns("__pycache__", "*.pyc", "*.pyo"))
    return target


class SkillIntegrityTests(unittest.TestCase):
    def test_diagnostic_resolver_mode_is_explicit_and_autonomous_but_nonmutating(self):
        proc = subprocess.run(
            [sys.executable, str(ROOT / "scripts" / "aurion_guard.py"), "resolve-plan", "--mode", "diagnostic"],
            cwd=ROOT,
            capture_output=True,
            text=True,
        )
        self.assertEqual(proc.returncode, 1)
        receipt = json.loads(proc.stdout)
        self.assertEqual(receipt["mode"], "diagnostic")
        self.assertEqual(receipt["metrics"]["verdict"], "UNVERIFIED")
        self.assertFalse(receipt["ownerPromptRequired"])
        self.assertFalse(receipt["invariants"]["diagnosticMayDispatchProductionMutation"])
        self.assertTrue(any(item["autoAllowed"] for item in receipt["actions"]))

    def test_manifest_verification_passes_without_generated_files(self):
        proc = subprocess.run(
            [sys.executable, str(ROOT / "scripts" / "verify_manifest.py")],
            cwd=ROOT,
            capture_output=True,
            text=True,
        )
        self.assertEqual(proc.returncode, 0, proc.stdout + proc.stderr)
        result = json.loads(proc.stdout)
        self.assertEqual(result["status"], "IN_SYNC")
        self.assertTrue(result["modesVerified"])

    def test_manifest_detects_mode_drift(self):
        with tempfile.TemporaryDirectory() as tmp:
            skill = copy_skill(tmp)
            target = skill / "scripts" / "aurion_guard.py"
            os.chmod(target, 0o600)
            proc = subprocess.run([sys.executable, str(skill / "scripts" / "verify_manifest.py")], cwd=skill, capture_output=True, text=True)
            self.assertEqual(proc.returncode, 1)
            result = json.loads(proc.stdout)
            self.assertTrue(any(error.startswith("mode:scripts/aurion_guard.py") for error in result["errors"]))

    def test_packager_refuses_payload_drift_before_writing_archive(self):
        with tempfile.TemporaryDirectory() as tmp:
            skill = copy_skill(tmp)
            (skill / "SKILL.md").write_text((skill / "SKILL.md").read_text() + "\nTAMPER\n", encoding="utf-8")
            output = Path(tmp) / "should-not-exist.skill"
            proc = subprocess.run([sys.executable, str(skill / "scripts" / "check_package.py"), "--output", str(output)], cwd=skill, capture_output=True, text=True)
            self.assertEqual(proc.returncode, 1)
            self.assertFalse(output.exists())
            result = json.loads(proc.stdout)
            self.assertEqual(result["status"], "OUT_OF_SYNC")

    def test_packaging_is_byte_reproducible_across_mtime_changes(self):
        with tempfile.TemporaryDirectory() as tmp:
            skill = copy_skill(tmp)
            out1 = Path(tmp) / "one.skill"
            out2 = Path(tmp) / "two.skill"
            first = subprocess.run([sys.executable, str(skill / "scripts" / "check_package.py"), "--output", str(out1)], cwd=skill, capture_output=True, text=True)
            self.assertEqual(first.returncode, 0, first.stdout + first.stderr)
            os.utime(skill / "SKILL.md", (1_900_000_000, 1_900_000_000))
            second = subprocess.run([sys.executable, str(skill / "scripts" / "check_package.py"), "--output", str(out2)], cwd=skill, capture_output=True, text=True)
            self.assertEqual(second.returncode, 0, second.stdout + second.stderr)
            self.assertEqual(hashlib.sha256(out1.read_bytes()).hexdigest(), hashlib.sha256(out2.read_bytes()).hexdigest())

    def test_manifest_update_never_self_asserts_green(self):
        with tempfile.TemporaryDirectory() as tmp:
            skill = copy_skill(tmp)
            (skill / "SKILL.md").write_text((skill / "SKILL.md").read_text() + "\nrevision\n", encoding="utf-8")
            update = subprocess.run([sys.executable, str(skill / "scripts" / "update_manifest.py")], cwd=skill, capture_output=True, text=True)
            self.assertEqual(update.returncode, 0)
            result = json.loads(update.stdout)
            self.assertEqual(result["status"], "MANIFEST_UPDATED_PENDING_VERIFICATION")
            verify = subprocess.run([sys.executable, str(skill / "scripts" / "verify_manifest.py")], cwd=skill, capture_output=True, text=True)
            self.assertEqual(verify.returncode, 0, verify.stdout + verify.stderr)


if __name__ == "__main__":
    unittest.main(verbosity=2)
