"""Negative readback tests; fixtures are never claimed as solver runtime proof."""
import json
import tempfile
import unittest
from pathlib import Path
from opencourant_evidence import inventory, verify


class EvidenceTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.work = self.root / 'solver-work'
        self.work.mkdir()
        for name, content in {'starter.out': 'starter completed', 'engine.out': 'NORMAL TERMINATION',
                              'ACCELERO_0000.rad': 'starter deck', 'ACCELERO_0001.rad': 'engine deck',
                              'ACCELEROT01': 'numeric output'}.items():
            (self.work / name).write_text(content)
        # OpenCourant uses the root + T01 name without a dot.
        (self.work / 'ACCELEROT01').rename(self.work / 'ACCELERO.T01')
        files = inventory(self.work)
        self.data = {'sourceRevision': 'a' * 40, 'securityPreset': 'maximum', 'solverArtifacts': files,
                     'starterDeckHash': next(x['sha256'] for x in files if x['path'].endswith('_0000.rad')),
                     'engineDeckHash': next(x['sha256'] for x in files if x['path'].endswith('_0001.rad'))}
        self.save()

    def save(self):
        (self.root / 'runtime-evidence.json').write_text(json.dumps(self.data))

    def test_readback(self):
        self.assertEqual(verify(self.root, 'a' * 40), self.data)

    def test_stale_revision(self):
        with self.assertRaisesRegex(ValueError, 'revision'):
            verify(self.root, 'b' * 40)

    def test_tampered_output(self):
        (self.work / 'ACCELERO.T01').write_text('changed')
        with self.assertRaisesRegex(ValueError, 'inventory/hash'):
            verify(self.root, 'a' * 40)

    def test_missing_output(self):
        (self.work / 'ACCELERO.T01').unlink()
        self.data['solverArtifacts'] = inventory(self.work)
        self.save()
        with self.assertRaisesRegex(ValueError, 'numeric output'):
            verify(self.root, 'a' * 40)

    def test_missing_termination(self):
        (self.work / 'engine.out').write_text('abnormal exit')
        self.data['solverArtifacts'] = inventory(self.work)
        self.save()
        with self.assertRaisesRegex(ValueError, 'normal termination'):
            verify(self.root, 'a' * 40)

    def test_deck_hash_mismatch(self):
        self.data['starterDeckHash'] = 'sha256:' + 'f' * 64
        self.save()
        with self.assertRaisesRegex(ValueError, 'deck hash'):
            verify(self.root, 'a' * 40)

    def test_weakened_security(self):
        self.data['securityPreset'] = 'development'
        self.save()
        with self.assertRaisesRegex(ValueError, 'maximum isolation'):
            verify(self.root, 'a' * 40)

    def test_symlink_escape(self):
        (self.work / 'escaped').symlink_to(self.root / 'runtime-evidence.json')
        with self.assertRaisesRegex(ValueError, 'symlink'):
            verify(self.root, 'a' * 40)


if __name__ == '__main__':
    unittest.main()
