#!/usr/bin/env python3
"""Pin real KTX invocation parameters before encoding, without editing output bytes."""
from __future__ import annotations

import os
from pathlib import Path
import sys

KTX_THREADS = 4


def pinned_arguments(arguments):
    if arguments == ['--version']:
        return arguments
    if not arguments or arguments[0] != 'create':
        raise ValueError('KTX_SHIPPING_CREATE_ONLY')
    result = []
    index = 0
    seen_threads = False
    while index < len(arguments):
        arg = arguments[index]
        if arg == '--threads' or arg.startswith('--threads='):
            if seen_threads:
                raise ValueError('KTX_DUPLICATE_THREADS')
            seen_threads = True
            if arg == '--threads':
                index += 1
                value = arguments[index] if index < len(arguments) else ''
            else:
                value = arg.split('=', 1)[1]
            if not value.isascii() or not value.isdecimal() or int(value) < 1:
                raise ValueError('KTX_INVALID_THREADS')
        else:
            result.append(arg)
        index += 1
    # KTX accepts options before the two positional image/output paths.
    result[1:1] = ['--threads', str(KTX_THREADS)]
    if '--uastc-rdo' in result and '--uastc-rdo-m' not in result:
        result.insert(3, '--uastc-rdo-m')
    return result


def main():
    native = Path(os.environ['AURION_KTX_EXECUTABLE'])
    if not native.is_absolute() or not native.is_file() or native.resolve() == Path(__file__).resolve():
        raise ValueError('KTX_NATIVE_EXECUTABLE_REQUIRED')
    arguments = pinned_arguments(sys.argv[1:])
    # Replace this process: preserve the actual encoder's output and exit status.
    os.execv(str(native), [str(native), *arguments])


if __name__ == '__main__':
    main()
