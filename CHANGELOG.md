# Changelog

All notable changes to DiceForge SDK will be documented here. This project intends to follow [Semantic Versioning](https://semver.org/).

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- **DiceForge for Godot** (ADR-0021): the headless engine as a Godot 4 addon, in GDScript — `DiceForge.seeded("table-42").roll("2d20kh1+3")` produces the same schema v2 record as the TypeScript core, bit for bit. Grammar v1.2 in full, custom dice, coin flips, position-exact notation errors. Held to new **conformance vectors** exported from the core (`packages/testing/vectors/core-vectors.json`, shipped with `@diceforge-sdk/testing`): seeded RNG streams, parses, error positions and resolved records that every port must reproduce exactly. A freshness test regenerates the vectors on every run so they cannot drift from the core, and the addon's conformance scene passes 48/48 in Godot 4.7.1. Engine only — Godot presentation is future work, as is the Unity C# port against the same vectors.
- The Godot addon's folder can now live anywhere in a project: internal references became script-relative `preload`s after a real integration hit the old absolute paths. A relocation test builds a moved copy at runtime — `class_name` lines stripped, as a vendored second copy must — and rolls the vector-pinned record through it. A `plugin.cfg` also ships so the addon appears in Project Settings → Plugins; enabling it changes nothing, since there is nothing editor-side to install.
- **Godot presentation, first slice**: `presenter_3d.gd` shows a resolved record with the forge models — loaded at runtime from an `@diceforge-sdk/assets-forge` directory, posed by the same calibrated manifest that drives the web renderer, dropped dice darkened, coin included. `face_up(sides, pose)` reports what a pose shows, so the demo scene proves every posed face equals the record before saving viewport captures. Settled poses only; motion is future work, and `present` returns `false` for records it cannot show (percentile pairs, custom dice) so callers can fall back.
- **Coin flips now always tumble.** Some flips read as a drop — measured, 51 of 60 turned over fewer than twice. Flooring the spin about a horizontal diameter helped less than expected because the real constraint was air time, so the coin is now tossed upward as well, which is also just what a coin flip is. `PhysicsCoin` gains `turnovers` (horizon crossings of the face axis), the retry loop rejects flips with fewer than two, and a coin spinning on its rim past 3 s is thrown again rather than watched. Measured: 120 of 120 seeded flips at two or more turnovers, worst duration 1.5 s. Dice throws and their committed baselines are untouched — the coin's extra randomness draws happen after the shared throw sequence.
- The React example gains the same Sound checkbox as the browser demo, and CI gains a `packaging` job running `npm run smoke` on every push — a broken `exports` map or missing file now fails the push that caused it, not the next release.
- **Impact-driven sound** (ADR-0020): `createPhysicsPresenter({ sound: true })` plays a knock for every collision in the recording — felt, wall, and die-on-die each with their own voice, loudness from the recorded closing speed. Nothing fires on a timer: the same data drives the animation and the audio. Knocks are synthesized from filtered noise with Web Audio, so no audio assets are shipped, sourced, or loaded; the `AudioContext` is created lazily inside the first presented roll, satisfying autoplay policy, and a browser without Web Audio stays silent rather than erroring. Default off, and reduced motion skips sound along with the animation. `PhysicsRoll` and `PhysicsFlip` gain `impacts` — time, body, surface, closing speed, deterministic per seed — and `impactSchedule(impacts)` is exported for applications with their own audio pipeline.

## [0.6.0] - 2026-07-28

Coin flips join the physics simulation, and the release process grows the
guard-rails this week's bugs earned.

**Upgrading:** nothing breaks. `simulateCoinFlip` is a new export; records,
notation and the presenter contract are unchanged. One visible behaviour
change: when a theme ships a coin, the physics presenter now flips it itself
instead of handing it to the renderer's toss, so physics mode no longer swaps
canvases mid-session. A theme without a coin model, or a coin that fails to
load, still falls back to the toss.

### Added

- **Physics coin flips** (`simulateCoinFlip`): a coin thrown into the same tray as the dice, on a cylinder collider whose two faces *are* the outcomes — ADR-0019's rule applied to a coin. The calibrated pair from the theme seats the model in the collider, and when the simulation lands the other face up, a half turn about a diameter — a symmetry of the cylinder — puts the recorded outcome on top without the physics noticing (ADR-0018). The collider's radius and thickness are measured from the loaded model, so a themed coin of any proportions collides as the coin it is; a flip that finishes on its rim is thrown again. The presenter now flips natively whenever the theme ships a coin, so physics mode no longer swaps canvases mid-session; a coin model that fails to load still falls back to the renderer's toss. Measured over 60 seeded flips: every one settled flat on the recorded outcome, ~5 ms per flip with retries.
- A test ties each die value to the numeral actually printed on the shipped model: it applies the value's rotation, finds the face that ends up on top, and checks that face's UVs land in the atlas tile the manifest assigns to that value. The existing tests only checked the tables were internally tidy and sent every value to a *distinct* face — all of which is true of a table that is consistently wrong, which is how the physics presenter shipped showing 57 of 60 faces incorrectly. Verified by swapping two d20 rotations in the generated source *and* the manifest together, the way a generator bug would: every other test passed, this one failed.
- The textures are checked too — every face's atlas tile must carry ink, and no two faces of a die may be painted alike, so a texture build that silently skipped or duplicated a glyph is caught.
- `npm run smoke` packs what `npm publish` would upload, installs it into a throwaway project, and uses it: resolving a roll, formatting an announcement, resolving asset URLs, running all 60 physics faces, and type-checking a consumer against the published `.d.ts` under `strict`. It catches a broken `exports` map, a file missing from `files`, or a dependency that should have been a peer — none of which the unit tests can see, since they run against workspace source. Takes about 20 seconds.

## [0.5.0] - 2026-07-28

Dice that tumble under real physics and still land on the outcome the engine
decided, shipped as an optional fifth package.

**Upgrading:** nothing breaks. Records, notation and the presenter contract are
unchanged from 0.4.0, and `@diceforge-sdk/presenter-physics` is opt-in — install
it only if you want simulated motion. It declares `@diceforge-sdk/core`,
`@diceforge-sdk/renderer-web` and `three` as peers, so it uses the copies you
already have.

### Added

- `@diceforge-sdk/presenter-physics`: dice that tumble for real and still land on the outcome the engine decided (ADR-0018, ADR-0019). `simulateRoll(dice, options)` runs the whole roll headlessly with cannon-es and hands back a recorded trajectory plus, for each die, the rotation to apply to its mesh *inside* its collider so the recorded face occupies the place the simulation's face landed in. The collider is built from the model's own calibrated face table, so a collider face *is* a numeral and the die that is simulated is the die that is drawn; `PhysicsDieRequest` therefore requires `faceRotations`. A throw that leaves any die propped against a wall is thrown again rather than shown. A symmetry leaves the collider identical, so the physics never notices and nothing is corrected on screen. Recording the trajectory rather than simulating live keeps playback frame-rate independent, makes reduced motion a jump to the last frame, and means the engine need not be deterministic across runs; a whole roll costs 4–44 ms for 1–40 dice.
- `createPhysicsPresenter({ container, theme })` turns that motion into a presenter: it plays the recorded trajectory with three.js, applies each die's remap before the first frame, and reveals dropped dice once the roll has landed. Anything it cannot honestly simulate — a coin, a custom die, an unusual face count, no theme, no WebGL — is handed to `@diceforge-sdk/renderer-web` rather than reimplemented, and the result is announced exactly once however it was drawn. It is the second implementation of the presenter contract, and the first thing the conformance suite has been pointed at that it was not designed around.
- `@diceforge-sdk/renderer-web` exports the pieces a second 3D presenter needs rather than a copy of them: the die solids (`dieGeometry`, `PolyhedronData`, `ShapedDieSides`, `DIE_SIZE`), the model loader and texturing (`loadDieModel`, `instantiateDieModel`, `loadThemeTexture`, `applyTexture`, `modelSilhouetteScale`), and `visualDiceForEvent`.
- The browser demo has a `physics` renderer option.
- The React example can switch between the renderer and the physics presenter while it runs, which is the clearer demonstration of the contract: the component depends on `InteractionPresenter`, not on either implementation, so swapping one for the other is an effect teardown and nothing else. It cancels an in-flight presentation with `present(event, { signal })` on the way out — the outcome is already recorded, so an interrupted presentation is not a failed roll — and reads what it shows from `capabilities` rather than from the option it passed.
- The visual regression suite runs in CI, and no longer prints "No visual changes detected" immediately after listing the scenes that changed. Pixels are only comparable against the browser build that drew them, so the baselines and the CI job live in the same pinned Playwright container, and `npm run vrt:docker` reproduces it exactly. `baselines/environment.json` records what drew the committed PNGs, so a run from any other machine explains itself and reports what changed *without* failing — it cannot tell a regression from another Chromium's anti-aliasing, and a suite that cries wolf gets ignored. The image tag is derived from the Playwright pinned in `package.json`, and a version bump that leaves the workflow behind fails with that as the message rather than as thirteen mysterious diffs.
- Four visual regression scenes cover the physics presenter — a simulated roll landing on its recorded faces, framing of a scattered handful, the dropped-die reveal, and delegation of a die physics cannot model. A seeded throw makes them repeatable to the pixel.
- The dice area is a fixed rectangle shaped to the viewport (`trayRadius`, `trayAspect`), and the camera frames it and nothing else — the same die is the same size on every throw. `dieWidth × 3.5` is measured as the tightest area that still lands 30 of 30 dice flat at one, five and ten dice.

### Fixed

- `@diceforge-sdk/assets-forge`, `@diceforge-sdk/testing` and `@diceforge-sdk/presenter-physics` shipped without a `LICENSE` file despite declaring MIT, so the published tarballs carried no licence text. All five packages now include it.
- Published source maps referenced `../src/*.ts`, which packages ship `dist` and not `src` — so the maps resolved to nothing in a consumer's project, and some bundlers warned about them. They now carry the TypeScript inline (`inlineSources`), so stepping into the SDK works whatever a bundler does with relative paths. Tarballs grow by roughly half: `@diceforge-sdk/core` from 31 kB to 49 kB packed, `renderer-web` from 38 kB to 58 kB.
- `createPhysicsPresenter` never followed its container. The scene is built once, on the first roll it draws, so the canvas kept whatever size the container had then — wrong after any reflow, and worse than it sounds: `trayAspect` *is* read from the container on every roll, so a resized page had the camera framing a tray shaped for a viewport that no longer existed. It now resizes and re-frames on `resize`, and stops listening when disposed.
- The React example resolved `@diceforge-sdk/presenter-physics` from `dist` rather than source, so it showed a stale build — the exact thing the other aliases in its Vite config exist to prevent.
- A stray NUL byte sat in the browser demo's seed sentinel, where it read as a space in every editor. It worked, but it made git treat a TypeScript file as binary — no diffs, no line-ending handling. Replaced with a named `STALE_SEED` constant.
- `.gitattributes` pins LF line endings and marks the models, textures and VRT baselines binary. Without it, a contributor with git's Windows default `core.autocrlf=true` gets a working tree Biome rejects on every checkout, for files they never edited.

## [0.4.0] - 2026-07-27

The extensibility milestone: dice a game system can define for itself, notation
for how they are rolled, sessions that replay, and contracts a third-party
plugin can be held to.

**Upgrading:** stored records still read — a version 1 record deserializes and
comes back as version 2 with the same numbers. Two things need attention.
Consumers who annotated a die size as `DieSides` should widen it to `number`
(that type still names the sizes with a standard shape). Anyone who implemented
`InteractionPresenter` must now declare `capabilities`; the conformance suite in
`@diceforge-sdk/testing` will say what is missing.

### Added

- **Custom die definitions** (ADR-0015): `defineDie({ id, faces })` describes a die by its faces, each with a `value` it contributes and an optional `label` it reads as, and `createDiceEngine({ dice })` makes them rollable as `4d{fate}`. Faces may repeat, so weighting a value means listing it twice; values may be negative or zero, which is what Fate/Fudge, symbol and Sicherman dice need. Rolling one consumes exactly one random number per die, so a seed replays identically whichever dice a system uses.
- Notation accepts **any face count** from 2 to `MAX_DIE_FACES` (1000): `d3` and `d30` need no setup. `d1` and `d0` are rejected with an error pointing at the modifier that was probably meant.
- **Exploding dice and rerolls** (ADR-0016): `4d6!` adds a die for every highest face, chaining; `4d6r1` rerolls 1s until they are not, `4d6ro1` rerolls each die at most once, and `r2` means "reroll 1s and 2s". Modifiers may be written in any order and always apply as reroll, then explode, then keep/drop — `4d6kh3r1` normalizes to `4d6r1kh3`. Both are capped at 10 per die so a hostile expression cannot hang the engine, and neither draws a random number when it is not used, so existing seeds still mean what they meant.
- Extra dice appear in `group.dice` in rolled order with `source: "reroll" | "explosion"`, and a roll a reroll threw away keeps its place with `rerolled: true` — a roll reads back as it happened rather than as a tidied summary.
- **Replay** (ADR-0017): `createSession(events)` turns a log of resolved events into a versioned, serializable artifact, and `replaySession(session, presenter)` presents it again. A replay consumes no randomness — it shows outcomes that were already decided, so watching a session back leaves a seeded engine's next roll unchanged — and it reproduces results only, never the motion. Events are validated entering and leaving a session, and an invalid one is reported by index. The engine still records nothing itself, so it keeps holding no state beyond its random source.
- **Capability discovery** (ADR-0014): every presenter carries `capabilities` — the event kinds it accepts, the die sizes it can show, the media it may use (`"3d" | "2d" | "none"`), and whether it cancels, announces, and honors reduced motion. `presentationSupport(capabilities, event)` answers whether an event is covered, and says which die sizes are at fault when it is not. Both are plain data and pure logic, so an application, an adapter, or a conformance suite can ask the same question without constructing a renderer.
- **`@diceforge-sdk/testing`**: a conformance suite a third-party presenter can run against itself. `assertPresenterConformance(factory)` checks that declared kinds and die sizes really present, that presenting leaves the resolved record byte-identical, that an aborted presentation rejects when cancellation is claimed, and that `dispose()` is idempotent — failing on a timeout rather than hanging when a presentation never settles. Runner-agnostic: the checks return data, so any test framework can assert on them. Its README doubles as the guide to writing a presenter, and `@diceforge-sdk/renderer-web` is its first consumer.

### Changed

- **Breaking (records):** event `schemaVersion` is now **2**. `sides` is any face count and `value` any integer for a custom die (still 1..sides for a plain one), with new optional `die`, `label`, `source` and `rerolled` fields. Version 1 records still deserialize and come back as version 2 with the same numbers; an older core rejects a version 2 record as an unsupported version rather than misreading it. `SUPPORTED_SCHEMA_VERSIONS` lists what a core reads.
- **Breaking (types):** `DieOutcome.sides` and `RollGroupOutcome.sides` widen from the seven-size union to `number`. `DieSides` still names the sizes with a standard physical shape.
- **Breaking (contract):** implementing `InteractionPresenter` now requires a `capabilities` field, and `PresenterCapabilities.dieSides` accepts `"any"` — which `@diceforge-sdk/renderer-web` declares, because its tiles read whatever a face says.
- A custom die is never drawn with a numbered 3D model, since a model cannot show a face the die does not have; such rolls fall back to tiles for the whole event.
- `DicePresenter.mode` remains for browser-specific code, and is now documented as the vendor spelling of `capabilities.media`.
- `group.dice.length` is the number of dice **rolled**, which modifiers can exceed the count that was asked for; the group's `notation` is what was asked for.

### Fixed

- A 3D presenter that fell back to tiles for one roll stayed on tiles for every later roll — the WebGL canvas was hidden and never shown again. The fallback is per event, which unusual and custom dice make easy to reach. A visual regression scene now covers it, and the suite captures the canvas only when it is actually visible, so a hidden one can no longer be photographed as though it had rendered.

## [0.3.0] - 2026-07-26

3D dice now work from `npm install`.

### Added

- `@diceforge-sdk/assets-forge`: the first-party die set as an optional package — d4 through d20, a two-faced coin, and a texture atlas per colour. `forgeAssets({ color })` returns the URLs your bundler emitted for those files, so nothing has to be copied into a public directory or hosted: `forgeTheme(forgeAssets({ color: "red" }))` is the whole setup (ADR-0013). The package has no dependencies and no renderer code, and neither `core` nor `renderer-web` depends on it — an install of either still carries no art.
- `forgeTheme()` accepts explicit URLs (`{ urls, color }`) as well as a directory (`{ baseUrl, color }`), because bundler-emitted files are hashed and share no common prefix. Both forms produce identical themes. New exported types: `ForgeAssetUrls`, `ForgeThemeOptions`.

### Changed

- The generated dice moved from `assets/forge/` to `packages/assets-forge/forge/`, which is now their canonical home: the Blender pipeline writes there, and `assets/` keeps the licensing record. Applications that serve their own copy are unaffected — `baseUrl` still works and is still the way to use a custom pack.
- Both example apps consume the asset package the way an application would, so the demo and the visual regression suite exercise the same resolution path a user gets.
- CI and release workflows run `actions/checkout@v5` and `actions/setup-node@v5`; the v4 line was being forced onto Node 24 with a deprecation warning.

## [0.2.0] - 2026-07-26

The web presentation milestone. Entries describe the net change since 0.1.0,
not the path taken to get there.

### Added

- `forgeTheme({ baseUrl, color })`: a first-party textured die set covering every shape the core resolves — d4 through d20 plus a coin whose heads and tails are textured independently — in ivory, red, blue, green and yellow. One model per die serves all colours: a theme swaps the texture atlas, not the mesh (`DieModelSet.textureUrls`, `DiceTheme.tensTextureUrl`, `DiceTheme.coin`).
- A committed Blender pipeline that generates those dice and their textures (`tools/blender/`, ADR-0011). Faces are numbered so opposite faces sum to N+1, which makes the exported rotation table exact by construction rather than hand-calibrated; `emit_rotations.py` emits the renderer's tables and a test compares them against the manifest so the two cannot drift.
- Percentile rolls show the classic pair of d10s, with the tens die reading 00–90 from its own atlas.
- Visual regression suite (`npm run vrt`): eight scenes rendered through the real presenter in headless Chromium and compared to committed PNGs, covering face orientation, per-theme texturing, the dropped-die reveal, relative die sizes, the percentile pair, the coin, camera framing and the DOM fallback. Runs deterministically — zero differing pixels between runs — and writes annotated diffs when a scene changes. Not in CI yet: baselines are specific to the browser that drew them.
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
