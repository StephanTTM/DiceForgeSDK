import type { CoinFlipResult } from "../records.js";
import { deepFreeze, EVENT_SCHEMA_VERSION } from "../records.js";
import { rollFace } from "../rng/sample.js";
import type { RandomSource } from "../rng/types.js";

/** Resolves a fair coin flip into an immutable, serializable record. */
export function resolveCoinFlip(random: RandomSource): CoinFlipResult {
  const face = rollFace(random, 2);
  return deepFreeze({
    kind: "coin-flip",
    schemaVersion: EVENT_SCHEMA_VERSION,
    outcome: face === 1 ? "heads" : "tails",
    provenance: random.provenance(),
  });
}
