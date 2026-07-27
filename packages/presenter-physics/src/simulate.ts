import type { ShapedDieSides, Vec3 } from "@diceforge-sdk/renderer-web";
import { dieGeometry } from "@diceforge-sdk/renderer-web";
import type { GSSolver } from "cannon-es";
import {
  Body,
  ContactMaterial,
  ConvexPolyhedron,
  Vec3 as CVec3,
  Material,
  Plane,
  World,
} from "cannon-es";
import type { QuaternionTuple } from "./symmetry.js";
import { faceNormals, symmetryTable, upwardFace } from "./symmetry.js";

/** One die to roll: its shape, and the face the engine already resolved. */
export type PhysicsDieRequest = {
  readonly shape: ShapedDieSides;
  /** The recorded face, 1..shape. This is what must be showing at the end. */
  readonly face: number;
};

/** A die's pose at one instant, in the caller's units. */
export type PhysicsFrame = {
  readonly position: readonly [number, number, number];
  readonly orientation: QuaternionTuple;
};

export type PhysicsDie = {
  readonly shape: ShapedDieSides;
  readonly face: number;
  /**
   * Rotation to apply to the die's mesh *inside* its collider, so the recorded
   * face lands where the simulation put whichever face came up (ADR-0018).
   * Apply it once, before the first frame is drawn.
   */
  readonly remap: QuaternionTuple;
  readonly frames: readonly PhysicsFrame[];
  /**
   * How squarely the die finished: 1 is flat on a face, less means it came to
   * rest leaning on a wall or a neighbour, where the face is harder to read.
   */
  readonly seated: number;
};

/** A rectangle on the table: where it sits, and how far it reaches. */
export type PhysicsBounds = {
  /** Centre on the table, as [x, z]. */
  readonly center: readonly [number, number];
  readonly halfWidth: number;
  readonly halfDepth: number;
};

/** The walls the roll happened inside, centred on the origin. */
export type PhysicsTray = {
  /** Half-extent along x, in the caller's units. */
  readonly halfWidth: number;
  /** Half-extent along z. */
  readonly halfDepth: number;
};

export type PhysicsRoll = {
  readonly dice: readonly PhysicsDie[];
  /** Frames per second the trajectory was recorded at. */
  readonly frameRate: number;
  readonly duration: number;
  /** What the dice were confined to. */
  readonly tray: PhysicsTray;
  /**
   * Where the dice actually came to rest, as a centre and half-extents.
   *
   * Framing this rather than the whole tray is what keeps the dice legible: a
   * tray big enough to settle a roll cleanly is far bigger than the dice need,
   * so a camera fitted to the walls leaves them looking distant. Dice fly in
   * from outside this box on the way down, which reads as a throw.
   */
  readonly resting: PhysicsBounds;
  /** False when the roll was still moving when recording stopped. */
  readonly settled: boolean;
};

export type SimulateOptions = {
  /**
   * Circumradius of a die in the caller's units; every distance out of the
   * simulation is scaled to match. Defaults to 1.
   */
  readonly dieRadius?: number;
  /**
   * The tray's shorter half-extent, in the caller's units. Defaults to a size
   * measured to settle reliably for the number of dice: `dieWidth × (5 + 0.8√n)`.
   */
  readonly trayRadius?: number;
  /**
   * Width over depth. A tray shaped like the viewport fills the frame; a square
   * one on a wide canvas leaves most of the width empty and the dice looking
   * distant. The shorter side keeps the measured size, so a roll always has at
   * least the room it was tuned for. Defaults to 1.
   */
  readonly trayAspect?: number;
  /** Uniform random source in [0, 1). Defaults to `Math.random`. */
  readonly random?: () => number;
  /** Recording rate. Defaults to 60. */
  readonly frameRate?: number;
  /** Longest roll to record, in seconds. Defaults to 8. */
  readonly maxDuration?: number;
};

/**
 * Simulated at roughly the size of a real die, under real gravity. A 2-unit die
 * at 9.82 m/s² tumbles like a boulder; the small scale is what makes the motion
 * read as dice. Results are scaled to the caller's units on the way out.
 */
const DIE_RADIUS_M = 0.008;
const GRAVITY = -9.82;
const STEP = 1 / 120;
/**
 * Cannon's default of 10 leaves a dodecahedron in a permanent limit cycle:
 * dead flat, then kicked into a spin, repeating for as long as you watch.
 * Sixteen is the measured threshold. `solver.tolerance` is left at its default
 * — loosening it stops every shape settling.
 */
