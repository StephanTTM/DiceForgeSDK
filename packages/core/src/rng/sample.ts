import { DiceForgeError } from "../errors.js";
import type { RandomSource } from "./types.js";

const UINT32_RANGE = 0x100000000;

/**
 * Uniform integer in [1, sides]. Uses rejection sampling so every face has
 * exactly equal probability regardless of die size (plain modulo would favor
 * low faces).
 */
export function rollFace(source: RandomSource, sides: number): number {
  if (!Number.isInteger(sides) || sides < 1 || sides > UINT32_RANGE) {
    throw new DiceForgeError(
      "invalid-argument",
      `sides must be an integer between 1 and ${UINT32_RANGE}, got ${sides}`,
    );
  }
  const limit = UINT32_RANGE - (UINT32_RANGE % sides);
  let value = source.nextUint32();
  while (value >= limit) {
    value = source.nextUint32();
  }
  return (value % sides) + 1;
}
