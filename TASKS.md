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

- [x] Add one popular-framework example (React) consuming `@diceforge-sdk/renderer-web`. (`examples/react-demo`; also swaps in `@diceforge-sdk/presenter-physics` at runtime, showing the presenter contract is what the component depends on)
- [x] Theme/asset loading as an optional presentation concern. (`DiceTheme` + lazy glTF models with calibrated face tables, KayKit CC0 pack — ADR-0010)
- [x] Publish 0.1.0 to npm. (`@diceforge-sdk/core` + `@diceforge-sdk/renderer-web` live 2026-07-25; `v0.1.0` tagged; trusted publishing configured; release workflow verified green and idempotent — ADR-0009)

## Extensibility — 0.4.0 (released 2026-07-27)

- [x] Add capability discovery so an adapter can ask what a presenter supports instead of feature-detecting it. (`PresenterCapabilities` + `presentationSupport()` in core, declared per instance by the web renderer — ADR-0014)
- [x] Custom dice definitions. (`defineDie` + `createDiceEngine({ dice })`, `4d{fate}`, any face count 2..1000, event schema v2 with a v1 read path — ADR-0015)
- [x] Notation extensions beyond grammar v1 (exploding dice, rerolls). (`4d6!`, `4d6r1`, `4d6ro1`; any modifier order, capped chains, extras recorded in rolled order — ADR-0016)
- [x] Replay support: re-present a stored record without re-resolving it. (`SessionRecord`, `createSession`, `serializeSession`/`deserializeSession`, `replaySession`; replay draws no randomness — ADR-0017)
- [x] Plugin-author documentation and a compatibility test kit a third-party renderer can run against. (`@diceforge-sdk/testing`: runner-agnostic conformance checks + the presenter-authoring guide; `renderer-web` runs it against itself — ADR-0014)
- [x] Decide whether the first-party dice ship as an optional `@diceforge-sdk/assets-forge` package or stay repository-only. (shipped as a package — ADR-0013; `forgeTheme(forgeAssets({ color }))` needs no copying, `baseUrl` still serves custom packs)

## Motion — 0.5.0 (released 2026-07-28)

- [x] Physics-based presenter plugin. Record the trajectory headlessly, then remap the mesh inside the collider by a symmetry so the recorded face lands where the simulation's did (ADR-0018, **accepted**). Every face pair on all six shapes admits such a remap (`symmetry.test.ts`), and the shipped rotation tables cannot supply it.
  - [x] Decide the engine and measure a real roll. (`cannon-es`; `npm run physics` — every shape settles every time in ~0.75 s, scatters 123–269 mm at p95, remaps at 0.0000° error, 28–37 kB of trajectory per roll)
  - [x] Measure a bevelled hull from the shipped `.glb`. (`npm run physics -- --hull=glb`: simulates fine, but the remap fails on all 180 poses and it costs up to 500x more — the collider is the idealised solid and the model is cosmetic, which also frees custom art to have holes or missing faces)
  - [x] Decide how the camera frames the roll, and what the simulation costs. (`--tray=<mm>`: walls cap the scatter, and `dieWidth × (5 + 0.8√n)` settles in ~1s at 96–100% seated. There is no pre-roll latency — simulating a whole roll costs 4–44 ms for 1–40 dice; the 0.7–1.5 s is the animation's length. The first measurement claimed a fixed tray meant the camera never moves; superseded by the framing item below.)
  - [x] Ship it as `@diceforge-sdk/presenter-physics`. (`simulateRoll` + the symmetry remap, cannon-es, tray-framed, 10 tests; the collider is the idealised solid and the model is cosmetic, so a theme needs no symmetry data of its own)
  - [x] Play the trajectory. (`createPhysicsPresenter` — three.js playback, remap applied before the first frame, dropped dice revealed on landing; coins, custom dice and no-WebGL delegate to `renderer-web`, and it passes the conformance suite with no skips)
  - [x] Framing polish. (Rectangular tray shaped to the viewport — measured to cost nothing in settling — and the camera frames where the dice came to rest, centred on them, instead of the walls. Shaping the tray alone did not help: it makes the tray bigger, so the camera pulls back by the same amount.)
- [x] Run the visual regression suite in CI against platform-stable baselines. (a `visual` job inside the pinned `mcr.microsoft.com/playwright` image; `npm run vrt:docker` reproduces it, and a run from anywhere else is advisory rather than red)

## Next

- [ ] Extend the plugin contracts to the categories beyond presentation (physics, audio, transport) once a second implementation exists to shape them — ARCHITECTURE lists them, but nothing implements them yet.

## Backlog

- [ ] Unity adapter exploration and package distribution plan. (engine adapters milestone)
- [ ] Godot adapter exploration and package distribution plan. (engine adapters milestone)
- [x] Theme/asset pack policy and licensing checklist. (ADR-0010, `assets/LICENSES.md`, CONTRIBUTING)
- [x] Add the missing `boardgame_bits_texture.png` so the KayKit D6_A/D6_B pip styles can be offered. (`d6Style: "pips-a" | "pips-b"`)
- [x] Calibrate d10/d12 models so themes can cover every shape. (superseded: first-party set generated for every shape, tables exact by construction — ADR-0011)
- [x] Texture the first-party dice, then ship `forgeTheme()`. (five colours, textured coin, `tools/blender/build_textures.py`)
- [x] Give the percentile tens die its own 00–90 texture. (`DieModelSet.tensTextureUrl`, generated per colour)
- [x] Even out apparent die sizes. (`modelSilhouetteScale` equalizes each die's on-screen silhouette, measured from the loaded mesh)
- [x] Give procedural dice beveled edges, or retire them. (retired, along with the KayKit pack — ADR-0012)
- [ ] Optional multiplayer transport plugin research. (beyond 1.0)
- [x] Browser-based visual regression testing for the renderer. (`npm run vrt`, 13 scenes including four for the physics presenter, Playwright + committed baselines)

## Task maintenance

Move work between sections as it changes. Mark completed tasks only after code, tests, and relevant documentation are present. Add scoped tasks rather than leaving vague implementation notes.
