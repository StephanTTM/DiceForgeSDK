import { createDiceEngine, createSeededRandomSource } from "@diceforge-sdk/core";
import type { ShapedDieSides, Vec3 } from "@diceforge-sdk/renderer-web";
import { FORGE_COIN_ROTATIONS, FORGE_FACE_ROTATIONS } from "@diceforge-sdk/renderer-web";
import { describe, expect, it } from "vitest";
import type { PhysicsDie, QuaternionTuple } from "./index.js";
import {
  faceDirections,
  faceNormals,
  multiply,
  rotate,
  simulateCoinFlip,
  simulateRoll,
  solidFromFaceDirections,
  symmetryTable,
} from "./index.js";

const SHAPES: readonly ShapedDieSides[] = [4, 6, 8, 10, 12, 20];

/** A repeatable throw, so a failure can be reproduced exactly. */
function seededRandom(seed: string): () => number {
  const source = createSeededRandomSource(seed);
  return () => source.nextUint32() / 0x100000000;
}

/**
 * Where each printed numeral sits on the model, taken from the calibrated table
 * that positions them — `faceRotations[v - 1]` brings numeral `v` to the top, so
 * its inverse says where that numeral rests.
 *
 * This, not the collider's geometry, is what the player reads. An earlier
 * version of these tests measured `dieGeometry`'s face order instead and passed
 * while every shipped die showed the wrong number (ADR-0019).
 */
function printedFaceDirections(shape: ShapedDieSides): Vec3[] {
  const table = FORGE_FACE_ROTATIONS[shape];
  if (!table) throw new Error(`no calibrated rotations for d${shape}`);
  return table.map((q) => {
    const inverse: QuaternionTuple = [-q[0], -q[1], -q[2], q[3]];
    return rotate([0, 1, 0], inverse);
  });
}

/** A request carrying the calibrated table the simulation now requires. */
function request(shape: ShapedDieSides, face: number) {
  return { shape, face, faceRotations: FORGE_FACE_ROTATIONS[shape] as readonly QuaternionTuple[] };
}

/** The numeral actually facing up once the die has landed and been remapped. */
function shownNumeral(die: PhysicsDie): number {
  const drawn = remapped(die);
  const heights = printedFaceDirections(die.shape).map((dir) => rotate(dir, drawn)[1]);
  return heights.indexOf(Math.max(...heights)) + 1;
}

/** How square to the camera the shown numeral sits, as its height in [0, 1]. */
function shownHeight(die: PhysicsDie): number {
  const drawn = remapped(die);
  return Math.max(...printedFaceDirections(die.shape).map((dir) => rotate(dir, drawn)[1]));
}

/** The die's final orientation with its mesh remap folded in. */
function remapped(die: PhysicsDie) {
  const last = die.frames[die.frames.length - 1];
  if (!last) throw new Error("no frames recorded");
  return multiply(last.orientation, die.remap);
}

