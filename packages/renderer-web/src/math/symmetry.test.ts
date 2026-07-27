import { Matrix4, Quaternion, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { FORGE_FACE_ROTATIONS } from "../forge-rotations.js";
import type { ShapedDieSides } from "./geometry.js";
import { dieGeometry, faceCentroid } from "./geometry.js";

/**
 * Every die shape can be turned so that any chosen face takes the place of any
 * other, without the solid moving at all.
 *
 * That is what would let a physics presenter honour an already-resolved
 * outcome: simulate a roll freely, then rotate the *mesh inside the collider*
 * by such a rotation so the recorded face lands where the simulation's face
 * did. The collider is unchanged, so the physics never notices and nothing is
 * visibly corrected (ADR-0007, ADR-0018).
 *
 * Nothing depends on this yet. It is here because the property belongs to the
 * geometry, and a change to the solids that quietly broke it would otherwise
 * only surface much later.
 */

const SHAPES: readonly ShapedDieSides[] = [4, 6, 8, 10, 12, 20];
/** Far below the closest distance between two distinct vertices on any solid. */
const TOLERANCE = 1e-4;

type FaceFrame = { readonly normal: Vector3; readonly inPlane: Vector3 };

/** A face's orthonormal frame, starting from the `offset`-th of its vertices. */
function frame(
  vertices: readonly Vector3[],
  ring: readonly number[],
  centre: Vector3,
  offset: number,
): FaceFrame {
  const normal = centre.clone().normalize();
  const index = ring[offset % ring.length] as number;
  const inPlane = (vertices[index] as Vector3)
    .clone()
    .sub(centre)
    .projectOnPlane(normal)
    .normalize();
  return { normal, inPlane };
}

function basisOf(f: FaceFrame): Matrix4 {
  return new Matrix4().makeBasis(
    f.inPlane,
    f.normal,
    f.inPlane.clone().cross(f.normal).normalize(),
  );
}

/** The rotation carrying one face frame onto another. */
function rotationBetween(from: FaceFrame, to: FaceFrame): Quaternion {
  return new Quaternion().setFromRotationMatrix(basisOf(to).multiply(basisOf(from).invert()));
}

function isSymmetry(vertices: readonly Vector3[], rotation: Quaternion): boolean {
  return vertices.every((vertex) => {
    const moved = vertex.clone().applyQuaternion(rotation);
    return vertices.some((candidate) => candidate.distanceTo(moved) < TOLERANCE);
  });
}

describe("rotational symmetry of the die solids", () => {
  it("can carry any face onto any other without moving the solid", () => {
    for (const shape of SHAPES) {
      const data = dieGeometry(shape);
      const vertices = data.vertices.map((v) => new Vector3(v[0], v[1], v[2]));
      const centres = data.faces.map((_, index) => {
        const c = faceCentroid(data, index);
        return new Vector3(c[0], c[1], c[2]);
      });

      for (let actual = 0; actual < data.faces.length; actual++) {
        for (let target = 0; target < data.faces.length; target++) {
          const ringTarget = data.faces[target] as readonly number[];
          const ringActual = data.faces[actual] as readonly number[];
          const from = frame(vertices, ringTarget, centres[target] as Vector3, 0);
          // One of the face's rotational alignments must work; which one is not
          // interesting, only that the solid maps onto itself.
          const found = Array.from({ length: ringActual.length }, (_, offset) =>
            rotationBetween(from, frame(vertices, ringActual, centres[actual] as Vector3, offset)),
          ).some((rotation) => isSymmetry(vertices, rotation));
          expect(found, `d${shape}: no symmetry carries face ${target} onto face ${actual}`).toBe(
            true,
          );
        }
      }
    }
  });

  /**
   * The presentation tables are not a source of such rotations, and this pins
   * why: they bake a yaw that makes numerals read upright, which is a symmetry
   * for a cube's square faces but not for a d10's kites. A physics presenter
   * that derived its remap from these would place the die in a pose the solid
   * cannot rest in.
   */
  it("cannot borrow those rotations from the face-rotation tables", () => {
    const tableRemapIsSymmetry = (shape: ShapedDieSides, actual: number, target: number) => {
      const quaternion = (value: number) => {
        const t = FORGE_FACE_ROTATIONS[shape]?.[value - 1];
        if (!t) throw new Error(`no rotation for d${shape} value ${value}`);
        return new Quaternion(t[0], t[1], t[2], t[3]);
      };
      const vertices = dieGeometry(shape).vertices.map((v) => new Vector3(v[0], v[1], v[2]));
      return isSymmetry(vertices, quaternion(actual).invert().multiply(quaternion(target)));
    };

    // A cube's numerals are upright at multiples of a quarter turn, which the
    // symmetry group contains; a d10's kite faces have no rotational symmetry
    // of their own, so only the identity survives.
    expect(tableRemapIsSymmetry(6, 1, 2)).toBe(true);
    expect(tableRemapIsSymmetry(10, 1, 2)).toBe(false);
    expect(tableRemapIsSymmetry(10, 1, 1)).toBe(true);
  });
});
