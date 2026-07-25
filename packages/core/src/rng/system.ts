import type { RandomSource, SystemProvenance } from "./types.js";

type CryptoLike = { getRandomValues(array: Uint32Array): Uint32Array };

function findCrypto(): CryptoLike | undefined {
  const candidate = (globalThis as { crypto?: unknown }).crypto;
  if (
    candidate !== null &&
    typeof candidate === "object" &&
    typeof (candidate as CryptoLike).getRandomValues === "function"
  ) {
    return candidate as CryptoLike;
  }
  return undefined;
}

/**
 * Creates a non-reproducible random source backed by the platform.
 *
 * Uses the Web Crypto `getRandomValues` global when available (Node >= 20 and
 * all modern browsers), falling back to `Math.random`. Neither variant is
 * seedable or replayable; provenance records which one was used. Use
 * `createSeededRandomSource` when reproducibility matters.
 */
export function createSystemRandomSource(): RandomSource {
  const platformCrypto = findCrypto();
  if (platformCrypto) {
    const provenance: SystemProvenance = Object.freeze({
      source: "system",
      algorithm: "crypto-get-random-values",
    });
    const buffer = new Uint32Array(1);
    return {
      nextUint32(): number {
        platformCrypto.getRandomValues(buffer);
        return buffer[0] ?? 0;
      },
      provenance: () => provenance,
    };
  }
  const provenance: SystemProvenance = Object.freeze({
    source: "system",
    algorithm: "math-random",
  });
  return {
    nextUint32: () => Math.floor(Math.random() * 0x100000000),
    provenance: () => provenance,
  };
}
