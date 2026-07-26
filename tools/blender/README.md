# DiceForge die generator (Blender)

Generates the first-party die set — d4, d6, d8, d10, d12, d20 and a two-faced coin — into `assets/forge/`, together with the face-up rotation table the web renderer needs.

## Regenerating

Three steps, in order — the second and third read what the first writes. Step 1 needs Blender 5.1+; steps 2 and 3 are plain Python (step 2 needs Pillow). From the repository root:

```bash
blender --background --factory-startup --python tools/blender/build_dice.py
python tools/blender/build_textures.py
python tools/blender/emit_rotations.py
```

Outputs, all overwritten in place:

| File | Written by | Contents |
| --- | --- | --- |
| `assets/forge/<name>.glb` | `build_dice` | one model per die, plus `coin.glb` |
| `assets/forge/face-rotations.json` | `build_dice` | face-up rotations, UV atlas layout, coin materials |
| `tools/blender/diceforge-dice.blend` | `build_dice` | the scene, for inspecting or hand-editing |
| `assets/forge/textures/<colour>/*.png` | `build_textures` | one atlas per die, plus coin heads/tails/rim |
| `packages/renderer-web/src/forge-rotations.ts` | `emit_rotations` | the rotation tables the renderer imports |

`forge-rotations.test.ts` compares the emitted TypeScript against the manifest, so forgetting step 3 fails the test suite rather than shipping stale orientations.

Fonts: `build_textures.py` prefers DejaVu Sans Bold (permissively licensed, and bundled with matplotlib) so glyphs are identical anywhere it is installed, and falls back to a system bold face otherwise. It prints which font it used.

## Why this is a script plus a node group, not one node graph

Blender 5.1 has **no bevel geometry node**, and its mesh primitives stop at cube, cone, cylinder, ico-sphere and UV-sphere. There is no node that builds a mesh from arbitrary vertex and face lists, so a dodecahedron (d12) and the pentagonal trapezohedron (d10) cannot be authored in a node graph at all. The split is therefore:

- **`dice_shapes.py`** builds each solid exactly, in pure Python. The math mirrors `packages/renderer-web/src/math/geometry.ts`, which is unit-tested for planarity, distinct outward normals, and face-up orientation — so the generated models and the renderer's built-in procedural dice are the same shapes.
- **The "DiceForge Finish" geometry node group** normalizes every die to a common longest-axis size, measured live from its bounding box. Add a new solid and it is scaled to match the rest without touching the script.
- **A Bevel modifier** rounds the edges, since no node equivalent exists. Width is *per shape*, computed as a fraction of that solid's mean face radius (`DICEFORGE_BEVEL_FRACTION`, default 0.13): one absolute width would leave a d10's large faces looking sharp at the same setting that melts a d20's small ones.

## Numbering and orientation

Faces are numbered so that opposite faces sum to *N+1*, the standard die layout, by pairing each face with its antipodal neighbour. A tetrahedron has no antipodal faces and is simply numbered 1–4. The d10 is labelled 0–9, so a 10 reads as "0" the way a percentile die does.

Each rotation also carries a yaw, so a numeral is not just face-up but the right way up: the renderer views the table from above with world −Z as screen-up, and the face's texture-up axis is turned to point that way. That axis follows the face's first *edge* rather than a corner, which is what makes a d6 land square to the viewer instead of as a diamond.

Because numbering is *assigned* here rather than measured afterwards, `face-rotations.json` is exact by construction — the manual calibration the KayKit models needed does not apply to these. Entry `rotations[value - 1]` is the quaternion `(x, y, z, w)` that turns the die so `value` reads upward, already converted to glTF's Y-up convention.

Verify the shipped models at any time with the maintainer page, which loads the `.glb`, clusters its real faces, and checks that every value lands on a different one:

```
npm run demo:web
# then open /calibrate.html?forge=d20
```

## UV atlas

Each face is mapped into its own square tile of an atlas grid (`atlas.columns` × `atlas.rows`), centred on the face and scaled by its circumradius. A face spans only `atlas.faceFraction` of its tile: bevelling extends geometry slightly past the original face and its UVs go with it, so the margin keeps that overshoot from sampling the neighbouring tile. The texture generator scales glyphs by the same fraction, so the numerals keep their proportions. Per face, `fit` is inradius ÷ circumradius: the fraction of the tile a centred numeral may occupy before it crosses an edge — 0.5 on an equilateral triangle, ~0.43 on the d10's kites, 1.0 on a square. A texture generator should size glyphs by it.

The coin carries three material slots — `forge_coin_heads`, `forge_coin_tails`, `forge_coin_rim` — so its two faces can be textured independently.