const SOLVER_ITERATIONS = 20;
const SLEEP_SPEED = 0.02;
const SLEEP_TIME = 0.15;

/**
 * Measured: a tray of about `dieWidth × (5 + 0.8√n)` settles every trial in
 * roughly a second with 96-100% of dice resting square on a face.
 *
 * The floor of five is what a *single* die needs — the case the harness never
 * tried, since it swept five dice and up. At four die-widths one die rattles
 * between the walls and finishes leaning about a fifth of the time; at seven it
 * has room to bounce for a second before it stops. Five is the sweet spot at
 * every count from one to ten.
 */
function defaultTrayRadius(dieRadius: number, count: number): number {
  return dieRadius * 2 * (5 + 0.8 * Math.sqrt(count));
}

function collider(shape: ShapedDieSides): ConvexPolyhedron {
  const data = dieGeometry(shape);
  const scale = DIE_RADIUS_M / Math.max(...data.vertices.map((v) => Math.hypot(v[0], v[1], v[2])));
  const vertices = data.vertices.map((v) => new CVec3(v[0] * scale, v[1] * scale, v[2] * scale));
  const faces = data.faces.map((face) => {
    const [a, b, c] = face as [number, number, number];
    const normal = (vertices[b] as CVec3)
      .vsub(vertices[a] as CVec3)
      .cross((vertices[c] as CVec3).vsub(vertices[a] as CVec3));
    const centre = face
      .reduce((sum, index) => sum.vadd(vertices[index] as CVec3), new CVec3())
      .scale(1 / face.length);
    // cannon derives normals from winding; an inward face makes the hull
    // non-convex as far as the solver is concerned, and the die sinks.
    return normal.dot(centre) >= 0 ? [...face] : [...face].reverse();
  });
  return new ConvexPolyhedron({ vertices, faces });
}

/**
 * Rolls dice and records where they went — without deciding anything.
 *
 * The outcome arrived already resolved; this only produces motion that ends
 * with each recorded face on top. It simulates ahead of time and hands back the
 * whole trajectory, so playback is ordinary animation: no physics runs while
 * the roll is on screen, nothing is corrected mid-air, and reduced motion is a
 * matter of jumping to the last frame.
 *
 * Cost is a few milliseconds — 4 ms for one die, 44 ms for forty — so this can
 * run inside the frame that starts the roll.
 */
