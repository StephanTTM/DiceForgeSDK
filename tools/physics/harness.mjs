/**
 * Physics presenter harness — measurement, not a presenter.
 *
 *   npm run physics            all shapes, default trials
 *   npm run physics -- --shape=20 --dice=5 --trials=40
 *   npm run physics -- --hull=glb    collide the shipped bevelled models
 *
 * ADR-0018 proposes simulating a roll headlessly, recording the trajectory,
 * and rotating each die's mesh inside its collider by a symmetry so the
 * already-resolved face lands where the simulation's face did. The technique
 * is proven on paper by `packages/renderer-web/src/math/symmetry.test.ts`.
 * What that test cannot tell us is whether a simulation of real dice behaves
 * well enough to animate: how long a roll takes to settle, how far dice
 * scatter (which is what the camera has to frame), and whether the remap still
 * works against poses a simulation actually produced rather than poses we
 * constructed.
 *
 * This answers those. It renders nothing and ships nothing.
 *
 * Requires a current build: `npm run build`.
 */

import { Body, ContactMaterial, ConvexPolyhedron, Material, Plane, Vec3, World } from "cannon-es";
import { createSeededRandomSource } from "../../packages/core/dist/index.js";
import { dieGeometry } from "../../packages/renderer-web/dist/math/geometry.js";
import { convexFromMesh, readGlbMesh } from "./glb.mjs";

const SHAPES = [4, 6, 8, 10, 12, 20];

/**
 * Dice are modelled at roughly their real size in metres. Simulating a 2-unit
 * die under earth gravity produces a boulder that drifts; keeping the die
 * small and the gravity real is what makes the motion read as dice.
 */
const DIE_RADIUS = 0.008;
const GRAVITY = -9.82;
const STEP = 1 / 120;
/**
 * Cannon's default of 10 is not enough for a dodecahedron: measured, a d12
 * never comes to rest below 16, and settles every time at 16 or more. Leave
 * `solver.tolerance` alone — loosening it to 1e-3 stops every shape settling,
 * whatever the iteration count.
 */
const SOLVER_ITERATIONS = 20;
const MAX_STEPS = 1800; // 15 simulated seconds
/**
 * Rest is cannon's own sleep, not a hand-rolled velocity threshold. A convex
 * hull resting on a plane gets periodic kicks from the solver — measured on a
 * d20: dead flat and motionless, then spin jumping from 0.008 to 1.66 and back,
 * over and over. A threshold detector never sees every die quiet at the same
 * moment; a sleeping body ignores the kick entirely.
 */
const SLEEP_SPEED = 0.02;
const SLEEP_TIME = 0.15;

const args = new Map(
  process.argv
    .slice(2)
    .filter((a) => a.startsWith("--"))
    .map((a) => {
      const [key, value = "true"] = a.slice(2).split("=");
      return [key, value];
    }),
);
const TRIALS = Number(args.get("trials") ?? 25);
const DICE = Number(args.get("dice") ?? 5);
const ONLY = args.get("shape") ? Number(args.get("shape")) : undefined;
/** "ideal" is the sharp solid; "glb" is the shipped bevelled model. */
const HULL = args.get("hull") ?? "ideal";

/** Distance from the centre to the nearest face plane, over the N largest faces. */
function inradius(data, faceCount) {
  const centres = data.faces.map((ring) => {
    const c = ring
      .reduce(
        (sum, i) => [
          sum[0] + data.vertices[i][0],
          sum[1] + data.vertices[i][1],
          sum[2] + data.vertices[i][2],
        ],
        [0, 0, 0],
      )
      .map((v) => v / ring.length);
    return Math.hypot(...c);
  });
  return (
    centres
      .sort((a, b) => a - b)
      .slice(0, faceCount)
      .reduce((a, b) => a + b, 0) / faceCount
  );
}

