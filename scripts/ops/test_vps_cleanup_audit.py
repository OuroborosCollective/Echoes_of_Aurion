"""Contract tests: synthetic command results are NOT host or cleanup evidence."""
import unittest
from unittest.mock import patch
import vps_cleanup_audit as m


class ReadOnlyAuditTests(unittest.TestCase):
    def test_no_host_mutating_command(self):
        calls = []

        def run(argv, timeout):
            calls.append(tuple(argv))
            if argv[:2] == ["du", "-x"]:
                return 0, f"8192\t{argv[-1]}/child\n16384\t{argv[-1]}\n"
            if argv[:2] == ["docker", "ps"]:
                return 0, '{"Names":"echoes-of-aurion-aurion-1","State":"running"}\n'
            if argv[:3] == ["docker", "volume", "ls"]:
                return 0, "protected_database\nprotected_assets\n"
            if argv[:3] == ["docker", "image", "ls"]:
                return 0, "sha256:abc\n"
            if argv[:3] == ["docker", "system", "df"]:
                return 0, "TYPE TOTAL ACTIVE SIZE RECLAIMABLE\n"
            return 0, "active\n"

        with patch.object(m, "get_disk", return_value={
            "totalBytes": 42, "usedBytes": 20, "availableBytes": 18, "usedPpm": 476190
        }), patch.object(m.Path, "exists", return_value=True), patch.object(
            m.Path, "is_symlink", return_value=False
        ), patch.object(m.Path, "is_dir", return_value=True):
            report = m.collect(run)
        self.assertIs(report["mutationPerformed"], False)
        self.assertIs(report["deleteCapability"], False)
        self.assertEqual(report["deletionCandidates"], [])
        self.assertEqual(report["docker"]["protectedVolumeCount"], 2)
        self.assertEqual(report["docker"]["containerStates"], {"running": 1})
        self.assertEqual(report["directoryUsage"][0]["largestChildren"][0]["bytes"], 8192)
        for call in calls:
            self.assertNotIn(call[0], ("rm", "truncate", "sh", "bash"))
            self.assertFalse(any(s in call for s in ("prune", "stop", "delete", "rmi", "--force")))

    def test_missing_docker_does_not_authorize_cleanup(self):
        info, failures = m.docker_inventory(lambda argv, timeout: (127, ""))
        self.assertIsNone(info["containerCount"])
        self.assertIn("VOLUME_INVENTORY_UNAVAILABLE", failures)
        self.assertIn("IMAGE_INVENTORY_UNAVAILABLE", failures)

    def test_directory_parser_rejects_unexpected_output(self):
        with patch.object(m.Path, "exists", return_value=True), patch.object(
            m.Path, "is_symlink", return_value=False
        ), patch.object(m.Path, "is_dir", return_value=True):
            dirs, errors = m.directory_sizes(
                lambda argv, timeout: (0, "unexpected-output\n")
            )
        self.assertTrue(errors)
        self.assertTrue(all(row["bytes"] is None for row in dirs))


if __name__ == "__main__":
    unittest.main()
