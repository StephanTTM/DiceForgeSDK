import { describe, expect, it } from "vitest";
import type { ShapedDieSides } from "./math/geometry.js";
import { forgeTheme, hasCalibratedModel } from "./theme.js";

describe("hasCalibratedModel", () => {
  const theme = forgeTheme({ baseUrl: "/forge" });

  /**
   * The gate that keeps presentation honest: a model is only ever used when its
   * rotation table can say which orientation shows which value. Anything less
   * and a die could imply a face the core never resolved.
   */
  it("accepts a shape with both a model and a complete table", () => {
    for (const shape of [4, 6, 8, 10, 12, 20] as ShapedDieSides[]) {
      expect(hasCalibratedModel(theme.models, shape), `d${shape}`).toBe(true);
    }
  });

  it("rejects an undefined model set", () => {
    expect(hasCalibratedModel(undefined, 20)).toBe(false);
  });

  it("rejects a shape the set has no model for", () => {
    const partial = {
      urls: { 6: "/d6.glb" },
      faceRotations: { 6: theme.models?.faceRotations[6] ?? [] },
    } as const;
    expect(hasCalibratedModel(partial, 6)).toBe(true);
    expect(hasCalibratedModel(partial, 20)).toBe(false);
  });

  it("rejects a model whose rotation table is incomplete", () => {
    const broken = {
      urls: { 20: "/d20.glb" },
      faceRotations: { 20: [[0, 0, 0, 1]] },
    } as const;
    expect(hasCalibratedModel(broken, 20)).toBe(false);
  });
});
