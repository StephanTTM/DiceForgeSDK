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
});
