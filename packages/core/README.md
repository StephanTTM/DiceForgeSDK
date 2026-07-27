# @diceforge-sdk/core

Headless, renderer-agnostic dice and coin-flip engine: seedable RNG, dice notation, and schema-versioned, replayable event records. Zero runtime dependencies; runs in Node (>= 20), browsers, and workers. Part of [DiceForge SDK](https://github.com/StephanTTM/DiceForgeSDK).

```ts
import { createDiceEngine, createSeededRandomSource } from "@diceforge-sdk/core";

const engine = createDiceEngine({ random: createSeededRandomSource("table-42") });

const roll = engine.roll("2d20kh1+3"); // frozen, serializable RollResult
const flip = engine.flipCoin();        // "heads" | "tails" with provenance

roll.total;      // resolved without any renderer or network
roll.provenance; // { source: "seeded", seed: "table-42", algorithm: "xoshiro128**" }
```

- **Deterministic**: the same seed produces the same results on every platform and release (a breaking RNG change requires a documented ADR).
- **Notation v1**: `[count]d(sides|%)` for d4–d100, `kh`/`kl`/`dh`/`dl` keep/drop, `+`/`-` modifiers — advantage is `2d20kh1`, ability scores `4d6dl1`.
- **Trustworthy records**: results are deeply frozen and `serializeEvent`/`deserializeEvent` validate structure and totals, so downstream consumers can rely on them.
- **Presentation-ready**: pair with [`@diceforge-sdk/renderer-web`](https://www.npmjs.com/package/@diceforge-sdk/renderer-web) for 3D dice, or implement the `InteractionPresenter` contract yourself. A presenter declares what it can do (`capabilities`), and `presentationSupport(capabilities, event)` answers whether it covers a given roll — so applications ask rather than feature-detect.

Full API reference, grammar, and determinism guarantees: [API.md](https://github.com/StephanTTM/DiceForgeSDK/blob/main/API.md).

Stability: experimental (pre-1.0) — minor versions may change APIs; serialized records carry `schemaVersion` for compatibility.

MIT © DiceForgeSDK contributors
