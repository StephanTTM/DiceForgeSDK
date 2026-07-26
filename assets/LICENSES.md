# Assets

Assets in this directory are optional presentation content. They are served by
examples and theme factories at runtime and are **never bundled into the npm
packages** (see ADR-0010 and CONTRIBUTING.md).

## DiceForge die set (`forge/`) — first-party

- **Files:** `forge/d4.glb`, `d6`, `d8`, `d10`, `d12`, `d20`, `coin.glb`, `forge/face-rotations.json`, and `forge/textures/<colour>/*.png`
- **Author:** DiceForgeSDK contributors
- **License:** MIT, the same as the rest of this repository
- **Source:** generated from `tools/blender/build_dice.py` and `build_textures.py` — see [tools/blender/README.md](../tools/blender/README.md) to regenerate (ADR-0011)
- **Notes:** covers every shape the SDK resolves, plus a coin whose two faces are textured separately and a 00–90 tens atlas for percentile rolls. Five colours: ivory, red, blue, green, yellow. Glyphs are rendered with DejaVu Sans Bold at generation time; only the resulting images are redistributed, not the font.

# Third-party assets

None. The KayKit Board Game Bits pack was removed once the first-party set covered every shape (ADR-0012).
