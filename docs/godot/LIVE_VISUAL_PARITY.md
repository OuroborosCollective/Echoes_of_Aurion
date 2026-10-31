# Aurion versus Godot: authenticated live visual parity

The Aurion server is the sole gameplay and persistence authority. This workflow NEVER invents a server screenshot or marks a synthetic fixture as production evidence.

## Live evidence sources on the owner VPS

Read-only paths:
- /srv/serverin/evidence/aurion-visual/source/server.png : independent authenticated Aurion game viewport
- /srv/serverin/evidence/aurion-visual/source/server.json : its capture provenance
- /srv/serverin/evidence/aurion-visual/source/godot.png : actual authenticated Godot game viewport
- /srv/serverin/evidence/aurion-visual/source/godot.json : its capture provenance

Each metadata JSON must contain schema=aurion.live-visual-parity.v1; captureKind=aurion-live-gameplay-viewport or godot-live-gameplay-viewport; authenticated=true; liveProcess=true; uiState=gameplay; capturedAt as UTC ISO timestamp; worldId, zoneId, tick, sourceRevision, runtimeImageDigest, receiptHash, projectionHash, streamInstance, camera={position,target,fov}, scene={entityIds,terrainChunks,skyVisible,horizonVisible,assetDigest}, screenshotSha256 (hex SHA256 of exact image bytes).

The screenshot producer for each independent live-gameplay renderer is NOT currently implemented. A server tick or JSON snapshot alone is not a reference image. Until two independently authenticated render captures and server-bound metadata exist, the job MUST fail closed, not substitute a demo screenshot.

## Decision and artifacts

Passing requires fresh captures (within 120 seconds), same captured tick (within 2 seconds), the same world/zone/receipt/revision/digest/stream/camera/scene census, terrain and sky/horizon present, and visibly similar pixel content at matching resolution. Thresholds are initial strict checks, not calibrated live acceptance. No lowering thresholds to make a test green.

Failure artifacts include report.json, report.md, difference.png when both images exist, and the original godot-workspace-desktop.png. The desktop screenshot can diagnose login, black viewport or green placeholders but is NOT accepted as the actual Godot gameplay viewport.

A distinct workflow named Aurion Visual Comparator UNIT runs GitHub-hosted synthetic tests for pull requests; its success never means live-parity success. The Aurion LIVE Godot Visual Parity workflow has ONLY one owner-VPS audit job, runs by workflow_dispatch, fails if not on main and never has a skipped live job silently reported green. No service restart, database change, credential extraction, asset mutation or world edit is performed. Green unit tests NEVER establish live parity.

The current live Godot desktop observation was predominantly dark with an auth screen (~96 percent dark sample); local bridge port 8765 was not listening at inspection time. These are observations, not final causal proof. Native Godot authoring Apply/Receipt/independent readback remains a separate gate.
