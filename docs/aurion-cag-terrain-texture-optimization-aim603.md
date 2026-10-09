# Aurion Deterministic Terrain Texture Optimization (AIM-603)

## Overview
Echoes of Aurion utilizes a fully deterministic terrain pipeline (AIM-599). While the pipeline correctly asserts physical bounds (min/max heights, maximum adjacent slopes, and walkability constraints), texture projection and model distribution heavily depend on terrain *continuity* and *variance*.

To improve and optimize world and game texturization without breaking the strict Single Authority boundary, we are extending the Wolfram CAG (Computer-Aided Generation) integration. CAG will act as a verifiable oracle for geometric variance and material/texture continuity.

## 1. Authority Boundary
Just as with geometric bounds checking, the CAG integration **does not** generate terrain, mutate the world, or decide chunk survival.
CAG purely processes an already-generated deterministic `BaseWorldChunk` to compute statistical metrics that are computationally expensive to calculate in the hot game loop but are critical for design validation.

The flow remains:
```
BaseWorldChunk (Aurion canonical state)
  -> Extraction of Height Matrix and Material/Surface Grid
  -> Projection to Wolfram Language literals
  -> CAG Oracle calculation (Standard Deviation, Curvature, Connected Components)
  -> Design Evidence (receipt)
```

## 2. Terrain Metrics for Texturization
To optimize procedural texturing (e.g., blending biome textures without harsh seams or excessive stretching), the CAG probe analyzes two core properties:

### 2.1 Geometric Variance (Mesh Density/Texture Stretching)
Large variations in height within small areas lead to stretched textures and geometry artifacts.
The existing probe checked `Max[Join[dx, dz]]` (maximum slope). The new continuity probe evaluates the **variance or standard deviation** of the height matrix.
By bounding the variance, world designers can mathematically prove that a given seed produces terrain suitable for natural texture blending.

### 2.2 Surface Continuity (Material Transitions)
The pipeline assigns explicit materials/surfaces to tiles (`grass`, `forest_floor`, `riverbank`, `stone`, `ash`, `ruin_path`).
A highly fragmented chunk (e.g., a checkerboard of stone and grass) causes visual noise and ruins the texture projection.
The new CAG probe maps these string-based surfaces to canonical integers and computes the sum of non-zero transitions across the grid (adjacent tile differences).

## 3. Implementation
The design protocol `shared/aurionCagDesignProtocol.ts` introduces `buildWorldChunkTerrainContinuityCagProbe(chunk: BaseWorldChunk)`.

### Canonical Surface Mapping
Surfaces are mapped to integers deterministically for Wolfram processing:
- `grass` -> 1
- `forest_floor` -> 2
- `riverbank` -> 3
- `stone` -> 4
- `ash` -> 5
- `ruin_path` -> 6

### Wolfram Probe Geometry
The Wolfram probe computes:
1. `Variance[Flatten[heightMatrix]]` - Overall height variance.
2. The number of surface transitions. It calculates the differences along rows and columns of the surface matrix and counts how many are non-zero (`Count[Flatten[dx], x_ /; x != 0]`).

```wolfram
h={...};
s={...};
var=Round[Variance[Flatten[h]]];
sdx=Map[Differences,s];
sdz=Differences[s];
trans=Count[Flatten[sdx], x_ /; x != 0] + Count[Flatten[sdz], x_ /; x != 0];
{var, trans}
```

## 4. Summary
By extracting these deterministically bounded values via CAG, Echoes of Aurion can systematically measure and optimize terrain texturization and geometric detail distribution without bringing heavy statistical processing into the live multiplayer tick cycle.
