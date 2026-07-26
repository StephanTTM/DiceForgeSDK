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
export function faceTriangles(data: PolyhedronData, faceIndex: number): [number, number, number][] {
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

/** Area of the convex hull of 2D points, via the monotone chain. */
function hullArea(points: readonly (readonly [number, number])[]): number {
  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (sorted.length < 3) return 0;
  const cross2 = (
    o: readonly [number, number],
    a: readonly [number, number],
    b: readonly [number, number],
  ) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const build = (sequence: readonly (readonly [number, number])[]) => {
    const chain: (readonly [number, number])[] = [];
    for (const point of sequence) {
      while (chain.length >= 2) {
        const a = chain[chain.length - 2];
        const b = chain[chain.length - 1];
        if (a && b && cross2(a, b, point) <= 0) chain.pop();
        else break;
      }
      chain.push(point);
    }
    return chain;
  };
  const hull = [...build(sorted).slice(0, -1), ...build([...sorted].reverse()).slice(0, -1)];
  let area = 0;
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i];
    const b = hull[(i + 1) % hull.length];
    if (a && b) area += a[0] * b[1] - b[0] * a[1];
  }
  return Math.abs(area) / 2;
}

/**
 * Elevation the presenter views the table from. Apparent size has to be
 * measured from where the camera actually is: straight down would ignore a
 * die's height, and a tall solid like the d10 gains silhouette from it.
 */
const VIEW_ELEVATION_RADIANS = (80 * Math.PI) / 180;

// Camera looks down from +Z at the view elevation; the screen plane is spanned
// by world X and the direction perpendicular to the view.
const SCREEN_UP = new Vector3(
  0,
  Math.cos(VIEW_ELEVATION_RADIANS),
  -Math.sin(VIEW_ELEVATION_RADIANS),
);
const SCREEN_RIGHT = new Vector3(1, 0, 0);

/** Screen area a set of points covers in one pose, from the presenter's camera. */
export function projectedArea(points: readonly Vector3[], pose: Quaternion): number {
  return hullArea(
    points.map((point) => {
      const turned = point.clone().applyQuaternion(pose);
      return [turned.dot(SCREEN_RIGHT), turned.dot(SCREEN_UP)] as const;
    }),
  );
}

/**
 * Screen area averaged over the poses a die actually lands in. Averaging over
 * arbitrary yaw instead would count orientations a die never comes to rest at,
 * which biases shapes whose outline changes a lot as they turn — a cube most of
 * all, since it is much wider corner-on than face-on.
 */
export function silhouetteArea(points: readonly Vector3[], poses: readonly Quaternion[]): number {
  if (poses.length === 0) return 0;
  let total = 0;
  for (const pose of poses) total += projectedArea(points, pose);
  return total / poses.length;
}

/**
 * Silhouette a die covers on screen when resting with a face up, averaged over
 * the yaw it may land at.
 */
export function restingSilhouette(sides: ShapedDieSides): number {
  const data = dieGeometry(sides);
  const points = data.vertices.map((v) => new Vector3(...v));
  // Every face in turn: the poses this die can come to rest in.
  const poses = data.faces.map((_, index) => faceUpQuaternion(sides, index + 1));
  return silhouetteArea(points, poses);
}

const apparentScales = new Map<ShapedDieSides, number>();

/**
 * Uniform scale that makes every die cover the same amount of screen.
 *
 * Solids are built to a common bounding box, but a compact one fills more of
 * that box: a d6 covers well over twice the area of a d8 at the same nominal
 * size, which reads as a mismatched set. What has to match is the silhouette
 * from where the camera actually sits — a die's height counts towards that, so
 * measuring the straight-down footprint instead leaves tall solids like the
 * d10 looking oversized next to the d20. The d20 is the reference and is
 * unchanged.
 */
export function apparentScale(sides: ShapedDieSides): number {
  const cached = apparentScales.get(sides);
  if (cached !== undefined) return cached;
  const scale = Math.sqrt(restingSilhouette(20) / restingSilhouette(sides));
  apparentScales.set(sides, scale);
  return scale;
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
