import { describe, expect, it } from "vitest";
import { EVENT_SCHEMA_VERSION } from "../records.js";
import { createSeededRandomSource } from "../rng/seeded.js";
import type { RandomSource } from "../rng/types.js";
import { resolveCoinFlip } from "./coin.js";

function scriptedSource(values: readonly number[]): RandomSource {
  let cursor = 0;
  return {
    nextUint32() {
      const value = values[cursor];
      if (value === undefined) throw new Error("scripted source exhausted");
      cursor++;
      return value;
    },
    provenance: () => ({ source: "system", algorithm: "math-random" }),
  };
}

describe("resolveCoinFlip", () => {
  it("maps even draws to heads and odd draws to tails", () => {
    expect(resolveCoinFlip(scriptedSource([0])).outcome).toBe("heads");
    expect(resolveCoinFlip(scriptedSource([1])).outcome).toBe("tails");
  });

  it("is deterministic for a given seed", () => {
    const first = resolveCoinFlip(createSeededRandomSource("flip"));
    const second = resolveCoinFlip(createSeededRandomSource("flip"));
    expect(second).toEqual(first);
  });

  it("produces both outcomes across many seeded flips", () => {
    const source = createSeededRandomSource("many-flips");
    const outcomes = new Set<string>();
    for (let i = 0; i < 100; i++) {
      outcomes.add(resolveCoinFlip(source).outcome);
    }
    expect(outcomes).toEqual(new Set(["heads", "tails"]));
  });

  it("returns a frozen, schema-versioned record", () => {
    const result = resolveCoinFlip(scriptedSource([0]));
    expect(result.kind).toBe("coin-flip");
    expect(result.schemaVersion).toBe(EVENT_SCHEMA_VERSION);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Reflect.set(result, "outcome", "tails")).toBe(false);
    expect(result.outcome).toBe("heads");
  });
});
