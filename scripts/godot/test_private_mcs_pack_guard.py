"""Synthetic hostile PCK fixtures; these do not represent a private runtime."""
import hashlib
import struct
import unittest

from private_mcs_pack_guard import assert_compatible_overlay, inspect_pck, strip_and_validate_vendor_pack


def uid_cache(entries):
    parts = [struct.pack("<I", len(entries))]
    for uid, path in entries:
        raw = path.encode()
        parts += [struct.pack("<QI", uid, len(raw)), raw]
    return b"".join(parts)


def class_cache(name):
    return ('list=[{"class": &"' + name + '"}]').encode()


def pack(entries):
    body = bytearray(b"\0" * 112)
    records = []
    for name, content in entries:
        offset = len(body) - 112
        body.extend(content)
        raw = name.encode()
        raw += b"\0" * ((-len(raw)) % 4)
        records.append(struct.pack("<I", len(raw)) + raw + struct.pack("<QQ16sI", offset, len(content), # Godot PCK v4 requires this MD5 field; the fixture bytes are synthetic, not sensitive.
        hashlib.md5(content, usedforsecurity=False).digest(), 0))
    directory = len(body)
    body.extend(struct.pack("<I", len(records)))
    for record in records:
        body.extend(record)
    struct.pack_into("<4sIIIIIQQ", body, 0, b"GDPC", 4, 4, 7, 2, 2, 112, directory)
    return bytes(body)


def vendor():
    return [
        ("project.binary", b"project"),
        (".godot/global_script_class_cache.cfg", class_cache("VendorClass")),
        (".godot/uid_cache.bin", uid_cache([(1, "res://addons/modular_character_system/a.gd")])),
        ("addons/modular_character_system/a.gd.remap", b"vendor fixture"),
        (".godot/imported/a.scn", b"import fixture"),
    ]


def host():
    return [
        ("project.binary", b"host"),
        (".godot/global_script_class_cache.cfg", class_cache("HostClass")),
        (".godot/uid_cache.bin", uid_cache([(2, "res://actors/a.gd")])),
        ("actors/a.gd", b"host fixture"),
    ]


class GuardTest(unittest.TestCase):
    def test_accepts_isolated_vendor_and_removes_project_settings(self):
        result = strip_and_validate_vendor_pack(pack(vendor()))
        self.assertNotIn("project.binary", inspect_pck(result)["entries"])
        assert_compatible_overlay(result, pack(host()))

    def test_rejects_changed_pck_entry_and_bad_namespace(self):
        original = bytearray(pack(vendor()))
        original[112] ^= 1
        with self.assertRaisesRegex(ValueError, "PCK_ENTRY_INTEGRITY"):
            inspect_pck(bytes(original))
        with self.assertRaisesRegex(ValueError, "PCK_UNEXPECTED_NAMESPACE"):
            strip_and_validate_vendor_pack(pack(vendor() + [("actors/attack.gd", b"x")]))

    def test_rejects_path_class_and_uid_collisions(self):
        v = strip_and_validate_vendor_pack(pack(vendor()))
        with self.assertRaisesRegex(ValueError, "OVERLAY_PATH_COLLISION"):
            assert_compatible_overlay(v, pack(host() + [(".godot/imported/a.scn", b"host")]))
        bad_class = [(n, class_cache("VendorClass") if n.endswith("global_script_class_cache.cfg") else c) for n, c in host()]
        with self.assertRaisesRegex(ValueError, "OVERLAY_CLASS_COLLISION"):
            assert_compatible_overlay(v, pack(bad_class))
        bad_uid = [(n, uid_cache([(1, "res://actors/a.gd")]) if n.endswith("uid_cache.bin") else c) for n, c in host()]
        with self.assertRaisesRegex(ValueError, "OVERLAY_UID_COLLISION"):
            assert_compatible_overlay(v, pack(bad_uid))

    def test_rejects_duplicate_paths_and_invalid_header(self):
        with self.assertRaisesRegex(ValueError, "PCK_DUPLICATE_PATH"):
            inspect_pck(pack(host() + [("ACTORS/A.GD", b"x")]))
        raw = bytearray(pack(host()))
        raw[4] = 3
        with self.assertRaisesRegex(ValueError, "PCK_HEADER_INVALID"):
            inspect_pck(bytes(raw))

    def test_rejects_traversal_and_truncated_directory(self):
        with self.assertRaisesRegex(ValueError, "PCK_PATH_INVALID"):
            inspect_pck(pack(host() + [("addons/../actors/attack", b"x")]))
        with self.assertRaisesRegex(ValueError, "PCK_ENTRY_TRUNCATED"):
            inspect_pck(pack(host())[:-1])


if __name__ == "__main__":
    unittest.main()