describe("simulateRoll", () => {
  it("shows the recorded numeral, for every face of every shape", () => {
    for (const shape of SHAPES) {
      for (let face = 1; face <= shape; face++) {
        const roll = simulateRoll([request(shape, face)], {
          random: seededRandom(`d${shape}-${face}`),
        });
        const die = roll.dice[0] as PhysicsDie;
        expect(roll.settled, `d${shape} face ${face} never settled`).toBe(true);
        expect(shownNumeral(die), `d${shape} recorded ${face}`).toBe(face);
      }
    }
  });

  /**
   * The numeral must not merely be the highest — it must be lying flat enough
   * to read. A model seated crooked on its collider still "wins" the height
   * comparison while visibly resting on an edge, which is how the shipped d10,
   * d12 and d20 came to sit up to 41 degrees off (ADR-0019).
   */
  it("lays the shown numeral flat, not merely highest", () => {
    for (const shape of SHAPES) {
      for (let face = 1; face <= shape; face++) {
        const roll = simulateRoll([request(shape, face)], {
          random: seededRandom(`flat-d${shape}-${face}`),
        });
        const die = roll.dice[0] as PhysicsDie;
        const tilt = (Math.acos(Math.min(1, shownHeight(die))) * 180) / Math.PI;
        // A tetrahedron reads off the face resting on the table, so its numeral
        // sits at the solid's own 70.5 degrees rather than pointing up.
        const allowed = shape === 4 ? 71.5 : 3;
        expect(tilt, `d${shape} face ${face} tilted ${tilt.toFixed(1)}deg`).toBeLessThan(allowed);
      }
    }
  });

  it("rolls every die of a whole roll onto its recorded numeral", () => {
    const engine = createDiceEngine({ random: createSeededRandomSource("table-42") });
    const record = engine.roll("4d6+2d20");
    const dice = record.groups.flatMap((group) =>
      group.dice.map((die) => request(die.sides as ShapedDieSides, die.value)),
    );
    const roll = simulateRoll(dice, { random: seededRandom("whole-roll") });

    expect(roll.dice).toHaveLength(6);
    roll.dice.forEach((die, index) => {
      expect(shownNumeral(die), `die ${index}`).toBe(die.face);
    });
  });

  it("keeps every die inside the tray, so a camera on it never moves", () => {
    const roll = simulateRoll(
      Array.from({ length: 10 }, () => request(20, 7)),
      { random: seededRandom("tray"), dieRadius: 1 },
    );
    for (const die of roll.dice) {
      for (const frame of die.frames) {
        // A die's centre can approach a wall to within its own radius.
        expect(Math.abs(frame.position[0])).toBeLessThanOrEqual(roll.tray.halfWidth + 1.001);
        expect(Math.abs(frame.position[2])).toBeLessThanOrEqual(roll.tray.halfDepth + 1.001);
      }
    }
  });

  it("scales its output to the caller's units", () => {
    const spec = [request(20, 1)];
    const small = simulateRoll(spec, { random: seededRandom("scale"), dieRadius: 1 });
    const large = simulateRoll(spec, { random: seededRandom("scale"), dieRadius: 10 });

    expect(large.tray.halfWidth).toBeCloseTo(small.tray.halfWidth * 10, 6);
    const smallLast = small.dice[0]?.frames.at(-1);
    const largeLast = large.dice[0]?.frames.at(-1);
    expect(largeLast?.position[1]).toBeCloseTo((smallLast?.position[1] ?? 0) * 10, 6);
    // Orientation is unitless, so the same throw lands the same way at any size.
    expect(largeLast?.orientation).toEqual(smallLast?.orientation);
  });

  it("records a trajectory that starts in the air and ends at rest", () => {
    const roll = simulateRoll([request(6, 4)], { random: seededRandom("arc") });
    const die = roll.dice[0] as PhysicsDie;
    const first = die.frames[0];
    const last = die.frames.at(-1);

    expect(die.frames.length).toBeGreaterThan(10);
    expect(first?.position[1]).toBeGreaterThan((last?.position[1] ?? 0) + 1);
    expect(roll.duration).toBeCloseTo((die.frames.length - 1) / roll.frameRate, 1);
  });

  it("takes the same throw to the same place, so a failure reproduces", () => {
    const spec = [request(12, 9)];
    const a = simulateRoll(spec, { random: seededRandom("repeat") });
    const b = simulateRoll(spec, { random: seededRandom("repeat") });
    expect(b.dice[0]?.frames.at(-1)).toEqual(a.dice[0]?.frames.at(-1));
  });

  /**
   * Seating is a population property, not a promise about one throw: a tray
   * means a die can finish leaning on a wall or a neighbour. Such a die still
   * carries an exact recorded face — the tests above hold regardless — it is
   * only harder to read, which is what this number is for.
   */
  it("reports how squarely each die came to rest, and mostly lands them flat", () => {
    const seatings = Array.from({ length: 25 }, (_, trial) => {
      const roll = simulateRoll([request(20, 11)], {
        random: seededRandom(`seated-${trial}`),
      });
      return roll.dice[0]?.seated ?? 0;
    });
    const flat = seatings.filter((seated) => seated > 0.99).length;

    expect(Math.min(...seatings)).toBeGreaterThan(0.7);
    expect(flat / seatings.length).toBeGreaterThan(0.8);
  });
});

