# ARE-rLOGIC companion offline runner

Aurion remains the sole gameplay, world, persistence, receipt and runtime authority.

The automated runner is a one-way research export:

```text
Aurion append-only companion memory
  -> bounded read-only sanitizer
  -> pseudonymous observation/action JSONL
  -> pinned ARE-rLOGIC companion ingest
  -> normalized research evidence artifact
```

The runner never writes policy output back into Aurion.

## Production runner

Workflow: `.github/workflows/arelogic-companion-offline-runner.yml`

- contract checks run on pull requests and relevant pushes;
- the production export runs on a six-hour schedule or explicit dispatch;
- the export job uses the existing self-hosted `aurion-static` runner;
- production companion memory is read from
  `/opt/aurion-zone-runtime/current/data/companion-memory`;
- ARE-rLOGIC is checked out at an immutable pinned revision;
- results are uploaded as a GitHub Actions artifact for 14 days.

## Privacy and authority boundary

Exported research rows omit account identity, raw session/sample identifiers,
timestamps, notes and captured frames. Episode/sample identities are SHA-256
pseudonyms. Only bounded numeric feature/state/action vectors leave the Aurion
memory surface.

Companion memory has observation/action semantics only. No reward is invented.
ARE-rLOGIC therefore treats this as demonstration evidence, not as
discounted-return training input.

Failure of the runner, ARE-rLOGIC or any research result cannot alter Aurion
gameplay state.
