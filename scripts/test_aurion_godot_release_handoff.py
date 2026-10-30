"""Release boundary regressions; synthetic archive fixtures are not live evidence."""
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import re
import tarfile
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]


class HostBuildBoundary(unittest.TestCase):
    def test_promoter_only_imports_a_hosted_image(self):
        source = (ROOT / 'deploy/promote-aurion-zone-runtime.sh').read_text()
        commands = '\n'.join(line for line in source.splitlines() if not line.lstrip().startswith('#'))
        self.assertNotRegex(commands, r'docker\s+(?:build|buildx\s+build)\b')
        self.assertIn('load-aurion-runtime-image.py', source)
        self.assertIn('--no-build', source)


def module(name, path):
    spec = importlib.util.spec_from_file_location(name, ROOT / path)
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


class ImageArchiveBoundary(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.directory = Path(self.temp.name)
        self.loader = module('image_loader', 'deploy/load-aurion-runtime-image.py')
        self.revision = 'a' * 40
        self.write_archive()

    def write_archive(self, config_change=None, extra_tag=False, claimed_id=None):
        config = {'os': 'linux', 'architecture': 'amd64', 'config': {'User': 'node', 'Labels': {'org.opencontainers.image.revision': self.revision}}}
        if config_change:
            config_change(config)
        raw = json.dumps(config).encode()
        image_id = 'sha256:' + hashlib.sha256(raw).hexdigest()
        tag = 'echoes-of-aurion:' + self.revision
        index = [{'Config': 'config.json', 'RepoTags': [tag] + (['unrelated:latest'] if extra_tag else []), 'Layers': []}]
        with tarfile.open(self.directory / 'runtime-image.tar', 'w') as archive:
            for name, data in [('config.json', raw), ('manifest.json', json.dumps(index).encode())]:
                info = tarfile.TarInfo(name); info.size = len(data); archive.addfile(info, io.BytesIO(data))
        manifest = {'recordType': 'aurion_traefik_runtime_artifact', 'revision': self.revision,
                    'runtimeImage': {'schema': 'aurion.hosted-runtime-image.v1', 'sourceRevision': self.revision, 'archive': 'runtime-image.tar', 'id': claimed_id or image_id, 'platform': 'linux/amd64', 'builtBy': 'github-hosted-actions'},
                    'files': {'runtime-image.tar': self.loader.file_hash(self.directory / 'runtime-image.tar')}}
        (self.directory / 'manifest.json').write_text(json.dumps(manifest))

    def rejected_before_docker(self):
        with patch.object(self.loader.subprocess, 'run') as invoke:
            with self.assertRaises(ValueError):
                self.loader.load(self.directory, self.revision)
            invoke.assert_not_called()

    def test_exact_config_and_archive_are_verified(self):
        self.assertEqual(self.loader.verify(self.directory, self.revision)['sourceRevision'], self.revision)

    def test_tampered_archive_is_rejected_before_docker(self):
        with (self.directory / 'runtime-image.tar').open('ab') as stream:
            stream.write(b'tampered')
        self.rejected_before_docker()

    def test_wrong_revision_is_rejected_before_docker(self):
        self.write_archive(lambda c: c['config']['Labels'].update({'org.opencontainers.image.revision': 'b' * 40}))
        self.rejected_before_docker()

    def test_wrong_platform_is_rejected_before_docker(self):
        self.write_archive(lambda c: c.update(architecture='arm64'))
        self.rejected_before_docker()

    def test_root_runtime_is_rejected_before_docker(self):
        self.write_archive(lambda c: c['config'].update(User='root'))
        self.rejected_before_docker()

    def test_extra_mutable_tag_is_rejected_before_docker(self):
        self.write_archive(extra_tag=True)
        self.rejected_before_docker()

    def test_wrong_image_digest_is_rejected_before_docker(self):
        self.write_archive(claimed_id='sha256:' + '0' * 64)
        self.rejected_before_docker()

    def test_loaded_container_identity_cannot_drift(self):
        with patch.object(self.loader.subprocess, 'run'), patch.object(self.loader.subprocess, 'check_output', return_value='[{"Id":"sha256:wrong"}]'):
            with self.assertRaisesRegex(ValueError, 'LOADED_IDENTITY'):
                self.loader.load(self.directory, self.revision)


class ProtectedFeedFiles(unittest.TestCase):
    def setUp(self):
        if os.geteuid() != 0:
            self.fail('Run these isolated permission tests with sudo on the CI runner')
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.directory = Path(self.temp.name)
        self.directory.chmod(0o750)
        self.feed = self.directory / 'feed.token'; self.feed.write_text('a' * 64 + '\n')
        os.chown(self.feed, 0, 1000); self.feed.chmod(0o440)
        self.editor = self.directory / 'editor.token'; self.editor.write_text('b' * 64 + '\n')
        self.editor.chmod(0o600)
        self.contract = module('feed_contract', 'deploy/verify-aurion-godot-feed.py')
        self.contract.TOKEN = self.feed

    def test_protected_files_are_accepted_without_output(self):
        self.contract.preflight()

    def test_world_readable_feed_is_rejected(self):
        self.feed.chmod(0o444)
        with self.assertRaises(ValueError): self.contract.preflight()

    def test_user_owned_feed_is_rejected(self):
        os.chown(self.feed, 1001, 1000)
        with self.assertRaises(ValueError): self.contract.preflight()

    def test_symlink_is_rejected(self):
        other = self.directory / 'actual'; self.feed.rename(other); self.feed.symlink_to(other)
        with self.assertRaises(ValueError): self.contract.preflight()

    def test_reused_feed_credential_is_rejected(self):
        self.editor.write_bytes(self.feed.read_bytes())
        with self.assertRaises(ValueError): self.contract.preflight()

    def test_invalid_token_is_rejected(self):
        self.feed.write_text('too short')
        with self.assertRaises(ValueError): self.contract.preflight()


if __name__ == '__main__':
    unittest.main()
