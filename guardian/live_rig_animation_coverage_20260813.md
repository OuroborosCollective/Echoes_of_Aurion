# Prozedurale Livefiguren — Zustandsabdeckung

**Zeitpunkt:** 13. August 2026  
**Quelle:** `client/src/game/scene.ts`

| Figur | Idle | Lauf / Bewegung | Treffer | Angriff / Aktion |
| --- | --- | --- | --- | --- |
| Explorer | Geringe Bein-/Torsoatnung bei `moving = 0` | Tastatur- und Human-Command-Bewegung setzt `explorerMotionUntil`; gegenläufiger Schrittzyklus | `explorerHurtUntil` senkt Skalierung und kippt Torso | `explorerAttackUntil` richtet Arm, Speer und Torso aus |
| Echo Scout | Schwebebewegung, Halo-Rotation und leichte Gliedmaßendrift | Echo-Zielverfolgung erzeugt gegensätzliche Beinbewegung | `echoHurtUntil` kippt den Torso und senkt Skalierung | `echoActionUntil` setzt Arm- und Aktionspose |
| Sentinel | Geringe Beinbewegung und Torso-Ruhe | Distanzgebundene Verfolgung des Explorers setzt `sentinelMoving`; Schrittzyklus und Torsohub | `sentinelHurtUntil` lässt Torso und Emission reagieren | `sentinelAttackUntil` setzt Arm- und Torsoangriffspose |

`pnpm check`, `pnpm test` (27 Tests) und `git diff --check` bestehen nach der Ergänzung. Die visuelle Missionsabnahme bleibt an eine autorisierte Testsession gebunden; die aktuelle Implementierung deckt die Zustände jedoch eindeutig im Szenencode ab.

## GitHub- und Deploymentreadback

Der Sentinel-Kandidat `facdc1d55c6114da97a50a2aff7b8f72692b785c` wurde über PR [#21](https://github.com/OuroborosCollective/Echoes_of_Aurion/pull/21) in `main` integriert. Die aktuelle Hauptbranchrevision ist `077b5e4403c85fea77caf5de8e3bd03f44838204`. Workflowlauf [31700912699](https://github.com/OuroborosCollective/Echoes_of_Aurion/actions/runs/31700912699) endete erfolgreich: Hosted-Build, verifiziertes Static-Artifact und eingeschränkte Aurion-Promotion sind auf derselben Revision abgeschlossen.
