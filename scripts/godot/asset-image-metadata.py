"""Read texture dimensions through Aurion's existing byte-level image parser."""
import json
import sys
import math
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from glb_shipping_contract import image_dimensions, read_glb

root = Path(__file__).resolve().parents[2]

def multiply(a, b):
    return [sum(a[row * 4 + k] * b[k * 4 + col] for k in range(4))
            for row in range(4) for col in range(4)]

def local_matrix(node):
    if "matrix" in node:
        return [node["matrix"][col * 4 + row] for row in range(4) for col in range(4)]
    x, y, z, w = node.get("rotation", [0, 0, 0, 1])
    sx, sy, sz = node.get("scale", [1, 1, 1])
    tx, ty, tz = node.get("translation", [0, 0, 0])
    return [(1-2*y*y-2*z*z)*sx, (2*x*y-2*z*w)*sy, (2*x*z+2*y*w)*sz, tx,
            (2*x*y+2*z*w)*sx, (1-2*x*x-2*z*z)*sy, (2*y*z-2*x*w)*sz, ty,
            (2*x*z-2*y*w)*sx, (2*y*z+2*x*w)*sy, (1-2*x*x-2*y*y)*sz, tz,
            0, 0, 0, 1]

def metadata(paths):
    result = {}
    for relative in paths:
        path = (root / relative).resolve()
        if not path.is_relative_to(root / "assets"):
            raise ValueError("ASSET_SOURCE_PATH")
        _, document, binary = read_glb(path)
        images = []
        for image in document.get("images", []):
            view = document["bufferViews"][image["bufferView"]]
            start = view.get("byteOffset", 0)
            data = binary[start:start + view["byteLength"]]
            width, height = image_dimensions(data, image["mimeType"])
            images.append({"width": width, "height": height})
        nodes = document.get("nodes", [])
        parents = {child: index for index, node in enumerate(nodes) for child in node.get("children", [])}
        def global_matrix(index, chain=()):
            if index in chain or len(chain) > 4096:
                raise ValueError("GLB_NODE_CYCLE")
            local = local_matrix(nodes[index])
            return multiply(global_matrix(parents[index], (*chain, index)), local) if index in parents else local
        transforms = []
        for index, node in enumerate(nodes):
            if "mesh" in node:
                matrix = global_matrix(index)
                if not all(math.isfinite(value) for value in matrix):
                    raise ValueError("GLB_NONFINITE_TRANSFORM")
                transforms.append({"nodeIndex": index, "name": node.get("name", ""),
                                   "localMatrix": local_matrix(node), "globalMatrix": matrix})
        result[relative] = {"images": images, "meshNodeTransforms": transforms}
    return result


if __name__ == "__main__":
    print(json.dumps(metadata(json.load(sys.stdin)), sort_keys=True))
