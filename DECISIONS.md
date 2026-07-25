# Architecture Decision Records

This log records decisions that materially affect architecture, public contracts, compatibility, or contributor workflow. New records use the next sequential identifier. Do not edit accepted historical context; supersede it with a new record when direction changes.

## ADR-0001: Renderer-agnostic, headless core

- **Date:** 2026-07-25
- **Status:** Accepted
- **Decision:** The core resolves dice rolls and coin flips without importing rendering, physics, game-engine, UI, or networking dependencies.
- **Rationale:** A headless core enables web, server, Unity, Godot, test, and simulation use cases while keeping integration lightweight.
- **Consequences:** Visual adapters must consume core event records rather than decide outcomes. Additional contracts are needed between core and presentation layers.
- **Alternatives considered:** A browser-first Three.js implementation; separate implementations per platform.

## ADR-0002: Offline-first with optional transport

- **Date:** 2026-07-25
- **Status:** Accepted
- **Decision:** Local functionality requires no account, service, or network connection. Multiplayer/synchronization is an optional plugin category.
- **Rationale:** This keeps the SDK useful in games, prototypes, private tools, and disconnected environments.
- **Consequences:** Networked features must be additive and cannot be part of core correctness.
- **Alternatives considered:** A hosted synchronized dice service as a required backend.

## ADR-0003: Dice and coin flips are the initial scope

- **Date:** 2026-07-25
- **Status:** Accepted
- **Decision:** The initial SDK supports dice and coin flips only. Other tabletop interaction types are out of scope unless separately adopted.
- **Rationale:** A focused domain gives the project a coherent first release and protects integration quality.
- **Consequences:** Plugin architecture remains general, but no speculative support for cards, tiles, or spinners is built initially.
- **Alternatives considered:** A broad tabletop interaction engine from the outset.

## ADR-0004: npm workspaces, Vitest, Biome, and ESM-only tsc builds

- **Date:** 2026-07-25
- **Status:** Accepted
- **Decision:** The TypeScript monorepo uses npm workspaces (no separate monorepo task runner), Vitest for tests and coverage, Biome for linting and formatting, and plain `tsc` producing ESM-only output with type declarations. Supported runtime is Node.js >= 20 for tooling and any ES2022 JavaScript environment for the core package.
- **Rationale:** npm ships with Node, keeps contributor setup to `npm ci`, and its publish workflow is a plain `npm publish`. Unity and Godot adapters will not be npm packages, so a heavier monorepo tool buys nothing today. Vitest and Biome minimize configuration and dependencies while covering tests, coverage, lint, and format. ESM-only output matches modern bundlers and Node without dual-package complexity.
- **Consequences:** Contributors need no global tooling beyond Node and npm. If the workspace later gains many interdependent packages, a task runner (or pnpm) can be adopted via a superseding ADR. CommonJS consumers must use dynamic `import()` or a bundler.
- **Alternatives considered:** pnpm workspaces (stricter isolation but extra install step); Turborepo/Nx (premature for one package); ESLint + Prettier (more configuration and dependencies); dual CJS/ESM builds (complexity without a current consumer).

## ADR-0005: Seeded RNG algorithm and reproducibility guarantee

- **Date:** 2026-07-25
- **Status:** Accepted
- **Decision:** The seeded random source hashes the seed text with cyrb128 into the state of a xoshiro128\*\* generator, implemented with 32-bit integer operations only. Guarantee: the same seed produces the same sequence on every platform and every core release. Golden known-answer tests lock the sequences; changing the algorithm or constants is a breaking change requiring a superseding ADR. Die faces are derived from `nextUint32()` via rejection sampling so no face is biased. The system (non-seeded) source uses Web Crypto `getRandomValues` when present, falling back to `Math.random`, and is explicitly non-reproducible.
- **Rationale:** xoshiro128\*\* is a public-domain, well-studied generator that is fast and exactly reproducible in JavaScript's 32-bit integer semantics, unlike float-based approaches. cyrb128 turns human-friendly string seeds ("table-42") into well-mixed state. Rejection sampling removes modulo bias without floating-point involvement.
- **Consequences:** Replays, tests, and cross-device synchronization can rely on identical outcomes from identical seeds. Cryptographic unpredictability is explicitly **not** guaranteed for seeded sequences; provenance metadata records which source produced each result. Verifiable fairness remains future scope.
- **Alternatives considered:** `Math.random` with no seeding (not reproducible); PCG32 (needs 64-bit emulation in JS); Mersenne Twister (large state, slower); float-based mulberry32 pipelines (risk of cross-engine drift).

## ADR-0006: Dice notation grammar v1 and event schema v1

- **Date:** 2026-07-25
- **Status:** Accepted
- **Decision:** Notation grammar v1 is `[sign] term { ("+"|"-") term }` where a term is an integer modifier or a dice group `[count]d(sides|%)` with optional `kh`/`kl`/`dh`/`dl` selection (count defaults to 1). It is case-insensitive and whitespace-tolerant; `d%` means d100; sides are restricted to {4, 6, 8, 10, 12, 20, 100}. Limits: 100 dice per group, 20 terms, modifiers up to 1,000,000, 500-character expressions, and at least one dice group per expression. Event records (`RollResult`, `CoinFlipResult`) carry `schemaVersion: 1`, are deeply frozen, preserve per-die rolled order with `kept` flags, and embed RNG provenance. Keep/drop ties are broken in favor of earlier-rolled dice. Serialization is canonical JSON; deserialization validates structure and internal consistency (subtotals and totals recomputed), drops unknown fields, and rejects unknown schema versions with a dedicated error code. Additive optional fields keep the version; renaming, removing, or re-meaning fields bumps `schemaVersion` with documented migration.
- **Rationale:** A small, unambiguous grammar covers the dominant tabletop cases (modifiers, advantage/disadvantage via `2d20kh1`/`2d20kl1`, ability-score `4d6dl1`, percentile) without committing to a full expression language. Consistency validation makes deserialized records trustworthy inputs for presenters and replay. Explicit limits bound memory and keep records renderable.
- **Consequences:** Exotic notation (exploding dice, rerolls, custom dice) requires grammar extensions in the 0.3.0 plugin/extension milestone, not silent core growth. Old cores reject records from future schema versions cleanly rather than mis-rendering them.
- **Alternatives considered:** Adopting a full existing dice-expression language (large surface, licensing/compatibility risk); arbitrary die sizes in v1 (blocks curated presentation and asset mapping); mutable result objects (invites presentation-layer outcome tampering).

## ADR template

```md
## ADR-XXXX: Short title

- **Date:** YYYY-MM-DD
- **Status:** Proposed | Accepted | Superseded
- **Decision:**
- **Rationale:**
- **Consequences:**
- **Alternatives considered:**
```
