#!/usr/bin/env python3
"""Secret-safe host preflight and independent container binding readback."""
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import sys

TOKEN = Path('/etc/aurion-godot/feed.token')


def preflight():
    parent = TOKEN.parent.lstat()
    info = TOKEN.lstat()
    if (not stat.S_ISDIR(parent.st_mode) or parent.st_uid != 0 or parent.st_gid != 0 or stat.S_IMODE(parent.st_mode) != 0o750
            or not stat.S_ISREG(info.st_mode) or info.st_nlink != 1 or info.st_uid != 0 or info.st_gid != 1000
            or stat.S_IMODE(info.st_mode) != 0o440):
        raise ValueError('GODOT_FEED_PROTECTED_FILE_REQUIRED')
    fd = os.open(TOKEN, os.O_RDONLY | os.O_NOFOLLOW)
    with os.fdopen(fd, 'rb') as stream:
        opened = os.fstat(stream.fileno())
        if (opened.st_dev, opened.st_ino) != (info.st_dev, info.st_ino):
            raise ValueError('GODOT_FEED_FILE_CHANGED')
        value = stream.read(258)
    if not re.fullmatch(rb'[A-Za-z0-9_-]{32,256}\n?', value):
        raise ValueError('GODOT_FEED_TOKEN_INVALID')
    editor = TOKEN.parent / 'editor.token'
    info = editor.lstat()
    if (not stat.S_ISREG(info.st_mode) or info.st_nlink != 1 or info.st_uid != 0
            or info.st_gid != 0 or stat.S_IMODE(info.st_mode) != 0o600):
        raise ValueError('GODOT_EDITOR_PROTECTED_FILE_REQUIRED')
    fd = os.open(editor, os.O_RDONLY | os.O_NOFOLLOW)
    with os.fdopen(fd, 'rb') as stream:
        opened = os.fstat(stream.fileno())
        if (opened.st_dev, opened.st_ino) != (info.st_dev, info.st_ino):
            raise ValueError('GODOT_EDITOR_FILE_CHANGED')
        editor_value = stream.read(258)
    if not re.fullmatch(rb'[A-Za-z0-9_-]{32,256}\n?', editor_value) or editor_value.strip() == value.strip():
        raise ValueError('GODOT_EDITOR_TOKEN_INVALID')


def readback(container, enabled, revision):
    if not re.fullmatch(r'[a-f0-9]{64}', container) or not re.fullmatch(r'[a-f0-9]{40}', revision):
        raise ValueError('GODOT_FEED_READBACK_INPUT_INVALID')
    actual = json.loads(subprocess.check_output(['docker', 'inspect', container], text=True))[0]
    env = dict(item.split('=', 1) for item in actual['Config']['Env'] if '=' in item)
    bindings = (actual['HostConfig'].get('PortBindings') or {}).get('39220/tcp') or []
    mounts = [item for item in actual['Mounts'] if item.get('Destination') == '/run/secrets/aurion-godot-feed.token']
    if actual['Config'].get('Labels', {}).get('org.opencontainers.image.revision') != revision:
        raise ValueError('GODOT_FEED_SOURCE_MISMATCH')
    if enabled:
        preflight()
        if (env.get('AURION_GODOT_FEED_TOKEN_FILE') != '/run/secrets/aurion-godot-feed.token'
                or env.get('AURION_GODOT_FEED_BIND') != '0.0.0.0' or env.get('AURION_GODOT_FEED_PORT') != '39220'
                or bindings != [{'HostIp': '127.0.0.1', 'HostPort': '39220'}]
                or len(mounts) != 1 or mounts[0].get('Type') != 'bind' or mounts[0].get('Source') != str(TOKEN)
                or mounts[0].get('RW') is not False):
            raise ValueError('GODOT_FEED_CONTAINER_BINDING_MISMATCH')
    elif env.get('AURION_GODOT_FEED_TOKEN_FILE') or bindings or mounts:
        raise ValueError('GODOT_FEED_DISABLED_BINDING_MISMATCH')
    return {'schema': 'aurion.godot.feed-installation.v1', 'sourceRevision': revision,
            'containerId': container, 'enabled': enabled, 'loopbackOnly': True,
            'editHandler': False, 'productionWorldEvidence': False, 'secretValuesReturned': False}


if __name__ == '__main__':
    try:
        if sys.argv[1:] == ['preflight']:
            preflight()
        elif len(sys.argv) == 5 and sys.argv[1] == 'readback' and sys.argv[3] in ['0', '1']:
            print(json.dumps(readback(sys.argv[2], sys.argv[3] == '1', sys.argv[4]), sort_keys=True))
        else:
            sys.exit(64)
    except Exception:
        print('GODOT_FEED_INSTALLATION_UNVERIFIED', file=sys.stderr)
        sys.exit(70)
