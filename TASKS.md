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

## Coin and guard-rails — 0.6.0 (released 2026-07-28)

- [x] Tie each die value to the numeral printed on the model, in CI. (`forge-models.test.ts` walks rotation → face → UV → atlas tile, and checks every tile is inked and distinct; proved by a generator-style fault that no other test caught)
- [x] Make the pre-publish tarball check repeatable. (`npm run smoke` — packs, installs and uses all five packages, ~20 s)
- [x] Physics coin flips. (`simulateCoinFlip` — cylinder collider whose faces *are* the outcomes, thrown into the shared tray; the model's calibrated pair seats it and a half-turn symmetry lands the recorded face; radius and thickness measured from the loaded model; rim landings re-thrown. 60/60 seeded flips flat on the recorded outcome at ~5 ms each; the presenter no longer swaps canvases for a coin)

## Sound, a second engine, and a stable core — 0.7.0 (released 2026-07-31)

- [x] Record impacts in the simulation. (`PhysicsImpact` on `PhysicsRoll`/`PhysicsFlip` from cannon's collide events — time, body, felt/wall/die, closing speed in m/s at real scale; deterministic per seed, asserted)
- [x] Impact-driven synthesized knocks. (`impactSchedule` — pure, measured thresholds: 0.12 m/s floor, 55 ms per-body merge; Web Audio synthesis from filtered noise, lazy context in the click chain, silent without Web Audio — ADR-0020)
- [x] `sound` option on the physics presenter, default off, and a demo checkbox. (verified in-browser: sound off schedules nothing; a 3d6 roll schedules 7 knocks on one lazily-created context; a coin flip 2)
- [ ] Tune the knock voices down. **1.0 blocker** (ROADMAP's readiness checklist). First listen (product owner, 2026-07-28): the sound works but reads a bit high pitched. Fix shape: lower the material bandpass centres in `audio.ts` (`MATERIALS` — felt 950 / wall 2100 / die 3100 Hz today), keeping their order so felt stays dullest and die-on-die brightest; a longer decay would also soften the read. Constants are internal (ADR-0020), so retuning is free — but tune *with* the product owner listening, not ahead of them.

## Story playback — web parity (0.7.0, shipped)

- [x] Reroll and explosion stories in both web presenters, matching Godot. (`visualDiceForEvent` returns the settled stage with `rerolledFaces`/`exploded`/`bornOf`; the WebGL renderer's authored story lives in `webgl/story.ts`, the physics presenter's multi-throw plan in `presenter-physics/src/story.ts` — both pure and headlessly tested; three VRT scenes pin the settled stages; the React demo grew one-click story buttons)
- [ ] Custom-dice stories: a custom die falls back to tiles, which show only the settled stage — its rerolls and explosions have no motion anywhere yet.
- [ ] Physics follow-up throws run in their own worlds, so a re-toss or a born die does not collide with resting dice and can settle closer than a real die could (or clip one in flight). Fix shape: seed the follow-up world with the resting dice as static bodies, and re-throw when the landing spot overlaps one.
- [ ] Product owner's live look at the web stories (throw feel of the physics re-toss pickup, celebration timing) — constants are `STORY` in each story module.

## Engine adapters (in progress — Godot first, per the product owner)

- [x] Decide how a non-TypeScript platform gets the core: a native port held to exported conformance vectors, bit for bit. (`tools/conformance/export-vectors.mjs` → `packages/testing/vectors/core-vectors.json`, freshness-tested against the live core every run — ADR-0021)
- [x] Godot: headless engine as a GDScript addon. (`adapters/godot/addons/diceforge` — RNG, grammar v1.2, resolution, custom dice, coin; 57/57 vectors pass in Godot 4.7.1 — extended 2026-07-30 with degenerate seeds and hostile parse errors from the core's adversarial probes — and one flipped rotate constant fails 16, so the gate is real. A lone-surrogate seed is deliberately vector-exempt: JSON cannot carry unpaired surrogates in interchange, measured against Godot's parser)
- [x] Godot: posed presentation — the forge models in a scene, faces from the calibrated manifest. (`presenter_3d.gd` + `demo/dice_demo.tscn`: runtime-loads models and textures from `packages/assets-forge`, poses every die on its recorded value, darkens dropped dice, shows the coin; `face_up()` mechanically verifies every pose against the record — 4 seeded shots, 0 failures, screenshots reviewed)
- [x] Godot: rolling motion. (authored tumble per ADR-0007 — drop, bounce, free tumble easing into exactly the calibrated pose; dropped dice dim on landing; seedable motion for reproducible captures. Real physics measured impossible in GDScript: no manual stepping on `PhysicsServer3D` — `tests/capability.gd` asks the engine — so ADR-0018's record-then-replay waits on engine support or a GDExtension)
- [ ] Godot: camera/theming polish for a real game scene, and percentile-pair + custom-dice presentation.
- [x] Godot: distribution bundle. (`npm run godot:bundle` composes addon + forge dice into the Asset Library layout with a zero-config presenter default; verified by unzipping into a fresh project and rolling the golden-vector record with no configuration. The `Godot bundle` workflow publishes it as an artifact and force-pushes the orphan `godot-asset` branch)
- [ ] Godot: Asset Library submission. (needs the human owner: an assetlib account, the listing form pointed at the `godot-asset` branch, an icon, and screenshots — the bundle branch is already the exact layout it serves)
- [ ] Run the Godot conformance scene in CI. (needs a Godot binary on the runner; the scene already exits nonzero on mismatch)
- [ ] Unity: C# port of the core against the same vectors.

## Next

- [x] Declare the core stable. (ADR-0022, 2026-07-30: grammar v1.2, event schema v2, the RNG and presenter contracts, and the conformance vectors are frozen — changes are additive-by-ADR only. Success-counting pools deferred by decision, recorded in the ADR, so the Unity port targets a fixed contract)
- [ ] Harden the six-times-rejected fallback pose in `simulateRoll`/`simulateCoinFlip`. Diagnosis from a one-in-~300 CI flake (2026-07-29): when every retry is rejected, the returned best-effort roll can rest nearly edge-on, where the recorded face wins "highest" by less than the symmetry table's ~1e-5 numeric error — an observer measuring argmax can read the neighbour. The record is never wrong, only near-unreadable. Options: prefer settled throws in the fallback ranking, snap the final frame to the nearest exact face pose when seated is below threshold, or raise MAX_THROWS. Reproduce with unseeded soak (`2,400 local rolls hit 0`; it needs the tail).

- [x] Guarantee the coin tumbles on entry. (the diagnosis held — isotropic spin reads as a drop 51 times in 60 — but flooring the diameter spin only got it to 40/60: the real lever was air time, so the coin is now *tossed* upward as well. `PhysicsCoin.turnovers` counts horizon crossings, the retry rejects fewer than two, and a rim-spinner longer than 3 s is re-thrown instead of watched. Measured: 120/120 seeds at ≥2 turnovers, worst duration 1.5 s, ~5.5 ms per flip)
- [ ] Extend the plugin contracts to the categories beyond presentation (physics, audio, transport) once a second implementation exists to shape them — ARCHITECTURE lists them, but nothing implements them yet.

## Backlog

- [x] Theme/asset pack policy and licensing checklist. (ADR-0010, `assets/LICENSES.md`, CONTRIBUTING)
- [x] Add the missing `boardgame_bits_texture.png` so the KayKit D6_A/D6_B pip styles can be offered. (`d6Style: "pips-a" | "pips-b"`)
- [x] Calibrate d10/d12 models so themes can cover every shape. (superseded: first-party set generated for every shape, tables exact by construction — ADR-0011)
- [x] Texture the first-party dice, then ship `forgeTheme()`. (five colours, textured coin, `tools/blender/build_textures.py`)
- [x] Give the percentile tens die its own 00–90 texture. (`DieModelSet.tensTextureUrl`, generated per colour)
- [x] Even out apparent die sizes. (`modelSilhouetteScale` equalizes each die's on-screen silhouette, measured from the loaded mesh)
- [x] Give procedural dice beveled edges, or retire them. (retired, along with the KayKit pack — ADR-0012)
- [ ] Optional multiplayer transport plugin research. (beyond 1.0)
- [ ] Success-counting pools (`7d10>=8` — count dice that pass a target instead of summing; World of Darkness, Shadowrun, Year Zero). Post-1.0 by decision (ADR-0022): waits for a real integration to shape the dialect, then lands additively — target syntax errors today, per-die success flags and a group success count ride a schema bump, keep/drop rejected in pool groups, vectors grow with it.
- [x] Browser-based visual regression testing for the renderer. (`npm run vrt`, 17 scenes including six for the physics presenter, Playwright + committed baselines)

## Task maintenance

Move work between sections as it changes. Mark completed tasks only after code, tests, and relevant documentation are present. Add scoped tasks rather than leaving vague implementation notes.
