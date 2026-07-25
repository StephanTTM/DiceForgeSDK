import { describe, expect, it } from "vitest";
import { createSystemRandomSource } from "./system.js";

describe("createSystemRandomSource", () => {
  it("produces integers within uint32 range", () => {
    const source = createSystemRandomSource();
    for (let i = 0; i < 100; i++) {
      const value = source.nextUint32();
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(0xffffffff);
    }
  });

  it("does not return a constant sequence", () => {
    const source = createSystemRandomSource();
    const values = new Set<number>();
    for (let i = 0; i < 20; i++) {
      values.add(source.nextUint32());
    }
    expect(values.size).toBeGreaterThan(1);
  });

  it("reports system provenance naming the platform generator", () => {
    const provenance = createSystemRandomSource().provenance();
    expect(provenance.source).toBe("system");
    expect(["crypto-get-random-values", "math-random"]).toContain(provenance.algorithm);
  });
});
