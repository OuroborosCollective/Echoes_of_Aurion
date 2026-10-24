"""Read texture dimensions through Aurion's existing byte-level image parser."""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from glb_shipping_contract import image_dimensions, read_glb

root = Path(__file__).resolve().parents[2]
result = {}
for relative in json.load(sys.stdin):
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
    result[relative] = images
print(json.dumps(result, sort_keys=True))
