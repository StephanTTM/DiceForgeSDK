# DiceForge SDK

> One dice API for web apps and game engines.

DiceForge SDK is an open-source, offline-first toolkit for deterministic dice rolls and optional 3D presentation. Its renderer-agnostic core can run headlessly; adapters make the same roll experience easy to integrate with web applications, Unity, and Godot.

## Why DiceForge?

- **Renderer-agnostic core** — rules, randomness, roll state, and replay data do not depend on a graphics library or engine.
- **Offline first** — local rolls work without a service or account. Networking is an optional plugin concern.
- **Easy integration** — one consistent API, with focused adapters instead of application-specific forks.
- **Visuals are optional** — resolve a trustworthy headless result, then animate that result when a renderer is available.
- **Extensible by design** — physics, renderers, dice definitions, themes, audio, and integrations are replaceable plugins.

## Implemented today (`@diceforge/core`)

- Standard polyhedral dice — d4, d6, d8, d10, d12, d20, d100/percentile — plus coin flips, resolved fully headlessly.
- Dice notation with modifiers and keep/drop (`2d20kh1+3` for advantage, `4d6dl1`, `d%`), with positioned parse errors.
- Injected randomness: a reproducible seeded source (same seed ⇒ same results on every platform) and a non-seeded system source, with provenance recorded in every result.
- Immutable, schema-versioned event records with validating JSON serialization for storage, replay, and future presentation.

Planned next: a web adapter and 3D renderer plugin, then Unity and Godot adapters. See [ROADMAP.md](ROADMAP.md).

## Quick start (headless)

```ts
import { createDiceEngine, createSeededRandomSource } from "@diceforge/core";

const engine = createDiceEngine({ random: createSeededRandomSource("table-42") });

const roll = engine.roll("2d20kh1+3"); // { total, groups, provenance, ... } — frozen and serializable
const flip = engine.flipCoin();        // { outcome: "heads" | "tails", ... }
```

A runnable version lives in [examples/headless/main.mjs](examples/headless/main.mjs) (`npm run example`). Full contracts, the notation grammar, and determinism guarantees are documented in [API.md](API.md).

## Project status

The 0.1.0 foundation core is implemented with tests and CI, but not yet published to npm; interfaces may change before the first public release. To use it today, build from source (`npm ci && npm run build`). See [ROADMAP.md](ROADMAP.md) and [TASKS.md](TASKS.md).

## Repository guides

- [Architecture](ARCHITECTURE.md)
- [Contributing](CONTRIBUTING.md)
- [Code of Conduct](CODE_OF_CONDUCT.md)
- [Changelog](CHANGELOG.md)
- [Claude Code project prompt](PROMPT.md)

## Assets and third-party content

The SDK must remain usable without bundled proprietary assets. Any optional art (including potential KayKit Board Game Bits assets) must be added only after confirming its license, attribution requirements, redistribution rights, and repository policy. Keep asset packs separate from the platform-agnostic core.

## License

MIT. See [LICENSE](LICENSE).
