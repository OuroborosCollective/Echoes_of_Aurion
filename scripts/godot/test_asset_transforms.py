import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location("asset_metadata", Path(__file__).with_name("asset-image-metadata.py"))
metadata = importlib.util.module_from_spec(spec)
spec.loader.exec_module(metadata)


class AssetTransformTests(unittest.TestCase):
    def test_quaternion_nonuniform_scale_and_column_major_child_matrix(self):
        parent = {"translation": [5, 6, 7], "rotation": [0, 2 ** -0.5, 0, 2 ** -0.5], "scale": [2, 3, 4]}
        child = {"matrix": [0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1, 0, 1, 2, 3, 1]}
        combined = metadata.multiply(metadata.local_matrix(parent), metadata.local_matrix(child))
        # Independent reference: Ry(90°)·diag(2,3,4)·Rz(90°),
        # translated by Ry(90°)·diag(2,3,4)·(1,2,3)+(5,6,7).
        expected = [0, 0, 4, 17, 3, 0, 0, 12, 0, 2, 0, 5, 0, 0, 0, 1]
        for actual, reference in zip(combined, expected):
            self.assertAlmostEqual(actual, reference)


if __name__ == "__main__":
    unittest.main()
