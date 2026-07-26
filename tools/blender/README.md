# DiceForge die generator (Blender)

Generates the first-party die set — d4, d6, d8, d10, d12, d20 and a two-faced coin — into `assets/forge/`, together with the face-up rotation table the web renderer needs.

## Regenerating

Requires Blender 5.1 or newer on `PATH` (or call the executable directly). From the repository root:

```bash
blender --background --factory-startup --python tools/blender/build_dice.py
```

Outputs, all overwritten in place:

| File | Contents |
| --- | --- |
| `assets/forge/<name>.glb` | one model per die, plus `coin.glb` |
| `assets/forge/face-rotations.json` | face-up rotations, UV atlas layout, coin materials |
| `tools/blender/diceforge-dice.blend` | the scene, for inspecting or hand-editing |

## Why this is a script plus a node group, not one node graph

Blender 5.1 has **no bevel geometry node**, and its mesh primitives stop at cube, cone, cylinder, ico-sphere and UV-sphere. There is no node that builds a mesh from arbitrary vertex and face lists, so a dodecahedron (d12) and the pentagonal trapezohedron (d10) cannot be authored in a node graph at all. The split is therefore:

- **`dice_shapes.py`** builds each solid exactly, in pure Python. The math mirrors `packages/renderer-web/src/math/geometry.ts`, which is unit-tested for planarity, distinct outward normals, and face-up orientation — so the generated models and the renderer's built-in procedural dice are the same shapes.
- **The "DiceForge Finish" geometry node group** normalizes every die to a common longest-axis size, measured live from its bounding box. Add a new solid and it is scaled to match the rest without touching the script.
- **A Bevel modifier** rounds the edges (width and segments are constants at the top of `build_dice.py`), since no node equivalent exists.

## Numbering and orientation

Faces are numbered so that opposite faces sum to *N+1*, the standard die layout, by pairing each face with its antipodal neighbour. A tetrahedron has no antipodal faces and is simply numbered 1–4.

Because numbering is *assigned* here rather than measured afterwards, `face-rotations.json` is exact by construction — the manual calibration the KayKit models needed does not apply to these. Entry `rotations[value - 1]` is the quaternion `(x, y, z, w)` that turns the die so `value` reads upward, already converted to glTF's Y-up convention.

Verify the shipped models at any time with the maintainer page, which loads the `.glb`, clusters its real faces, and checks that every value lands on a different one:

```
npm run demo:web
# then open /calibrate.html?forge=d20
```

## UV atlas

Each face is mapped into its own square tile of an atlas grid (`atlas.columns` × `atlas.rows`), centred on the face and scaled by its circumradius so it can never bleed into a neighbouring tile. Per face, `fit` is inradius ÷ circumradius: the fraction of the tile a centred numeral may occupy before it crosses an edge — 0.5 on an equilateral triangle, ~0.43 on the d10's kites, 1.0 on a square. A texture generator should size glyphs by it.

The coin carries three material slots — `forge_coin_heads`, `forge_coin_tails`, `forge_coin_rim` — so its two faces can be textured independently.
