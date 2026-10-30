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
OCI_INDEX = 'application/vnd.oci.image.index.v1+json'
OCI_MANIFEST = 'application/vnd.oci.image.manifest.v1+json'
OCI_CONFIG = 'application/vnd.oci.image.config.v1+json'


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
        config_digest = 'sha256:' + hashlib.sha256(raw).hexdigest()
        if (config.get('os') != 'linux' or config.get('architecture') != 'amd64'
                or config.get('config', {}).get('Labels', {}).get('org.opencontainers.image.revision') != revision
                or config.get('config', {}).get('User') != 'node'):
            raise ValueError('RUNTIME_IMAGE_CONFIG_IDENTITY_MISMATCH')
        descriptor = None
        # Classic Docker exposes the config digest as Id; the containerd store
        # exposes its OCI target digest. Bind both through the sealed archive,
        # rather than accepting an arbitrary Id carrying the same source label.
        if any(member.name == 'index.json' for member in archive.getmembers()):
            _, index = archive_json(archive, 'index.json')
            targets = index.get('manifests')
            if (index.get('schemaVersion') != 2 or index.get('mediaType') != OCI_INDEX
                    or not isinstance(targets, list) or len(targets) != 1):
                raise ValueError('RUNTIME_IMAGE_OCI_INDEX_INVALID')
            target = targets[0]
            digest = target.get('digest', '')
            if (target.get('mediaType') != OCI_MANIFEST or not SHA256.fullmatch(digest)
                    or type(target.get('size')) is not int or not 0 < target['size'] <= 1024 * 1024):
                raise ValueError('RUNTIME_IMAGE_OCI_DESCRIPTOR_INVALID')
            manifest_raw, oci = archive_json(archive, 'blobs/sha256/' + digest.removeprefix('sha256:'))
            if len(manifest_raw) != target['size'] or 'sha256:' + hashlib.sha256(manifest_raw).hexdigest() != digest:
                raise ValueError('RUNTIME_IMAGE_OCI_MANIFEST_DIGEST_MISMATCH')
            config_descriptor = oci.get('config', {})
            if (oci.get('schemaVersion') != 2 or oci.get('mediaType') != OCI_MANIFEST
                    or entries[0]['Config'] != 'blobs/sha256/' + config_digest.removeprefix('sha256:')
                    or config_descriptor.get('mediaType') != OCI_CONFIG
                    or config_descriptor.get('digest') != config_digest
                    or type(config_descriptor.get('size')) is not int or config_descriptor['size'] != len(raw)):
                raise ValueError('RUNTIME_IMAGE_OCI_CONFIG_BINDING_MISMATCH')
            descriptor = {key: target[key] for key in ('mediaType', 'digest', 'size')}
        if image['id'] not in {config_digest, descriptor['digest'] if descriptor else config_digest}:
            raise ValueError('RUNTIME_IMAGE_CONFIG_DIGEST_MISMATCH')
    return {**image, 'verifiedConfigDigest': config_digest, 'verifiedManifestDescriptor': descriptor}


def inspect_verified(image, revision):
    actual = json.loads(subprocess.check_output(['docker', 'image', 'inspect', 'echoes-of-aurion:' + revision], text=True))[0]
    descriptor = image['verifiedManifestDescriptor']
    actual_descriptor = actual.get('Descriptor')
    config_identity = actual.get('Id') == image['verifiedConfigDigest']
    manifest_identity = (descriptor is not None and actual.get('Id') == descriptor['digest']
                         and isinstance(actual_descriptor, dict)
                         and all(actual_descriptor.get(key) == value for key, value in descriptor.items()))
    if (not (config_identity or manifest_identity) or actual.get('Os') != 'linux' or actual.get('Architecture') != 'amd64'
            or actual.get('Config', {}).get('User') != 'node'
            or actual.get('Config', {}).get('Labels', {}).get('org.opencontainers.image.revision') != revision):
        raise ValueError('RUNTIME_IMAGE_LOADED_IDENTITY_MISMATCH')
    return actual['Id']


def inspect_loaded(directory, revision):
    """Read-only identity proof for neighboring readbacks; never imports images."""
    return inspect_verified(verify(directory, revision), revision)


def load(directory, revision):
    image = verify(directory, revision)
    subprocess.run(['docker', 'image', 'load', '--input', str(Path(directory) / image['archive'])], check=True, stdout=subprocess.DEVNULL)
    return inspect_verified(image, revision)


def main():
    if len(sys.argv) not in (3, 4) or (len(sys.argv) == 4 and sys.argv[3] != '--inspect-loaded'):
        return 64
    try:
        operation = inspect_loaded if len(sys.argv) == 4 else load
        print(operation(sys.argv[1], sys.argv[2]))
        return 0
    except Exception:
        # Never expose an image configuration, environment or Docker output.
        print('RUNTIME_HOSTED_IMAGE_HANDOFF_REJECTED', file=sys.stderr)
        return 70


if __name__ == '__main__':
    sys.exit(main())
