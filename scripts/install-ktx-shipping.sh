#!/usr/bin/env bash
set -euo pipefail
destination="${1:?Provide an isolated toolchain directory}"
test "$(uname -sm)" = "Linux x86_64"
mkdir -p "$destination"
archive="$destination/ktx-4.4.2.tar.bz2"
curl --fail --location --retry 3 --output "$archive" https://github.com/KhronosGroup/KTX-Software/releases/download/v4.4.2/KTX-Software-4.4.2-Linux-x86_64.tar.bz2
printf '%s  %s\n' a8781bad05f9624edbf910b7f258cd0a4ba7d3e63b49ecc0a0ab440bf6a0a245 "$archive" | sha256sum --check --strict
tar -xjf "$archive" -C "$destination"
"$destination/KTX-Software-4.4.2-Linux-x86_64/bin/toktx" --version
