#!/usr/bin/env python3
"""Verify the sealed hosted image before invoking Docker. Never builds an image."""
import gzip
import hashlib
import json
from pathlib import Path, PurePosixPath
import re
import subprocess
import sys
import tarfile

SHA40 = re.compile(r'[a-f0-9]{40}')
SHA256 = re.compile(r'sha256:[a-f0-9]{64}')
V1 = 'aurion.hosted-runtime-image.v1'
V2 = 'aurion.hosted-runtime-image.v2'
OCI_INDEX = 'application/vnd.oci.image.index.v1+json'
MANIFEST_CONFIG_TYPES = {
    'application/vnd.oci.image.manifest.v1+json': 'application/vnd.oci.image.config.v1+json',
    'application/vnd.docker.distribution.manifest.v2+json': 'application/vnd.docker.container.image.v1+json',
}
TAR_LAYERS = {'application/vnd.oci.image.layer.v1.tar', 'application/vnd.docker.image.rootfs.diff.tar'}
GZIP_LAYERS = {'application/vnd.oci.image.layer.v1.tar+gzip', 'application/vnd.docker.image.rootfs.diff.tar.gzip'}
MAX_UNCOMPRESSED_BYTES = 16 * 1024 ** 3


def stream_hash(stream, limit=None):
    value = hashlib.sha256()
    size = 0
    for chunk in iter(lambda: stream.read(1024 * 1024), b''):
        size += len(chunk)
        if limit is not None and size > limit:
            raise ValueError('RUNTIME_IMAGE_LAYER_LIMIT_EXCEEDED')
        value.update(chunk)
    return 'sha256:' + value.hexdigest(), size


def file_hash(path):
    with path.open('rb') as stream:
        return stream_hash(stream)[0].removeprefix('sha256:')


def archive_json(archive, name):
    path = PurePosixPath(name)
    if path.is_absolute() or '..' in path.parts or str(path) != name:
        raise ValueError('RUNTIME_IMAGE_ARCHIVE_PATH_INVALID')
    matches = [item for item in archive.getmembers() if item.name == name]
    if len(matches) != 1 or not matches[0].isfile() or matches[0].size > 1024 * 1024:
        raise ValueError('RUNTIME_IMAGE_ARCHIVE_ENTRY_INVALID')
    data = archive.extractfile(matches[0]).read()
    return data, json.loads(data)


def config_identity(config, revision):
    if (config.get('os') != 'linux' or config.get('architecture') != 'amd64'
            or config.get('config', {}).get('Labels', {}).get('org.opencontainers.image.revision') != revision
            or config.get('config', {}).get('User') != 'node'):
        raise ValueError('RUNTIME_IMAGE_CONFIG_IDENTITY_MISMATCH')


def docker_manifest(archive, revision):
    _, entries = archive_json(archive, 'manifest.json')
    if not isinstance(entries, list) or len(entries) != 1 or entries[0].get('RepoTags') != ['echoes-of-aurion:' + revision]:
        raise ValueError('RUNTIME_IMAGE_TAG_SET_INVALID')
    return entries[0]


def checked_members(archive):
    members = {}
    for member in archive.getmembers():
        name = member.name.rstrip('/') if member.isdir() else member.name
        path = PurePosixPath(name)
        if (path.is_absolute() or '..' in path.parts or str(path) != name
                or name in members or not (member.isfile() or member.isdir())):
            raise ValueError('RUNTIME_IMAGE_OCI_ARCHIVE_ENTRY_INVALID')
        members[name] = member
    return members


def blob(archive, members, descriptor):
    digest = descriptor.get('digest', '')
    if (not isinstance(digest, str) or not SHA256.fullmatch(digest)
            or type(descriptor.get('size')) is not int or descriptor['size'] < 0):
        raise ValueError('RUNTIME_IMAGE_OCI_DESCRIPTOR_INVALID')
    name = 'blobs/sha256/' + digest.removeprefix('sha256:')
    member = members.get(name)
    if member is None or not member.isfile() or member.size != descriptor['size']:
        raise ValueError('RUNTIME_IMAGE_OCI_BLOB_SIZE_MISMATCH')
    with archive.extractfile(member) as stream:
        actual, size = stream_hash(stream)
    if actual != digest or size != descriptor['size']:
        raise ValueError('RUNTIME_IMAGE_OCI_BLOB_DIGEST_MISMATCH')
    return name


