# Third-party assets

Assets in this directory are optional presentation content. They are served by
examples and theme factories at runtime and are **never bundled into the npm
packages** (see ADR-0010 and CONTRIBUTING.md).

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
