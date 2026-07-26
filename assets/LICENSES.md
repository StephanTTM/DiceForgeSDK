# Assets

Assets in this directory are optional presentation content. They are served by
examples and theme factories at runtime and are **never bundled into the npm
packages** (see ADR-0010 and CONTRIBUTING.md).

## DiceForge die set (`forge/`) — first-party

- **Files:** `forge/d4.glb`, `d6`, `d8`, `d10`, `d12`, `d20`, `coin.glb`, `forge/face-rotations.json`, and `forge/textures/<colour>/*.png`
- **Author:** DiceForgeSDK contributors
- **License:** MIT, the same as the rest of this repository
- **Source:** generated from `tools/blender/build_dice.py` and `build_textures.py` — see [tools/blender/README.md](../tools/blender/README.md) to regenerate (ADR-0011)
- **Notes:** covers every shape the SDK resolves, including the d10 and d12 the KayKit pack lacks, plus a coin whose two faces are textured separately. Five colours: ivory, red, blue, green, yellow. Glyphs are rendered with DejaVu Sans Bold at generation time; only the resulting images are redistributed, not the font.

# Third-party assets

## KayKit Board Game Bits — dice models

- **Files:** `D4_*`, `D6_A*`, `D6_B*`, `D6_C_*`, `D8_*`, `D20_*` (`.gltf` + `.bin`), `dice_red|blue|green|yellow.png`
- **Author:** Kay Lousberg
- **Source:** https://kaylousberg.itch.io/board-game-bits
- **License:** CC0 1.0 Universal — the source page states "Free for personal and commercial use, no attribution required. (CC0 Licensed)". Attribution is provided here anyway with thanks.
- **Retrieved:** 2026-07-25
- **Notes:**
  - The pack covers d4, d6, d8, and d20. Other die shapes (d10, d12, percentile) always render with DiceForge's built-in procedural geometry.
  - Three d6 styles are available: `D6_C_*` printed numerals (default), and the `D6_A_*` / `D6_B_*` modeled-pip dice, which take their color from `boardgame_bits_texture.png` rather than a per-color texture.
  - Do not resell unmodified copies of these assets or claim them as your own (per the author's request on the source page).
