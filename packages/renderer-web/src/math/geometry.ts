import { DiceForgeError } from "@diceforge-sdk/core";

export type Vec3 = readonly [number, number, number];

export type PolyhedronData = {
  readonly vertices: readonly Vec3[];
  /**
   * Faces as vertex-index polygons; face i displays value i + 1. Winding is
   * not guaranteed — consumers derive outward normals via the centroid test
   * in orientation.ts and render double-sided.
   */
  readonly faces: readonly (readonly number[])[];
};

/** Die sizes with a single physical shape (d100 is presented as two d10s). */
export type ShapedDieSides = 4 | 6 | 8 | 10 | 12 | 20;

const PHI = (1 + Math.sqrt(5)) / 2;

export function add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

export function subtract(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

export function scale(a: Vec3, factor: number): Vec3 {
  return [a[0] * factor, a[1] * factor, a[2] * factor];
}

export function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

export function normalize(a: Vec3): Vec3 {
  const length = Math.sqrt(dot(a, a));
  if (length === 0) {
    throw new DiceForgeError("invalid-argument", "cannot normalize a zero-length vector");
  }
  return scale(a, 1 / length);
}

export function faceCentroid(data: PolyhedronData, faceIndex: number): Vec3 {
  const face = data.faces[faceIndex];
  if (!face) {
    throw new DiceForgeError("invalid-argument", `face ${faceIndex} does not exist`);
  }
  let centroid: Vec3 = [0, 0, 0];
  for (const vertexIndex of face) {
    const vertex = data.vertices[vertexIndex];
    if (!vertex) {
      throw new DiceForgeError("invalid-argument", `vertex ${vertexIndex} does not exist`);
    }
    centroid = add(centroid, vertex);
  }
  return scale(centroid, 1 / face.length);
}

function tetrahedron(): PolyhedronData {
  return {
    vertices: [
      [1, 1, 1],
      [1, -1, -1],
      [-1, 1, -1],
      [-1, -1, 1],
    ],
    faces: [
      [0, 1, 2],
      [0, 3, 1],
      [0, 2, 3],
      [1, 3, 2],
    ],
  };
}

function cube(): PolyhedronData {
  return {
    vertices: [
      [-1, -1, -1],
      [1, -1, -1],
      [1, 1, -1],
      [-1, 1, -1],
      [-1, -1, 1],
      [1, -1, 1],
      [1, 1, 1],
      [-1, 1, 1],
    ],
    // Classic numbering: opposite faces sum to 7 (1/6, 2/5, 3/4).
    faces: [
      [7, 6, 2, 3], // 1: +Y
      [4, 5, 6, 7], // 2: +Z
      [1, 2, 6, 5], // 3: +X
      [0, 4, 7, 3], // 4: -X
      [0, 3, 2, 1], // 5: -Z
      [0, 1, 5, 4], // 6: -Y
    ],
  };
}

function octahedron(): PolyhedronData {
  return {
    vertices: [
      [1, 0, 0],
      [-1, 0, 0],
      [0, 1, 0],
      [0, -1, 0],
      [0, 0, 1],
      [0, 0, -1],
    ],
    faces: [
      [0, 2, 4],
      [2, 1, 4],
      [1, 3, 4],
      [3, 0, 4],
      [2, 0, 5],
      [1, 2, 5],
      [3, 1, 5],
      [0, 3, 5],
    ],
  };
}

/**
 * Pentagonal trapezohedron. The ring offset delta is derived from the apex
 * height so every kite face is exactly planar.
 */
function pentagonalTrapezohedron(): PolyhedronData {
  const apexHeight = 1.05;
  const delta = (apexHeight * (1 - Math.cos(Math.PI / 5))) / (1 + Math.cos(Math.PI / 5));
  const upper: Vec3[] = [];
  const lower: Vec3[] = [];
  for (let k = 0; k < 5; k++) {
    const upperAngle = (2 * Math.PI * k) / 5;
    const lowerAngle = upperAngle + Math.PI / 5;
    upper.push([Math.cos(upperAngle), delta, Math.sin(upperAngle)]);
    lower.push([Math.cos(lowerAngle), -delta, Math.sin(lowerAngle)]);
  }
  const top: Vec3 = [0, apexHeight, 0];
  const bottom: Vec3 = [0, -apexHeight, 0];
  // Vertex order: 0 top apex, 1 bottom apex, 2..6 upper ring, 7..11 lower ring.
  const vertices: Vec3[] = [top, bottom, ...upper, ...lower];
  const upperIndex = (k: number) => 2 + (k % 5);
  const lowerIndex = (k: number) => 7 + (k % 5);
  const faces: number[][] = [];
  for (let k = 0; k < 5; k++) {
    faces.push([0, upperIndex(k), lowerIndex(k), upperIndex(k + 1)]);
  }
  for (let k = 0; k < 5; k++) {
    faces.push([1, lowerIndex(k), upperIndex(k + 1), lowerIndex(k + 1)]);
  }
  return { vertices, faces };
}

function icosahedron(): PolyhedronData {
  const t = PHI;
  return {
    vertices: [
      [-1, t, 0],
      [1, t, 0],
      [-1, -t, 0],
      [1, -t, 0],
      [0, -1, t],
      [0, 1, t],
      [0, -1, -t],
      [0, 1, -t],
      [t, 0, -1],
      [t, 0, 1],
      [-t, 0, -1],
      [-t, 0, 1],
    ],
    faces: [
      [0, 11, 5],
      [0, 5, 1],
      [0, 1, 7],
      [0, 7, 10],
      [0, 10, 11],
      [1, 5, 9],
      [5, 11, 4],
      [11, 10, 2],
      [10, 7, 6],
      [7, 1, 8],
      [3, 9, 4],
      [3, 4, 2],
      [3, 2, 6],
      [3, 6, 8],
      [3, 8, 9],
      [4, 9, 5],
      [2, 4, 11],
      [6, 2, 10],
      [8, 6, 7],
      [9, 8, 1],
    ],
  };
}

/**
 * Dodecahedron built as the dual of the icosahedron: one vertex per
 * icosahedron face (its centroid), one pentagon per icosahedron vertex, with
 * the pentagon's corners ordered by angle around that vertex. Correct by
 * construction, so every pentagon is planar and regular.
 */
function dodecahedron(): PolyhedronData {
  const icosa = icosahedron();
  const centroids = icosa.faces.map((_, faceIndex) => faceCentroid(icosa, faceIndex));
  const faces = icosa.vertices.map((vertex, vertexIndex) => {
    const adjacent: number[] = [];
    icosa.faces.forEach((face, faceIndex) => {
      if (face.includes(vertexIndex)) adjacent.push(faceIndex);
    });
    const axis = normalize(vertex);
    const first = centroids[adjacent[0] ?? 0] ?? [1, 0, 0];
    const reference = normalize(subtract(first, scale(axis, dot(first, axis))));
    const orthogonal = cross(axis, reference);
    const angleOf = (faceIndex: number): number => {
      const centroid = centroids[faceIndex] ?? [0, 0, 0];
      return Math.atan2(dot(centroid, orthogonal), dot(centroid, reference));
    };
    return [...adjacent].sort((a, b) => angleOf(a) - angleOf(b));
  });
  return { vertices: centroids, faces };
}

const BUILDERS: Record<ShapedDieSides, () => PolyhedronData> = {
  4: tetrahedron,
  6: cube,
  8: octahedron,
  10: pentagonalTrapezohedron,
  12: dodecahedron,
  20: icosahedron,
};

const cache = new Map<ShapedDieSides, PolyhedronData>();

/**
 * Largest dimension of a die, shared by procedural and themed models so a d6
 * and a d20 sit side by side at comparable size.
 */
export const DIE_SIZE = 2.1;

/** Scales a solid so its bounding box measures `DIE_SIZE` on its longest axis. */
function normalizeSize(data: PolyhedronData): PolyhedronData {
  let extent = 0;
  for (const vertex of data.vertices) {
    extent = Math.max(extent, Math.abs(vertex[0]), Math.abs(vertex[1]), Math.abs(vertex[2]));
  }
  if (extent === 0) return data;
  const factor = DIE_SIZE / (2 * extent);
  return { vertices: data.vertices.map((vertex) => scale(vertex, factor)), faces: data.faces };
}

/** Geometry for a physical die shape. d100 has no shape of its own: present it as two d10s. */
export function dieGeometry(sides: ShapedDieSides): PolyhedronData {
  const cached = cache.get(sides);
  if (cached) return cached;
  const builder = BUILDERS[sides];
  if (!builder) {
    throw new DiceForgeError("invalid-argument", `no die geometry for d${sides}`);
  }
  const data = normalizeSize(builder());
  cache.set(sides, data);
  return data;
}
