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

## Development workflow (to be finalized)

The initial implementation will define the exact package manager and commands. Until then, do not invent commands in documentation or automation. The expected quality gates are type checking, linting, formatting, unit tests, and integration/conformance tests for adapters.

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