def json_blob(archive, members, descriptor):
    if type(descriptor.get('size')) is not int or not 0 < descriptor['size'] <= 1024 * 1024:
        raise ValueError('RUNTIME_IMAGE_OCI_JSON_SIZE_INVALID')
    name = blob(archive, members, descriptor)
    return archive_json(archive, name)[1]


def oci_identity(archive, revision):
    members = checked_members(archive)
    _, layout = archive_json(archive, 'oci-layout')
    _, index = archive_json(archive, 'index.json')
    targets = index.get('manifests')
    if (layout != {'imageLayoutVersion': '1.0.0'} or index.get('schemaVersion') != 2
            or index.get('mediaType') != OCI_INDEX or not isinstance(targets, list) or len(targets) != 1):
        raise ValueError('RUNTIME_IMAGE_OCI_INDEX_INVALID')
    target = targets[0]
    media_type = target.get('mediaType')
    annotations = target.get('annotations', {})
    if (media_type not in MANIFEST_CONFIG_TYPES
            or annotations.get('org.opencontainers.image.ref.name') != revision
            or annotations.get('io.containerd.image.name') != 'docker.io/library/echoes-of-aurion:' + revision):
        raise ValueError('RUNTIME_IMAGE_OCI_TARGET_INVALID')
    manifest = json_blob(archive, members, target)
    if manifest.get('schemaVersion') != 2 or manifest.get('mediaType') != media_type:
        raise ValueError('RUNTIME_IMAGE_OCI_MANIFEST_INVALID')
    descriptor = manifest.get('config', {})
    if descriptor.get('mediaType') != MANIFEST_CONFIG_TYPES[media_type]:
        raise ValueError('RUNTIME_IMAGE_OCI_CONFIG_TYPE_INVALID')
    config = json_blob(archive, members, descriptor)
    config_identity(config, revision)
    compatibility = docker_manifest(archive, revision)
    if compatibility.get('Config') != 'blobs/sha256/' + descriptor['digest'].removeprefix('sha256:'):
        raise ValueError('RUNTIME_IMAGE_OCI_CONFIG_BINDING_MISMATCH')
    layers = manifest.get('layers')
    diff_ids = config.get('rootfs', {}).get('diff_ids')
    compatibility_layers = compatibility.get('Layers')
    if (config.get('rootfs', {}).get('type') != 'layers' or not isinstance(layers, list)
            or not isinstance(diff_ids, list) or not isinstance(compatibility_layers, list)
            or len(layers) != len(diff_ids) or len(layers) != len(compatibility_layers)
            or any(not isinstance(value, str) or not SHA256.fullmatch(value) for value in diff_ids)):
        raise ValueError('RUNTIME_IMAGE_OCI_LAYER_SET_INVALID')
    total = 0
    for layer, expected_diff, compatibility_path in zip(layers, diff_ids, compatibility_layers):
        kind = layer.get('mediaType')
        if kind not in TAR_LAYERS | GZIP_LAYERS:
            raise ValueError('RUNTIME_IMAGE_OCI_LAYER_TYPE_INVALID')
        name = blob(archive, members, layer)
        with archive.extractfile(members[name]) as stream:
            if kind in GZIP_LAYERS:
                with gzip.GzipFile(fileobj=stream) as decoded:
                    diff, size = stream_hash(decoded, MAX_UNCOMPRESSED_BYTES - total)
            else:
                diff, size = stream_hash(stream, MAX_UNCOMPRESSED_BYTES - total)
        total += size
        if diff != expected_diff:
            raise ValueError('RUNTIME_IMAGE_OCI_LAYER_ORDER_MISMATCH')
        if compatibility_path != name:
            expected_path = 'blobs/sha256/' + expected_diff.removeprefix('sha256:')
            member = members.get(expected_path)
            if compatibility_path != expected_path or member is None or not member.isfile():
                raise ValueError('RUNTIME_IMAGE_OCI_COMPATIBILITY_LAYER_MISMATCH')
            with archive.extractfile(member) as stream:
                compatible_diff, _ = stream_hash(stream, MAX_UNCOMPRESSED_BYTES)
            if compatible_diff != expected_diff:
                raise ValueError('RUNTIME_IMAGE_OCI_COMPATIBILITY_LAYER_MISMATCH')
    return {'id': target['digest'], 'configDigest': descriptor['digest'],
            'descriptor': {key: target[key] for key in ('mediaType', 'digest', 'size')},
            'diffIds': diff_ids}


