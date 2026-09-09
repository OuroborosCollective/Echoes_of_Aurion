"""Byte-level shipping audit. Asset metadata never authorizes gameplay changes."""
from __future__ import annotations
import hashlib, json, struct
from pathlib import Path

VERSION = 'aurion-glb-shipping.v1'
def sha(data: bytes) -> str: return hashlib.sha256(data).hexdigest()
def canonical(value) -> bytes: return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode()

def read_glb(path: Path):
    data = path.read_bytes()
    if len(data) < 28 or data[:4] != b'glTF': raise ValueError('GLB_MAGIC')
    version, size, length, kind = struct.unpack_from('<IIII', data, 4)
    if version != 2 or size != len(data) or kind != 0x4e4f534a or length % 4 or 20 + length + 8 > size: raise ValueError('GLB_HEADER')
    doc = json.loads(data[20:20+length])
    bin_size, bin_kind = struct.unpack_from('<II', data, 20+length)
    binary = data[28+length:]
    if bin_kind != 0x004e4942 or len(binary) != bin_size: raise ValueError('GLB_BIN')
    if any('uri' in b for b in doc.get('buffers', [])): raise ValueError('GLB_EXTERNAL_BUFFER')
    return data, doc, binary

def image_dimensions(data: bytes, mime: str):
    if mime == 'image/ktx2' and data[:12] == b'\xabKTX 20\xbb\r\n\x1a\n':
        return struct.unpack_from('<II', data, 20)
    if mime == 'image/png' and data[:8] == b'\x89PNG\r\n\x1a\n':
        return struct.unpack_from('>II', data, 16)
    if mime == 'image/webp' and data[:4] == b'RIFF' and data[8:12] == b'WEBP':
        offset = 12
        while offset + 8 <= len(data):
            kind, size = data[offset:offset+4], struct.unpack_from('<I', data, offset+4)[0]
            body = data[offset+8:offset+8+size]
            if kind == b'VP8X': return int.from_bytes(body[4:7], 'little')+1, int.from_bytes(body[7:10], 'little')+1
            if kind == b'VP8L' and body[0] == 0x2f:
                bits = int.from_bytes(body[1:5], 'little'); return (bits & 0x3fff)+1, ((bits >> 14) & 0x3fff)+1
            if kind == b'VP8 ' and body[3:6] == b'\x9d\x01\x2a':
                w, h = struct.unpack_from('<HH', body, 6); return w & 0x3fff, h & 0x3fff
            offset += 8 + size + size % 2
    if mime == 'image/jpeg' and data[:2] == b'\xff\xd8':
        offset = 2
        while offset + 4 <= len(data):
            if data[offset] != 255: raise ValueError('JPEG_MARKER')
            marker = data[offset+1]; size = int.from_bytes(data[offset+2:offset+4], 'big')
            if marker in (0xc0, 0xc1, 0xc2):
                h, w = struct.unpack_from('>HH', data, offset+5); return w, h
            if size < 2: break
            offset += 2 + size
    raise ValueError('SHIPPING_IMAGE_FORMAT_UNSUPPORTED')

def ktx_encoder_parameters(data: bytes):
    if len(data) < 80 or data[:12] != b'\xabKTX 20\xbb\r\n\x1a\n': raise ValueError('KTX_HEADER')
    offset, length = struct.unpack_from('<II', data, 56)
    end = offset + length
    if offset < 80 or end > len(data): raise ValueError('KTX_METADATA_BOUNDS')
    entries = {}
    while offset < end:
        if offset + 4 > end: raise ValueError('KTX_METADATA_BOUNDS')
        size = struct.unpack_from('<I', data, offset)[0]; offset += 4
        if not size or offset + size > end: raise ValueError('KTX_METADATA_BOUNDS')
        key, separator, value = data[offset:offset+size].partition(b'\0')
        if not separator or key in entries: raise ValueError('KTX_METADATA_KEY')
        entries[key] = value.rstrip(b'\0')
        offset += (size + 3) & ~3
        if offset > end: raise ValueError('KTX_METADATA_BOUNDS')
    if b'KTXwriterScParams' not in entries: raise ValueError('KTX_ENCODER_PARAMETERS_REQUIRED')
    return entries[b'KTXwriterScParams'].decode('ascii')

def audit_glb(path: Path, ceiling: int):
    data, doc, binary = read_glb(path)
    views, accessors = doc.get('bufferViews', []), doc.get('accessors', [])
    triangles = 0
    for mesh in doc.get('meshes', []):
        for primitive in mesh.get('primitives', []):
            if primitive.get('mode', 4) != 4: raise ValueError('SHIPPING_TRIANGLES_REQUIRED')
            count = accessors[primitive.get('indices', primitive['attributes']['POSITION'])]['count']
            if count % 3: raise ValueError('SHIPPING_TRIANGLE_COUNT')
            triangles += count // 3
    if not 0 < triangles <= ceiling: raise ValueError(f'SHIPPING_TRIANGLE_BUDGET:{triangles}/{ceiling}')
    if 'EXT_meshopt_compression' not in doc.get('extensionsUsed', []): raise ValueError('SHIPPING_MESHOPT_REQUIRED')
    images = []
    for image in doc.get('images', []):
        if 'uri' in image or 'bufferView' not in image: raise ValueError('SHIPPING_EMBEDDED_TEXTURE_REQUIRED')
        view = views[image['bufferView']]
        start, length = view.get('byteOffset', 0), view['byteLength']
        content = binary[start:start+length]
        if len(content) != length: raise ValueError('SHIPPING_IMAGE_BOUNDS')
        width, height = image_dimensions(content, image['mimeType'])
        if not 0 < width <= 4096 or not 0 < height <= 4096: raise ValueError('SHIPPING_TEXTURE_DIMENSIONS')
        # A safe upper bound even when Basis has to transcode to RGBA8.
        mip_bytes, w, h = 0, width, height
        while True:
            mip_bytes += w*h*4
            if w == h == 1: break
            w, h = max(1, w//2), max(1, h//2)
        images.append({'sha256': sha(content), 'mimeType': image['mimeType'], 'bytes': length, 'width': width, 'height': height, 'decodedCeilingBytes': mip_bytes})
        if image['mimeType'] == 'image/ktx2': images[-1]['encoderParameters'] = ktx_encoder_parameters(content)
    image_views = {image['bufferView'] for image in doc.get('images', [])}
    geometry_bytes = sum(view['byteLength'] for i, view in enumerate(views) if i not in image_views)
    basis = any(image['mimeType'] == 'image/ktx2' for image in images)
    if basis != ('KHR_texture_basisu' in doc.get('extensionsUsed', [])): raise ValueError('SHIPPING_BASIS_EXTENSION')
    return {'sha256': sha(data), 'bytes': len(data), 'triangles': triangles, 'geometryBytes': geometry_bytes,
            'textureBytes': sum(i['bytes'] for i in images), 'decodedCeilingBytes': geometry_bytes + sum(i['decodedCeilingBytes'] for i in images),
            'textures': images, 'textureHashes': [i['sha256'] for i in images], 'animations': len(doc.get('animations', [])),
            'skins': len(doc.get('skins', [])), 'format': 'ktx2' if basis else 'raster', 'glTFVersion': doc['asset']['version']}

def confined(root: Path, relative: str) -> Path:
    path = (root / relative).resolve()
    if path == root or not path.is_relative_to(root) or not path.is_file(): raise ValueError('SHIPPING_SOURCE_PATH')
    return path
