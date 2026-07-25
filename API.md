# API Design Guide

This document describes intended public contracts. Names may evolve before 1.0; any implemented API must update this document and its runnable examples.

## Core principles

- Every outcome is resolvable without a renderer.
- Core methods return serializable domain data, not platform objects.
- Randomness is injected and identifiable in result provenance when possible.
- Presentation receives result records and must not change the authoritative outcome.

## Illustrative TypeScript API

```ts
type DiceEngine = {
  roll(expression: string, options?: RollOptions): RollResult;
  flipCoin(options?: CoinFlipOptions): CoinFlipResult;
};

type RollResult = {
  kind: "roll";
  schemaVersion: 1;
  expression: string;
  dice: readonly DieOutcome[];
  total: number;
  provenance: RandomProvenance;
};

type CoinFlipResult = {
  kind: "coin-flip";
  schemaVersion: 1;
  outcome: "heads" | "tails";
  provenance: RandomProvenance;
};
```

The final API must define error behavior, validation limits, notation grammar, immutability semantics, serialization, and backwards compatibility. Do not expose a renderer or physics engine through these core types.

## Presentation contract (direction)

```ts
interface InteractionPresenter {
  present(event: RollResult | CoinFlipResult, options?: PresentationOptions): Promise<void>;
}
```

A presenter may map event data to visual geometry, motion, audio, or haptics. It must document its capabilities and degraded behavior. A failed presentation must not invalidate a successfully resolved core event.

## API documentation checklist

For each public export, document purpose, parameters, return shape, errors, determinism behavior, examples, platform support, and stability level.