describe("recorded impacts", () => {
  it("records when and how hard each die struck what, in time order", () => {
    const roll = simulateRoll([request(6, 3), request(6, 5)], {
      random: seededRandom("impacts"),
    });
    expect(roll.impacts.length).toBeGreaterThan(0);
    let previous = 0;
    for (const hit of roll.impacts) {
      expect(hit.time).toBeGreaterThanOrEqual(previous);
      expect(hit.time).toBeLessThanOrEqual(roll.duration + 1 / 60);
      expect(hit.speed).toBeGreaterThanOrEqual(0);
      expect([0, 1]).toContain(hit.body);
      expect(["felt", "wall", "die"]).toContain(hit.against);
      previous = hit.time;
    }
    // A throw that lands has, at minimum, hit the felt.
    expect(roll.impacts.some((hit) => hit.against === "felt")).toBe(true);
  });

  it("records the same impacts for the same throw", () => {
    const a = simulateRoll([request(20, 7)], { random: seededRandom("impact-repeat") });
    const b = simulateRoll([request(20, 7)], { random: seededRandom("impact-repeat") });
    expect(b.impacts).toEqual(a.impacts);
  });

  it("records a coin flip's impacts too", () => {
    const flip = simulateCoinFlip(
      { outcome: "heads", rotations: FORGE_COIN_ROTATIONS, radius: 1.0346, thickness: 0.231 },
      { dieRadius: 1.05, random: seededRandom("coin-impacts") },
    );
    expect(flip.impacts.length).toBeGreaterThan(0);
    expect(flip.impacts.every((hit) => hit.body === 0)).toBe(true);
  });
});

