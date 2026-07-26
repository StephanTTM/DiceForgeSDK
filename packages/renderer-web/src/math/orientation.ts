import { DiceForgeError } from "@diceforge-sdk/core";
import { Quaternion, Vector3 } from "three";
import type { PolyhedronData, ShapedDieSides, Vec3 } from "./geometry.js";
import { cross, dieGeometry, dot, faceCentroid, normalize, subtract } from "./geometry.js";

/**
 * Outward unit normal of a face, independent of winding order: Newell's
 * method gives the plane normal, and the centroid test flips it outward
 * (every supported shape is convex and centered at the origin).
 */
export function faceNormal(data: PolyhedronData, faceIndex: number): Vec3 {
  const face = data.faces[faceIndex];
  if (!face) {
    throw new DiceForgeError("invalid-argument", `face ${faceIndex} does not exist`);
  }
  let normal: Vec3 = [0, 0, 0];
  for (let i = 0; i < face.length; i++) {
    const current = data.vertices[face[i] ?? -1];
    const next = data.vertices[face[(i + 1) % face.length] ?? -1];
    if (!current || !next) {
      throw new DiceForgeError("invalid-argument", "face references a missing vertex");
    }
    normal = [
      normal[0] + (current[1] - next[1]) * (current[2] + next[2]),
      normal[1] + (current[2] - next[2]) * (current[0] + next[0]),
      normal[2] + (current[0] - next[0]) * (current[1] + next[1]),
    ];
  }
  const unit = normalize(normal);
  return dot(unit, faceCentroid(data, faceIndex)) < 0 ? [-unit[0], -unit[1], -unit[2]] : unit;
}

const UP = new Vector3(0, 1, 0);

/**
 * Quaternion that orients a die so the face showing `value` points up (+Y),
 * toward the viewer. This is how presentation conforms to an
 * already-resolved outcome: the animation ends at exactly this orientation.
 */
export function faceUpQuaternion(sides: ShapedDieSides, value: number): Quaternion {
  const data = dieGeometry(sides);
  if (!Number.isInteger(value) || value < 1 || value > data.faces.length) {
    throw new DiceForgeError(
      "invalid-argument",
      `d${sides} has no face for value ${value}; expected 1..${data.faces.length}`,
    );
  }
  const normal = faceNormal(data, value - 1);
  return new Quaternion().setFromUnitVectors(new Vector3(...normal), UP);
}

/**
 * Fans a face into triangles wound counter-clockwise when seen from outside
 * the die. The source polygon lists corners in whichever order each solid was
 * authored, so winding must be corrected here: renderers derive lighting
 * normals from it, and an inward-facing triangle is lit from within and shows
 * through the solid whenever a material is not fully opaque.
 */
export function faceTriangles(
  data: PolyhedronData,
  faceIndex: number,
): [number, number, number][] {
  const face = data.faces[faceIndex];
  if (!face) {
    throw new DiceForgeError("invalid-argument", `face ${faceIndex} does not exist`);
  }
  const outward = faceNormal(data, faceIndex);
  const triangles: [number, number, number][] = [];
  for (let i = 1; i + 1 < face.length; i++) {
    const a = face[0] ?? -1;
    const b = face[i] ?? -1;
    const c = face[i + 1] ?? -1;
    const va = data.vertices[a];
    const vb = data.vertices[b];
    const vc = data.vertices[c];
    if (!va || !vb || !vc) {
      throw new DiceForgeError("invalid-argument", "face references a missing vertex");
    }
    const winding = cross(subtract(vb, va), subtract(vc, va));
    triangles.push(dot(winding, outward) >= 0 ? [a, b, c] : [a, c, b]);
  }
  return triangles;
}

/** In-plane axes of a face, for projecting its polygon into UV space. */
export function faceBasis(data: PolyhedronData, faceIndex: number): { u: Vec3; v: Vec3 } {
  const face = data.faces[faceIndex];
  const first = face ? data.vertices[face[0] ?? -1] : undefined;
  const second = face ? data.vertices[face[1] ?? -1] : undefined;
  if (!face || !first || !second) {
    throw new DiceForgeError("invalid-argument", `face ${faceIndex} does not exist`);
  }
  const normal = faceNormal(data, faceIndex);
  const u = normalize(subtract(second, first));
  const v = normalize(cross(normal, u));
  return { u, v };
}
