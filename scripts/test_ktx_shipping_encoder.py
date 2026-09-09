"""Argument regressions; real compression/metadata is verified by the shipping CI."""
import unittest
import struct
from ktx_shipping_encoder import pinned_arguments
from glb_shipping_contract import ktx_encoder_parameters


class EncoderArguments(unittest.TestCase):
    def test_cpu_dependent_threads_converge_without_changing_quality_or_paths(self):
        base = ['create', '--encode', 'uastc', '--uastc-quality', '4', '--zstd', '18']
        paths = ['source image.png', 'output texture.ktx2']
        expected = ['create', '--threads', '4', *base[1:], *paths]
        for incoming in ([], ['--threads', '4'], ['--threads', '9'], ['--threads=32']):
            with self.subTest(incoming=incoming):
                self.assertEqual(pinned_arguments([*base, *incoming, *paths]), expected)

    def test_rdo_multithreading_is_disabled_only_when_rdo_is_active(self):
        base = ['create', '--uastc-rdo', 'in.png', 'out.ktx2']
        result = pinned_arguments(base)
        self.assertEqual(result.count('--uastc-rdo-m'), 1)
        self.assertEqual(pinned_arguments(result), result)
        self.assertNotIn('--uastc-rdo-m', pinned_arguments(['create', 'in.png', 'out.ktx2']))

    def test_bad_or_duplicate_thread_parameters_are_rejected(self):
        for incoming in (['--threads'], ['--threads', '0'], ['--threads=x'], ['--threads', '-1'], ['--threads', '4', '--threads=9']):
            with self.subTest(incoming=incoming), self.assertRaises(ValueError):
                pinned_arguments(['create', *incoming])

    def test_version_is_native_and_other_commands_are_rejected(self):
        self.assertEqual(pinned_arguments(['--version']), ['--version'])
        for args in ([], ['extract'], ['--help']):
            with self.assertRaises(ValueError):
                pinned_arguments(args)

    def test_encoder_metadata_is_read_from_bytes_and_rejects_truncation(self):
        # Explicit parser fixture, never a shipping or runtime success receipt.
        header = bytearray(80); header[:12] = b'\xabKTX 20\xbb\r\n\x1a\n'
        entry = b'KTXwriterScParams\0--threads 4 --qlevel 255\0'
        kv = struct.pack('<I', len(entry)) + entry + b'\0' * (-len(entry) % 4)
        struct.pack_into('<II', header, 56, 80, len(kv))
        self.assertEqual(ktx_encoder_parameters(bytes(header)+kv), '--threads 4 --qlevel 255')
        for invalid in (b'', bytes(header), bytes(header)+kv[:-1]):
            with self.assertRaises(ValueError): ktx_encoder_parameters(invalid)


if __name__ == '__main__':
    unittest.main()
