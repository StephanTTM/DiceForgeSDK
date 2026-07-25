import { Vector3 } from "three";
import { describe, expect, it } from "vitest";
import type { ShapedDieSides, Vec3 } from "./geometry.js";
import { dieGeometry, dot, faceCentroid, subtract } from "./geometry.js";
import { faceNormal, faceUpQuaternion } from "./orientation.js";

const ALL_SHAPES: readonly ShapedDieSides[] = [4, 6, 8, 10, 12, 20];

describe("dieGeometry", () => {
  it("has exactly one face per die value", () => {
    for (const sides of ALL_SHAPES) {
      expect(dieGeometry(sides).faces).toHaveLength(sides);
    }
  });

  it("has planar faces on every shape", () => {
    for (const sides of ALL_SHAPES) {
      const data = dieGeometry(sides);
      data.faces.forEach((face, faceIndex) => {
        const normal = faceNormal(data, faceIndex);
        const centroid = faceCentroid(data, faceIndex);
        for (const vertexIndex of face) {
          const vertex = data.vertices[vertexIndex];
          if (!vertex) throw new Error("missing vertex");
          const distance = Math.abs(dot(subtract(vertex, centroid), normal));
          expect(distance, `d${sides} face ${faceIndex}`).toBeLessThan(1e-9);
        }
      });
    }
  });

  it("produces outward-pointing, distinct face normals", () => {
    for (const sides of ALL_SHAPES) {
      const data = dieGeometry(sides);
      const seen: Vec3[] = [];
      data.faces.forEach((_, faceIndex) => {
        const normal = faceNormal(data, faceIndex);
        expect(Math.hypot(...normal)).toBeCloseTo(1, 9);
        expect(dot(normal, faceCentroid(data, faceIndex))).toBeGreaterThan(0);
        for (const other of seen) {
          expect(dot(normal, other)).toBeLessThan(0.9999);
        }
        seen.push(normal);
      });
    }
  });
});

describe("faceUpQuaternion", () => {
  it("rotates every face normal of every die onto +Y", () => {
    for (const sides of ALL_SHAPES) {
      const data = dieGeometry(sides);
      for (let value = 1; value <= sides; value++) {
        const quaternion = faceUpQuaternion(sides, value);
        const rotated = new Vector3(...faceNormal(data, value - 1)).applyQuaternion(quaternion);
        expect(rotated.x, `d${sides} value ${value}`).toBeCloseTo(0, 6);
        expect(rotated.y, `d${sides} value ${value}`).toBeCloseTo(1, 6);
        expect(rotated.z, `d${sides} value ${value}`).toBeCloseTo(0, 6);
      }
    }
  });

  /**
   * The rendering contract: after orienting for a value, that value's face must
   * be the highest one on the die — what a player reads from above. Aligning
   * the normal to +Y is not enough on its own, since a normal could be flipped.
   */
  it("puts the value's own face on top, above every other face", () => {
    for (const sides of ALL_SHAPES) {
      const data = dieGeometry(sides);
      for (let value = 1; value <= sides; value++) {
        const quaternion = faceUpQuaternion(sides, value);
        const heights = data.faces.map(
          (_, faceIndex) =>
            new Vector3(...faceCentroid(data, faceIndex)).applyQuaternion(quaternion).y,
        );
        const winner = heights.indexOf(Math.max(...heights));
        expect(winner, `d${sides} value ${value} showed face ${winner + 1}`).toBe(value - 1);
      }
    }
  });

  it("rejects values without a face", () => {
    expect(() => faceUpQuaternion(6, 0)).toThrowError(/no face for value 0/);
    expect(() => faceUpQuaternion(6, 7)).toThrowError(/no face for value 7/);
    expect(() => faceUpQuaternion(20, 2.5)).toThrowError(/no face for value 2.5/);
  });
});
