import type { RandomProvenance } from "./rng/types.js";

/**
 * Version of the serialized event shape. Additive, optional fields keep the
 * version; renaming, removing, or re-meaning fields bumps it and requires a
 * migration note (ADR-0006).
 *
 * Version 2 (ADR-0015) widened `sides` to any face count and `value` to any
 * integer, so a custom die can record faces that are not 1..N, and added the
 * optional `die` and `label`. Version 1 records still deserialize: their
 * values are already valid version 2, and reading one returns a version 2
 * record with the same numbers.
 */
export const EVENT_SCHEMA_VERSION = 2;

/** Schema versions this core can read. */
export const SUPPORTED_SCHEMA_VERSIONS: readonly number[] = [1, 2];

/** One physical die inside a roll, in rolled order. */
export type DieOutcome = {
  /** How many faces the die has. */
  readonly sides: number;
  /**
   * What the die contributes: the face rolled (1..sides) for a plain numeric
   * die, or the face's value for a custom one, which may be negative or zero.
   */
  readonly value: number;
  /** False when a keep/drop selection removed this die from the subtotal. */
  readonly kept: boolean;
  /** Custom die this came from, when it was not a plain numeric die. */
  readonly die?: string;
  /** How the face reads, when that differs from the value. */
  readonly label?: string;
};

/** The outcome of one dice group term such as "2d20kh1". */
export type RollGroupOutcome = {
  /** Canonical notation for this group, e.g. "2d20kh1", "4d{fate}". */
  readonly notation: string;
  readonly sign: 1 | -1;
  /** Face count of every die in the group. */
  readonly sides: number;
  /** Custom die name, when the group rolled one. */
  readonly die?: string;
  readonly dice: readonly DieOutcome[];
  /** Sum of kept die values, before the sign is applied. */
  readonly subtotal: number;
};

export type RollResult = {
  readonly kind: "roll";
  readonly schemaVersion: number;
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
  readonly schemaVersion: number;
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
