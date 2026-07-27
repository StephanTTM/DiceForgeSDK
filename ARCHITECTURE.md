# Architecture

## Guiding principle

DiceForge separates **authoritative interaction resolution** from **optional presentation**. A roll or coin flip is domain data first; a 3D animation is a consumer of that data, never its only source of truth.

## Layers

```text
Applications
  └─ Web / Unity / Godot adapters
       └─ Renderer, physics, audio, theme plugins
            └─ Platform-agnostic DiceForge core
                 └─ RNG, notation, definitions, resolver, event records
```

### Core

The core owns dice definitions, notation parsing, random-number interfaces, outcome resolution, roll/flip event records, validation, and serialization contracts. It must be runnable in a headless environment and must not import renderer, game-engine, UI, or networking libraries.

### Plugins

Plugins implement optional capabilities behind core-defined contracts. Initial plugin categories are renderer, physics/presentation simulation, theme, audio, notation extension, and transport/replay storage. Plugins declare what they can do as data rather than leaving applications to feature-detect: a presenter carries `PresenterCapabilities`, and `presentationSupport(capabilities, event)` in the core answers whether an event is covered (ADR-0014). Contracts are added when a second implementation makes them necessary, not in advance.

### Adapters

Adapters offer idiomatic installation and lifecycle APIs for a host platform. They configure core plus chosen plugins; they do not create alternate rules engines. Planned adapters:

- Web: TypeScript package(s), initially a browser renderer integration.
- Unity: a Unity package that maps core event records to C# and Unity presentation.
- Godot: a Godot package/add-on that maps core event records to GDScript/C# and Godot presentation.

## Core data flow

1. An application requests a roll or coin flip.
2. The core validates and resolves it with an injected RNG.
3. The core returns an immutable event record with inputs, outcomes, totals, seed/provenance metadata where available, and format version.
4. A presenter optionally converts the event record into visuals, physics motion, audio, and accessibility feedback.
5. Replay or transport plugins may persist or share the event record; they never become mandatory for local resolution.

## Determinism and fairness

Seeded RNG providers must produce reproducible core results. Presentation physics is allowed to be non-deterministic, but must not alter an already-resolved outcome. The API must clearly label random-source guarantees; cryptographic randomness and verifiable fairness are future scoped extensions, not implied by ordinary RNG.

## Package boundaries (target)

```text
packages/
  core/                 rules, notation, resolver, event schemas   [implemented]
  plugin-contracts/     optional extension interfaces              [presenter contract + capabilities live in core — ADR-0008, ADR-0014]
  renderer-web/         web rendering integration                  [implemented — also serves as the browser adapter, ADR-0007]
  assets-forge/         the first-party die set, art only          [implemented — optional, no code depends on it, ADR-0013]
  presenter-physics/    simulated motion for a resolved roll       [implemented — optional, cannon-es, ADR-0018]
  adapter-unity/        Unity-facing integration                   [future]
  adapter-godot/        Godot-facing integration                   [future]
  testing/              plugin conformance suite                   [implemented — ADR-0014]
examples/               minimal, runnable integration examples     [headless + web demo implemented]
docs/                   user and contributor documentation         [future]
```

This is a target structure, not a reason to create empty packages prematurely. `packages/core` (npm workspace `@diceforge-sdk/core`) ships the ADR-0004 toolchain: ESM-only `tsc` output, Vitest tests colocated as `*.test.ts`, Biome lint/format.

Art is a package, not a dependency. `packages/assets-forge` carries models and textures and exports URLs; nothing imports it — the renderer accepts the URL shape structurally, so installing the engine or the renderer still pulls in no art (ADR-0013). The dependency arrow points from the application at both, never between them.

## Compatibility rules

- Event records must carry a schema version before persistence or transport is introduced.
- Adapters consume public core contracts only.
- Plugins must fail clearly when required capabilities or compatible versions are missing, and must declare capabilities that match their behavior — a declaration is a contract, not a hint.
- Breaking public API or serialized-data changes require a decision record and migration guidance.
