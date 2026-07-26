import { DiceForgeError } from "@diceforge-sdk/core";
import { Quaternion, Vector3 } from "three";
import type { PolyhedronData, ShapedDieSides, Vec3 } from "./geometry.js";
import { dieGeometry, dot, faceCentroid, normalize } from "./geometry.js";

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
