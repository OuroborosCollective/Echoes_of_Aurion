#!/usr/bin/env python3
"""Run one OpenCourant bake inside a BoxLite micro-VM.

The host supplies the Radioss Starter/Engine deck pair. BoxLite executes the
pinned OpenCourant OCI image and only copied-back files may become Aurion
evidence. The solver never mutates gameplay state.
"""
import argparse
import asyncio
import hashlib
import json
import os
import shlex
from pathlib import Path

import boxlite

REQUIRED = (
    "AURION_IMPACT_WORK_ID", "AURION_SOURCE_REVISION", "AURION_LOGICAL_TICK",
    "AURION_STARTER_DECK_HASH", "AURION_ENGINE_DECK_HASH", "AURION_SCENARIO",
    "OPENCOURANT_IMAGE", "OPENCOURANT_COMMIT", "BOXLITE_VERSION",
    "BOXLITE_CPUS", "BOXLITE_MEMORY_MIB",
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
    parser.add_argument("--output", required=True)
    args = parser.parse_args()

    missing = [key for key in REQUIRED if not os.environ.get(key)]
    if missing:
        raise SystemExit("missing required environment: " + ",".join(missing))

    starter = Path(args.starter_deck).resolve()
    engine = Path(args.engine_deck).resolve()
    validate_deck_pair(starter, engine)

    output = Path(args.output).resolve()
    output.mkdir(parents=True, exist_ok=True)
    cpus = int(os.environ["BOXLITE_CPUS"])
    memory = int(os.environ["BOXLITE_MEMORY_MIB"])
    image = os.environ["OPENCOURANT_IMAGE"]

    runtime = boxlite.Boxlite.default()
    security = boxlite.SecurityOptions.maximum()
    box = await runtime.create(boxlite.BoxOptions(
        image=image,
        cpus=cpus,
        memory_mib=memory,
        working_dir="/work",
        advanced=boxlite.AdvancedBoxOptions(security=security),
        auto_remove=True,
    ))
    try:
        await box.copy_in(str(starter), "/work/" + starter.name)
        await box.copy_in(str(engine), "/work/" + engine.name)
        command = (
            "set -eu; cd /work; "
            f"export OMP_NUM_THREADS={cpus}; "
            f"starter -i {shlex.quote(starter.name)} -np 1 > starter.out 2>&1; "
            f"engine -i {shlex.quote(engine.name)} > engine.out 2>&1; "
            "grep -q 'NORMAL TERMINATION' engine.out"
        )
        execution = await box.exec("sh", ["-lc", command])
        try:
            result = await asyncio.wait_for(execution.wait(), timeout=1800)
        except asyncio.TimeoutError:
            await execution.kill()
            raise
        if result.exit_code != 0:
            raise SystemExit(f"OpenCourant failed with exit code {result.exit_code}")
        await box.copy_out("/work", str(output / "solver-work"))
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
        "solverImage": image,
        "solverCommit": os.environ["OPENCOURANT_COMMIT"],
        "boxliteVersion": os.environ["BOXLITE_VERSION"],
    }
    (output / "runtime-evidence.json").write_text(
        json.dumps(manifest, sort_keys=True, indent=2) + "\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    asyncio.run(main())
