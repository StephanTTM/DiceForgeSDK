import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";
import { describe, expect, it } from "vitest";
import { FORGE_FACE_ROTATIONS } from "./forge-rotations.js";
import type { ShapedDieSides } from "./math/geometry.js";

/**
 * Ties a die's value to the numeral actually printed on the shipped model.
 *
 * Everything else about the rotation tables was already checked — that they
 * match the manifest, hold unit quaternions, and send every value to a
 * *distinct* face. All of that is true of a table that is internally tidy and
 * completely wrong, which is exactly how the physics presenter shipped showing
 * 57 of 60 faces incorrectly (ADR-0019): its own tests were self-consistent and
 * blind to the numerals.
 *
 * So this walks the whole chain the renderer depends on. For each value, apply
 * the rotation, find the face it brings up, read that face's UVs, and check
 * they land in the atlas tile the manifest assigns to that value. Nothing here
 * trusts a second artefact to agree with a first: the geometry, the UVs and the
 * tables are compared against each other.
 */

const FORGE = new URL("../../assets-forge/forge/", import.meta.url);
const SHAPES: readonly ShapedDieSides[] = [4, 6, 8, 10, 12, 20];

type Manifest = Record<
  string,
  {
    faces: number;
    atlas: { columns: number; rows: number; faces: { tile: [number, number] }[] };
  }
>;

const manifest = JSON.parse(
  readFileSync(fileURLToPath(new URL("face-rotations.json", FORGE)), "utf8"),
) as Manifest;

type Vec3 = [number, number, number];
type Vec2 = [number, number];

const TYPED = {
  5121: Uint8Array,
  5123: Uint16Array,
  5125: Uint32Array,
  5126: Float32Array,
} as const;
const COMPONENTS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 } as const;

/**
 * Reads a glTF-Binary directly. The container is a 12-byte header followed by
 * length-prefixed JSON and binary chunks, so a loader (and a DOM to run it in)
 * would be more machinery than the job needs.
 */
