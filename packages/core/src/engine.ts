import type { DieDefinition } from "./dice/definition.js";
import { createDieRegistry } from "./dice/definition.js";
import { parseDiceNotation } from "./notation/parser.js";
import type { CoinFlipResult, RollResult } from "./records.js";
import { resolveCoinFlip } from "./resolve/coin.js";
import { resolveRoll } from "./resolve/roll.js";
import { createSystemRandomSource } from "./rng/system.js";
import type { RandomSource } from "./rng/types.js";

export type DiceEngineOptions = {
  /**
   * Randomness provider consumed by every roll and flip, in order. Defaults
   * to the non-reproducible system source; pass `createSeededRandomSource`
   * for deterministic, replayable results.
   */
  readonly random?: RandomSource;
  /**
   * Custom dice this engine can roll, named in notation as `d{id}` (ADR-0015).
   * Plain numeric dice such as `d3` or `d30` need no definition.
   */
  readonly dice?: readonly DieDefinition[];
};

export interface DiceEngine {
  /**
   * Parses and resolves a dice notation expression such as "2d20kh1+3", or
   * "4d{fate}" for a die given to `createDiceEngine`. Throws
   * `DiceNotationError` for invalid notation; never touches the network, a
   * renderer, or the DOM.
   */
  roll(expression: string): RollResult;
  /** Resolves a fair coin flip. */
  flipCoin(): CoinFlipResult;
  /** The custom dice this engine knows, in the order they were given. */
  readonly dice: readonly DieDefinition[];
}

/**
 * Creates the headless DiceForge engine. All state lives in the injected
 * random source; the engine itself holds no other mutable state.
 */
export function createDiceEngine(options: DiceEngineOptions = {}): DiceEngine {
  const random = options.random ?? createSystemRandomSource();
  const definitions = options.dice ?? [];
  const dice = createDieRegistry(definitions);
  return {
    dice: Object.freeze([...definitions]),
    roll: (expression) => resolveRoll(parseDiceNotation(expression, { dice }), random, { dice }),
    flipCoin: () => resolveCoinFlip(random),
  };
}
