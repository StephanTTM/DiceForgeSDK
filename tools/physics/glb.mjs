/**
 * Reads the shipped dice as convex polyhedra, for the physics harness.
 *
 * The models are bevelled, so a face that is one flat pentagon on the ideal
 * solid arrives as a fan of triangles surrounded by chamfer strips. Handing
 * that soup to a physics engine as hundreds of separate faces is both slow and
 * a poor description of the shape, so coplanar triangles are merged back into
 * the polygons they came from.
 *
 * This parses the GLB container directly. GLTFLoader expects a browser, and
 * the files here are geometry only — one mesh, one primitive, no images — so
 * the fifty lines below are less trouble than making the loader run in Node.
 */

import { readFileSync } from "node:fs";

const COMPONENT_TYPES = {
  5121: Uint8Array,
  5123: Uint16Array,
  5125: Uint32Array,
  5126: Float32Array,
};
const COMPONENTS_PER_TYPE = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };

/** Positions and triangle indices from a .glb's first primitive. */
export function readGlbMesh(path) {
  const buffer = readFileSync(path);
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  let offset = 12;
  let json;
  let bin;
  while (offset < buffer.byteLength) {
    const length = view.getUint32(offset, true);
    const type = buffer.toString("utf8", offset + 4, offset + 8);
    const start = offset + 8;
    if (type.startsWith("JSON")) json = JSON.parse(buffer.toString("utf8", start, start + length));
    else if (type.startsWith("BIN")) bin = buffer.subarray(start, start + length);
    offset = start + length + ((4 - (length % 4)) % 4);
  }
  if (!json || !bin) throw new Error(`${path} is not a GLB with JSON and BIN chunks`);

  const read = (accessorIndex) => {
    const accessor = json.accessors[accessorIndex];
    const bufferView = json.bufferViews[accessor.bufferView];
    const Type = COMPONENT_TYPES[accessor.componentType];
    const width = COMPONENTS_PER_TYPE[accessor.type];
    const start = (bufferView.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
    const values = new Type(bin.buffer, bin.byteOffset + start, accessor.count * width);
    const out = [];
    for (let i = 0; i < accessor.count; i++)
      out.push([...values.slice(i * width, (i + 1) * width)]);
    return out;
  };

  const primitive = json.meshes[0].primitives[0];
  return {
    positions: read(primitive.attributes.POSITION),
    indices: read(primitive.indices).flat(),
  };
}

const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const length = (a) => Math.hypot(a[0], a[1], a[2]);
const normalize = (a) => {
  const l = length(a);
  return [a[0] / l, a[1] / l, a[2] / l];
};

/**
 * The model as a convex polyhedron: welded vertices, and coplanar triangles
 * merged into single polygon faces with their vertices in cyclic order.
 *
 * `weld` is in model units; vertices closer than this are the same corner
 * split by the exporter for normals or UVs.
 */
export function convexFromMesh({ positions, indices }, { weld = 1e-4, coplanar = 1e-3 } = {}) {
  const vertices = [];
  const remap = positions.map((position) => {
    const existing = vertices.findIndex((v) => length(sub(v, position)) < weld);
    if (existing >= 0) return existing;
    vertices.push([...position]);
    return vertices.length - 1;
  });

  // Group triangles by the plane they lie in: same normal, same offset.
  const planes = [];
  for (let i = 0; i < indices.length; i += 3) {
    const tri = [remap[indices[i]], remap[indices[i + 1]], remap[indices[i + 2]]];
    const a = vertices[tri[0]];
    const normal = normalize(cross(sub(vertices[tri[1]], a), sub(vertices[tri[2]], a)));
    if (!Number.isFinite(normal[0])) continue; // degenerate sliver
    const offset = dot(normal, a);
    const plane = planes.find(
      (p) => dot(p.normal, normal) > 1 - coplanar && Math.abs(p.offset - offset) < coplanar,
    );
    if (plane) for (const index of tri) plane.corners.add(index);
    else planes.push({ normal, offset, corners: new Set(tri) });
  }

  // Each merged face is convex, so ordering its corners by angle about the
  // face centre is enough to recover the ring the engine needs.
  const faces = planes.map(({ normal, corners }) => {
    const ring = [...corners];
    const centre = ring
      .reduce(
        (sum, i) => [sum[0] + vertices[i][0], sum[1] + vertices[i][1], sum[2] + vertices[i][2]],
        [0, 0, 0],
      )
      .map((v) => v / ring.length);
    const u = normalize(sub(vertices[ring[0]], centre));
    const v = cross(normal, u);
    return ring
      .map((index) => {
        const d = sub(vertices[index], centre);
        return { index, angle: Math.atan2(dot(d, v), dot(d, u)) };
      })
      .sort((a, b) => a.angle - b.angle)
      .map((entry) => entry.index);
  });

  return { vertices, faces, planes: planes.map((p) => ({ normal: p.normal, offset: p.offset })) };
}

/** True when every vertex sits on or inside every face plane. */
export function isConvex({ vertices, planes }, tolerance = 1e-3) {
  return vertices.every((vertex) =>
    planes.every((p) => dot(p.normal, vertex) <= p.offset + tolerance),
  );
}
