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

## Extensibility — 0.3.0 and 0.4.0 *(shipped)*

- Publish the first-party dice as an optional asset package so 3D works from `npm install`.
- Stabilize plugin contracts and capability discovery.
- Add custom dice definitions and notation extensions.
- Add replay records and schema-versioning policy.
- Publish plugin-author documentation and compatibility tests.

Still open from this line: contracts for the plugin categories beyond
presentation — physics, audio, transport — which wait on a second
implementation to shape them rather than being guessed at in advance.

## Motion — 0.5.0 *(shipped)*

- Ship physics-driven dice as an optional plugin, without letting a simulation choose an outcome.
- Prove the presenter contract holds for an implementation it was not designed around.
- Put the visual regression suite on a platform-stable footing so it can gate CI.

## Coin and guard-rails — 0.6.0 *(shipped)*

- Flip coins under the same physics as the dice, in the same tray.
- Tie every die value to the numeral printed on the shipped model, in CI.
- Make the pre-publish tarball check a repeatable command.

## Sound, a second engine, and a stable core — 0.7.0 *(shipped)*

- Impact-driven audio: sounds derived from the recorded trajectory's own collisions, not played on a timer. *(ADR-0020)*
- Synthesized rather than sampled, so no audio assets need sourcing or licensing to start.
- No audio plugin contract yet — the first implementation shapes it, a later second one justifies it.
- DiceForge running natively in Godot, held to the core's own conformance vectors. *(ADR-0021)*
- Rerolls and explosions presented as stories, on every platform, with the settled stage summing to the record.
- The headless core declared stable, changes additive-by-ADR. *(ADR-0022)*

## Engine adapters *(in progress — Godot first)*

- Hold every non-TypeScript port to conformance vectors exported by the core, so identical result semantics are verified mechanically. *(shipped — ADR-0021)*
- Godot: headless engine as a GDScript addon. *(shipped, 57/57 vectors in Godot 4.7)*
- Godot: presentation — dice in a scene, themes, an end-to-end sample.
- Unity: C# port against the same vectors, install path, end-to-end sample.

## 1.0 readiness

1.0 is earned by a checklist, not declared by a feeling. The core's contract is
already stable (ADR-0022) and binding regardless of the version number, so the
0.x line continues until every item below is done — the version lock means a
`1.0.0` also freezes the presentation packages, and those are still moving.

- [x] Stabilize public APIs and serialized event schema. *(ADR-0022: grammar v1.2, schema v2, the RNG and presenter contracts, and the conformance vectors are frozen; changes are additive-by-ADR from 2026-07-30)*
- [ ] **Unity C# port passing the same conformance vectors.** The portability claim — same seed, same rolls, every platform — is proven once today. 1.0 should prove it twice.
- [ ] **Knock voices tuned with the product owner listening.** The one piece of shipped presentation flagged as not-right (reads high pitched, 2026-07-28).
- [ ] **The near-edge-on fallback pose fixed** in `simulateRoll`/`simulateCoinFlip` — the one known physics blemish, a 1-in-~300 tail.
- [ ] **Godot Asset Library listing live**, so the second platform's install story is reachable by its audience, not just by a branch URL.
- [ ] Complete supported-platform test matrix and migration policy.
- [ ] Publish security, release, and long-term maintenance policies.

Success-counting pools (`7d10>=8` — World of Darkness, Shadowrun) are
deliberately **post-1.0**: the one dice family whose result is not a sum,
deferred by decision until a real integration shapes the dialect, and additive
when it comes (ADR-0022).

## Explicit non-goals for the first releases

- Mandatory accounts, servers, or multiplayer services.
- Trying to outperform specialized products on photorealistic rendering alone.
- Broad tabletop mechanics beyond dice and coin flips.
