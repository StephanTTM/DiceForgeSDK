# Contributing to DiceForge SDK

Thanks for contributing. DiceForge values small, well-tested changes that make cross-platform integration simpler.

## Before you begin

1. Read `README.md`, `ARCHITECTURE.md`, `DECISIONS.md`, `API.md`, and `TASKS.md`.
2. Search existing issues and decision records before proposing a new abstraction.
3. Open a discussion or issue for significant API, architecture, package, or dependency changes.

## Contribution expectations

- Keep the core independent from renderers, game engines, UI frameworks, and mandatory network services.
- Include focused automated tests for behavior changes.
- Update public API docs, examples, task status, roadmap, and/or decision records when your change affects them.
- Keep changes narrowly scoped and explain user-facing impact.
- Preserve deterministic behavior and serialization compatibility, or document a deliberate change.

## Development workflow

The workspace uses npm (ships with Node >= 20), Vitest, Biome, and plain `tsc` (ADR-0004). From the repository root:

```bash
npm ci                 # install exact locked dependencies
npm run check          # Biome lint + format check
npm run format         # apply Biome formatting
npm run typecheck      # TypeScript, no emit
npm test               # Vitest (npm run test:coverage for coverage)
npm run build          # compile @diceforge/core to packages/core/dist
npm run example        # build, then run the headless example
```

All of these must pass before a pull request; CI runs the same gates on Node 20 and 24. Seeded-RNG golden tests lock the reproducibility contract — never update those constants without a superseding ADR (see ADR-0005).

## Pull requests

Use a clear title and include:

- What changed and why.
- Tests added or run.
- Documentation updated.
- Any compatibility, asset-license, or platform implications.

Maintainers may request an ADR for changes affecting the core boundary, plugin contracts, public API, result schemas, or supported platforms.

## Asset contributions

Do not add third-party art, models, textures, or audio without a documented license that permits the intended redistribution. Include attribution and provenance where required. Keep optional assets out of the core package.

## Community standards

By participating, you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).
