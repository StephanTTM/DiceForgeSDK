import { describe, expect, it } from "vitest";
import { rollFace } from "./sample.js";
import { createSeededRandomSource } from "./seeded.js";

// Known-answer sequences lock the seeded algorithm (ADR-0005). If these fail,
// the reproducibility contract is broken: do not update the constants without
// a superseding ADR declaring a breaking RNG change.
const GOLDEN_SEQUENCES: ReadonlyArray<{ seed: string | number; values: readonly number[] }> = [
  {
    seed: "table-42",
    values: [
      620594660, 8249658, 2420746511, 2562415255, 1748188114, 820627445, 826280001, 2360778102,
    ],
  },
  {
    seed: "diceforge",
    values: [
      1697740581, 740975865, 3837547173, 952298613, 2667865476, 1375008376, 458852519, 3379415171,
    ],
  },
  {
    seed: 42,
    values: [
      164136637, 2507053714, 335270064, 1804198605, 1174834312, 2955824659, 3431101737, 302297811,
    ],
  },
];

describe("createSeededRandomSource", () => {
  it("reproduces the locked golden sequences", () => {
    for (const { seed, values } of GOLDEN_SEQUENCES) {
      const source = createSeededRandomSource(seed);
      expect(values.map(() => source.nextUint32())).toEqual([...values]);
    }
  });

  it("produces identical sequences for identical seeds", () => {
    const a = createSeededRandomSource("same-seed");
    const b = createSeededRandomSource("same-seed");
    for (let i = 0; i < 100; i++) {
      expect(a.nextUint32()).toBe(b.nextUint32());
    }
  });

  it("treats a numeric seed as its string form", () => {
    const numeric = createSeededRandomSource(42);
    const text = createSeededRandomSource("42");
    for (let i = 0; i < 20; i++) {
      expect(numeric.nextUint32()).toBe(text.nextUint32());
    }
  });

  it("produces different sequences for different seeds", () => {
    const a = createSeededRandomSource("seed-a");
    const b = createSeededRandomSource("seed-b");
    const draws = 10;
    let differences = 0;
    for (let i = 0; i < draws; i++) {
      if (a.nextUint32() !== b.nextUint32()) differences++;
    }
    expect(differences).toBeGreaterThan(0);
  });

  it("keeps independent state per source instance", () => {
    const a = createSeededRandomSource("shared");
    const b = createSeededRandomSource("shared");
    a.nextUint32();
    a.nextUint32();
    // b has not advanced, so it still starts at the beginning of the sequence.
    const fresh = createSeededRandomSource("shared");
    expect(b.nextUint32()).toBe(fresh.nextUint32());
  });

  it("stays within uint32 range", () => {
    const source = createSeededRandomSource("range-check");
    for (let i = 0; i < 1000; i++) {
      const value = source.nextUint32();
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(0xffffffff);
    }
  });

  it("reports seeded provenance with the original seed text", () => {
    expect(createSeededRandomSource("table-42").provenance()).toEqual({
      source: "seeded",
      seed: "table-42",
      algorithm: "xoshiro128**",
    });
    expect(createSeededRandomSource(7).provenance()).toMatchObject({
      source: "seeded",
      seed: "7",
    });
  });

  /**
   * Degenerate seeds are part of the same reproducibility contract as the
   * golden sequences above: applications put user text straight into seeds,
   * so an empty field, an emoji, or even a lone surrogate must produce the
   * same stream on every platform and every release. First draws locked from
   * an adversarial probe of the built package.
   */
  it("accepts degenerate seeds deterministically", () => {
    const locked: ReadonlyArray<{ seed: string | number; first: number }> = [
      { seed: "", first: 3381779455 },
      { seed: "💀💀", first: 718141903 },
      { seed: "\uD800", first: 1252319433 }, // a lone surrogate, half an emoji
      { seed: "x".repeat(100_000), first: 3524031551 },
      { seed: Number.NaN, first: 4290949258 },
      { seed: Number.POSITIVE_INFINITY, first: 877592210 },
      { seed: 1.5, first: 1772739166 },
    ];
    for (const { seed, first } of locked) {
      expect(createSeededRandomSource(seed).nextUint32(), `seed ${String(seed)}`).toBe(first);
    }
  });

  it('treats -0 as 0, because String(-0) is "0"', () => {
    const negative = createSeededRandomSource(-0);
    const positive = createSeededRandomSource(0);
    for (let i = 0; i < 10; i++) {
      expect(negative.nextUint32()).toBe(positive.nextUint32());
    }
  });
});

describe("rollFace", () => {
  it("covers every face of a d6 across many rolls", () => {
    const source = createSeededRandomSource("coverage");
    const seen = new Set<number>();
    for (let i = 0; i < 600; i++) {
      seen.add(rollFace(source, 6));
    }
    expect([...seen].sort((x, y) => x - y)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("stays within [1, sides] for every supported die", () => {
    const source = createSeededRandomSource("bounds");
    for (const sides of [4, 6, 8, 10, 12, 20, 100]) {
      for (let i = 0; i < 200; i++) {
        const face = rollFace(source, sides);
        expect(face).toBeGreaterThanOrEqual(1);
        expect(face).toBeLessThanOrEqual(sides);
      }
    }
  });

  it("rejects invalid side counts", () => {
    const source = createSeededRandomSource("invalid");
    for (const sides of [0, -1, 1.5, Number.NaN]) {
      expect(() => rollFace(source, sides)).toThrowError(/sides must be an integer/);
    }
  });

  it("redraws instead of taking a biased value from the rejection zone", () => {
    // A scripted source, so the resample loop is exercised on purpose: for a
    // d6 the rejection zone is the top four values of the uint32 range, and a
    // plain modulo would have turned this draw into a 4.
    const draws = [0xffffffff, 2];
    const source = {
      nextUint32: () => draws.shift() as number,
      provenance: () =>
        ({ source: "seeded", seed: "scripted", algorithm: "xoshiro128**" }) as const,
    };
    expect(rollFace(source, 6)).toBe(3);
    expect(draws).toHaveLength(0);
  });

  /**
   * Fairness, not just coverage: chi-square over a fixed seed is fully
   * deterministic, so this pins the *distribution* the way the golden
   * sequences pin the stream. A modulo-bias bug would send these statistics
   * orders of magnitude past their thresholds for any seed at all.
   */
  it("rolls a d6 uniformly across 60,000 draws", () => {
    const source = createSeededRandomSource("fairness");
    const counts = [0, 0, 0, 0, 0, 0];
    for (let i = 0; i < 60_000; i++) {
      const face = rollFace(source, 6);
      counts[face - 1] = (counts[face - 1] ?? 0) + 1;
    }
    const expected = 10_000;
    const chi = counts.reduce((sum, count) => sum + (count - expected) ** 2 / expected, 0);
    // 5 degrees of freedom: 11.07 at p = 0.05.
    expect(chi).toBeLessThan(11.07);
  });

  it("rolls a d20 uniformly across 40,000 draws", () => {
    const source = createSeededRandomSource("fairness-d20");
    const counts = Array<number>(20).fill(0);
    for (let i = 0; i < 40_000; i++) {
      const face = rollFace(source, 20);
      counts[face - 1] = (counts[face - 1] ?? 0) + 1;
    }
    const expected = 2_000;
    const chi = counts.reduce((sum, count) => sum + (count - expected) ** 2 / expected, 0);
    // 19 degrees of freedom: 30.14 at p = 0.05.
    expect(chi).toBeLessThan(30.14);
  });
});
