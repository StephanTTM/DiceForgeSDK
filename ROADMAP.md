# Roadmap

This roadmap states intent, not release promises. Priorities favor a small reliable core and low-friction integration over visual breadth.

## Foundation — 0.1.0

- Establish the TypeScript workspace, package conventions, test runner, linting, formatting, and CI.
- Implement headless dice definitions for d4, d6, d8, d10, d12, d20, and d100.
- Implement a coin-flip domain model and resolver.
- Provide injected seeded and system RNG providers.
- Deliver basic dice notation, result records, serialization, documentation, and conformance tests.

## Web presentation — 0.2.0

- Ship a browser-focused adapter and first 3D renderer plugin.
- Provide a minimal no-framework example and one popular-framework example.
- Support theme and asset loading as optional presentation concerns.
- Add clear graceful fallback behavior for headless or reduced-motion contexts.

## Extensibility — 0.3.0

- Stabilize plugin contracts and capability discovery.
- Add custom dice definitions and notation extensions.
- Add replay records and schema-versioning policy.
- Publish plugin-author documentation and compatibility tests.

## Engine adapters — 0.4.0

- Prototype Unity adapter with documented install path and end-to-end sample.
- Prototype Godot adapter with documented install path and end-to-end sample.
- Verify that adapters share identical core result semantics.

## 1.0 readiness

- Stabilize public APIs and serialized event schema.
- Complete supported-platform test matrix and migration policy.
- Publish security, release, and long-term maintenance policies.

## Explicit non-goals for the first releases

- Mandatory accounts, servers, or multiplayer services.
- Trying to outperform specialized products on photorealistic rendering alone.
- Broad tabletop mechanics beyond dice and coin flips.
