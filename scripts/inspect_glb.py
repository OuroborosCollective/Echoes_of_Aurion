import json
import struct
import sys
from pathlib import Path

path = Path(sys.argv[1])
data = path.read_bytes()
if len(data) < 20 or data[:4] != b"glTF":
    raise SystemExit("Not a GLB file")
version, declared_length = struct.unpack_from("<II", data, 4)
chunk_length, chunk_type = struct.unpack_from("<II", data, 12)
if version != 2 or declared_length != len(data) or chunk_type != 0x4E4F534A:
    raise SystemExit("Invalid GLB header or JSON chunk")
document = json.loads(data[20:20 + chunk_length].decode("utf-8").rstrip(" \t\r\n\x00"))
triangle_count = 0
for mesh in document.get("meshes", []):
    for primitive in mesh.get("primitives", []):
        accessor_index = primitive.get("indices")
        if accessor_index is not None:
            triangle_count += document.get("accessors", [])[accessor_index].get("count", 0) // 3
result = {
    "path": str(path),
    "bytes": len(data),
    "version": version,
    "meshes": len(document.get("meshes", [])),
    "nodes": len(document.get("nodes", [])),
    "triangles": triangle_count,
    "materials": len(document.get("materials", [])),
    "textures": len(document.get("textures", [])),
    "skins": len(document.get("skins", [])),
    "animations": len(document.get("animations", [])),
    "hasScene": bool(document.get("scenes")),
}
print(json.dumps(result, ensure_ascii=False))
