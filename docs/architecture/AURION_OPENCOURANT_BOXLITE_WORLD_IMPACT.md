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

`scripts/run-opencourant-boxlite.py` launches OpenCourant inside a BoxLite micro-VM, copies both decks in, executes the container's supported `starter` and `engine` entry points, requires a normal Engine termination, and copies solver files back out. No solver result directly mutates gameplay state.

Only a validated `ImpactBakeReceipt` may cross back into Aurion. Reduced deformation samples are deterministic runtime projections keyed by the receipt and can always be regenerated from solver evidence.

## Reproducibility and licensing

The integration records:
- OpenCourant release commit `33e685176cccf0c539a3ce07aa2096985a284e2a`
- discovery tag `ghcr.io/opencourant/opencourant:latest-20261006`
- BoxLite `0.10.5`

The dated OpenCourant tag is not treated as immutable evidence. Production jobs may pass only that reviewed release tag or the preferred immutable `ghcr.io/opencourant/opencourant@sha256:...` form. The runtime-proof workflow resolves the release tag to its registry digest before launching the smoke model.

OpenCourant remains a separate AGPLv3 process/image; no OpenCourant source is copied into Aurion. The runtime smoke test downloads the upstream CC BY-NC QA decks at the exact OpenCourant release commit only for execution evidence and does not commit those decks to this repository.

## Runtime prerequisites

- Python 3.10+
- `boxlite==0.10.5`
- Linux host with readable/writable `/dev/kvm`
- enough CPU/RAM for the chosen FEM deck

The runner fails closed on missing environment, unmatched deck pair, hash mismatch, KVM/BoxLite failure, timeout, non-zero solver exit, or missing OpenCourant normal termination.