function readGlb(path: string): { positions: Vec3[]; uvs: Vec2[]; indices: number[] } {
  const buf = readFileSync(path);
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let offset = 12;
  let json: Record<string, never[]> | undefined;
  let bin: Buffer | undefined;
  while (offset < buf.byteLength) {
    const length = view.getUint32(offset, true);
    const kind = buf.toString("ascii", offset + 4, offset + 8);
    const start = offset + 8;
    if (kind === "JSON") json = JSON.parse(buf.toString("utf8", start, start + length));
    if (kind.startsWith("BIN")) bin = buf.subarray(start, start + length);
    offset = start + length;
  }
  if (!json || !bin) throw new Error(`${path}: not a glTF-Binary`);
  const binary = bin;

  const gltf = json as unknown as {
    accessors: {
      bufferView: number;
      componentType: 5121 | 5123 | 5125 | 5126;
      count: number;
      type: keyof typeof COMPONENTS;
      byteOffset?: number;
    }[];
    bufferViews: { byteOffset?: number }[];
    meshes: { primitives: { attributes: Record<string, number>; indices: number }[] }[];
  };

  function read(index: number): number[][] {
    const accessor = gltf.accessors[index];
    if (!accessor) throw new Error(`${path}: missing accessor ${index}`);
    const bufferView = gltf.bufferViews[accessor.bufferView];
    if (!bufferView) throw new Error(`${path}: missing bufferView`);
    const Ctor = TYPED[accessor.componentType];
    const stride = COMPONENTS[accessor.type];
    const at = (bufferView.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
    // Buffer types its backing store as ArrayBufferLike, which admits
    // SharedArrayBuffer; a file read is never shared.
    const store = binary.buffer as ArrayBuffer;
    const data = new Ctor(store, binary.byteOffset + at, accessor.count * stride);
    const out: number[][] = [];
    for (let i = 0; i < accessor.count; i++) {
      out.push(Array.from(data.subarray(i * stride, i * stride + stride)));
    }
    return out;
  }

  const primitive = gltf.meshes[0]?.primitives[0];
  if (!primitive) throw new Error(`${path}: no mesh`);
  const position = primitive.attributes.POSITION;
  const texcoord = primitive.attributes.TEXCOORD_0;
  if (position === undefined || texcoord === undefined)
    throw new Error(`${path}: missing attributes`);
  return {
    positions: read(position) as Vec3[],
    uvs: read(texcoord) as Vec2[],
    indices: read(primitive.indices).map((i) => i[0] as number),
  };
}

function rotate(v: Vec3, q: readonly number[]): Vec3 {
  const [x, y, z] = v;
  const qx = q[0] as number;
  const qy = q[1] as number;
  const qz = q[2] as number;
  const qw = q[3] as number;
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

type Face = { normal: Vec3; uv: Vec2 };

/**
 * Groups a bevelled mesh's triangles back into the flat faces a player sees.
 * Bevelling turns a d20 into hundreds of facets, so only the largest clusters
 * are real faces; the slivers around the edges are chamfer.
 */
function facesOf(shape: ShapedDieSides): Face[] {
  const { positions, uvs, indices } = readGlb(fileURLToPath(new URL(`d${shape}.glb`, FORGE)));
  const clusters: { sum: Vec3; area: number; uv: Vec2 }[] = [];
  for (let t = 0; t < indices.length / 3; t++) {
    const i0 = indices[t * 3] as number;
    const i1 = indices[t * 3 + 1] as number;
    const i2 = indices[t * 3 + 2] as number;
    const a = positions[i0] as Vec3;
    const b = positions[i1] as Vec3;
    const c = positions[i2] as Vec3;
    const u: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const w: Vec3 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const cross: Vec3 = [
      u[1] * w[2] - u[2] * w[1],
      u[2] * w[0] - u[0] * w[2],
      u[0] * w[1] - u[1] * w[0],
    ];
    const area = Math.hypot(cross[0], cross[1], cross[2]) / 2;
    if (area < 1e-9) continue;
    const unit: Vec3 = [cross[0] / (area * 2), cross[1] / (area * 2), cross[2] / (area * 2)];
    let cluster = clusters.find((k) => {
      const length = Math.hypot(k.sum[0], k.sum[1], k.sum[2]);
      return (k.sum[0] * unit[0] + k.sum[1] * unit[1] + k.sum[2] * unit[2]) / length > 0.985;
    });
    if (!cluster) {
      cluster = { sum: [0, 0, 0], area: 0, uv: [0, 0] };
      clusters.push(cluster);
    }
    cluster.sum = [
      cluster.sum[0] + unit[0] * area,
      cluster.sum[1] + unit[1] * area,
      cluster.sum[2] + unit[2] * area,
    ];
    cluster.area += area;
    for (const i of [i0, i1, i2]) {
      const uv = uvs[i] as Vec2;
      cluster.uv[0] += (uv[0] * area) / 3;
      cluster.uv[1] += (uv[1] * area) / 3;
    }
  }
  clusters.sort((x, y) => y.area - x.area);
  return clusters.slice(0, shape).map((k) => {
    const length = Math.hypot(k.sum[0], k.sum[1], k.sum[2]);
    return {
      normal: [k.sum[0] / length, k.sum[1] / length, k.sum[2] / length] as Vec3,
      uv: [k.uv[0] / k.area, k.uv[1] / k.area] as Vec2,
    };
  });
}

describe("the shipped dice show the value that was rolled", () => {
  it("brings the numeral's own atlas tile to the top, for every face", () => {
    for (const shape of SHAPES) {
      const entry = manifest[`d${shape}`];
      const rotations = FORGE_FACE_ROTATIONS[shape];
      if (!entry || !rotations) throw new Error(`d${shape} missing`);
      const faces = facesOf(shape);
      expect(faces, `d${shape} did not resolve to ${shape} flat faces`).toHaveLength(shape);

      // Tiles sit on a square grid — `1 / max(columns, rows)` — so a 3x2 atlas
      // still steps in thirds vertically. The exporter flips V from Blender's
      // bottom-left origin to glTF's top-left, which cancels the flip the
      // generator applied, so row reads straight off v.
      const size = 1 / Math.max(entry.atlas.columns, entry.atlas.rows);

      for (let value = 1; value <= shape; value++) {
        const rotation = rotations[value - 1];
        if (!rotation) throw new Error(`d${shape} value ${value} has no rotation`);
        let top = 0;
        let highest = Number.NEGATIVE_INFINITY;
        faces.forEach((face, index) => {
          const y = rotate(face.normal, rotation)[1];
          if (y > highest) {
            highest = y;
            top = index;
          }
        });
        const uv = (faces[top] as Face).uv;
        const tile = [Math.floor(uv[0] / size), Math.floor(uv[1] / size)];
        const want = entry.atlas.faces[value - 1]?.tile;
        expect(tile, `d${shape} value ${value} lands on tile ${tile} of ${String(want)}`).toEqual(
          want,
        );
      }
    }
  });
});

describe("the shipped textures", () => {
  /**
   * A correct chain still shows nothing if the atlas tile is blank, which is
   * what a texture build that silently skipped a glyph would leave behind. Ink
   * coverage per tile is a cheap proxy: every face should carry a mark, and no
   * two faces of a die should carry the same one.
   */
  it("paint a distinct numeral in every face's tile", () => {
    for (const shape of SHAPES) {
      const entry = manifest[`d${shape}`];
      if (!entry) throw new Error(`d${shape} missing`);
      const png = PNG.sync.read(
        readFileSync(fileURLToPath(new URL(`textures/blue/d${shape}.png`, FORGE))),
      );
      const columns = Math.max(entry.atlas.columns, entry.atlas.rows);
      const side = Math.floor(png.width / columns);

      const signatures = entry.atlas.faces.map(({ tile }) => {
        // Coarse 4x4 ink histogram: enough to tell "7" from "8", and immune to
        // the antialiasing that makes exact pixel comparison brittle.
        const bins = new Array(16).fill(0);
        let ink = 0;
        for (let y = 0; y < side; y++) {
          for (let x = 0; x < side; x++) {
            const px = ((tile[1] * side + y) * png.width + (tile[0] * side + x)) * 4;
            const r = png.data[px] as number;
            const g = png.data[px + 1] as number;
            const b = png.data[px + 2] as number;
            // Numerals are painted light on a dark die face.
            const lit = (r + g + b) / 3 > 140 ? 1 : 0;
            ink += lit;
            bins[Math.floor((y * 4) / side) * 4 + Math.floor((x * 4) / side)] += lit;
          }
        }
        return { ink, key: bins.join(",") };
      });

      signatures.forEach((signature, index) => {
        expect(signature.ink, `d${shape} value ${index + 1} has a blank tile`).toBeGreaterThan(0);
      });
      const distinct = new Set(signatures.map((s) => s.key));
      expect(distinct.size, `d${shape} has faces painted alike`).toBe(shape);
    }
  });
});
