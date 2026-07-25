import type { RandomSource, SeededProvenance } from "./types.js";

/**
 * cyrb128 string hash: expands arbitrary text into four well-mixed 32-bit words.
 * The exact constants are part of the reproducibility contract (ADR-0005);
 * changing them changes every seeded sequence and requires a superseding ADR.
 */
function hashSeed(text: string): [number, number, number, number] {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let i = 0; i < text.length; i++) {
    const k = text.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  return [(h1 ^ h2 ^ h3 ^ h4) >>> 0, (h2 ^ h1) >>> 0, (h3 ^ h1) >>> 0, (h4 ^ h1) >>> 0];
}

function rotl(x: number, k: number): number {
  return ((x << k) | (x >>> (32 - k))) >>> 0;
}

/**
 * Creates a reproducible random source seeded from a string or number.
 *
 * Guarantee: the same seed produces the same `nextUint32()` sequence on every
 * platform and every core release, until a superseding ADR declares a breaking
 * algorithm change. Numeric seeds are equivalent to their string form
 * (`createSeededRandomSource(42)` === `createSeededRandomSource("42")`).
 *
 * The generator is xoshiro128** (public domain, Blackman & Vigna) implemented
 * with 32-bit integer operations only, so results are identical across
 * JavaScript engines.
 */
export function createSeededRandomSource(seed: string | number): RandomSource {
  const seedText = String(seed);
  let [s0, s1, s2, s3] = hashSeed(seedText);
  if ((s0 | s1 | s2 | s3) === 0) {
    // xoshiro must never start at the all-zero state.
    [s0, s1, s2, s3] = [0x9e3779b9, 0x243f6a88, 0xb7e15162, 0x8aed2a6a];
  }
  const provenance: SeededProvenance = Object.freeze({
    source: "seeded",
    seed: seedText,
    algorithm: "xoshiro128**",
  });
  return {
    nextUint32(): number {
      const result = Math.imul(rotl(Math.imul(s1, 5) >>> 0, 7), 9) >>> 0;
      const t = (s1 << 9) >>> 0;
      s2 = (s2 ^ s0) >>> 0;
      s3 = (s3 ^ s1) >>> 0;
      s1 = (s1 ^ s2) >>> 0;
      s0 = (s0 ^ s3) >>> 0;
      s2 = (s2 ^ t) >>> 0;
      s3 = rotl(s3, 11);
      return result;
    },
    provenance: () => provenance,
  };
}