def describe_oci(directory, revision):
    if not SHA40.fullmatch(revision):
        raise ValueError('RUNTIME_IMAGE_REVISION_INVALID')
    image_file = Path(directory) / 'runtime-image.tar'
    if image_file.is_symlink() or not image_file.is_file():
        raise ValueError('RUNTIME_IMAGE_FILE_INVALID')
    with tarfile.open(image_file, 'r:') as archive:
        identity = oci_identity(archive, revision)
    return {key: identity[key] for key in ('id', 'configDigest')}


def verify(directory, revision):
    if not SHA40.fullmatch(revision):
        raise ValueError('RUNTIME_IMAGE_REVISION_INVALID')
    directory = Path(directory)
    manifest = json.loads((directory / 'manifest.json').read_text())
    image = manifest.get('runtimeImage', {})
    if (manifest.get('recordType') != 'aurion_traefik_runtime_artifact'
            or manifest.get('revision') != revision or image.get('schema') not in (V1, V2)
            or image.get('sourceRevision') != revision or image.get('archive') != 'runtime-image.tar'
            or image.get('platform') != 'linux/amd64' or image.get('builtBy') != 'github-hosted-actions'
            or not SHA256.fullmatch(image.get('id', ''))):
        raise ValueError('RUNTIME_IMAGE_MANIFEST_INVALID')
    image_file = directory / image['archive']
    if image_file.is_symlink() or not image_file.is_file():
        raise ValueError('RUNTIME_IMAGE_FILE_INVALID')
    if file_hash(image_file) != manifest.get('files', {}).get(image['archive']):
        raise ValueError('RUNTIME_IMAGE_ARCHIVE_DIGEST_MISMATCH')
    with tarfile.open(image_file, 'r:') as archive:
        if image['schema'] == V1:
            entry = docker_manifest(archive, revision)
            raw, config = archive_json(archive, entry['Config'])
            if 'sha256:' + hashlib.sha256(raw).hexdigest() != image['id']:
                raise ValueError('RUNTIME_IMAGE_CONFIG_DIGEST_MISMATCH')
            config_identity(config, revision)
            return image
        identity = oci_identity(archive, revision)
        if image['id'] != identity['id'] or image.get('configDigest') != identity['configDigest']:
            raise ValueError('RUNTIME_IMAGE_OCI_IDENTITY_MISMATCH')
        return {**image, 'verifiedDescriptor': identity['descriptor'], 'verifiedDiffIds': identity['diffIds']}


def load(directory, revision):
    image = verify(directory, revision)
    subprocess.run(['docker', 'image', 'load', '--input', str(Path(directory) / image['archive'])], check=True, stdout=subprocess.DEVNULL)
    actual = json.loads(subprocess.check_output(['docker', 'image', 'inspect', 'echoes-of-aurion:' + revision], text=True))[0]
    if (actual.get('Id') != image['id'] or actual.get('Os') != 'linux' or actual.get('Architecture') != 'amd64'
            or actual.get('Config', {}).get('User') != 'node'
            or actual.get('Config', {}).get('Labels', {}).get('org.opencontainers.image.revision') != revision):
        raise ValueError('RUNTIME_IMAGE_LOADED_IDENTITY_MISMATCH')
    if image['schema'] == V2:
        descriptor = actual.get('Descriptor')
        if (not isinstance(descriptor, dict) or any(descriptor.get(key) != value for key, value in image['verifiedDescriptor'].items())
                or actual.get('RootFS', {}).get('Type') != 'layers'
                or actual.get('RootFS', {}).get('Layers') != image['verifiedDiffIds']):
            raise ValueError('RUNTIME_IMAGE_LOADED_IDENTITY_MISMATCH')
    return image['id']


def main():
    if len(sys.argv) == 4 and sys.argv[1] == '--describe-oci':
        try:
            print(json.dumps(describe_oci(sys.argv[2], sys.argv[3])))
            return 0
        except Exception:
            print('RUNTIME_HOSTED_IMAGE_HANDOFF_REJECTED', file=sys.stderr)
            return 70
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
