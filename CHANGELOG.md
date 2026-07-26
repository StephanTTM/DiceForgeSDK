# Changelog

All notable changes to DiceForge SDK will be documented here. This project intends to follow [Semantic Versioning](https://semver.org/).

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

Nothing here is released yet. Entries describe the net change since 0.1.0, not
the path taken to get there.

### Added

- `forgeTheme({ baseUrl, color })`: a first-party textured die set covering every shape the core resolves — d4 through d20 plus a coin whose heads and tails are textured independently — in ivory, red, blue, green and yellow. One model per die serves all colours: a theme swaps the texture atlas, not the mesh (`DieModelSet.textureUrls`, `DiceTheme.tensTextureUrl`, `DiceTheme.coin`).
- A committed Blender pipeline that generates those dice and their textures (`tools/blender/`, ADR-0011). Faces are numbered so opposite faces sum to N+1, which makes the exported rotation table exact by construction rather than hand-calibrated; `emit_rotations.py` emits the renderer's tables and a test compares them against the manifest so the two cannot drift.
- Percentile rolls show the classic pair of d10s, with the tens die reading 00–90 from its own atlas.
- A theme picker in the browser demo, and a maintainer page (`examples/web-demo/devtools.html`) that renders a roll through the real presenter or checks a shipped model against its rotation table.

### Changed

- Dropped dice are revealed only after the whole roll lands: they tumble looking identical to every other die, then darken and shrink once the result is visible. They stay fully opaque, so a die never appears see-through.
- A coin is tossed rather than spun in place — it rests flat, is thrown spinning end over end, and drops back onto its result. The number of half turns is chosen by parity, so it lands on the resolved face with no mid-air correction.
- The camera frames each roll automatically and looks down steeply so the resolved face reads clearly; an all-d4 roll keeps the lower angled view those dice are read from. Its field of view is narrow (22°), because a wide lens magnifies whatever is nearest it and made flat-topped dice render large.
- Dice are sized so each covers the same screen area, measured from the camera's angle, averaged over the poses a die can land in, and taken from the loaded mesh so bevelling is accounted for. Measured on screen, the d8, d10 and d12 sit within 1% of the d20.
- Both example apps resolve workspace packages to source, so a demo can never run against a stale `dist` build.

### Removed

- The runtime-generated ("procedural") dice and the vendored KayKit pack, superseded by the first-party set (ADR-0012). 3D presentation now requires a theme: without one, or for a roll a theme cannot cover, the presenter falls back to the DOM tiles for the whole event, so a resolved die is never missing from the table. `createDicePresenter({ container })` with no theme reports `mode: "dom"`.
- `PROMPT.md`, a frozen copy of the original agent prompt that had drifted from `CLAUDE.md`.

## [0.1.0] - 2026-07-25

First published release: `@diceforge-sdk/core` and `@diceforge-sdk/renderer-web` on npm (scope per ADR-0009).

### Added

- React example (`examples/react-demo`, `npm run demo:react`): StrictMode-safe presenter lifecycle owned by an effect, engine memoized per seed.
- Tag-driven release workflow publishing both packages together with npm provenance (ADR-0009).
- `@diceforge-sdk/renderer-web`: browser presenter with Three.js 3D dice whose tumble animation always lands on the core-resolved face (ADR-0007); DOM tile fallback without WebGL, `prefers-reduced-motion` support, AbortSignal cancellation, aria-live announcements (`formatEventAnnouncement`), and percentile d100 shown as the classic tens + units d10 pair.
- `@diceforge-sdk/core`: type-only presentation contract (`InteractionPresenter`, `PresentationOptions`, `AbortSignalLike`) keeping the core platform-free (ADR-0008).
- Browser demo (`examples/web-demo`, `npm run demo:web`): notation and seed inputs, renderer and motion overrides demonstrating every fallback tier, and the live serialized record.
- `@diceforge-sdk/core`: headless engine (`createDiceEngine`) resolving dice rolls and coin flips offline with no renderer, UI, or network dependencies.
- Dice notation grammar v1 (`parseDiceNotation`): `[count]d(sides|%)` for d4–d100, `kh`/`kl`/`dh`/`dl` keep/drop, `+`/`-` chaining with integer modifiers, positioned `DiceNotationError` diagnostics, and documented input limits (ADR-0006).
- Seeded, cross-platform reproducible RNG (`createSeededRandomSource`, xoshiro128\*\* + cyrb128) locked by golden known-answer tests, plus a non-reproducible system source (`createSystemRandomSource`); provenance embedded in every result (ADR-0005).
- Immutable, schema-versioned event records (`RollResult`, `CoinFlipResult`, `schemaVersion: 1`) with per-die kept flags in rolled order and deterministic keep/drop tie-breaking.
- Validating canonical JSON serialization (`serializeEvent`, `deserializeEvent`, `validateEventRecord`) that recomputes totals, drops unknown fields, and rejects unsupported schema versions.
- npm-workspaces monorepo with strict TypeScript, Biome, Vitest (62 tests), GitHub Actions CI on Node 20/24 (ADR-0004), and a runnable headless example (`npm run example`).
- Initial project charter, architecture guidance, roadmap, task list, decision records, contribution guidance, and Claude Code prompt.

## Release policy

- Add user-visible changes under `Unreleased` as they land.
- Categorize entries as Added, Changed, Deprecated, Removed, Fixed, or Security.
- Link migration notes and relevant ADRs for breaking changes.
- Do not publish a version until release notes, compatibility notes, and documentation are complete.
