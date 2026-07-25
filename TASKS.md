# Tasks

## Current focus: repository foundation

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

- [x] Push to a Git host and verify the CI workflow runs green on Node 20 and 24. (github.com/StephanTTM/DiceForgeSDK, private until release readiness)
- [ ] Publish to npm — folded into the publish task under "Next" so both packages ship together.

## Web proof of integration (complete)

- [x] Select a web renderer/physics approach through an ADR. (Three.js + outcome-first scripted tumble — ADR-0007)
- [x] Define renderer plugin contract and presentation lifecycle. (`InteractionPresenter` in core — ADR-0008)
- [x] Build a small browser demo with dice and coin flip interactions. (`examples/web-demo`, `npm run demo:web`)
- [x] Add reduced-motion and no-WebGL fallbacks. (DOM tile backend, `prefers-reduced-motion`, aria-live announcements)

## Next: toward 0.2.0 completion

- [x] Add one popular-framework example (React) consuming `@diceforge-sdk/renderer-web`. (`examples/react-demo`)
- [ ] Theme/asset loading as an optional presentation concern (with the licensing checklist below).
- [ ] Publish 0.1.0: pipeline and scaffolding are in place (ADR-0009); the two `npm publish` commands need a maintainer's interactive 2FA approval. Afterwards: tag `v0.1.0`, configure npm trusted publishing for both packages, and check this off.

## Backlog

- [ ] Physics-based presenter plugin exploration (realistic motion behind the same presenter contract).
- [ ] Unity adapter exploration and package distribution plan.
- [ ] Godot adapter exploration and package distribution plan.
- [ ] Custom dice definitions.
- [ ] Notation extensions beyond grammar v1 (exploding dice, rerolls) via plugin contracts.
- [ ] Theme/asset pack policy and licensing checklist.
- [ ] Replay support.
- [ ] Optional multiplayer transport plugin research.
- [ ] Browser-based visual regression testing for the renderer.

## Task maintenance

Move work between sections as it changes. Mark completed tasks only after code, tests, and relevant documentation are present. Add scoped tasks rather than leaving vague implementation notes.
