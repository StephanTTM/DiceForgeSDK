import { describe, expect, it } from "vitest";
import { percentileDisplay } from "./percentile.js";

describe("percentileDisplay", () => {
  it("maps values onto the classic tens + units pair", () => {
    expect(percentileDisplay(42)).toEqual({
      tens: { label: "40", face: 4 },
      units: { label: "2", face: 2 },
    });
    expect(percentileDisplay(7)).toEqual({
      tens: { label: "00", face: 10 },
      units: { label: "7", face: 7 },
    });
    expect(percentileDisplay(10)).toEqual({
      tens: { label: "10", face: 1 },
      units: { label: "0", face: 10 },
    });
    expect(percentileDisplay(99)).toEqual({
      tens: { label: "90", face: 9 },
      units: { label: "9", face: 9 },
    });
  });

  it("reads 100 as 00 + 0, per tabletop convention", () => {
    expect(percentileDisplay(100)).toEqual({
      tens: { label: "00", face: 10 },
      units: { label: "0", face: 10 },
    });
  });

  it("rejects values outside 1..100", () => {
    for (const value of [0, 101, -5, 4.2]) {
      expect(() => percentileDisplay(value)).toThrowError(/must be an integer in 1\.\.100/);
    }
  });
});
