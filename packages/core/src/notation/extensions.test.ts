import { describe, expect, it } from "vitest";
import { defineDie } from "../dice/definition.js";
import { createDiceEngine } from "../engine.js";
import { DiceNotationError } from "../errors.js";
import type { DieOutcome } from "../records.js";
import { createSeededRandomSource } from "../rng/seeded.js";
import type { RandomSource } from "../rng/types.js";
import { deserializeEvent, serializeEvent } from "../serialization.js";
import { parseDiceNotation } from "./parser.js";

/**
 * Feeds exact faces, so a modifier's behaviour can be stated rather than
 * sampled. `rollFace` returns `(draw % sides) + 1`, so handing it `face - 1`
 * yields that face for any die with at least that many sides.
 */
function scriptedSource(faces: readonly number[]): RandomSource {
  let cursor = 0;
  return {
    nextUint32() {
      const face = faces[cursor++];
      if (face === undefined) throw new Error("scripted source ran out of faces");
      // rollFace maps a draw to (value % sides) + 1 after rejection sampling.
      return face - 1;
    },
    provenance: () => ({ source: "seeded", seed: "scripted", algorithm: "xoshiro128**" }) as const,
  };
}

function rollWith(expression: string, faces: readonly number[]) {
  const engine = createDiceEngine({ random: scriptedSource(faces) });
  return engine.roll(expression);
}

function dice(result: ReturnType<typeof rollWith>): readonly DieOutcome[] {
  return result.groups[0]?.dice ?? [];
}

function expectNotationError(expression: string, pattern: RegExp, position?: number): void {
  let caught: unknown;
  try {
    createDiceEngine().roll(expression);
  } catch (error) {
    caught = error;
  }
  expect(caught, `expected ${JSON.stringify(expression)} to fail`).toBeInstanceOf(
    DiceNotationError,
  );
  expect((caught as DiceNotationError).message).toMatch(pattern);
  if (position !== undefined) expect((caught as DiceNotationError).position).toBe(position);
}

describe("exploding dice", () => {
  it("adds a die for every highest face, chaining", () => {
    // 6 explodes into 6, which explodes into 2; the second die is an ordinary 3.
    const result = rollWith("2d6!", [6, 6, 2, 3]);
    expect(dice(result).map((die) => die.value)).toEqual([6, 6, 2, 3]);
    expect(dice(result).map((die) => die.source)).toEqual([
      undefined,
      "explosion",
      "explosion",
      undefined,
    ]);
    expect(result.total).toBe(17);
  });

  it("counts every exploded die towards the total", () => {
    const result = rollWith("1d6!", [6, 4]);
    expect(dice(result).every((die) => die.kept)).toBe(true);
    expect(result.groups[0]?.subtotal).toBe(10);
  });

  it("stops at the explosion cap rather than running forever", () => {
    const result = rollWith(
      "1d6!",
      Array.from({ length: 40 }, () => 6),
    );
    // The original die plus at most MAX_EXPLOSIONS_PER_DIE extras.
    expect(dice(result)).toHaveLength(11);
    expect(result.total).toBe(66);
  });

  it("explodes a custom die on its highest value, not its last face", () => {
    const swing = defineDie({ id: "swing", faces: [{ value: 5 }, { value: -2 }, { value: 1 }] });
    const engine = createDiceEngine({ random: scriptedSource([1, 2]), dice: [swing] });
    const result = engine.roll("1d{swing}!");
    // Face 1 is worth 5, the highest, so it explodes; face 2 is worth -2.
    expect(result.groups[0]?.dice.map((die) => die.value)).toEqual([5, -2]);
    expect(result.total).toBe(3);
  });

  it("refuses a die whose every face is its highest", () => {
    const flat = defineDie({ id: "flat", faces: [3, 3] });
    const engine = createDiceEngine({ random: createSeededRandomSource("x"), dice: [flat] });
    expect(() => engine.roll("1d{flat}!")).toThrowError(/explode forever/);
  });
});

