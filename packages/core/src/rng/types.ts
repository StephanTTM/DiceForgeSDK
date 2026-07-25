/** Provenance of a reproducible, seed-derived random sequence. */
export type SeededProvenance = {
  readonly source: "seeded";
  /** The seed exactly as provided, converted to a string. */
  readonly seed: string;
  readonly algorithm: "xoshiro128**";
};

/** Provenance of a non-reproducible platform random sequence. */
export type SystemProvenance = {
  readonly source: "system";
  readonly algorithm: "crypto-get-random-values" | "math-random";
};

export type RandomProvenance = SeededProvenance | SystemProvenance;

/**
 * The only randomness contract the core consumes. Implementations must return
 * uniformly distributed unsigned 32-bit integers; the core derives die faces
 * from them without additional bias.
 */
export interface RandomSource {
  nextUint32(): number;
  /** Describes where randomness came from; embedded verbatim in result records. */
  provenance(): RandomProvenance;
}
