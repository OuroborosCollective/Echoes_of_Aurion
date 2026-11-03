"""Offline geometry derivation from the exact approved wall; never runtime authority.
Requires numpy, trimesh and Shapely >=2.1. Usage: script SOURCE.glb [--check].
The output is a versioned Aurion gameplay input, separately admitted by a
published world design and recorded canonical zone intent.
"""
import hashlib
import json
from pathlib import Path
import sys
import numpy as np
import trimesh
import shapely
from shapely.geometry import LineString, Polygon, Point
from shapely.ops import polygonize, unary_union

SOURCE_SHA = "a6c164035b8c8f1855ccf52e38c3202731718acc28346cc07f4837591540f349"
source = Path(sys.argv[1])
assert hashlib.sha256(source.read_bytes()).hexdigest() == SOURCE_SHA, "WALL_COLLIDER_SOURCE_MISMATCH"
scene = trimesh.load(source, force="scene", process=True)
polygons = []
for mesh in scene.geometry.values():
    for height in [0.35, 0.9, 1.7]:
        segments = trimesh.intersections.mesh_plane(mesh, [0, 1, 0], [0, height, 0])
        lines = [LineString(np.round(segment[:, [0, 2]] * 1000).astype(int)) for segment in segments]
        polygons.extend(polygonize(unary_union(lines)))
footprint = shapely.set_precision(unary_union(polygons), 1)
footprint = shapely.set_precision(footprint.buffer(1, join_style="mitre").simplify(1, preserve_topology=True), 1)
assert footprint.is_valid and 680_000_000 < footprint.area < 730_000_000
assert not footprint.intersects(Point(0, 0).buffer(350))
for x, z in [(0, 42000), (48000, 0), (0, -42000), (-48000, 0)]:
    assert not footprint.intersects(Point(x, z).buffer(350)), "WALL_GATE_BLOCKED"

# Constrained triangles preserve the openings and concavities. Merge only
# adjacent regions whose union is exactly convex; never use the city's hull.
parts = list(shapely.constrained_delaunay_triangles(footprint).geoms)
changed = True
while changed:
    changed = False
    edges = {}
    for index, polygon in enumerate(parts):
        points = list(polygon.exterior.coords)[:-1]
        for a, b in zip(points, points[1:] + points[:1]):
            edge = tuple(sorted([a, b]))
            edges.setdefault(edge, []).append(index)
    for owners in edges.values():
        if len(owners) != 2:
            continue
        a, b = owners
        merged = parts[a].union(parts[b])
        if merged.geom_type == "Polygon" and not merged.interiors and abs(merged.convex_hull.area - merged.area) < 0.01:
            parts[a] = merged.convex_hull
            del parts[b]
            changed = True
            break

hulls = []
for polygon in parts:
    points = [[int(round(x)), int(round(z))] for x, z in shapely.geometry.polygon.orient(polygon, sign=1).exterior.coords[:-1]]
    start = min(range(len(points)), key=lambda i: points[i])
    points = points[start:] + points[:start]
    hulls.append(points)
hulls.sort()
reconstructed = unary_union([Polygon(points) for points in hulls])
assert reconstructed.symmetric_difference(footprint).area < 1
assert len(hulls) <= 256
payload = {
    "schemaVersion": "aurion.city-wall-collision.v1", "sourceSha256": SOURCE_SHA,
    "units": "millimeters", "sampleHeightsMm": [350, 900, 1700], "geometryMarginMm": 1,
    "hulls": hulls,
}
digest = hashlib.sha256(json.dumps(payload, separators=(",", ":")).encode()).hexdigest()
output = json.dumps({**payload, "manifestSha256": digest}, separators=(",", ":")) + "\n"
root = Path(__file__).resolve().parents[1]
for relative in ["shared/starterCityWallCollision.json", "godot-client/world/starter_city_wall_collision.json"]:
    destination = root / relative
    if "--check" in sys.argv:
        assert destination.read_text() == output, "WALL_COLLIDER_MANIFEST_DRIFT"
    else:
        destination.write_text(output)
print(json.dumps({"hulls": len(hulls), "manifestSha256": digest, "gatesClear": 4, "areaSquareMeters": footprint.area / 1_000_000}))
