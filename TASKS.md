# Tasks

## Foundation — 0.1.0 (released 2026-07-25)

- [x] Choose the TypeScript package manager and monorepo tool after evaluating publish workflow and Unity/Godot needs. (npm workspaces — ADR-0004)
- [x] Create the core package with strict TypeScript configuration. (`packages/core`, `@diceforge-sdk/core`)
- [x] Define domain schemas for die definitions, coin flips, RNG, roll requests, and immutable result records. (`records.ts`, `rng/types.ts`, `notation/ast.ts`)
- [x] Implement seeded and system RNG providers with tests. (xoshiro128\*\* + golden tests — ADR-0005)
- [x] Implement initial dice notation parser and resolver with tests. (grammar v1 — ADR-0006)
- [x] Implement coin-flip resolver with tests.
- [x] Define event serialization and schema-versioning rules. (`serialization.ts` — ADR-0006)
- [x] Add lint, formatting, test, coverage, and CI workflows. (Biome, Vitest, `.github/workflows/ci.yml`)
- [x] Create one headless usage example. (`examples/headless`)
- [x] Record implementation decisions in `DECISIONS.md` as they are made. (ADR-0004..0006)

Remaining before tagging 0.1.0:

- [x] Push to a Git host and verify the CI workflow runs green on Node 20 and 24. (github.com/StephanTTM/DiceForgeSDK, public since 2026-07-26)
- [x] Publish to npm — shipped with the 0.1.0 release (see the 0.2.0 section).

## Web proof of integration (complete)

- [x] Select a web renderer/physics approach through an ADR. (Three.js + outcome-first scripted tumble — ADR-0007)
- [x] Define renderer plugin contract and presentation lifecycle. (`InteractionPresenter` in core — ADR-0008)
- [x] Build a small browser demo with dice and coin flip interactions. (`examples/web-demo`, `npm run demo:web`)
- [x] Add reduced-motion and no-WebGL fallbacks. (DOM tile backend, `prefers-reduced-motion`, aria-live announcements)

## Web presentation — 0.2.0 (released 2026-07-26)

- [x] Add one popular-framework example (React) consuming `@diceforge-sdk/renderer-web`. (`examples/react-demo`)
- [x] Theme/asset loading as an optional presentation concern. (`DiceTheme` + lazy glTF models with calibrated face tables, KayKit CC0 pack — ADR-0010)
- [x] Publish 0.1.0 to npm. (`@diceforge-sdk/core` + `@diceforge-sdk/renderer-web` live 2026-07-25; `v0.1.0` tagged; trusted publishing configured; release workflow verified green and idempotent — ADR-0009)

## Next: extensibility — 0.3.0

- [ ] Stabilize the plugin contracts and add capability discovery, so an adapter can ask what a presenter supports instead of feature-detecting it.
- [ ] Custom dice definitions.
- [ ] Notation extensions beyond grammar v1 (exploding dice, rerolls) via plugin contracts.
- [ ] Replay support: re-present a stored record without re-resolving it.
- [ ] Plugin-author documentation and a compatibility test kit a third-party renderer can run against.
- [ ] Decide whether the first-party dice ship as an optional `@diceforge-sdk/assets-forge` package or stay repository-only. (open question — ADR-0010 keeps art out of the current packages)

## Backlog

- [ ] Physics-based presenter plugin exploration (realistic motion behind the same presenter contract).
- [ ] Unity adapter exploration and package distribution plan. (0.4.0)
- [ ] Godot adapter exploration and package distribution plan. (0.4.0)
- [x] Theme/asset pack policy and licensing checklist. (ADR-0010, `assets/LICENSES.md`, CONTRIBUTING)
- [x] Add the missing `boardgame_bits_texture.png` so the KayKit D6_A/D6_B pip styles can be offered. (`d6Style: "pips-a" | "pips-b"`)
- [x] Calibrate d10/d12 models so themes can cover every shape. (superseded: first-party set generated for every shape, tables exact by construction — ADR-0011)
- [x] Texture the first-party dice, then ship `forgeTheme()`. (five colours, textured coin, `tools/blender/build_textures.py`)
- [x] Give the percentile tens die its own 00–90 texture. (`DieModelSet.tensTextureUrl`, generated per colour)
- [x] Even out apparent die sizes. (`modelSilhouetteScale` equalizes each die's on-screen silhouette, measured from the loaded mesh)
- [x] Give procedural dice beveled edges, or retire them. (retired, along with the KayKit pack — ADR-0012)
- [ ] Optional multiplayer transport plugin research. (beyond 1.0)
- [x] Browser-based visual regression testing for the renderer. (`npm run vrt`, 8 scenes, Playwright + committed baselines)
- [ ] Run the visual regression suite in CI, with baselines generated inside the CI container image so they are platform-stable.

## Task maintenance

Move work between sections as it changes. Mark completed tasks only after code, tests, and relevant documentation are present. Add scoped tasks rather than leaving vague implementation notes.
