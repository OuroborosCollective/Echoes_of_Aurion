# Emergent Life Core

## Zweck

AIM-544 verbindet bestätigte Lebens-Impacts mit deterministischer Need-Ableitung, Action-Kandidaten und einem nächsten Impact.

```
confirmed receipt → Impact → Need transition → deterministic Action Candidate
                   → Aurion Effect Intent → next Impact
```

## Truth boundary

Der Core erzeugt keine eigene Persistenz- oder Gameplay-Authority. Tatsächliche Mutationen bleiben auf den bestehenden Aurion-Gateway-/Receipt-Pfaden. AX1/WASD, CAG, Wolfram und LLMs sind keine Truth-Quellen.

## Determinismus

* Resolution ist an einen expliziten `resolutionIndex` gebunden.
* Inputs werden stabil nach Resolution, Domain und Receipt-ID geordnet.
* Needs verwenden ganzzahlige Basis-Punkte.
* Action-Kandidaten verwenden deterministische Prioritäts-/Nutzen-/Risiko-Tie-Breaks.
* State-, Candidate-Set-, Action-Intent- und Resolution-Hashes werden mit dem kanonischen SHA-256-Encoder gebildet.
* Zukunfts- und doppelte Evidence wird fail-closed behandelt.

## Implementierung

* `shared/aurionEmergentLifeCore.ts`
* `server/aurionEmergentLifeCore.test.ts`
* GitHub PR #614: https://github.com/OuroborosCollective/Echoes\_of\_Aurion/pull/614

## Abnahme

Der aktuelle PR wird gegen seinen exakten GitHub-Head durch Local Test Pack, Runtime Candidate, Runtime Container Proof und NPC-Memory-Regression geprüft. Merge erfolgt erst nach erfolgreichem Exact-Head-Readback.