/** The solid, scaled to die size, with faces wound so normals point outward. */
function collider(sides) {
  const ideal = dieGeometry(sides);
  const data =
    HULL === "glb"
      ? convexFromMesh(
          readGlbMesh(new URL(`../../packages/assets-forge/forge/d${sides}.glb`, import.meta.url)),
        )
      : ideal;
  // Scaled so the *face planes* coincide, not the bounding radius: bevelling
  // cuts corners without moving faces, so matching radii would rest a bevelled
  // die 3-9% higher than the drawn model sits.
  const scale =
    (DIE_RADIUS *
      (inradius(ideal, ideal.faces.length) /
        Math.max(...ideal.vertices.map((v) => Math.hypot(...v))))) /
    inradius(data, ideal.faces.length);
  const vertices = data.vertices.map((v) => new Vec3(v[0] * scale, v[1] * scale, v[2] * scale));
  const faces = data.faces.map((face) => {
    const [a, b, c] = face;
    const normal = vertices[b].vsub(vertices[a]).cross(vertices[c].vsub(vertices[a]));
    const centre = face
      .reduce((sum, i) => sum.vadd(vertices[i]), new Vec3())
      .scale(1 / face.length);
    // cannon-es reads winding to derive normals; an inward face makes the hull
    // non-convex as far as the solver is concerned and the die sinks.
    return normal.dot(centre) >= 0 ? [...face] : [...face].reverse();
  });
  return { shape: new ConvexPolyhedron({ vertices, faces }), data };
}

/** Outward unit normals of the solid's faces, in face order. */
function faceNormals(data) {
  return data.faces.map((face) => {
    const centre = face
      .reduce(
        (sum, i) => [
          sum[0] + data.vertices[i][0],
          sum[1] + data.vertices[i][1],
          sum[2] + data.vertices[i][2],
        ],
        [0, 0, 0],
      )
      .map((v) => v / face.length);
    const length = Math.hypot(...centre);
    return [centre[0] / length, centre[1] / length, centre[2] / length];
  });
}

