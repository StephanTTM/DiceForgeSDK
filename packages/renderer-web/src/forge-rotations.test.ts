import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Quaternion, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { FORGE_COIN_ROTATIONS, FORGE_FACE_ROTATIONS } from "./forge-rotations.js";
import type { ShapedDieSides } from "./math/geometry.js";
import { FORGE_COLORS, forgeTheme, hasCalibratedModel } from "./theme.js";

const manifest = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("../../../assets/forge/face-rotations.json", import.meta.url)),
    "utf8",
  ),
) as Record<
  string,
  { faces: number; rotations: number[][]; atlas?: { columns: number; rows: number } }
>;

const FORGE_SHAPES: readonly ShapedDieSides[] = [4, 6, 8, 10, 12, 20];

describe("generated forge rotation tables", () => {
  /**
   * `forge-rotations.ts` is emitted from the Blender manifest. If someone edits
   * one without rerunning the generator, the renderer would orient dice with
   * stale data — so the two are compared directly.
   */
  it("matches assets/forge/face-rotations.json", () => {
    for (const shape of FORGE_SHAPES) {
      const fromManifest = manifest[`d${shape}`]?.rotations;
      const fromSource = FORGE_FACE_ROTATIONS[shape];
      expect(fromSource, `d${shape} missing from generated source`).toBeDefined();
      expect(fromSource).toHaveLength(shape);
      fromSource?.forEach((quaternion, index) => {
        const expected = fromManifest?.[index];
        expect(expected, `d${shape} value ${index + 1} missing from manifest`).toBeDefined();
        quaternion.forEach((component, axis) => {
          expect(component, `d${shape} value ${index + 1}`).toBeCloseTo(expected?.[axis] ?? 0, 5);
        });
      });
    }
    expect(FORGE_COIN_ROTATIONS).toHaveLength(2);
    manifest.coin?.rotations.forEach((expected, index) => {
      (FORGE_COIN_ROTATIONS[index] ?? []).forEach((component, axis) => {
        expect(component).toBeCloseTo(expected[axis] ?? 0, 5);
      });
    });
  });

  it("holds unit quaternions", () => {
    for (const shape of FORGE_SHAPES) {
      for (const [index, q] of (FORGE_FACE_ROTATIONS[shape] ?? []).entries()) {
        expect(Math.hypot(q[0], q[1], q[2], q[3]), `d${shape} value ${index + 1}`).toBeCloseTo(
          1,
          5,
        );
      }
    }
  });

  /** Same invariant the KayKit tables must satisfy: one value, one face. */
  it("maps every value to a distinct upward direction", () => {
    const up = new Vector3(0, 1, 0);
    for (const shape of FORGE_SHAPES) {
      const directions = (FORGE_FACE_ROTATIONS[shape] ?? []).map((q) =>
        up.clone().applyQuaternion(new Quaternion(q[0], q[1], q[2], q[3]).invert()),
      );
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

  it("turns the coin to opposite faces for heads and tails", () => {
    const up = new Vector3(0, 1, 0);
    const [heads, tails] = FORGE_COIN_ROTATIONS;
    const headsFace = up.clone().applyQuaternion(new Quaternion(...heads).invert());
    const tailsFace = up.clone().applyQuaternion(new Quaternion(...tails).invert());
    expect(headsFace.dot(tailsFace)).toBeLessThan(-0.99);
  });
});

describe("forgeTheme", () => {
  it("covers every shape the SDK resolves, with a model and a full table", () => {
    const theme = forgeTheme({ baseUrl: "/forge" });
    for (const shape of FORGE_SHAPES) {
      expect(hasCalibratedModel(theme.models, shape), `d${shape}`).toBe(true);
    }
  });

  it("points models, textures and the coin at the colour's assets", () => {
    const theme = forgeTheme({ baseUrl: "/forge/", color: "blue" });
    expect(theme.name).toBe("forge-blue");
    expect(theme.models?.urls[20]).toBe("/forge/d20.glb");
    expect(theme.models?.textureUrls?.[20]).toBe("/forge/textures/blue/d20.png");
    expect(theme.coin?.url).toBe("/forge/coin.glb");
    expect(theme.coin?.textures?.heads).toBe("/forge/textures/blue/coin_heads.png");
    expect(theme.coin?.textures?.tails).toBe("/forge/textures/blue/coin_tails.png");
  });

  it("gives the percentile tens die its own 00-90 texture", () => {
    const theme = forgeTheme({ baseUrl: "/forge", color: "red" });
    expect(theme.models?.tensTextureUrl).toBe("/forge/textures/red/d10_tens.png");
    // It must differ from the plain d10 atlas, or the pair would read 0-9 twice.
    expect(theme.models?.tensTextureUrl).not.toBe(theme.models?.textureUrls?.[10]);
  });

  it("defaults to ivory and offers every published colour", () => {
    expect(forgeTheme({ baseUrl: "/forge" }).name).toBe("forge-ivory");
    for (const color of FORGE_COLORS) {
      const theme = forgeTheme({ baseUrl: "/forge", color });
      expect(theme.colors.die).toMatch(/^#[0-9a-f]{6}$/i);
      expect(theme.colors.label).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});
