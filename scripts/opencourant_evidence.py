"""Hash and independently verify copied-back OpenCourant solver artifacts."""
import argparse
import hashlib
import json
from pathlib import Path


def inventory(root: Path) -> list[dict]:
    files = []
    for path in sorted(root.rglob('*')):
        if path.is_symlink():
            raise ValueError('solver artifact symlink is forbidden')
        if path.is_file():
            files.append({'path': path.relative_to(root).as_posix(),
                          'bytes': path.stat().st_size,
                          'sha256': 'sha256:' + hashlib.sha256(path.read_bytes()).hexdigest()})
    if not files:
        raise ValueError('solver artifacts missing')
    return files


def verify(root: Path, expected_revision: str) -> dict:
    data = json.loads((root / 'runtime-evidence.json').read_text())
    if data['sourceRevision'] != expected_revision:
        raise ValueError('source revision mismatch')
    if data['securityPreset'] != 'maximum':
        raise ValueError('maximum isolation required')
    work = root / 'solver-work'
    observed = inventory(work)
    if observed != data['solverArtifacts']:
        raise ValueError('solver artifact inventory/hash mismatch')
    for name in ('starter.out', 'engine.out'):
        if not (work / name).is_file() or not (work / name).stat().st_size:
            raise ValueError('solver log missing or empty')
    if 'NORMAL TERMINATION' not in (work / 'engine.out').read_text(errors='replace'):
        raise ValueError('solver normal termination missing')
    # A log alone is insufficient: require solver-generated numeric output.
    if not any(x['bytes'] > 0 and x['path'].upper().endswith(('T01', 'A001', '.RST', '.VTK')) for x in observed):
        raise ValueError('solver numeric output missing')
    for suffix, key in (('_0000.rad', 'starterDeckHash'), ('_0001.rad', 'engineDeckHash')):
        decks = [x for x in observed if x['path'].endswith(suffix)]
        if len(decks) != 1 or decks[0]['sha256'] != data[key]:
            raise ValueError('copied-back deck hash mismatch')
    return data


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('root', type=Path)
    parser.add_argument('--source-revision', required=True)
    args = parser.parse_args()
    print(json.dumps(verify(args.root, args.source_revision), sort_keys=True))
