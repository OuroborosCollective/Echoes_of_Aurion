#!/usr/bin/env python3
"""Private license-aware staging; never commit or share the purchased package."""
import argparse, hashlib, json, os, shutil, stat, tempfile
from pathlib import Path
from zipfile import ZipFile

EXPECTED = "ac72db1a5ff6985e19f1c07e4d1404560684f07aa7b9268382be8bcd2c635788"
PREFIX = "ModularCharacterSystem/addons/modular_character_system/"
REQUIRED = (
    "LICENSE.txt", "README.md", "VERSION", "plugin.cfg",
    "Animation/ModularAnimationCharacter.gd", "Animation/ModularAnimationCharacter.tscn",
    "Customization/ModularCharacterAppearance.gd",
    "Assets/Models/BaseMale.gltf", "Assets/Models/BaseFemale.gltf",
)

def digest(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()

def install(archive_path, project_path, expected=EXPECTED):
    archive_path, project_path = Path(archive_path).resolve(strict=True), Path(project_path).resolve()
    if not (project_path / "project.godot").is_file():
        raise ValueError("project.godot missing")
    actual = digest(archive_path)
    if actual != expected:
        raise ValueError("archive hash mismatch")
    with ZipFile(archive_path) as archive:
        infos = archive.infolist()
        if len(infos) > 400:
            raise ValueError("unexpected archive entries")
        members, seen, total = [], set(), 0
        for info in infos:
            name = info.filename
            parts = name.rstrip("/").split("/")
            if (name.startswith("/") or "\\" in name or any(p in ("", ".", "..") for p in parts)):
                raise ValueError("unsafe path in purchased archive")
            if stat.S_IFMT(info.external_attr >> 16) == stat.S_IFLNK:
                raise ValueError("symlink in purchased archive")
            if info.is_dir():
                if not (PREFIX.startswith(name) or name.startswith(PREFIX)):
                    raise ValueError("unexpected archive directory")
                continue
            if stat.S_IFMT(info.external_attr >> 16) not in (0, stat.S_IFREG):
                raise ValueError("unsafe archive entry")
            if not name.startswith(PREFIX):
                raise ValueError("unexpected archive member")
            rel = name[len(PREFIX):]
            if rel.casefold() in seen:
                raise ValueError("duplicate case-insensitive path")
            seen.add(rel.casefold())
            total += info.file_size
            if total > 140 * 1024 * 1024:
                raise ValueError("archive is too large")
            members.append((info, rel))
        if not all(item.casefold() in seen for item in REQUIRED):
            raise ValueError("missing required MCS 1.0 file")
        if archive.read(PREFIX + "VERSION").decode().strip() != "1.0.0":
            raise ValueError("incorrect MCS version")
        if "imp0str.dev Modular Character System License" not in archive.read(PREFIX + "LICENSE.txt").decode():
            raise ValueError("incorrect MCS license")
        target = project_path / "addons" / "modular_character_system"
        if target.parent.is_symlink() or target.is_symlink():
            raise ValueError("unsafe addons path")
        receipt = {"version": "1.0.0", "sha256": actual, "count": len(members)}
        if target.exists():
            if not (target / ".aurion-mcs-install.json").is_file():
                raise ValueError("unmanaged existing addon")
            if json.loads((target / ".aurion-mcs-install.json").read_text()) != receipt:
                raise ValueError("existing addon receipt mismatch")
            for info, rel in members:
                f = target / rel
                if f.is_symlink() or not f.is_file() or hashlib.sha256(f.read_bytes()).digest() != hashlib.sha256(archive.read(info)).digest():
                    raise ValueError("existing addon differs from purchased archive")
            return receipt
        target.parent.mkdir(parents=True, exist_ok=True)
        stage = Path(tempfile.mkdtemp(prefix=".mcs-stage-", dir=target.parent))
        try:
            for info, rel in members:
                dest = stage / rel
                dest.parent.mkdir(parents=True, exist_ok=True)
                with archive.open(info) as src, dest.open("wb") as out:
                    shutil.copyfileobj(src, out)
            (stage / ".aurion-mcs-install.json").write_text(json.dumps(receipt, sort_keys=True))
            os.replace(stage, target)
        finally:
            if stage.exists():
                shutil.rmtree(stage)
        return receipt

if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--archive", required=True)
    p.add_argument("--project", default=str(Path(__file__).resolve().parents[2] / "godot-client"))
    args = p.parse_args()
    print(json.dumps(install(args.archive, args.project), sort_keys=True))
