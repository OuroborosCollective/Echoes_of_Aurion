# OpenCourant + BoxLite WORLD_IMPACT lane

Aurion remains the sole gameplay/world authority. OpenCourant is an offline numerical oracle only.

## Supported bake classes

- vehicle crashes
- destructible walls, gates and bridges
- iron, wood and stone material calibration
- projectile impacts
- explosive impacts
- offline damage/deformation baking
- reduced runtime deformation tables

## Boundary

`SimulationWorkItem.phase = WORLD_IMPACT` selects work. Every job binds the source revision, logical tick, material profile and the matched Radioss Starter/Engine deck pair (`*_0000.rad` + `*_0001.rad`) by SHA-256 before execution.

`scripts/run-opencourant-boxlite.py` launches a BoxLite micro-VM, copies the exact OpenCourant stable release package and both decks into the VM, executes the release's `starter_linux64_gf` and `engine_linux64_gf`, requires `NORMAL TERMINATION`, and copies only the job workspace back out. No solver result directly mutates gameplay state.

Only a validated `ImpactBakeReceipt` may cross back into Aurion. Reduced deformation samples are deterministic runtime projections keyed by the receipt and can always be regenerated from solver evidence.

## Reproducibility

The integration records:
- OpenCourant release commit `33e685176cccf0c539a3ce07aa2096985a284e2a`
- OpenCourant Linux package `OpenCourant_linux64.zip`
- package SHA-256 `9d67531de156dd9beba05fbfe710dcdc2bcecbdf3dc3a12642cf85dcece80081`
- GitHub release ID `405359625`, asset ID `617491847`, published 2026-10-07 from the same recorded commit; the earlier mutable release asset used SHA-256 `905bd73b4daf5c7762c18a50d4dc5db4c06b496811e6e0ab27c583d04578bd66`
- BoxLite `0.10.5`
- reviewed BoxLite base `ghcr.io/boxlite-ai/boxlite-agent-base:v0.1.0`

The runtime proof resolves the BoxLite base tag to an immutable registry digest before execution. Production jobs may pass only that reviewed base tag or the corresponding immutable digest form.

OpenCourant's own OCI image is intentionally not the BoxLite rootfs. BoxLite 0.10.5 reproduces the owner-unreadable `/etc/shadow` xattr failure family tracked upstream as boxlite-ai/boxlite#1692 when preparing that image. Aurion does not weaken file permissions or patch BoxLite. Instead it transports the official, hash-verified OpenCourant release package into a supported BoxLite base image.

## Licensing

OpenCourant remains an external AGPLv3 solver package; no OpenCourant source is copied into Aurion. The runtime smoke test downloads the upstream release package and CC BY-NC MiniQA decks only for execution evidence and does not commit them to this repository.

## Runtime prerequisites

- Python 3.10+
- `boxlite==0.10.5`
- Linux host with readable/writable `/dev/kvm`
- Bubblewrap with working user namespaces; Ubuntu 24.04 needs the targeted `/usr/bin/bwrap` AppArmor profile in `scripts/opencourant-bwrap.apparmor`. The workflow installs and loads that profile only after the real namespace probe fails, then requires a successful probe. Global AppArmor/userns restrictions and `SecurityOptions.maximum()` remain enabled.
- exact OpenCourant release package matching the recorded SHA-256
- enough CPU/RAM for the selected FEM deck

The runner fails closed on missing environment, unmatched deck pair, package/deck hash mismatch, KVM/BoxLite failure, timeout, non-zero solver exit, or missing OpenCourant normal termination.

The copied-back evidence inventories each solver file with its byte count and SHA-256. A separate GitHub job downloads the uploaded artifact into a fresh runner before validating it. Independent readback requires both solver logs, Engine normal termination, a non-empty numeric output, matching input-deck hashes, the exact source revision and maximum isolation. Regression fixtures test evidence rejection only; the KVM micro-VM workflow remains the sole solver execution proof.

The base image declares `USER boxlite` and `WORKDIR /workspace`; the runner creates its job and solver directories beneath that writable workspace and verifies the guest UID is non-zero. `CopyOptions(include_parent=False)` makes the copied-back directory match the verifier contract.
