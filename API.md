# API Reference — `@diceforge-sdk/core`

Stability: **experimental (pre-0.1 release)**. Names may still change before 1.0; every change to an implemented export updates this document in the same change set. The package is ESM-only, has no runtime dependencies, and runs in any ES2022 environment (Node >= 20, modern browsers, workers).

## Core principles

- Every outcome is resolvable without a renderer, network, or DOM.
- Core methods return frozen, serializable domain data — never platform objects.
- Randomness is injected and identified in each record's `provenance`.
- Presentation consumes result records and cannot change the authoritative outcome.

## Engine

```ts
import { createDiceEngine, createSeededRandomSource } from "@diceforge-sdk/core";

const engine = createDiceEngine({ random: createSeededRandomSource("table-42") });
const roll = engine.roll("2d20kh1+3"); // RollResult
const flip = engine.flipCoin();        // CoinFlipResult
```

### `createDiceEngine(options?: DiceEngineOptions): DiceEngine`

| Option   | Type           | Default                      | Meaning                                   |
| -------- | -------------- | ---------------------------- | ----------------------------------------- |
| `random` | `RandomSource` | `createSystemRandomSource()` | Randomness consumed by every roll/flip.   |

`DiceEngine.roll(expression)` parses and resolves dice notation; it throws `DiceNotationError` for invalid input. `DiceEngine.flipCoin()` resolves a fair coin flip. The engine holds no state besides the injected random source, so one engine per seed gives a reproducible sequence of results.

Advanced consumers can call the layers directly: `parseDiceNotation(expression)` returns the AST (`DiceExpression`), and `resolveRoll(ast, random)` / `resolveCoinFlip(random)` produce records from it.

## Dice notation grammar v1

```ebnf
expression := [sign] term { sign term }
sign       := "+" | "-"
term       := dice | integer
dice       := [count] "d" (sides | "%") [selection]
selection  := ("kh" | "kl" | "dh" | "dl") [count]
```

- Case-insensitive; whitespace is allowed around terms and signs, but not inside a dice group.
- Supported sides: **4, 6, 8, 10, 12, 20, 100**; `d%` is shorthand for `d100`.
- `kh`/`kl` keep the highest/lowest N dice; `dh`/`dl` drop them. N defaults to 1 (`2d20kh` = `2d20kh1`). Advantage is `2d20kh1`, disadvantage `2d20kl1`, ability scores `4d6dl1`.
- Ties select earlier-rolled dice first, so keep/drop is deterministic.
- Limits (exported as constants): `MAX_DICE_PER_GROUP` 100, `MAX_TERMS` 20, `MAX_MODIFIER` 1,000,000, `MAX_EXPRESSION_LENGTH` 500 characters, and at least one dice group per expression.

Errors: `DiceNotationError` (extends `DiceForgeError`, `code: "notation"`) with a zero-based `position` pointing into the original expression.

## Result records

All records are deeply frozen (`Object.freeze`), JSON-serializable, and carry `schemaVersion` (`EVENT_SCHEMA_VERSION`, currently `1`).

```ts
type RollResult = {
  kind: "roll";
  schemaVersion: 1;
  expression: string;            // canonical form, e.g. "2d20kh1+3"
  groups: readonly RollGroupOutcome[];
  modifier: number;              // net signed constant terms
  total: number;
  provenance: RandomProvenance;
};

type RollGroupOutcome = {
  notation: string;              // "2d20kh1"
  sign: 1 | -1;
  sides: DieSides;               // 4 | 6 | 8 | 10 | 12 | 20 | 100
  dice: readonly DieOutcome[];   // in rolled order
  subtotal: number;              // sum of kept values, before sign
};

type DieOutcome = { sides: DieSides; value: number; kept: boolean };

type CoinFlipResult = {
  kind: "coin-flip";
  schemaVersion: 1;
  outcome: "heads" | "tails";
  provenance: RandomProvenance;
};

type InteractionEvent = RollResult | CoinFlipResult;
```

Dropped dice stay in the record (`kept: false`) so presenters can animate every die while totals remain authoritative.

## Randomness

### `createSeededRandomSource(seed: string | number): RandomSource`

Reproducible source: cyrb128-hashed seed feeding xoshiro128\*\* in pure 32-bit integer math. **Determinism guarantee (ADR-0005):** the same seed produces the same sequence on every platform and every core release; changing the algorithm is a breaking change requiring a superseding ADR. Numeric seeds equal their string form (`42` ≡ `"42"`). Not cryptographically unpredictable.

### `createSystemRandomSource(): RandomSource`

Non-reproducible platform source: Web Crypto `getRandomValues` when available, else `Math.random`. Provenance records which was used.

### `RandomSource`

```ts
interface RandomSource {
  nextUint32(): number;            // uniform unsigned 32-bit integer
  provenance(): RandomProvenance;  // embedded verbatim in result records
}
```

Implement this to plug in any generator; the core derives die faces via rejection sampling, so implementations only need uniform `nextUint32` output.

```ts
type RandomProvenance =
  | { source: "seeded"; seed: string; algorithm: "xoshiro128**" }
  | { source: "system"; algorithm: "crypto-get-random-values" | "math-random" };
```

## Serialization

- `serializeEvent(event: InteractionEvent): string` — canonical JSON; validates first.
- `deserializeEvent(json: string): InteractionEvent` — parses, validates structure **and** internal consistency (die ranges, subtotals, totals), drops unknown fields, and returns a frozen canonical record.
- `validateEventRecord(value: unknown): InteractionEvent` — the same validation for already-parsed values.

Failure modes: `DiceForgeError` with `code: "invalid-event"` for malformed or inconsistent payloads, `code: "unsupported-schema-version"` for payloads from an incompatible core version.

Compatibility policy (ADR-0006): additive optional fields keep `schemaVersion: 1`; renaming, removing, or re-meaning fields bumps the version with documented migration. Current cores reject future versions cleanly.

## Errors

```ts
class DiceForgeError extends Error {
  code: "notation" | "invalid-event" | "unsupported-schema-version" | "invalid-argument";
}
class DiceNotationError extends DiceForgeError { position: number } // code: "notation"
```

`code` values are stable API; message text is not.

## Presentation contract (implemented — ADR-0008)

```ts
interface InteractionPresenter {
  present(event: InteractionEvent, options?: PresentationOptions): Promise<void>;
  dispose?(): void;
}

type PresentationOptions = { signal?: AbortSignalLike };
```

Type-only exports from the core (`InteractionPresenter`, `PresentationOptions`, `AbortSignalLike`). A presenter maps event data to visuals, motion, audio, or haptics; it must never decide or modify outcomes, and a failed or cancelled presentation does not invalidate the resolved event. `AbortSignalLike` is a structural stand-in satisfied by any real `AbortSignal`, so the core's types stay platform-free.

The first implementation is [`@diceforge-sdk/renderer-web`](packages/renderer-web/README.md): Three.js 3D dice with outcome-first animation, a DOM fallback, reduced-motion support, and aria-live announcements (ADR-0007).

## API documentation checklist

For each public export, document purpose, parameters, return shape, errors, determinism behavior, examples, platform support, and stability level.