describe("rerolling", () => {
  it("replaces results at or below the threshold, and records what it threw away", () => {
    const result = rollWith("2d6r2", [1, 5, 2, 2, 4]);
    expect(dice(result).map((die) => [die.value, die.kept, die.rerolled ?? false])).toEqual([
      [1, false, true],
      [5, true, false],
      [2, false, true],
      [2, false, true],
      [4, true, false],
    ]);
    expect(dice(result).filter((die) => die.source === "reroll")).toHaveLength(3);
    expect(result.total).toBe(9);
  });

  it("rerolls once and keeps the result with ro, however bad it is", () => {
    const result = rollWith("2d6ro1", [1, 1, 3, 6]);
    expect(dice(result).map((die) => die.value)).toEqual([1, 1, 3]);
    // The replacement 1 stands: "ro" means one reroll, not one good roll.
    expect(dice(result)[1]?.kept).toBe(true);
    expect(result.total).toBe(4);
  });

  it("stops at the reroll cap rather than running forever", () => {
    const result = rollWith(
      "1d6r5",
      Array.from({ length: 40 }, () => 1),
    );
    expect(dice(result)).toHaveLength(11);
    expect(dice(result).filter((die) => die.kept)).toHaveLength(1);
  });

  it("rejects a threshold that would cover every face", () => {
    // Points at the "r" that opens the modifier, as other errors point at the
    // start of the token they reject.
    expectNotationError("4d6r6", /covers every face/, 3);
    expectNotationError("4d6r9", /covers every face/);
  });

  it("rejects a threshold no face can reach", () => {
    expectNotationError("4d6r0", /below every face/);
  });
});

describe("modifiers together", () => {
  it("applies reroll, then explode, then keep/drop", () => {
    // d1: 1 rerolled into 6, which explodes into 2. d2: 3. d3: 4.
    const result = rollWith("3d6r1!kh2", [1, 6, 2, 3, 4]);
    expect(dice(result).map((die) => die.value)).toEqual([1, 6, 2, 3, 4]);
    // Selection sees the live pool of four (6, 2, 3, 4) and keeps the best two.
    expect(dice(result).map((die) => die.kept)).toEqual([false, true, false, false, true]);
    expect(result.total).toBe(10);
  });

  it("normalizes modifiers into the order they are applied", () => {
    expect(createDiceEngine().roll("4d6kh3r1").expression).toBe("4d6r1kh3");
    expect(createDiceEngine().roll("4D6!KH3RO2").expression).toBe("4d6ro2!kh3");
  });

  it("parses the same node whatever order they were typed in", () => {
    const typed = parseDiceNotation("4d6kh3!r1").terms[0];
    const canonical = parseDiceNotation("4d6r1!kh3").terms[0];
    expect(typed).toEqual(canonical);
  });

  it("rejects a modifier written twice", () => {
    expectNotationError("4d6!!", /explode is already set/);
    expectNotationError("4d6r1r2", /reroll is already set/);
    expectNotationError("4d6kh2kl1", /keep\/drop is already set/);
  });

  it("keeps a rerolled die out of the subtotal even under keep-lowest", () => {
    // Keep-lowest would otherwise be delighted to count a discarded 1.
    const result = rollWith("2d6r1kl1", [1, 4, 5]);
    const kept = dice(result).filter((die) => die.kept);
    expect(kept).toHaveLength(1);
    expect(kept[0]?.value).toBe(4);
    expect(result.total).toBe(4);
  });
});

describe("records with modifiers", () => {
  it("round-trips through serialization", () => {
    const result = rollWith("3d6r1!kh2", [1, 6, 2, 3, 4]);
    expect(deserializeEvent(serializeEvent(result))).toEqual(result);
  });

  it("rejects a record that counts a rerolled die", () => {
    const result = rollWith("2d6r1", [1, 4, 5]);
    const raw = JSON.parse(serializeEvent(result)) as {
      groups: { dice: { kept: boolean }[]; subtotal: number }[];
      total: number;
    };
    const discarded = raw.groups[0]?.dice[0];
    if (!discarded) throw new Error("expected a discarded die");
    discarded.kept = true;
    expect(() => deserializeEvent(JSON.stringify(raw))).toThrowError(/cannot also be kept/);
  });

  it("replays identically from the same seed", () => {
    const roll = () =>
      createDiceEngine({ random: createSeededRandomSource("explode-replay") }).roll("6d6r1!kh3");
    expect(serializeEvent(roll())).toBe(serializeEvent(roll()));
  });

  it("leaves an unmodified roll drawing exactly as before", () => {
    // The extensions must not shift the RNG stream for expressions that do not
    // use them, or every stored seed would change meaning (ADR-0005).
    const plain = createDiceEngine({ random: createSeededRandomSource("table-42") }).roll(
      "2d20kh1+3",
    );
    expect(plain.groups[0]?.dice.map((die) => die.value)).toEqual([1, 19]);
    expect(plain.total).toBe(22);
  });
});
