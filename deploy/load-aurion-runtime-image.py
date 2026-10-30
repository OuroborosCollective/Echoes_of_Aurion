#!/usr/bin/env python3
"""Verify the sealed hosted image before invoking Docker. Never builds an image."""
import hashlib
import json
from pathlib import Path, PurePosixPath
import re
import subprocess
import sys
import tarfile

SHA40 = re.compile(r'[a-f0-9]{40}')
SHA256 = re.compile(r'sha256:[a-f0-9]{64}')


def file_hash(path):
    value = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            value.update(chunk)
    return value.hexdigest()


def archive_json(archive, name):
    path = PurePosixPath(name)
    if path.is_absolute() or '..' in path.parts or str(path) != name:
        raise ValueError('RUNTIME_IMAGE_ARCHIVE_PATH_INVALID')
    matches = [item for item in archive.getmembers() if item.name == name]
    if len(matches) != 1 or not matches[0].isfile() or matches[0].size > 1024 * 1024:
        raise ValueError('RUNTIME_IMAGE_ARCHIVE_ENTRY_INVALID')
    data = archive.extractfile(matches[0]).read()
    return data, json.loads(data)


def verify(directory, revision):
    if not SHA40.fullmatch(revision):
        raise ValueError('RUNTIME_IMAGE_REVISION_INVALID')
    directory = Path(directory)
    manifest = json.loads((directory / 'manifest.json').read_text())
    image = manifest.get('runtimeImage', {})
    if (manifest.get('recordType') != 'aurion_traefik_runtime_artifact'
            or manifest.get('revision') != revision
            or image.get('schema') != 'aurion.hosted-runtime-image.v1'
            or image.get('sourceRevision') != revision
            or image.get('archive') != 'runtime-image.tar'
            or image.get('platform') != 'linux/amd64'
            or image.get('builtBy') != 'github-hosted-actions'
            or not SHA256.fullmatch(image.get('id', ''))):
        raise ValueError('RUNTIME_IMAGE_MANIFEST_INVALID')
    image_file = directory / image['archive']
    if image_file.is_symlink() or not image_file.is_file():
        raise ValueError('RUNTIME_IMAGE_FILE_INVALID')
    if file_hash(image_file) != manifest.get('files', {}).get(image['archive']):
        raise ValueError('RUNTIME_IMAGE_ARCHIVE_DIGEST_MISMATCH')
    with tarfile.open(image_file, 'r:') as archive:
        _, entries = archive_json(archive, 'manifest.json')
        tag = 'echoes-of-aurion:' + revision
        if not isinstance(entries, list) or len(entries) != 1 or entries[0].get('RepoTags') != [tag]:
            raise ValueError('RUNTIME_IMAGE_TAG_SET_INVALID')
        raw, config = archive_json(archive, entries[0]['Config'])
        if 'sha256:' + hashlib.sha256(raw).hexdigest() != image['id']:
            raise ValueError('RUNTIME_IMAGE_CONFIG_DIGEST_MISMATCH')
        if (config.get('os') != 'linux' or config.get('architecture') != 'amd64'
                or config.get('config', {}).get('Labels', {}).get('org.opencontainers.image.revision') != revision
                or config.get('config', {}).get('User') != 'node'):
            raise ValueError('RUNTIME_IMAGE_CONFIG_IDENTITY_MISMATCH')
    return image


def load(directory, revision):
    image = verify(directory, revision)
    subprocess.run(['docker', 'image', 'load', '--input', str(Path(directory) / image['archive'])], check=True, stdout=subprocess.DEVNULL)
    actual = json.loads(subprocess.check_output(['docker', 'image', 'inspect', 'echoes-of-aurion:' + revision], text=True))[0]
    if (actual.get('Id') != image['id'] or actual.get('Os') != 'linux' or actual.get('Architecture') != 'amd64'
            or actual.get('Config', {}).get('User') != 'node'
            or actual.get('Config', {}).get('Labels', {}).get('org.opencontainers.image.revision') != revision):
        raise ValueError('RUNTIME_IMAGE_LOADED_IDENTITY_MISMATCH')
    return image['id']


def main():
    if len(sys.argv) != 3:
        return 64
    try:
        print(load(sys.argv[1], sys.argv[2]))
        return 0
    except Exception:
        # Never expose an image configuration, environment or Docker output.
        print('RUNTIME_HOSTED_IMAGE_HANDOFF_REJECTED', file=sys.stderr)
        return 70


if __name__ == '__main__':
    sys.exit(main())
