import type { PolyhedronData, Vec3 } from "@diceforge-sdk/renderer-web";

/** Quaternion as [x, y, z, w], matching the renderer's convention. */
export type QuaternionTuple = readonly [number, number, number, number];

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const norm = (a: Vec3): Vec3 => {
  const length = Math.hypot(a[0], a[1], a[2]);
  return [a[0] / length, a[1] / length, a[2] / length];
};

/** Rotates a vector by a quaternion. */
export function rotate(v: Vec3, q: QuaternionTuple): Vec3 {
  const [x, y, z] = v;
  const [qx, qy, qz, qw] = q;
  const ix = qw * x + qy * z - qz * y;
  const iy = qw * y + qz * x - qx * z;
  const iz = qw * z + qx * y - qy * x;
  const iw = -qx * x - qy * y - qz * z;
  return [
    ix * qw + iw * -qx + iy * -qz - iz * -qy,
    iy * qw + iw * -qy + iz * -qx - ix * -qz,
    iz * qw + iw * -qz + ix * -qy - iy * -qx,
  ];
}

/** Composes two rotations: the result applies `b` first, then `a`. */
export function multiply(a: QuaternionTuple, b: QuaternionTuple): QuaternionTuple {
  return [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
  ];
}

/**
 * Outward unit normal of each face, in face order.
 *
 * Newell's method rather than the direction of the face's centroid: a centroid
 * points along the normal only when the face is symmetric about it, which is
 * true of every Platonic solid and false of the d10's kites. Reading a
 * trapezohedron's normals off its centroids puts them about 17 degrees out.
 */
export function faceNormals(data: PolyhedronData): Vec3[] {
  return data.faces.map((ring) => faceNormal(data, ring));
}

function faceNormal(data: PolyhedronData, ring: readonly number[]): Vec3 {
  let x = 0;
  let y = 0;
  let z = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = data.vertices[ring[i] as number] as Vec3;
    const b = data.vertices[ring[(i + 1) % ring.length] as number] as Vec3;
    x += (a[1] - b[1]) * (a[2] + b[2]);
    y += (a[2] - b[2]) * (a[0] + b[0]);
    z += (a[0] - b[0]) * (a[1] + b[1]);
  }
  const normal = norm([x, y, z]);
  // Winding decides the sign; the solid is centred, so the centroid says which
  // way is out.
  const centre = faceCentre(data, ring);
  return dot(normal, centre) >= 0 ? normal : [-normal[0], -normal[1], -normal[2]];
}

function faceCentre(data: PolyhedronData, ring: readonly number[]): Vec3 {
  const sum = ring.reduce<Vec3>(
    (acc, index) => {
      const v = data.vertices[index] as Vec3;
      return [acc[0] + v[0], acc[1] + v[1], acc[2] + v[2]];
    },
    [0, 0, 0],
  );
  return [sum[0] / ring.length, sum[1] / ring.length, sum[2] / ring.length];
}

type FaceFrame = { readonly normal: Vec3; readonly inPlane: Vec3 };

function frameOf(data: PolyhedronData, faceIndex: number, offset: number): FaceFrame {
  const ring = data.faces[faceIndex] as readonly number[];
  const centre = faceCentre(data, ring);
  const normal = faceNormal(data, ring);
  const vertex = data.vertices[ring[offset % ring.length] as number] as Vec3;
  const raw = sub(vertex, centre);
  const along = dot(raw, normal);
  return {
    normal,
    inPlane: norm([
      raw[0] - along * normal[0],
      raw[1] - along * normal[1],
      raw[2] - along * normal[2],
    ]),
  };
}

/**
 * Rotation carrying one face frame onto another, as a quaternion.
 *
 * The matrix taking frame A onto frame B is B·Aᵀ, since an orthonormal frame's
 * inverse is its transpose. `m(row, col)` reads an entry of it without ever
 * building the array.
 */
