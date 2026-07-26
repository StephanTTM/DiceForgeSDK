import { Vector3 } from "three";
import { describe, expect, it } from "vitest";
import type { ShapedDieSides, Vec3 } from "./geometry.js";
import { DIE_SIZE, dieGeometry, dot, faceCentroid, subtract } from "./geometry.js";
import {
  apparentScale,
  faceNormal,
  faceTriangles,
  faceUpQuaternion,
  restingFootprint,
} from "./orientation.js";

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

describe("faceTriangles", () => {
  it("covers each face with a fan of triangles", () => {
    for (const sides of ALL_SHAPES) {
      const data = dieGeometry(sides);
      data.faces.forEach((face, faceIndex) => {
        expect(faceTriangles(data, faceIndex)).toHaveLength(face.length - 2);
      });
    }
  });

  /**
   * Renderers derive lighting normals from winding, so every triangle must be
   * wound outward. A stray inward triangle is lit from inside the die and shows
   * through it — the die looks broken rather than solid.
   */
  it("winds every triangle outward", () => {
    for (const sides of ALL_SHAPES) {
      const data = dieGeometry(sides);
      data.faces.forEach((_, faceIndex) => {
        const outward = new Vector3(...faceNormal(data, faceIndex));
        for (const [a, b, c] of faceTriangles(data, faceIndex)) {
          const va = new Vector3(...(data.vertices[a] ?? [0, 0, 0]));
          const vb = new Vector3(...(data.vertices[b] ?? [0, 0, 0]));
          const vc = new Vector3(...(data.vertices[c] ?? [0, 0, 0]));
          const winding = vb.clone().sub(va).cross(vc.clone().sub(va));
          expect(winding.dot(outward), `d${sides} face ${faceIndex + 1}`).toBeGreaterThan(0);
        }
      });
    }
  });
});

describe("apparentScale", () => {
  /**
   * The point of the scale: every die should cover the same area of table when
   * resting, so a set does not look mismatched. Measured the same way the
   * scale is derived, but independently of the cached result.
   */
  /** Pins the projection and hull maths against shapes whose area is known. */
  it("measures a resting footprint correctly", () => {
    // A cube resting face-up covers a square of its own edge length.
    expect(restingFootprint(6)).toBeCloseTo(DIE_SIZE * DIE_SIZE, 6);
    // A tetrahedron covers an equilateral triangle on the edge of its face.
    const edge = DIE_SIZE * Math.SQRT2;
    expect(restingFootprint(4)).toBeCloseTo((Math.sqrt(3) / 4) * edge * edge, 6);
  });

  it("gives every die the same resting footprint once scaled", () => {
    const reference = restingFootprint(20);
    for (const sides of ALL_SHAPES) {
      const scaled = restingFootprint(sides) * apparentScale(sides) ** 2;
      expect(scaled, `d${sides}`).toBeCloseTo(reference, 6);
    }
  });

  it("leaves the d20 as the reference and resizes the outliers", () => {
    expect(apparentScale(20)).toBeCloseTo(1, 6);
    // A d8 covers far less table than a d6 at the same bounding box, so it
    // must grow while the d6 shrinks.
    expect(apparentScale(8)).toBeGreaterThan(1.2);
    expect(apparentScale(6)).toBeLessThan(1);
  });

  it("is stable across calls", () => {
    for (const sides of ALL_SHAPES) {
      expect(apparentScale(sides)).toBe(apparentScale(sides));
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
