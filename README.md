# DiceForge SDK

> One dice API for web apps and game engines.

DiceForge SDK is an open-source, offline-first toolkit for deterministic dice rolls and optional 3D presentation. Its renderer-agnostic core can run headlessly; adapters make the same roll experience easy to integrate with web applications, Unity, and Godot.

## Why DiceForge?

- **Renderer-agnostic core** — rules, randomness, roll state, and replay data do not depend on a graphics library or engine.
- **Offline first** — local rolls work without a service or account. Networking is an optional plugin concern.
- **Easy integration** — one consistent API, with focused adapters instead of application-specific forks.
- **Visuals are optional** — resolve a trustworthy headless result, then animate that result when a renderer is available.
- **Extensible by design** — physics, renderers, dice definitions, themes, audio, and integrations are replaceable plugins.

## Planned capabilities

- Standard polyhedral dice: d4, d6, d8, d10, d12, d20, and percentile dice.
- Dice notation and roll policies such as modifiers, keep/drop, advantage, and deterministic seeds.
- Coin flips, including a headless resolver and optional animated presentation.
- Adapters for web first, followed by Unity and Godot.
- Record/replay data for debugging, animation, and later synchronization providers.

## Conceptual API

```ts
const engine = createDiceEngine({ rng: seededRng("table-42") });

const roll = engine.roll("2d20kh1+3");
const flip = engine.flipCoin();

// A renderer may later present the already-resolved event.
await presenter.present(roll);
```

The public API is illustrative until the first release. See [API.md](API.md) for design direction.

## Project status

The repository is in the foundation phase. Interfaces and package names may change before the first public release. See [ROADMAP.md](ROADMAP.md) and [TASKS.md](TASKS.md).

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