function rotationBetween(from: FaceFrame, to: FaceFrame): QuaternionTuple {
  const au = from.inPlane;
  const an = from.normal;
  const aw = cross(from.inPlane, from.normal);
  const bu = to.inPlane;
  const bn = to.normal;
  const bw = cross(to.inPlane, to.normal);
  type Axis = 0 | 1 | 2;
  const m = (row: Axis, col: Axis): number =>
    bu[row] * au[col] + bn[row] * an[col] + bw[row] * aw[col];

  const trace = m(0, 0) + m(1, 1) + m(2, 2);
  if (trace > 0) {
    const s = Math.sqrt(trace + 1) * 2;
    return [(m(2, 1) - m(1, 2)) / s, (m(0, 2) - m(2, 0)) / s, (m(1, 0) - m(0, 1)) / s, s / 4];
  }
  // Trace near -1 makes the shortcut above numerically poor; pivot on the
  // largest diagonal entry instead.
  if (m(0, 0) > m(1, 1) && m(0, 0) > m(2, 2)) {
    const s = Math.sqrt(1 + m(0, 0) - m(1, 1) - m(2, 2)) * 2;
    return [s / 4, (m(0, 1) + m(1, 0)) / s, (m(0, 2) + m(2, 0)) / s, (m(2, 1) - m(1, 2)) / s];
  }
  if (m(1, 1) > m(2, 2)) {
    const s = Math.sqrt(1 + m(1, 1) - m(0, 0) - m(2, 2)) * 2;
    return [(m(0, 1) + m(1, 0)) / s, s / 4, (m(1, 2) + m(2, 1)) / s, (m(0, 2) - m(2, 0)) / s];
  }
  const s = Math.sqrt(1 + m(2, 2) - m(0, 0) - m(1, 1)) * 2;
  return [(m(0, 2) + m(2, 0)) / s, (m(1, 2) + m(2, 1)) / s, s / 4, (m(1, 0) - m(0, 1)) / s];
}

/** True when the rotation maps the solid's vertex set onto itself. */
function isSymmetry(data: PolyhedronData, rotation: QuaternionTuple, tolerance = 1e-4): boolean {
  return data.vertices.every((vertex) => {
    const moved = rotate(vertex as Vec3, rotation);
    return data.vertices.some((candidate) => {
      const c = candidate as Vec3;
      return Math.hypot(moved[0] - c[0], moved[1] - c[1], moved[2] - c[2]) < tolerance;
    });
  });
}

const cache = new Map<string, QuaternionTuple[][]>();

/**
 * For each pair of faces, a rotation of the solid carrying `target` onto the
 * place `actual` occupies (ADR-0018).
 *
 * Applied to a die's mesh inside its collider, it shows the recorded face
 * wherever the simulation happened to land — and because it is a symmetry, the
 * collider is unchanged and the physics never knows. Indexed
 * `[actualFace][targetFace]`, both zero-based.
 *
 * The solid is built from the model's own face directions (ADR-0019), so a
 * face index here is a numeral rather than an artefact of how some generator
 * happened to order its geometry.
 */
export function symmetryTable(data: PolyhedronData, key: string): QuaternionTuple[][] {
  const cached = cache.get(key);
  if (cached) return cached;

  const table = data.faces.map((_, actual) =>
    data.faces.map((_, target) => {
      const from = frameOf(data, target, 0);
      const actualRing = data.faces[actual] as readonly number[];
      for (let offset = 0; offset < actualRing.length; offset++) {
        const candidate = rotationBetween(from, frameOf(data, actual, offset));
        if (isSymmetry(data, candidate)) return candidate;
      }
      throw new Error(
        `no symmetry carries face ${target + 1} onto face ${actual + 1}; ` +
          "a physics collider must be a solid whose faces are all equivalent",
      );
    }),
  );
  cache.set(key, table);
  return table;
}

/** Which face of a solid points most nearly upward in the given orientation. */
export function upwardFace(normals: readonly Vec3[], orientation: QuaternionTuple): number {
  let best = 0;
  let bestY = Number.NEGATIVE_INFINITY;
  normals.forEach((normal, index) => {
    const y = rotate(normal, orientation)[1];
    if (y > bestY) {
      bestY = y;
      best = index;
    }
  });
  return best;
}
