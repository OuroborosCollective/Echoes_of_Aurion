#!/usr/bin/env python3
"""Run one OpenCourant bake inside a BoxLite micro-VM.

BoxLite owns the isolation boundary. The exact OpenCourant release package and
the matched Starter/Engine deck pair are copied into the VM after SHA-256
verification. Only copied-back job outputs may become Aurion evidence.
"""
import argparse
import asyncio
import hashlib
import json
import os
import shlex
from pathlib import Path

import boxlite
from opencourant_evidence import inventory, verify

REQUIRED = (
    "AURION_IMPACT_WORK_ID", "AURION_SOURCE_REVISION", "AURION_LOGICAL_TICK",
    "AURION_STARTER_DECK_HASH", "AURION_ENGINE_DECK_HASH", "AURION_SCENARIO",
    "OPENCOURANT_PACKAGE_HASH", "OPENCOURANT_COMMIT", "BOXLITE_IMAGE",
    "BOXLITE_VERSION", "BOXLITE_CPUS", "BOXLITE_MEMORY_MIB",
)


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return "sha256:" + h.hexdigest()


def validate_deck_pair(starter: Path, engine: Path) -> None:
    if not starter.is_file() or not starter.name.endswith("_0000.rad"):
        raise SystemExit("starter deck must be an existing *_0000.rad file")
    if not engine.is_file() or not engine.name.endswith("_0001.rad"):
        raise SystemExit("engine deck must be an existing *_0001.rad file")
    if starter.name[:-len("_0000.rad")] != engine.name[:-len("_0001.rad")]:
        raise SystemExit("starter and engine deck roots must match")
    if sha256_file(starter) != os.environ["AURION_STARTER_DECK_HASH"]:
        raise SystemExit("starter deck hash mismatch")
    if sha256_file(engine) != os.environ["AURION_ENGINE_DECK_HASH"]:
        raise SystemExit("engine deck hash mismatch")


async def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--starter-deck", required=True)
    parser.add_argument("--engine-deck", required=True)
    parser.add_argument("--solver-package", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()

    missing = [key for key in REQUIRED if not os.environ.get(key)]
    if missing:
        raise SystemExit("missing required environment: " + ",".join(missing))

    starter = Path(args.starter_deck).resolve()
    engine = Path(args.engine_deck).resolve()
    package = Path(args.solver_package).resolve()
    validate_deck_pair(starter, engine)
    if not package.is_file() or package.suffix.lower() != ".zip":
        raise SystemExit("solver package must be an existing .zip file")
    if sha256_file(package) != os.environ["OPENCOURANT_PACKAGE_HASH"]:
        raise SystemExit("OpenCourant package hash mismatch")

    output = Path(args.output).resolve()
    if output.exists() and any(output.iterdir()):
        raise SystemExit("output directory must be empty; stale evidence is forbidden")
    output.mkdir(parents=True, exist_ok=True)
    cpus = int(os.environ["BOXLITE_CPUS"])
    memory = int(os.environ["BOXLITE_MEMORY_MIB"])

    runtime = boxlite.Boxlite.default()
    security = boxlite.SecurityOptions.maximum()
    box = await runtime.create(boxlite.BoxOptions(
        image=os.environ["BOXLITE_IMAGE"],
        cpus=cpus,
        memory_mib=memory,
        working_dir="/workspace",
        advanced=boxlite.AdvancedBoxOptions(security=security),
        auto_remove=True,
    ))
    try:
        prep = await box.exec("sh", ["-lc", "set -eu; test \"$(id -u)\" -ne 0; test -w /workspace; mkdir -p /workspace/job /workspace/opencourant"])
        prep_result = await prep.wait()
        if prep_result.exit_code != 0:
            raise SystemExit("BoxLite workspace preparation failed")

        await box.copy_in(str(package), "/workspace/OpenCourant_linux64.zip")
        await box.copy_in(str(starter), "/workspace/job/" + starter.name)
        await box.copy_in(str(engine), "/workspace/job/" + engine.name)

        command = (
            "set -eu; "
            "python3 -m zipfile -e /workspace/OpenCourant_linux64.zip /workspace/opencourant; "
            "STARTER=$(find /workspace/opencourant -type f -name starter_linux64_gf | head -1); "
            "ENGINE=$(find /workspace/opencourant -type f -name engine_linux64_gf | head -1); "
            "test -n \"$STARTER\"; test -n \"$ENGINE\"; "
            "chmod u+x \"$STARTER\" \"$ENGINE\"; "
            "ROOT=$(dirname \"$(dirname \"$STARTER\")\"); "
            "export RAD_CFG_PATH=\"$ROOT/hm_cfg_files\"; "
            "export LD_LIBRARY_PATH=\"$ROOT/extlib/hm_reader/linux64:$ROOT/extlib/h3d/lib/linux64:${LD_LIBRARY_PATH:-}\"; "
            f"export OMP_NUM_THREADS={cpus}; cd /workspace/job; "
            f"\"$STARTER\" -i {shlex.quote(starter.name)} -np 1 > starter.out 2>&1; "
            f"\"$ENGINE\" -i {shlex.quote(engine.name)} > engine.out 2>&1; "
            "grep -q 'NORMAL TERMINATION' engine.out"
        )
        execution = await box.exec("sh", ["-lc", command])
        try:
            result = await asyncio.wait_for(execution.wait(), timeout=1800)
        except asyncio.TimeoutError:
            await execution.kill()
            raise
        await box.copy_out("/workspace/job", str(output / "solver-work"),
                           boxlite.CopyOptions(include_parent=False))
        if result.exit_code != 0:
            raise SystemExit(f"OpenCourant failed with exit code {result.exit_code}")
    finally:
        await box.stop()

    manifest = {
        "protocol": "aurion.world-impact-bake.runtime-evidence.v1",
        "workId": os.environ["AURION_IMPACT_WORK_ID"],
        "scenario": os.environ["AURION_SCENARIO"],
        "sourceRevision": os.environ["AURION_SOURCE_REVISION"],
        "logicalTick": int(os.environ["AURION_LOGICAL_TICK"]),
        "starterDeckHash": os.environ["AURION_STARTER_DECK_HASH"],
        "engineDeckHash": os.environ["AURION_ENGINE_DECK_HASH"],
        "solverPackageHash": os.environ["OPENCOURANT_PACKAGE_HASH"],
        "solverCommit": os.environ["OPENCOURANT_COMMIT"],
        "boxliteImage": os.environ["BOXLITE_IMAGE"],
        "boxliteVersion": os.environ["BOXLITE_VERSION"],
        "securityPreset": "maximum",
        "solverArtifacts": inventory(output / "solver-work"),
    }
    (output / "runtime-evidence.json").write_text(
        json.dumps(manifest, sort_keys=True, indent=2) + "\n",
        encoding="utf-8",
    )

    verify(output, os.environ["AURION_SOURCE_REVISION"])


if __name__ == "__main__":
    asyncio.run(main())
