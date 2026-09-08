# Aurion Guard CLI- und Receipt-Schema

## Betriebsmodi

`resolve-plan` kennt zwei explizite Modi, beide innerhalb derselben autonomen Integrationspolitik:

| Modus | Zweck | Produktionsmutation |
| --- | --- | --- |
| `diagnostic` | Evidenz beschaffen, Drift klassifizieren, Rechecks/Source-Reparaturen planen und fehlende Bindungen autonom ermitteln. | **Nie** dispatchen. Auch vollständige grüne Inputs ändern das nicht. |
| `final` | Beweise erneut verifizieren und eine kanonische Mutation freigeben, wenn alle kausalen Bindungen stehen. | Darf autonom den kanonischen Aurion-Workflow dispatchen; OIDC/root bleibt die echte Autorisierungsgrenze. |

Der Resolver verlangt **keine per-Aktion Owner-Abfrage**. `--owner-authorized` bleibt nur als versteckter Kompatibilitätsparameter für alte Aufrufer und beeinflusst die Mutationseignung nicht.

Der robuste Final-Aufruf verwendet den kanonischen Ledger selbst, nicht nur einen kopierten Hash:

```bash
python3 scripts/aurion_guard.py resolve-plan \
  --mode final \
  --repo-receipt .evidence/repo.json \
  --production-classification .evidence/production.json \
  --runtime-receipt .evidence/runtime.json \
  --plan-receipt .evidence/migration-ledger.json \
  --ledger-run-id <github-run-id> \
  --expected-revision <sha40>
```

`planSha256` wird aus `migration-ledger.json` kanonisch neu berechnet. Ein zusätzliches `--plan-sha256` ist nur noch ein Cross-Check. Fehlt `ledger_run_id`, erzeugt der Resolver `DISCOVER_CANONICAL_LEDGER_RUN_ID_FOR_VERIFIED_PLAN` mit `autoAllowed=true`; er fragt nicht den Owner.

Diagnostic bleibt für unvollständige Eingaben zulässig:

```bash
python3 scripts/aurion_guard.py resolve-plan --mode diagnostic --expected-revision <sha40>
```

Finale Evidenz mit ungültigem Receipt-Hash, falscher Revision oder manipuliertem Plan wird blockiert und autonom neu beschafft.

## Metriktypen

Jede Surface-Metrik ist typisiert:

```json
{
  "danceFloor": ["surface-name"],
  "exitLane": ["out-of-sync-or-blocked-surface"],
  "needsRecheck": ["unverified-surface"]
}
```

Alle drei Felder sind **Listen von Surface-Namen**, keine Booleans und keine freien Textfelder. `evidenceCoveragePpm` und `syncPpm` sind ganzzahlige Millionstelquoten.

## Regression-Receipt

Der Runner erzeugt zusätzlich zu Laufdaten zwei getrennte Identitäten:

- `outputSha256`: Hash der konkreten Testausgabe dieses Laufs.
- `testDefinitionSha256`: stabiler Hash der eingebundenen Python-Skripte und Tests, sortiert nach relativem Pfad.

Damit lassen sich eine geänderte Testdefinition und eine bloß abweichende Laufzeitausgabe unterscheiden. `runnerPython` dokumentiert die verwendete Python-Hauptversion.

## Manifest- und Paket-Receipts

`verify_manifest.py` prüft Bytes, SHA-256, Dateimodi, fehlende/nicht gelistete Dateien, Symlinks sowie generierte `.pyc`-/`__pycache__`-Artefakte. `check_package.py` ruft diese Prüfung zwingend **vor** dem Packaging auf und verweigert ein Archiv bei Drift. ZIP-Zeitstempel und Unix-Modi werden normalisiert, sodass identische Payload-Bytes unabhängig von Dateisystem-mtime denselben Archiv-Hash ergeben. `update_manifest.py` ist das einzige Werkzeug, das `manifest.json` bewusst neu schreibt und meldet danach nur `MANIFEST_UPDATED_PENDING_VERIFICATION`; erst ein separater `verify_manifest.py`-Lauf darf `IN_SYNC` behaupten.

## Hilfsskripte

- `scripts/endpoint_probe.py`: nur für eine explizit revisiongebundene, nicht geheime Endpunkt-/Health-Beobachtung verwenden. Die Ausgabe ist Runtime-Evidenz und ersetzt weder Produktionsschema-Readback noch Produktionswahrheit.
- `scripts/server_status.py`: nur für nicht geheime Container-/Service-Statusinformationen verwenden. Die Ausgabe ist Orientierung bzw. Runtime-Evidenz und darf keine Schema- oder Deployment-Synchronität allein belegen.
- `scripts/apply_migration.py`: absichtlicher Hard-Block für den entfernten direkten SSH/SQL-Pfad; nicht als Apply-Werkzeug verwenden.

## Cross-Repo-Choreography CLI

```bash
python3 scripts/aurion_guard.py choreograph-wasd \
  --expected-aurion-revision <aurion-sha40> \
  --expected-wasd-revision <wasd-sha40> \
  --plan-receipt .evidence/migration-ledger.json \
  --wasd-source-ledger .evidence/source-ledger.json \
  --wasd-run-id <github-run-id> \
  --causal-owner unknown
```

`--causal-owner` accepts `unknown|wasd|aurion|shared`. It is not an authorization flag;
it is causal routing evidence. `unknown` keeps root-causing autonomously. `wasd` or
`aurion` may emit a bounded `REQUEST_PATCH` whose write boundary is
`isolated_workspace_to_draft_pr`. No value authorizes a direct peer-main push.

The choreography receipt uses `scope=cross_repo_choreography` and contains:

- `wasd_source_evidence` — direct WASD source-ledger hash/revision contract;
- `aurion_migration_plan` — recomputed `planSha256` and source/target binding;
- `cross_repo_binding` — exact source revision + source manifest + Aurion target + plan;
- `actions[].dispatchIntent` — an executable control-plane intent, **not** a claim that
  the workflow ran;
- `ownerPromptRequired=false` for operational choreography.

`resolve-plan` can consume the same peer inputs using `--wasd-source-ledger`,
`--expected-wasd-revision`, `--wasd-run-id`, and `--causal-owner`. Its
`peerChoreography` field preserves the complete peer receipt rather than flattening the
source evidence into a single boolean.
