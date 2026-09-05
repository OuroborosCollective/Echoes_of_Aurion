import copy
import importlib.util
import json
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('aim265_oracle', Path(__file__).with_name('verify-aim265.py'))
oracle = importlib.util.module_from_spec(spec)
spec.loader.exec_module(oracle)


class OracleMutationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.report = json.loads(Path('docs/balancing/aim265-candidate.json').read_text())

    def test_real_protocol_sample(self):
        self.assertEqual(oracle.verify(self.report)['status'], 'local_independent_exact_oracle_pass')

    def test_rejects_wrong_xp_root(self):
        report = copy.deepcopy(self.report)
        report['progression'][0]['xpNextExact'] = '51'
        with self.assertRaises(AssertionError):
            oracle.verify(report)

    def test_rejects_missing_recipe(self):
        report = copy.deepcopy(self.report)
        report['recipes'].pop()
        with self.assertRaises(AssertionError):
            oracle.verify(report)

    def test_rejects_negative_coordinate_truncation(self):
        report = copy.deepcopy(self.report)
        boss = next(b for b in report['worldBosses'] if b['coordinatesMm'][0] < 0)
        boss['chunk']['coordinate']['x'] += 1
        with self.assertRaises(AssertionError):
            oracle.verify(report)

    def test_rejects_decreasing_floor_reward(self):
        report = copy.deepcopy(self.report)
        report['dungeonScenarios'][1]['rewardMultiplierBps'] = 1
        with self.assertRaises(AssertionError):
            oracle.verify(report)

    def test_rejects_disconnected_roads(self):
        report = copy.deepcopy(self.report)
        report['chunks'][0]['roadCells'] = [[1000 + i, 1000] for i in range(31)]
        with self.assertRaises(AssertionError):
            oracle.verify(report)


if __name__ == '__main__':
    unittest.main()
