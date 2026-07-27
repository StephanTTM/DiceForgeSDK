# DiceForge SDK

> One dice API for web apps and game engines.

[![CI](https://github.com/StephanTTM/DiceForgeSDK/actions/workflows/ci.yml/badge.svg)](https://github.com/StephanTTM/DiceForgeSDK/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@diceforge-sdk/core.svg?label=%40diceforge-sdk%2Fcore)](https://www.npmjs.com/package/@diceforge-sdk/core)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Roll dice deterministically, then — optionally — show them in 3D. The engine resolves every outcome headlessly, with no renderer, network, or DOM in sight; the presenter animates that already-decided result. Because the two are separate, the same roll behaves identically in a test, a server, and a browser.

```ts
import { createDiceEngine, createSeededRandomSource } from "@diceforge-sdk/core";

const engine = createDiceEngine({ random: createSeededRandomSource("table-42") });

engine.roll("2d20kh1+3"); // advantage, +3 — frozen, serializable, replayable
engine.flipCoin();        // { outcome: "heads" | "tails", ... }
```

## Why it is built this way

- **The result is decided before anything is drawn.** Presentation consumes a resolved record and cannot change it — a die's animation ends on the face the engine already chose, by construction rather than by correction.
- **Deterministic where it matters.** The same seed produces the same rolls on every platform and release. Golden tests lock the generator; changing it is a documented breaking change.
- **Offline and dependency-light.** The core has zero runtime dependencies and never touches the network. Multiplayer is an opt-in plugin concern, not a baseline assumption.
- **Trustworthy records.** Results are deeply frozen and schema-versioned; deserialization re-checks totals, so a record you load is a record you can rely on.
- **Extensible by design.** Renderers, themes, physics, audio and transports sit behind small contracts instead of forks.

## Install

```bash
npm install @diceforge-sdk/core            # headless engine, zero dependencies
npm install @diceforge-sdk/renderer-web    # + browser presentation (pulls in three.js)
npm install @diceforge-sdk/assets-forge    # + the 3D dice themselves (optional)
```

Both are ESM-only. The core runs anywhere with ES2022 — Node 20+, browsers, workers; the renderer needs a DOM, and uses WebGL when it can.

## What works today

| Area | Status |
| --- | --- |
| Dice d4–d20, d100/percentile, coin flips | Resolved headlessly, fully tested |
| Notation `2d20kh1+3`, `4d6dl1`, `d%` | Grammar v1, with positioned parse errors |
| Seeded + system randomness | Reproducible across platforms, provenance recorded per result |
| Serialization and replay | `schemaVersion: 2`, validated on read; sessions replay without re-rolling |
| Browser presentation | Three.js dice, DOM fallback, reduced motion, aria-live announcements |
| Themes | First-party textured set: every shape plus a two-faced coin, in five colours, installable from npm |
| Unity / Godot adapters | Not started — see [ROADMAP.md](ROADMAP.md) |

## Showing dice in the browser

```ts
import { forgeAssets } from "@diceforge-sdk/assets-forge";
import { createDicePresenter, forgeTheme } from "@diceforge-sdk/renderer-web";

const presenter = createDicePresenter({
  container: document.querySelector("#stage")!,
  theme: forgeTheme(forgeAssets({ color: "red" })),
});

await presenter.present(engine.roll("4d6dl1"));
```

**3D needs art, and the code packages ship none.** The dice are a separate optional install: `@diceforge-sdk/assets-forge` carries the models and textures and hands back URLs your bundler emits, so nothing has to be copied or hosted ([ADR-0013](DECISIONS.md)). Prefer to serve them yourself? Pass `forgeTheme({ baseUrl: "/dice-assets", color: "red" })` instead. Without a theme the presenter still works — it falls back to accessible labelled tiles and reports `mode: "dom"` — but there is nothing to draw in 3D ([ADR-0012](DECISIONS.md)).

Full options, fallback behaviour and theming are in the [renderer README](packages/renderer-web/README.md).

## Try it

```bash
npm ci
npm run example      # headless: seeded rolls and serialization, in the terminal
npm run demo:web     # browser demo: 3D dice, themes, fallbacks
npm run demo:react   # the same, inside React
```

## Project status

**0.3.0** is on npm: [`@diceforge-sdk/core`](https://www.npmjs.com/package/@diceforge-sdk/core), [`@diceforge-sdk/renderer-web`](https://www.npmjs.com/package/@diceforge-sdk/renderer-web), and the optional [`@diceforge-sdk/assets-forge`](https://www.npmjs.com/package/@diceforge-sdk/assets-forge). 0.2.0 completed the web presentation milestone — the Three.js presenter, themes, the first-party dice, and the React and browser examples; 0.3.0 made those dice installable. See the [changelog](CHANGELOG.md).

APIs are experimental before 1.0 and may change between minor versions. Serialized records carry a `schemaVersion` so stored results survive those changes.

## Documentation

| | |
| --- | --- |
| [API.md](API.md) | Public contracts, notation grammar, determinism guarantees |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Package boundaries and the rules that keep the core portable |
| [DECISIONS.md](DECISIONS.md) | Architecture decision records — why things are the way they are |
| [ROADMAP.md](ROADMAP.md) · [TASKS.md](TASKS.md) | Where this is going, and what is in flight |
| [CONTRIBUTING.md](CONTRIBUTING.md) · [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) | How to build, test, and take part |
| [packages/testing](packages/testing/README.md) | Writing a presenter, and the conformance suite that checks one |
| [CHANGELOG.md](CHANGELOG.md) | What changed, and when |

Two pieces of tooling have their own guides: the [Blender dice generator](tools/blender/README.md), which produces the first-party models and textures, and the [visual regression suite](tools/vrt/README.md), which catches renderer changes that unit tests cannot see.

## Assets and licensing

The dice are first-party and MIT licensed, generated by the [Blender pipeline](tools/blender/README.md), and published as [`@diceforge-sdk/assets-forge`](packages/assets-forge/README.md) — an optional package, so an install of the engine or the renderer still carries no art. Provenance and the rules for any third-party pack are recorded in [`assets/LICENSES.md`](assets/LICENSES.md).

## License

MIT. See [LICENSE](LICENSE).
