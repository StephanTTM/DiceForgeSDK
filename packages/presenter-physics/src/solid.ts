import type { PolyhedronData, Vec3 } from "@diceforge-sdk/renderer-web";
import type { QuaternionTuple } from "./symmetry.js";
import { rotate } from "./symmetry.js";

/**
 * The solid a die actually is, built from where its numerals face.
 *
 * The collider used to come from `dieGeometry`, which builds each shape in
 * whatever orientation and face order its construction happens to produce.
 * Nothing related that to the model's numbering, so the physics would seat a
 * *geometric* face upward and the model would show whichever numeral happened
 * to be printed there. For the d10 it was worse than a mismatched order: the
 * generated trapezohedron is not the same solid as the one that ships, so the
 * simulation was colliding a shape the player never sees (ADR-0019).
 *
 * Deriving the collider from the calibrated table removes the question. A face
 * of the collider *is* a numeral, indexed by value, so there is no
 * correspondence left to get wrong — and a third-party theme with its own dice
 * gets a correct collider without shipping geometry.
 */

/** Where numeral `v` faces on the model, from `faceRotations[v - 1]`. */
export function faceDirections(faceRotations: readonly QuaternionTuple[]): Vec3[] {
  return faceRotations.map((q) => {
    // The table rotates a face to +Y, so its inverse says where the face rests.
    const inverse: QuaternionTuple = [-q[0], -q[1], -q[2], q[3]];
    const d = rotate([0, 1, 0], inverse);
    const length = Math.hypot(d[0], d[1], d[2]);
    return [d[0] / length, d[1] / length, d[2] / length] as Vec3;
  });
}

const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/**
 * Intersects the half-spaces `x · direction ≤ 1`.
 *
 * A fair die's faces are all the same distance from its centre — that is what
 * makes it fair — so the directions alone determine the solid up to scale.
 * Every corner is where three faces meet, which is a 3×3 solve; a point that
 * falls outside any other face is not a corner of the intersection.
 */
export function solidFromFaceDirections(directions: readonly Vec3[]): PolyhedronData {
  // A corner where five faces meet is solved ten times over, once per triple,
  // and the answers differ in the last few digits. The tolerance has to swallow
  // that spread while staying far below the distance between real corners,
  // which is a good fraction of the die. Too tight and an icosahedron comes out
  // with 37 vertices instead of 12.
  const SAME_POINT = 1e-4;
  const ON_FACE = 1e-6;
  const corners: Vec3[] = [];
  for (let i = 0; i < directions.length; i++) {
    for (let j = i + 1; j < directions.length; j++) {
      for (let k = j + 1; k < directions.length; k++) {
        const a = directions[i] as Vec3;
        const b = directions[j] as Vec3;
        const c = directions[k] as Vec3;
        const determinant = dot(a, cross(b, c));
        // A nearly degenerate triple solves to a point that is mostly error.
        if (Math.abs(determinant) < 1e-6) continue;
        // Cramer's rule with every offset equal to 1.
        const bc = cross(b, c);
        const ca = cross(c, a);
        const ab = cross(a, b);
        const point: Vec3 = [
          (bc[0] + ca[0] + ab[0]) / determinant,
          (bc[1] + ca[1] + ab[1]) / determinant,
          (bc[2] + ca[2] + ab[2]) / determinant,
        ];
        if (directions.some((d) => dot(d as Vec3, point) > 1 + ON_FACE)) continue;
        const duplicate = corners.some(
          (existing) =>
            Math.hypot(point[0] - existing[0], point[1] - existing[1], point[2] - existing[2]) <
            SAME_POINT,
        );
        if (!duplicate) corners.push(point);
      }
    }
  }

  const faces = directions.map((direction) => {
    const d = direction as Vec3;
    const onFace = corners
      .map((corner, index) => ({ corner, index }))
      .filter(({ corner }) => Math.abs(dot(d, corner) - 1) < SAME_POINT);
    if (onFace.length < 3) {
      throw new Error("a face of the collider has fewer than three corners");
    }
    // Wind the ring counter-clockwise seen from outside, so cannon reads the
    // normal as outward and the hull stays convex to the solver.
    const centre = onFace.reduce<Vec3>(
      (sum, { corner }) => [sum[0] + corner[0], sum[1] + corner[1], sum[2] + corner[2]],
      [0, 0, 0],
    );
    const middle: Vec3 = [
      centre[0] / onFace.length,
      centre[1] / onFace.length,
      centre[2] / onFace.length,
    ];
    const first = onFace[0]?.corner as Vec3;
    const axis: Vec3 = [first[0] - middle[0], first[1] - middle[1], first[2] - middle[2]];
    const length = Math.hypot(axis[0], axis[1], axis[2]);
    const u: Vec3 = [axis[0] / length, axis[1] / length, axis[2] / length];
    const w = cross(d, u);
    return onFace
      .map(({ corner, index }) => {
        const offset: Vec3 = [corner[0] - middle[0], corner[1] - middle[1], corner[2] - middle[2]];
        return { index, angle: Math.atan2(dot(offset, w), dot(offset, u)) };
      })
      .sort((a, b) => a.angle - b.angle)
      .map(({ index }) => index);
  });

  return { vertices: corners, faces };
}