function rotate(normal, q) {
  const [x, y, z] = normal;
  const { x: qx, y: qy, z: qz, w: qw } = q;
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

/** Which face is uppermost in a resting pose, and how squarely it sits. */
function topFace(normals, quaternion) {
  let best = -1;
  let bestY = Number.NEGATIVE_INFINITY;
  normals.forEach((normal, index) => {
    const y = rotate(normal, quaternion)[1];
    if (y > bestY) {
      bestY = y;
      best = index;
    }
  });
  return { face: best, flatness: bestY };
}

function simulate(sides, diceCount, random) {
  const { shape, data } = collider(sides);
  const normals = faceNormals(data);
  const world = new World({ gravity: new Vec3(0, GRAVITY, 0) });
  world.allowSleep = true;
  world.solver.iterations = SOLVER_ITERATIONS;
  const dieMaterial = new Material("die");
  const floorMaterial = new Material("floor");
  world.addContactMaterial(
    new ContactMaterial(dieMaterial, floorMaterial, { friction: 0.4, restitution: 0.25 }),
  );
  world.addContactMaterial(
    new ContactMaterial(dieMaterial, dieMaterial, { friction: 0.2, restitution: 0.3 }),
  );

  const floor = new Body({ mass: 0, shape: new Plane(), material: floorMaterial });
  floor.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
  world.addBody(floor);

  const unit = () => random.nextUint32() / 0x100000000;
  const spread = (magnitude) => (unit() * 2 - 1) * magnitude;

  const bodies = [];
  for (let i = 0; i < diceCount; i++) {
    const body = new Body({
      mass: 0.004,
      shape,
      material: dieMaterial,
      // A real die bleeds energy into the felt; without damping a spinning one
      // keeps going far longer than anyone would wait.
      linearDamping: 0.06,
      angularDamping: 0.12,
      allowSleep: true,
      sleepSpeedLimit: SLEEP_SPEED,
      sleepTimeLimit: SLEEP_TIME,
    });
    body.position.set(spread(0.04), 0.09 + i * 0.03, spread(0.04));
    body.velocity.set(spread(0.6), -0.4, spread(0.6));
    body.angularVelocity.set(spread(28), spread(28), spread(28));
    body.quaternion.setFromEuler(spread(Math.PI), spread(Math.PI), spread(Math.PI));
    world.addBody(body);
    bodies.push(body);
  }

  let steps = 0;
  while (steps < MAX_STEPS) {
    // step(), not fixedStep(): the latter paces itself off wall-clock time,
    // which in a headless loop means the world barely advances at all.
    world.step(STEP);
    steps += 1;
    if (bodies.every((body) => body.sleepState === Body.SLEEPING)) break;
  }

  const settled = steps < MAX_STEPS;
  const rests = bodies.map((body) => {
    const top = topFace(normals, body.quaternion);
    return {
      ...top,
      distance: Math.hypot(body.position.x, body.position.z),
      belowFloor: body.position.y < -DIE_RADIUS,
      remap: settled ? remapError(data, normals, body.quaternion, top.face) : null,
    };
  });
  return { settled, seconds: steps * STEP, steps, rests, faceCount: data.faces.length };
}

/** A face's orthonormal frame, starting from the `offset`-th of its vertices. */
function faceFrame(data, faceIndex, offset) {
  const ring = data.faces[faceIndex];
  const centre = ring
    .reduce(
      (sum, i) => [
        sum[0] + data.vertices[i][0],
        sum[1] + data.vertices[i][1],
        sum[2] + data.vertices[i][2],
      ],
      [0, 0, 0],
    )
    .map((v) => v / ring.length);
  const length = Math.hypot(...centre);
  const normal = centre.map((v) => v / length);
  const vertex = data.vertices[ring[offset % ring.length]];
  const raw = [vertex[0] - centre[0], vertex[1] - centre[1], vertex[2] - centre[2]];
  const along = raw[0] * normal[0] + raw[1] * normal[1] + raw[2] * normal[2];
  const planar = raw.map((v, i) => v - along * normal[i]);
  const planarLength = Math.hypot(...planar);
  return { normal, inPlane: planar.map((v) => v / planarLength) };
}

/** Rotation carrying one face frame onto another, as a quaternion. */
function rotationBetween(from, to) {
  const third = (f) => [
    f.inPlane[1] * f.normal[2] - f.inPlane[2] * f.normal[1],
    f.inPlane[2] * f.normal[0] - f.inPlane[0] * f.normal[2],
    f.inPlane[0] * f.normal[1] - f.inPlane[1] * f.normal[0],
  ];
  // Columns of each frame's basis; the rotation is to * fromᵀ.
  const a = [from.inPlane, from.normal, third(from)];
  const b = [to.inPlane, to.normal, third(to)];
  const m = [0, 1, 2].map((r) =>
    [0, 1, 2].map((c) => a.reduce((sum, _, k) => sum + b[k][r] * a[k][c], 0)),
  );
  const trace = m[0][0] + m[1][1] + m[2][2];
  if (trace > 0) {
    const s2 = Math.sqrt(trace + 1) * 2;
    return {
      x: (m[2][1] - m[1][2]) / s2,
      y: (m[0][2] - m[2][0]) / s2,
      z: (m[1][0] - m[0][1]) / s2,
      w: s2 / 4,
    };
  }
  const i = m[0][0] > m[1][1] ? (m[0][0] > m[2][2] ? 0 : 2) : m[1][1] > m[2][2] ? 1 : 2;
  const j = (i + 1) % 3;
  const k = (i + 2) % 3;
  const s2 = Math.sqrt(m[i][i] - m[j][j] - m[k][k] + 1) * 2;
  const q = [0, 0, 0];
  q[i] = s2 / 4;
  q[j] = (m[j][i] + m[i][j]) / s2;
  q[k] = (m[k][i] + m[i][k]) / s2;
  return { x: q[0], y: q[1], z: q[2], w: (m[k][j] - m[j][k]) / s2 };
}

function isSymmetry(data, rotation) {
  return data.vertices.every((vertex) => {
    const moved = rotate(vertex, rotation);
    return data.vertices.some(
      (candidate) =>
        Math.hypot(moved[0] - candidate[0], moved[1] - candidate[1], moved[2] - candidate[2]) <
        1e-4,
    );
  });
}

/**
 * The heart of ADR-0018, checked against a pose the simulation produced: with
 * the die at rest showing `actual`, is there a symmetry of the solid that puts
 * `target` exactly where `actual` is now?
 *
 * The comparison is against the actual face's own direction, not against
 * vertical. A die does not always rest dead flat — a tetrahedron never does,
 * since it rests on a face with a vertex up — and measuring against +Y would
 * report that tilt as a remap error, which it is not.
 *
 * Returns the worst error in degrees, or null if some target had no symmetry.
 */
function remapError(data, normals, restQuaternion, actualFace) {
  let worst = 0;
  for (let target = 0; target < data.faces.length; target++) {
    const from = faceFrame(data, target, 0);
    let best = null;
    for (let offset = 0; offset < data.faces[actualFace].length; offset++) {
      const candidate = rotationBetween(from, faceFrame(data, actualFace, offset));
      if (isSymmetry(data, candidate)) {
        best = candidate;
        break;
      }
    }
    if (!best) return null;
    const shown = rotate(rotate(normals[target], best), restQuaternion);
    const wanted = rotate(normals[actualFace], restQuaternion);
    const alignment = shown[0] * wanted[0] + shown[1] * wanted[1] + shown[2] * wanted[2];
    worst = Math.max(worst, Math.acos(Math.min(1, Math.max(-1, alignment))));
  }
  return (worst * 180) / Math.PI;
}

function percentile(values, p) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))];
}