describe("simulateCoinFlip", () => {
  /** The shipped coin's proportions, measured from the model (ADR addendum in TASKS). */
  function flip(outcome: "heads" | "tails", seed: string) {
    return simulateCoinFlip(
      { outcome, rotations: FORGE_COIN_ROTATIONS, radius: 1.0346, thickness: 0.231 },
      { dieRadius: 1.05, random: seededRandom(seed) },
    );
  }

  /** Which printed face is up once the recorded pose and the remap compose. */
  function shownFace(result: ReturnType<typeof flip>): {
    face: "heads" | "tails";
    height: number;
  } {
    const coin = result.coin;
    const last = coin.frames[coin.frames.length - 1];
    if (!last) throw new Error("no frames");
    const drawn = multiply(last.orientation, coin.remap);
    const heads = FORGE_COIN_ROTATIONS[0];
    const tails = FORGE_COIN_ROTATIONS[1];
    const headsUp = rotate(
      rotate([0, 1, 0], [-heads[0], -heads[1], -heads[2], heads[3]]),
      drawn,
    )[1];
    const tailsUp = rotate(
      rotate([0, 1, 0], [-tails[0], -tails[1], -tails[2], tails[3]]),
      drawn,
    )[1];
    return headsUp > tailsUp
      ? { face: "heads", height: headsUp }
      : { face: "tails", height: tailsUp };
  }

  it("lands flat on the recorded outcome, for both outcomes across seeds", () => {
    for (const outcome of ["heads", "tails"] as const) {
      for (let trial = 0; trial < 5; trial++) {
        const result = flip(outcome, `coin-${outcome}-${trial}`);
        const shown = shownFace(result);
        expect(result.settled, `${outcome} trial ${trial} never settled`).toBe(true);
        expect(shown.face, `${outcome} trial ${trial}`).toBe(outcome);
        // Flat, not merely uppermost: a rim rest would leave the face near 0.
        expect(shown.height, `${outcome} trial ${trial} tilted`).toBeGreaterThan(0.999);
      }
    }
  });

  /**
   * The product owner's report: some flips read as a drop. A flip is at least
   * two turnovers — the face crossing the horizon — and the simulation now
   * guarantees it by construction and retry, so it is asserted, not eyeballed.
   */
  it("turns over at least twice on the way in, never reading as a drop", () => {
    for (const outcome of ["heads", "tails"] as const) {
      for (let trial = 0; trial < 10; trial++) {
        const result = flip(outcome, `turnover-${outcome}-${trial}`);
        expect(
          result.coin.turnovers,
          `${outcome} trial ${trial} turned over ${result.coin.turnovers}x`,
        ).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it("stays inside the tray", () => {
    const result = flip("heads", "coin-walls");
    for (const frame of result.coin.frames) {
      expect(Math.abs(frame.position[0])).toBeLessThanOrEqual(result.tray.halfWidth + 1.1);
      expect(Math.abs(frame.position[2])).toBeLessThanOrEqual(result.tray.halfDepth + 1.1);
    }
  });

  it("shares the dice tray, so the camera never moves between rolls and flips", () => {
    const roll = simulateRoll([request(20, 7)], { random: seededRandom("shared-tray") });
    const result = simulateCoinFlip(
      { outcome: "tails", rotations: FORGE_COIN_ROTATIONS, radius: 1.0346, thickness: 0.231 },
      { random: seededRandom("shared-tray") },
    );
    expect(result.tray).toEqual(roll.tray);
  });

  it("takes the same throw to the same place, so a failure reproduces", () => {
    const a = flip("tails", "coin-repeat");
    const b = flip("tails", "coin-repeat");
    expect(b.coin.frames[b.coin.frames.length - 1]).toEqual(
      a.coin.frames[a.coin.frames.length - 1],
    );
  });
});

describe("the solid a die is", () => {
  /** The collider, built from the model's numerals the way simulateRoll does. */
  function solidOf(shape: ShapedDieSides) {
    const table = FORGE_FACE_ROTATIONS[shape] as readonly QuaternionTuple[];
    return solidFromFaceDirections(faceDirections(table));
  }

  it("has one face per numeral, each a real polygon", () => {
    for (const shape of SHAPES) {
      const data = solidOf(shape);
      expect(data.faces, `d${shape}`).toHaveLength(shape);
      for (const ring of data.faces) expect(ring.length).toBeGreaterThanOrEqual(3);
    }
  });

  /**
   * The collider must be the die that is drawn. `dieGeometry(10)` is not: it
   * builds a trapezohedron whose faces sit at different angles from the shipped
   * d10, so the simulation used to collide a shape nobody could see (ADR-0019).
   */
  it("faces exactly where the model's numerals face", () => {
    for (const shape of SHAPES) {
      const data = solidOf(shape);
      const wanted = faceDirections(FORGE_FACE_ROTATIONS[shape] as readonly QuaternionTuple[]);
      faceNormals(data).forEach((normal, index) => {
        const target = wanted[index] as Vec3;
        const angle =
          (Math.acos(
            Math.min(1, normal[0] * target[0] + normal[1] * target[1] + normal[2] * target[2]),
          ) *
            180) /
          Math.PI;
        expect(angle, `d${shape} face ${index + 1} off by ${angle.toFixed(3)}deg`).toBeLessThan(
          0.01,
        );
      });
    }
  });

  it("is fair: every face plane the same distance from the centre", () => {
    for (const shape of SHAPES) {
      const data = solidOf(shape);
      const dirs = faceDirections(FORGE_FACE_ROTATIONS[shape] as readonly QuaternionTuple[]);
      // Distance to the face *plane*, not to its centroid: a kite's centroid is
      // not the foot of the perpendicular, so the d10 would fail that reading.
      const depths = data.faces.map((ring, i) => {
        const d = dirs[i] as Vec3;
        const corner = data.vertices[ring[0] as number] as Vec3;
        return corner[0] * d[0] + corner[1] * d[1] + corner[2] * d[2];
      });
      // Corner positions carry the error of a 3x3 solve, so this is exact to
      // about a part in a million rather than to the bit.
      expect(Math.max(...depths) - Math.min(...depths), `d${shape}`).toBeLessThan(1e-5);
    }
  });
});

describe("symmetryTable", () => {
  it("carries any face onto any other for every shape", () => {
    for (const shape of SHAPES) {
      const table = FORGE_FACE_ROTATIONS[shape] as readonly QuaternionTuple[];
      const rotations = symmetryTable(solidFromFaceDirections(faceDirections(table)), `d${shape}`);
      expect(rotations).toHaveLength(shape);
      for (const row of rotations) expect(row).toHaveLength(shape);
    }
  });

  it("is the identity when a die already shows the recorded face", () => {
    const faces = FORGE_FACE_ROTATIONS[6] as readonly QuaternionTuple[];
    const table = symmetryTable(solidFromFaceDirections(faceDirections(faces)), "d6");
    for (let face = 0; face < 6; face++) {
      const row = table[face] as QuaternionTuple[];
      const [x, y, z, w] = row[face] as QuaternionTuple;
      expect(Math.hypot(x, y, z), `face ${face + 1}`).toBeLessThan(1e-6);
      expect(Math.abs(w)).toBeCloseTo(1, 6);
    }
  });
});
