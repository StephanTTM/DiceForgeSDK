import { Quaternion, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import type { ShapedDieSides } from "./math/geometry.js";
import { hasCalibratedModel, KAYKIT_COLORS, KAYKIT_FACE_ROTATIONS, kayKitTheme } from "./theme.js";

const MODELLED_SHAPES: readonly ShapedDieSides[] = [4, 6, 8, 20];

describe("KayKit face rotation tables", () => {
  it("covers every face of each modelled shape", () => {
    for (const shape of MODELLED_SHAPES) {
      expect(KAYKIT_FACE_ROTATIONS[shape], `d${shape}`).toHaveLength(shape);
    }
  });

  it("contains only unit quaternions", () => {
    for (const shape of MODELLED_SHAPES) {
      for (const [index, q] of (KAYKIT_FACE_ROTATIONS[shape] ?? []).entries()) {
        const length = Math.hypot(q[0], q[1], q[2], q[3]);
        expect(length, `d${shape} value ${index + 1}`).toBeCloseTo(1, 5);
      }
    }
  });

  /**
   * Each entry must bring a *different* part of the die upward: inverse-rotating
   * +Y yields the model-space direction that ends up on top, and no two faces
   * may share one. This is what guarantees a value always shows its own face,
   * and it fails loudly if the calibrated tables are ever corrupted.
   */
  it("maps every value to a distinct upward direction", () => {
    const up = new Vector3(0, 1, 0);
    for (const shape of MODELLED_SHAPES) {
      const directions = (KAYKIT_FACE_ROTATIONS[shape] ?? []).map((q) =>
        up.clone().applyQuaternion(new Quaternion(q[0], q[1], q[2], q[3]).invert()),
      );
      expect(directions).toHaveLength(shape);
      for (let i = 0; i < directions.length; i++) {
        for (let j = i + 1; j < directions.length; j++) {
          const alignment = (directions[i] as Vector3).dot(directions[j] as Vector3);
          expect(alignment, `d${shape}: values ${i + 1} and ${j + 1} share a face`).toBeLessThan(
            0.99,
          );
        }
      }
    }
  });

  it("does not claim shapes the pack has no model for", () => {
    for (const shape of [10, 12] as ShapedDieSides[]) {
      expect(KAYKIT_FACE_ROTATIONS[shape]).toBeUndefined();
    }
  });
});

describe("kayKitTheme", () => {
  it("builds asset URLs for the modelled shapes", () => {
    const theme = kayKitTheme({ baseUrl: "/assets", color: "blue" });
    expect(theme.name).toBe("kaykit-blue");
    expect(theme.models?.urls).toEqual({
      4: "/assets/D4_blue.gltf",
      6: "/assets/D6_C_blue.gltf",
      8: "/assets/D8_blue.gltf",
      20: "/assets/D20_blue.gltf",
    });
  });

  it("normalizes a trailing slash in baseUrl", () => {
    expect(kayKitTheme({ baseUrl: "/" }).models?.urls[20]).toBe("/D20_red.gltf");
    expect(kayKitTheme({ baseUrl: "/dice//" }).models?.urls[20]).toBe("/dice/D20_red.gltf");
  });

  it("defaults to red and supports every published color", () => {
    expect(kayKitTheme({ baseUrl: "/" }).name).toBe("kaykit-red");
    for (const color of KAYKIT_COLORS) {
      const theme = kayKitTheme({ baseUrl: "/", color });
      expect(theme.colors.die).toMatch(/^#[0-9a-f]{6}$/i);
      expect(theme.colors.label).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});

describe("hasCalibratedModel", () => {
  const theme = kayKitTheme({ baseUrl: "/" });

  it("accepts shapes with both a model and a complete table", () => {
    for (const shape of MODELLED_SHAPES) {
      expect(hasCalibratedModel(theme.models, shape), `d${shape}`).toBe(true);
    }
  });

  it("rejects shapes the theme has no model for, so they render procedurally", () => {
    for (const shape of [10, 12] as ShapedDieSides[]) {
      expect(hasCalibratedModel(theme.models, shape)).toBe(false);
    }
  });

  it("rejects an undefined model set", () => {
    expect(hasCalibratedModel(undefined, 20)).toBe(false);
  });

  it("rejects a model whose rotation table is incomplete", () => {
    const broken = {
      urls: { 20: "/D20_red.gltf" },
      faceRotations: { 20: [[0, 0, 0, 1]] },
    } as const;
    expect(hasCalibratedModel(broken, 20)).toBe(false);
  });
});
