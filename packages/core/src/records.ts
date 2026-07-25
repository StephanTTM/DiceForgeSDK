import type { DieSides } from "./notation/ast.js";
import type { RandomProvenance } from "./rng/types.js";

/**
 * Version of the serialized event shape. Additive, optional fields keep the
 * version; renaming, removing, or re-meaning fields bumps it and requires a
 * migration note (ADR-0006).
 */
export const EVENT_SCHEMA_VERSION = 1;

/** One physical die inside a roll, in rolled order. */
export type DieOutcome = {
  readonly sides: DieSides;
  /** Face rolled, 1..sides. */
  readonly value: number;
  /** False when a keep/drop selection removed this die from the subtotal. */
  readonly kept: boolean;
};

/** The outcome of one dice group term such as "2d20kh1". */
export type RollGroupOutcome = {
  /** Canonical notation for this group, e.g. "2d20kh1". */
  readonly notation: string;
  readonly sign: 1 | -1;
  readonly sides: DieSides;
  readonly dice: readonly DieOutcome[];
  /** Sum of kept die values, before the sign is applied. */
  readonly subtotal: number;
};

export type RollResult = {
  readonly kind: "roll";
  readonly schemaVersion: typeof EVENT_SCHEMA_VERSION;
  /** Canonical form of the rolled expression, e.g. "2d20kh1+3". */
  readonly expression: string;
  readonly groups: readonly RollGroupOutcome[];
  /** Net signed contribution of all constant terms. */
  readonly modifier: number;
  readonly total: number;
  readonly provenance: RandomProvenance;
};

export type CoinFlipResult = {
  readonly kind: "coin-flip";
  readonly schemaVersion: typeof EVENT_SCHEMA_VERSION;
  readonly outcome: "heads" | "tails";
  readonly provenance: RandomProvenance;
};

/** Every event record the core can produce. */
export type InteractionEvent = RollResult | CoinFlipResult;

/** Recursively freezes a record so resolved outcomes are tamper-evident. */
export function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const key of Object.keys(value)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
    Object.freeze(value);
  }
  return value;
}
