import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Quaternion, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { FORGE_COIN_ROTATIONS, FORGE_FACE_ROTATIONS } from "./forge-rotations.js";
import type { ShapedDieSides } from "./math/geometry.js";
import type { ForgeAssetUrls } from "./theme.js";
import { FORGE_COLORS, forgeTheme, hasCalibratedModel } from "./theme.js";

const manifest = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("../../assets-forge/forge/face-rotations.json", import.meta.url)),
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
  it("matches the manifest shipped in @diceforge-sdk/assets-forge", () => {
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

  /**
   * `@diceforge-sdk/assets-forge` hands over URLs a bundler emitted, which are
   * hashed and share no common prefix — so they arrive as an explicit map
   * rather than a base directory (ADR-0013).
   */
  it("accepts explicit URLs instead of a base directory", () => {
    const urls: ForgeAssetUrls = {
      dice: { 4: "/a.glb", 6: "/b.glb", 8: "/c.glb", 10: "/d.glb", 12: "/e.glb", 20: "/f.glb" },
      diceTextures: {
        4: "/a.png",
        6: "/b.png",
        8: "/c.png",
        10: "/d.png",
        12: "/e.png",
        20: "/f.png",
      },
      tensTexture: "/tens.png",
      coin: "/coin.glb",
      coinTextures: { heads: "/h.png", tails: "/t.png", rim: "/r.png" },
    };
    const theme = forgeTheme({ urls, color: "green" });

    expect(theme.name).toBe("forge-green");
    expect(theme.models?.urls[20]).toBe("/f.glb");
    expect(theme.models?.textureUrls?.[12]).toBe("/e.png");
    expect(theme.models?.tensTextureUrl).toBe("/tens.png");
    expect(theme.coin?.textures?.rim).toBe("/r.png");
    // Whichever way the art is addressed, the rotation tables are the same.
    for (const shape of FORGE_SHAPES) {
      expect(hasCalibratedModel(theme.models, shape), `d${shape}`).toBe(true);
    }
  });

  it("derives the same theme from a base directory as from its URLs", () => {
    const fromBase = forgeTheme({ baseUrl: "/forge", color: "red" });
    const urls: ForgeAssetUrls = {
      dice: {
        4: "/forge/d4.glb",
        6: "/forge/d6.glb",
        8: "/forge/d8.glb",
        10: "/forge/d10.glb",
        12: "/forge/d12.glb",
        20: "/forge/d20.glb",
      },
      diceTextures: {
        4: "/forge/textures/red/d4.png",
        6: "/forge/textures/red/d6.png",
        8: "/forge/textures/red/d8.png",
        10: "/forge/textures/red/d10.png",
        12: "/forge/textures/red/d12.png",
        20: "/forge/textures/red/d20.png",
      },
      tensTexture: "/forge/textures/red/d10_tens.png",
      coin: "/forge/coin.glb",
      coinTextures: {
        heads: "/forge/textures/red/coin_heads.png",
        tails: "/forge/textures/red/coin_tails.png",
        rim: "/forge/textures/red/coin_rim.png",
      },
    };
    expect(forgeTheme({ urls, color: "red" })).toEqual(fromBase);
  });
});
