import { describe, expect, it } from "vitest";
import { createDiceEngine } from "../engine.js";
import { DiceForgeError, DiceNotationError } from "../errors.js";
import { EVENT_SCHEMA_VERSION } from "../records.js";
import { createSeededRandomSource } from "../rng/seeded.js";
import { deserializeEvent, serializeEvent } from "../serialization.js";
import { createDieRegistry, defineDie, MAX_DIE_FACES } from "./definition.js";

/** The canonical example: two plus faces, two minus, two blank. */
const fate = defineDie({
  id: "fate",
  faces: [
    { value: -1, label: "-" },
    { value: -1, label: "-" },
    { value: 0, label: " " },
    { value: 0, label: " " },
    { value: 1, label: "+" },
    { value: 1, label: "+" },
  ],
});

function engine(seed = "custom-dice") {
  return createDiceEngine({ random: createSeededRandomSource(seed), dice: [fate] });
}

describe("defineDie", () => {
  it("accepts bare numbers as faces", () => {
    const die = defineDie({ id: "swing", faces: [-2, 0, 3] });
    expect(die.faces).toEqual([{ value: -2 }, { value: 0 }, { value: 3 }]);
  });

  it("freezes the definition so it cannot drift after registration", () => {
    expect(Object.isFrozen(fate)).toBe(true);
    expect(Object.isFrozen(fate.faces)).toBe(true);
    expect(Reflect.set(fate.faces[0] as object, "value", 99)).toBe(false);
  });

  it("keeps repeated faces, because a die is a bag and not a set", () => {
    // Listing a value twice is how a die is weighted; deduplicating would
    // silently change the odds.
    expect(fate.faces.filter((face) => face.value === 0)).toHaveLength(2);
  });

  it("rejects names that could be mistaken for notation", () => {
    for (const id of ["", "2d6", "-fate", "fate!", "fa te"]) {
      expect(() => defineDie({ id, faces: [1, 2] }), id).toThrowError(DiceForgeError);
    }
  });

  it("rejects a die that cannot produce two different outcomes", () => {
    expect(() => defineDie({ id: "flat", faces: [1] })).toThrowError(/at least 2 faces/);
  });

  it("rejects more faces than a die may have", () => {
    const faces = Array.from({ length: MAX_DIE_FACES + 1 }, (_, index) => index);
    expect(() => defineDie({ id: "huge", faces })).toThrowError(/more than 1000 faces/);
  });

  it("rejects labels that would not fit on a face", () => {
    expect(() => defineDie({ id: "wordy", faces: [{ value: 1, label: "" }, 2] })).toThrowError(
      /non-empty string/,
    );
    expect(() =>
      defineDie({ id: "wordy", faces: [{ value: 1, label: "a".repeat(9) }, 2] }),
    ).toThrowError(/exceeds 8 characters/);
  });
});

describe("createDieRegistry", () => {
  it("rejects ids that differ only by case, since notation ignores case", () => {
    const upper = defineDie({ id: "Fate", faces: [1, 2] });
    expect(() => createDieRegistry([fate, upper])).toThrowError(/duplicate die id/);
  });
});

describe("rolling a custom die", () => {
  it("sums face values, not face indexes", () => {
    const roll = engine().roll("4d{fate}");
    const values = roll.groups[0]?.dice.map((die) => die.value) ?? [];
    expect(values).toHaveLength(4);
    for (const value of values) expect([-1, 0, 1]).toContain(value);
    expect(roll.total).toBe(values.reduce((sum, value) => sum + value, 0));
  });

  it("records the die name and the face label with each outcome", () => {
    const die = engine().roll("1d{fate}").groups[0]?.dice[0];
    expect(die?.die).toBe("fate");
    expect(die?.sides).toBe(6);
    expect(["-", " ", "+"]).toContain(die?.label);
  });

  it("canonicalizes the notation with braces", () => {
    expect(engine().roll("4D{FATE}").expression).toBe("4d{fate}");
    expect(engine().roll("2d{fate}kh1+3").expression).toBe("2d{fate}kh1+3");
  });

  it("keeps and drops custom dice by value, negatives included", () => {
    const roll = engine("keep-lowest").roll("4d{fate}kl1");
    const dice = roll.groups[0]?.dice ?? [];
    const kept = dice.filter((die) => die.kept);
    expect(kept).toHaveLength(1);
    const lowest = Math.min(...dice.map((die) => die.value));
    expect(kept[0]?.value).toBe(lowest);
    expect(roll.total).toBe(lowest);
  });

  it("draws one random number per die, exactly like a plain die", () => {
    // A custom die changes what a face is worth, never how much randomness a
    // roll consumes — otherwise a seed would not replay across die sets.
    const plain = createDiceEngine({ random: createSeededRandomSource("parity") }).roll("3d6");
    const custom = createDiceEngine({
      random: createSeededRandomSource("parity"),
      dice: [defineDie({ id: "six", faces: [1, 2, 3, 4, 5, 6] })],
    }).roll("3d{six}");
    expect(custom.groups[0]?.dice.map((die) => die.value)).toEqual(
      plain.groups[0]?.dice.map((die) => die.value),
    );
  });

  it("reports an unknown die with the position and the ones that exist", () => {
    let caught: unknown;
    try {
      engine().roll("2d{fudge}");
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(DiceNotationError);
    expect((caught as DiceNotationError).message).toMatch(/unknown die "fudge"/);
    expect((caught as DiceNotationError).message).toMatch(/d\{fate\}/);
    // Points at the "{" that opens the die reference, as other errors point at
    // the start of the token they reject.
    expect((caught as DiceNotationError).position).toBe(2);
  });

  it("says so when no dice are defined at all", () => {
    const bare = createDiceEngine({ random: createSeededRandomSource("bare") });
    expect(() => bare.roll("1d{fate}")).toThrowError(/no dice are defined/);
    expect(bare.dice).toEqual([]);
  });

  it("round-trips through serialization", () => {
    const roll = engine().roll("4d{fate}+1");
    const restored = deserializeEvent(serializeEvent(roll));
    expect(restored).toEqual(roll);
    expect(restored.schemaVersion).toBe(EVENT_SCHEMA_VERSION);
  });
});

describe("dice without a definition", () => {
  it("rolls any face count from 2 to the maximum", () => {
    const rolled = createDiceEngine({ random: createSeededRandomSource("odd-sizes") });
    for (const sides of [2, 3, 7, 30, MAX_DIE_FACES]) {
      const die = rolled.roll(`1d${sides}`).groups[0]?.dice[0];
      expect(die?.sides, `d${sides}`).toBe(sides);
      expect(die?.value).toBeGreaterThanOrEqual(1);
      expect(die?.value).toBeLessThanOrEqual(sides);
      // A plain numeric die carries no name and no label: it needs neither.
      expect(die?.die).toBeUndefined();
      expect(die?.label).toBeUndefined();
    }
  });
});
