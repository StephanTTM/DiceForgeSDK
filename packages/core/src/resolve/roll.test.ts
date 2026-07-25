import { describe, expect, it } from "vitest";
import { parseDiceNotation } from "../notation/parser.js";
import { createSeededRandomSource } from "../rng/seeded.js";
import type { RandomSource } from "../rng/types.js";
import { resolveRoll } from "./roll.js";

/**
 * Feeds predetermined uint32 values to the resolver. With small values the
 * rejection sampler never rejects, so face = value % sides + 1.
 */
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

function roll(expression: string, script: readonly number[]) {
  return resolveRoll(parseDiceNotation(expression), scriptedSource(script));
}

describe("resolveRoll", () => {
  it("resolves keep-highest with modifier", () => {
    const result = roll("2d20kh1+3", [4, 17]); // faces 5, 18
    expect(result.expression).toBe("2d20kh1+3");
    expect(result.groups[0]?.dice).toEqual([
      { sides: 20, value: 5, kept: false },
      { sides: 20, value: 18, kept: true },
    ]);
    expect(result.groups[0]?.subtotal).toBe(18);
    expect(result.modifier).toBe(3);
    expect(result.total).toBe(21);
  });

  it("resolves drop-lowest keeping roll order in the record", () => {
    const result = roll("4d6dl1", [2, 0, 5, 1]); // faces 3, 1, 6, 2
    expect(result.groups[0]?.dice.map((die) => die.value)).toEqual([3, 1, 6, 2]);
    expect(result.groups[0]?.dice.map((die) => die.kept)).toEqual([true, false, true, true]);
    expect(result.total).toBe(11);
  });

  it("breaks ties in favor of earlier-rolled dice", () => {
    const keepHigh = roll("2d20kh1", [4, 4]); // faces 5, 5
    expect(keepHigh.groups[0]?.dice.map((die) => die.kept)).toEqual([true, false]);
    const dropLow = roll("3d6dl1", [1, 1, 3]); // faces 2, 2, 4
    expect(dropLow.groups[0]?.dice.map((die) => die.kept)).toEqual([false, true, true]);
  });

  it("resolves drop-highest", () => {
    const result = roll("3d6dh2", [0, 3, 5]); // faces 1, 4, 6
    expect(result.groups[0]?.dice.map((die) => die.kept)).toEqual([true, false, false]);
    expect(result.total).toBe(1);
  });

  it("subtracts negative dice groups and modifiers", () => {
    expect(roll("1d20-1d4", [9, 1]).total).toBe(8); // 10 - 2
    expect(roll("1d6-2", [3]).total).toBe(2); // 4 - 2
  });

  it("resolves percentile dice as d100", () => {
    const result = roll("d%", [41]);
    expect(result.groups[0]?.dice).toEqual([{ sides: 100, value: 42, kept: true }]);
    expect(result.expression).toBe("1d100");
  });

  it("records group notation and sign", () => {
    const result = roll("2d6+1d4", [0, 1, 2]);
    expect(result.groups.map((group) => group.notation)).toEqual(["2d6", "1d4"]);
    expect(result.groups.map((group) => group.sign)).toEqual([1, 1]);
  });

  it("is deterministic for a given seed", () => {
    const first = resolveRoll(parseDiceNotation("10d10dl3+2d6+5"), createSeededRandomSource("t"));
    const second = resolveRoll(parseDiceNotation("10d10dl3+2d6+5"), createSeededRandomSource("t"));
    expect(second).toEqual(first);
  });

  it("embeds seeded provenance in the record", () => {
    const result = resolveRoll(parseDiceNotation("1d6"), createSeededRandomSource("table-42"));
    expect(result.provenance).toEqual({
      source: "seeded",
      seed: "table-42",
      algorithm: "xoshiro128**",
    });
  });

  it("returns deeply frozen records that reject mutation", () => {
    const result = roll("2d6", [0, 1]);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.groups)).toBe(true);
    expect(Object.isFrozen(result.groups[0])).toBe(true);
    expect(Object.isFrozen(result.groups[0]?.dice[0])).toBe(true);
    expect(Reflect.set(result, "total", 999)).toBe(false);
    const firstDie = result.groups[0]?.dice[0];
    expect(firstDie && Reflect.set(firstDie, "value", 6)).toBe(false);
    expect(result.total).toBe(3);
  });
});
