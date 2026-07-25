import { describe, expect, it } from "vitest";
import { DiceNotationError } from "../errors.js";
import { parseDiceNotation } from "./parser.js";

describe("parseDiceNotation — valid expressions", () => {
  it("parses a bare die with implicit count", () => {
    const parsed = parseDiceNotation("d20");
    expect(parsed.normalized).toBe("1d20");
    expect(parsed.terms).toEqual([{ type: "dice", sign: 1, count: 1, sides: 20 }]);
  });

  it("parses count, selection, and modifier", () => {
    const parsed = parseDiceNotation("2d20kh1+3");
    expect(parsed.normalized).toBe("2d20kh1+3");
    expect(parsed.terms).toEqual([
      { type: "dice", sign: 1, count: 2, sides: 20, selection: { mode: "kh", count: 1 } },
      { type: "modifier", sign: 1, value: 3 },
    ]);
  });

  it("parses drop-lowest", () => {
    const parsed = parseDiceNotation("4d6dl1");
    expect(parsed.terms[0]).toEqual({
      type: "dice",
      sign: 1,
      count: 4,
      sides: 6,
      selection: { mode: "dl", count: 1 },
    });
  });

  it("defaults a selection without a count to 1", () => {
    expect(parseDiceNotation("2d20kh").normalized).toBe("2d20kh1");
    expect(parseDiceNotation("2d20kl").normalized).toBe("2d20kl1");
  });

  it("treats d% as d100", () => {
    const parsed = parseDiceNotation("d%");
    expect(parsed.normalized).toBe("1d100");
    expect(parsed.terms[0]).toEqual({ type: "dice", sign: 1, count: 1, sides: 100 });
  });

  it("is case-insensitive and whitespace-tolerant", () => {
    expect(parseDiceNotation("  2D20 + 3 ").normalized).toBe("2d20+3");
    expect(parseDiceNotation("4d6DL1").normalized).toBe("4d6dl1");
    expect(parseDiceNotation("1D8 + 2 - 1d4").normalized).toBe("1d8+2-1d4");
  });

  it("supports subtraction of dice groups and leading signs", () => {
    const parsed = parseDiceNotation("-2+1d6");
    expect(parsed.normalized).toBe("-2+1d6");
    expect(parsed.terms).toEqual([
      { type: "modifier", sign: -1, value: 2 },
      { type: "dice", sign: 1, count: 1, sides: 6 },
    ]);
    expect(parseDiceNotation("1d20-1d4").normalized).toBe("1d20-1d4");
  });

  it("parses multi-group expressions", () => {
    const parsed = parseDiceNotation("10d10dl3+2d6+5");
    expect(parsed.normalized).toBe("10d10dl3+2d6+5");
    expect(parsed.terms).toHaveLength(3);
  });

  it("preserves the original source text", () => {
    expect(parseDiceNotation(" D% + 1 ").source).toBe(" D% + 1 ");
  });

  it("accepts every supported die size", () => {
    for (const sides of [4, 6, 8, 10, 12, 20, 100]) {
      expect(parseDiceNotation(`d${sides}`).normalized).toBe(`1d${sides}`);
    }
  });
});

describe("parseDiceNotation — errors", () => {
  function expectNotationError(expression: string, pattern: RegExp, position?: number): void {
    let caught: unknown;
    try {
      parseDiceNotation(expression);
    } catch (error) {
      caught = error;
    }
    expect(caught, `expected ${JSON.stringify(expression)} to fail`).toBeInstanceOf(
      DiceNotationError,
    );
    const notationError = caught as DiceNotationError;
    expect(notationError.code).toBe("notation");
    expect(notationError.message).toMatch(pattern);
    if (position !== undefined) {
      expect(notationError.position).toBe(position);
    }
  }

  it("rejects empty and whitespace-only input", () => {
    expectNotationError("", /expression is empty/);
    expectNotationError("   ", /expression is empty/);
  });

  it("rejects unsupported die sizes", () => {
    expectNotationError("2d7", /unsupported die size d7/, 2);
    expectNotationError("1d3", /unsupported die size d3/);
  });

  it("rejects invalid dice counts", () => {
    expectNotationError("0d6", /dice count must be at least 1/, 0);
    expectNotationError("101d6", /dice count exceeds 100/);
  });

  it("rejects invalid keep/drop counts", () => {
    expectNotationError("2d20kh0", /keep\/drop count must be at least 1/);
    expectNotationError("2d20kh3", /keep\/drop count 3 exceeds the 2 dice/);
  });

  it("rejects unknown roll modifiers", () => {
    expectNotationError("2d20xy", /unknown roll modifier "xy"/, 4);
    expectNotationError("2d20k1", /unknown roll modifier "k1"/);
  });

  it("rejects malformed structure", () => {
    expectNotationError("d", /expected a die size/);
    expectNotationError("1d6+", /expected a term after the operator/);
    expectNotationError("1d6 7", /expected "\+" or "-"/, 4);
    expectNotationError("(1d6)", /unexpected character/);
  });

  it("requires at least one die", () => {
    expectNotationError("5", /must include at least one die/);
    expectNotationError("3+4", /must include at least one die/);
  });

  it("enforces size limits", () => {
    expectNotationError("12345678d6", /number is too large/);
    expectNotationError(`2000000+1d6`, /modifier exceeds 1000000/);
    expectNotationError("1d6+".repeat(21).slice(0, -1), /exceeds 20 terms/);
    expectNotationError(`1d6${" ".repeat(600)}`, /exceeds 500 characters/);
  });
});