export function simulateRoll(
  request: readonly PhysicsDieRequest[],
  options: SimulateOptions = {},
): PhysicsRoll {
  const dieRadius = options.dieRadius ?? 1;
  const frameRate = options.frameRate ?? 60;
  const random = options.random ?? Math.random;
  const trayRadius = options.trayRadius ?? defaultTrayRadius(dieRadius, request.length);
  const aspect = options.trayAspect && options.trayAspect > 0 ? options.trayAspect : 1;
  const tray: PhysicsTray = {
    halfWidth: trayRadius * Math.max(aspect, 1),
    halfDepth: trayRadius * Math.max(1 / aspect, 1),
  };
  const maxSteps = Math.round((options.maxDuration ?? 8) / STEP);
  const stepsPerFrame = Math.max(1, Math.round(1 / (frameRate * STEP)));
  // Everything below runs in metres; this converts back at the end.
  const toCaller = dieRadius / DIE_RADIUS_M;
  const halfWidthM = tray.halfWidth / toCaller;
  const halfDepthM = tray.halfDepth / toCaller;

  const world = new World({ gravity: new CVec3(0, GRAVITY, 0) });
  world.allowSleep = true;
  // World.solver is typed as the abstract Solver; the default is a GSSolver,
  // which is the one with iterations to raise.
  (world.solver as GSSolver).iterations = SOLVER_ITERATIONS;
  const dieMaterial = new Material("die");
  const surface = new Material("surface");
  world.addContactMaterial(
    new ContactMaterial(dieMaterial, surface, { friction: 0.4, restitution: 0.25 }),
  );
  world.addContactMaterial(
    new ContactMaterial(dieMaterial, dieMaterial, { friction: 0.2, restitution: 0.3 }),
  );

  const floor = new Body({ mass: 0, shape: new Plane(), material: surface });
  floor.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
  world.addBody(floor);
  // Four walls rather than a ring: a rectangular tray can be shaped to the
  // viewport, and a camera framed on it wastes nothing.
  const walls: readonly [number, number, number][] = [
    [0, halfDepthM, Math.PI],
    [0, -halfDepthM, 0],
    [halfWidthM, 0, -Math.PI / 2],
    [-halfWidthM, 0, Math.PI / 2],
  ];
  for (const [x, z, yaw] of walls) {
    const wall = new Body({ mass: 0, shape: new Plane(), material: surface });
    wall.quaternion.setFromEuler(0, yaw, 0);
    wall.position.set(x, 0, z);
    world.addBody(wall);
  }

  const spread = (magnitude: number) => (random() * 2 - 1) * magnitude;
  const throwX = Math.max(halfWidthM * 0.35, DIE_RADIUS_M * 2);
  const throwZ = Math.max(halfDepthM * 0.35, DIE_RADIUS_M * 2);
  const bodies = request.map((die, index) => {
    const body = new Body({
      mass: 0.004,
      shape: collider(die.shape),
      material: dieMaterial,
      // A real die bleeds energy into the felt; without damping a spinning one
      // outlasts anyone's patience.
      linearDamping: 0.06,
      angularDamping: 0.12,
      allowSleep: true,
      sleepSpeedLimit: SLEEP_SPEED,
      sleepTimeLimit: SLEEP_TIME,
    });
    body.position.set(spread(throwX), DIE_RADIUS_M * 11 + index * DIE_RADIUS_M * 4, spread(throwZ));
    body.velocity.set(spread(0.6), -0.4, spread(0.6));
    body.angularVelocity.set(spread(28), spread(28), spread(28));
    body.quaternion.setFromEuler(spread(Math.PI), spread(Math.PI), spread(Math.PI));
    world.addBody(body);
    return body;
  });

  const frames: PhysicsFrame[][] = request.map(() => []);
  const record = () => {
    bodies.forEach((body, index) => {
      (frames[index] as PhysicsFrame[]).push({
        position: [
          body.position.x * toCaller,
          body.position.y * toCaller,
          body.position.z * toCaller,
        ],
        orientation: [body.quaternion.x, body.quaternion.y, body.quaternion.z, body.quaternion.w],
      });
    });
  };

  record();
  let steps = 0;
  let settled = false;
  while (steps < maxSteps) {
    world.step(STEP);
    steps += 1;
    if (steps % stepsPerFrame === 0) record();
    if (bodies.every((body) => body.sleepState === Body.SLEEPING)) {
      settled = true;
      break;
    }
  }
  if (steps % stepsPerFrame !== 0) record();

  const dice: PhysicsDie[] = request.map((die, index) => {
    const normals = faceNormals(dieGeometry(die.shape));
    const body = bodies[index] as Body;
    const orientation: QuaternionTuple = [
      body.quaternion.x,
      body.quaternion.y,
      body.quaternion.z,
      body.quaternion.w,
    ];
    const landed = upwardFace(normals, orientation);
    const table = symmetryTable(die.shape);
    // Face values are one-based; the table is not.
    const remap = (table[landed] as QuaternionTuple[])[die.face - 1] as QuaternionTuple;
    const seated = normals.reduce(
      (best, normal) => Math.max(best, -rotateY(normal, orientation)),
      -1,
    );
    return {
      shape: die.shape,
      face: die.face,
      remap,
      frames: frames[index] as PhysicsFrame[],
      seated,
    };
  });

  const span = (axis: 0 | 2): { centre: number; half: number } => {
    const values = dice.map((die) => die.frames[die.frames.length - 1]?.position[axis] ?? 0);
    const low = Math.min(...values);
    const high = Math.max(...values);
    return { centre: (low + high) / 2, half: (high - low) / 2 + dieRadius };
  };
  const x = span(0);
  const z = span(2);

  return {
    dice,
    frameRate,
    duration: steps * STEP,
    tray,
    resting: {
      center: [x.centre, z.centre],
      halfWidth: x.half,
      halfDepth: z.half,
    },
    settled,
  };
}

/** The Y component of a rotated vector, which is all the seating test needs. */
function rotateY(v: Vec3, q: QuaternionTuple): number {
  const [x, y, z] = v;
  const [qx, qy, qz, qw] = q;
  const ix = qw * x + qy * z - qz * y;
  const iy = qw * y + qz * x - qx * z;
  const iz = qw * z + qx * y - qy * x;
  const iw = -qx * x - qy * y - qz * z;
  return iy * qw + iw * -qy + iz * -qx - ix * -qz;
}
