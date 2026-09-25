# Aurion supply-chain control matrix — SLSA 1.2 oriented

Status: control evidence map; this document does not claim a SLSA conformance level.

| Control area | Aurion evidence | Verification boundary |
|---|---|---|
| Source identity | Exact Git commit SHA is checked out and compared with `GITHUB_SHA`. | Release workflow |
| Build identity | BuildInputManifest is bound into the runtime artifact and release predicate. | Runtime build + predicate |
| Artifact integrity | Runtime release archives carry SHA-256 checksums and an exact digest subject. | Build/promotion |
| Provenance | Workflow provenance records source revision, workflow SHA, repository and workflow path. | Release workflow |
| Attestation | GitHub Artifact Attestation signs the finalized runtime archive through OIDC. | Main release only |
| Independent verification | `gh attestation verify` checks repository, signer workflow, source digest/ref and predicate type; self-hosted runner signatures are denied. | Main release only |
| Tamper resistance | The exact attested archive is modified transiently and verification must reject it, then the original bytes are restored and reverified. | Main release only |
| SBOM | SPDX 2.3 runtime dependency SBOM is generated deterministically and its SHA-256 is bound into the signed release predicate. | Runtime release |
| Secret hygiene | Release metadata is scanned and signing predicate construction fails closed when secret-like values are present. | Build + predicate |
| Runner trust separation | Attestation verification uses `--deny-self-hosted-runners`; production promotion/readback is a separate step. | Release verification |
| Negative coverage | Missing/invalid digest identity and secret-like metadata are rejected by tests; archive tampering is rejected by the real verification command. | Test + release |
| Deferred APK lane | APK build and APK attestation are intentionally not part of this current scope. | Explicit remaining DoD |

## Explicit boundary

This matrix records implemented controls and their verification locations. It does not assert that every SLSA 1.2 requirement is satisfied, and it does not substitute for the deferred APK evidence.
