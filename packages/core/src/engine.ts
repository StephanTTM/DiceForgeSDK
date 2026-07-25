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
};

export interface DiceEngine {
  /**
   * Parses and resolves a dice notation expression such as "2d20kh1+3".
   * Throws `DiceNotationError` for invalid notation; never touches the
   * network, a renderer, or the DOM.
   */
  roll(expression: string): RollResult;
  /** Resolves a fair coin flip. */
  flipCoin(): CoinFlipResult;
}

/**
 * Creates the headless DiceForge engine. All state lives in the injected
 * random source; the engine itself holds no other mutable state.
 */
export function createDiceEngine(options: DiceEngineOptions = {}): DiceEngine {
  const random = options.random ?? createSystemRandomSource();
  return {
    roll: (expression) => resolveRoll(parseDiceNotation(expression), random),
    flipCoin: () => resolveCoinFlip(random),
  };
}
