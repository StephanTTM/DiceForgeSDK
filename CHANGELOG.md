# Changelog

All notable changes to DiceForge SDK will be documented here. This project intends to follow [Semantic Versioning](https://semver.org/).

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- Theming for `@diceforge-sdk/renderer-web`: `DiceTheme` carries colors plus an optional set of lazily-loaded glTF models with calibrated face-rotation tables, so a model only ever shows the face the core resolved (ADR-0010). Shapes without a calibrated model — and any asset that fails to load — fall back to the built-in procedural dice.
- `kayKitTheme({ baseUrl, color })` for the KayKit Board Game Bits dice (CC0, Kay Lousberg) in red, blue, green, and yellow, covering d4, d6, d8, and d20. Assets live in `assets/` and are served by the host application; published packages remain code-only.
- Theme picker in the browser demo, and a maintainer calibration tool (`examples/web-demo/calibrate.html`) that derives face tables and re-renders from the shipped table to verify them.

- KayKit d6 pip styles: `kayKitTheme({ d6Style: "pips-a" | "pips-b" })` alongside the default printed numerals, with their own calibrated face table.

### Changed

- Dropped dice are now revealed only after the whole roll has landed: they tumble looking identical to every other die, then dim, desaturate, and shrink once the result is visible. Previously they were drawn translucent from the first frame, which gave the outcome away before the dice settled.
- The camera now frames the whole roll automatically and looks down steeply so the resolved face reads clearly; a roll made only of d4s keeps the lower angled view those dice are read from.
- Procedural dice reworked: all shapes are scaled to a common size (a d8 no longer renders much smaller than a d20), numerals are centered on each face's centroid and sized to fit inside it (they previously drifted off triangular faces), and lighting, materials, and default colors were redone for a brighter, legible look with a contact shadow.
- Both example apps now resolve workspace packages to source, so a demo can never run against a stale `dist` build.

### Fixed

- Procedural die labels could sit partly off a triangular face, and each shape rendered at a different physical size.

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
