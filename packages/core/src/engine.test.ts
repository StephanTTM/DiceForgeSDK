import { describe, expect, it } from "vitest";
import {
  createDiceEngine,
  createSeededRandomSource,
  DiceNotationError,
  type RandomSource,
} from "./index.js";

describe("createDiceEngine", () => {
  it("rolls headlessly with the default system source", () => {
    const engine = createDiceEngine();
    const result = engine.roll("2d6+1");
    expect(result.kind).toBe("roll");
    expect(result.total).toBeGreaterThanOrEqual(3);
    expect(result.total).toBeLessThanOrEqual(13);
    expect(result.provenance.source).toBe("system");
  });

  it("produces identical roll sequences for identical seeds", () => {
    const first = createDiceEngine({ random: createSeededRandomSource("table-42") });
    const second = createDiceEngine({ random: createSeededRandomSource("table-42") });
    for (let i = 0; i < 10; i++) {
      expect(second.roll("2d20kh1+3")).toEqual(first.roll("2d20kh1+3"));
      expect(second.flipCoin()).toEqual(first.flipCoin());
    }
  });

  it("consumes an injected random source", () => {
    const script = [4, 17];
    let cursor = 0;
    const random: RandomSource = {
      nextUint32() {
        const value = script[cursor];
        if (value === undefined) throw new Error("script exhausted");
        cursor++;
        return value;
      },
      provenance: () => ({ source: "system", algorithm: "math-random" }),
    };
    const result = createDiceEngine({ random }).roll("2d20kh1+3");
    expect(result.total).toBe(21);
    expect(cursor).toBe(2);
  });

  it("throws DiceNotationError for invalid notation", () => {
    const engine = createDiceEngine();
    expect(() => engine.roll("2d7")).toThrowError(DiceNotationError);
    expect(() => engine.roll("")).toThrowError(DiceNotationError);
  });

  it("flips coins headlessly", () => {
    const flip = createDiceEngine().flipCoin();
    expect(flip.kind).toBe("coin-flip");
    expect(["heads", "tails"]).toContain(flip.outcome);
  });
});