console.log(
  `cannon-es harness — ${TRIALS} trials x ${DICE} dice, ${DIE_RADIUS * 2000}mm dice, ${STEP * 1000}ms steps\n`,
);
console.log(
  "shape   settled   settle s (mean/p95/max)   scatter mm (p95/max)   flatness min   remap err   trajectory   wall/roll",
);

const summary = [];
for (const sides of ONLY ? [ONLY] : SHAPES) {
  const random = createSeededRandomSource(`physics-d${sides}`);
  const seconds = [];
  const distances = [];
  const faces = new Map();
  let settledTrials = 0;
  let worstFlatness = 1;
  let sunk = 0;
  let worstRemap = 0;
  let remapFailures = 0;
  let steps = 0;

  const wallStart = performance.now();
  for (let trial = 0; trial < TRIALS; trial++) {
    const result = simulate(sides, DICE, random);
    if (result.settled) settledTrials += 1;
    seconds.push(result.seconds);
    steps = Math.max(steps, result.steps);
    for (const rest of result.rests) {
      distances.push(rest.distance * 1000);
      faces.set(rest.face, (faces.get(rest.face) ?? 0) + 1);
      worstFlatness = Math.min(worstFlatness, rest.flatness);
      if (rest.belowFloor) sunk += 1;
      if (rest.remap === null) remapFailures += 1;
      else worstRemap = Math.max(worstRemap, rest.remap);
    }
  }

  const mean = seconds.reduce((a, b) => a + b, 0) / seconds.length;
  const row =
    `d${sides}`.padEnd(8) +
    `${settledTrials}/${TRIALS}`.padEnd(10) +
    `${mean.toFixed(2)} / ${percentile(seconds, 0.95).toFixed(2)} / ${Math.max(...seconds).toFixed(2)}`.padEnd(
      26,
    ) +
    `${percentile(distances, 0.95).toFixed(0)} / ${Math.max(...distances).toFixed(0)}`.padEnd(23) +
    worstFlatness.toFixed(3).padEnd(15) +
    (remapFailures ? `${remapFailures} FAILED` : `${worstRemap.toFixed(4)}°`).padEnd(12) +
    // Position and quaternion per die per step, as float64.
    `${((steps * DICE * 7 * 8) / 1024).toFixed(0)} kB`.padEnd(13) +
    `${((performance.now() - wallStart) / TRIALS).toFixed(0)} ms`;
  console.log(row);
  summary.push({ sides, settledTrials, mean, sunk, worstFlatness, remapFailures });
}

const sunkTotal = summary.reduce((a, s) => a + s.sunk, 0);
console.log(
  `\n${sunkTotal === 0 ? "No die passed through the floor." : `${sunkTotal} dice passed through the floor.`}`,
);
const remapTotal = summary.reduce((a, s) => a + s.remapFailures, 0);
console.log(
  remapTotal === 0
    ? "Every resting pose could be remapped onto every face of its die (ADR-0018)."
    : `${remapTotal} resting poses had no symmetry remap. Expected with --hull=glb: a bevelled model is hundreds of facets, not a solid with faces, and only the idealised solid has the symmetry the remap needs. Collide the solid; draw the model (ADR-0018).`,
);
console.log(
  "\nFlatness is the up-face normal's Y at rest: 1.000 is dead flat. A d4 reads 0.333 by",
);
console.log(
  "construction — a tetrahedron rests on a face with a vertex up, so no face is on top at",
);
console.log("all, which is why the renderer views an all-d4 roll from a lower angle.");
