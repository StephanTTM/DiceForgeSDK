# Assets

Art is optional presentation content. It is never bundled into
`@diceforge-sdk/core` or `@diceforge-sdk/renderer-web` (ADR-0010). The
first-party set is published as its own optional package, `@diceforge-sdk/assets-forge`
(ADR-0013); anything third-party stays in this directory and is served by the
application. This file records provenance for both.

## DiceForge die set — first-party

- **Package:** `@diceforge-sdk/assets-forge`, sources in [`packages/assets-forge/forge/`](../packages/assets-forge/forge)
- **Files:** `d4.glb`, `d6`, `d8`, `d10`, `d12`, `d20`, `coin.glb`, `face-rotations.json`, and `textures/<colour>/*.png`
- **Author:** DiceForgeSDK contributors
- **License:** MIT, the same as the rest of this repository
- **Source:** generated from `tools/blender/build_dice.py` and `build_textures.py` — see [tools/blender/README.md](../tools/blender/README.md) to regenerate (ADR-0011)
- **Notes:** covers every shape the SDK resolves, plus a coin whose two faces are textured separately and a 00–90 tens atlas for percentile rolls. Five colours: ivory, red, blue, green, yellow. Glyphs are rendered with DejaVu Sans Bold at generation time; only the resulting images are redistributed, not the font.

# Third-party assets

None. The KayKit Board Game Bits pack was removed once the first-party set covered every shape (ADR-0012).
