import { createDiceEngine, createSeededRandomSource } from "@diceforge-sdk/core";
import type { ShapedDieSides, Vec3 } from "@diceforge-sdk/renderer-web";
import { dieGeometry } from "@diceforge-sdk/renderer-web";
import { describe, expect, it } from "vitest";
import type { PhysicsDie, QuaternionTuple } from "./index.js";
import { multiply, rotate, simulateRoll, symmetryTable } from "./index.js";

const SHAPES: readonly ShapedDieSides[] = [4, 6, 8, 10, 12, 20];

/** A repeatable throw, so a failure can be reproduced exactly. */
function seededRandom(seed: string): () => number {
  const source = createSeededRandomSource(seed);
  return () => source.nextUint32() / 0x100000000;
}

function faceNormalsOf(shape: ShapedDieSides): Vec3[] {
  const data = dieGeometry(shape);
  return data.faces.map((ring) => {
    const centre = ring.reduce<Vec3>(
      (acc, index) => {
        const v = data.vertices[index] as Vec3;
        return [acc[0] + v[0], acc[1] + v[1], acc[2] + v[2]];
      },
      [0, 0, 0],
    );
    const length = Math.hypot(...centre);
    return [centre[0] / length, centre[1] / length, centre[2] / length];
  });
}

/**
 * Where the recorded face ends up once the die has come to rest and its mesh
 * has been remapped — the whole point of the package, measured the way a
 * renderer would apply it.
 */
function recordedFaceDirection(die: PhysicsDie): Vec3 {
  const normals = faceNormalsOf(die.shape);
  return rotate(normals[die.face - 1] as Vec3, remapped(die));
}

/** How high one of a die's faces sits once the remap has been applied. */
function recordedFaceHeights(die: PhysicsDie, normal: Vec3): number {
  return rotate(normal, remapped(die))[1];
}

/** The die's final orientation with its mesh remap folded in. */
function remapped(die: PhysicsDie) {
  const last = die.frames[die.frames.length - 1];
  if (!last) throw new Error("no frames recorded");
  return multiply(last.orientation, die.remap);
}

describe("simulateRoll", () => {
  it("finishes with the recorded face uppermost, for every shape", () => {
    for (const shape of SHAPES) {
      for (const face of [1, Math.ceil(shape / 2), shape]) {
        const roll = simulateRoll([{ shape, face }], { random: seededRandom(`d${shape}-${face}`) });
        const die = roll.dice[0] as PhysicsDie;
        const up = recordedFaceDirection(die)[1];

        expect(roll.settled, `d${shape} face ${face} never settled`).toBe(true);
        // A die resting on a face has that face's opposite pointing straight
        // up on most solids; a tetrahedron rests with a vertex up, so its
        // faces sit at about 70 degrees. What matters is that the recorded
        // face is the highest one, which the next assertion pins exactly.
        expect(up, `d${shape} face ${face} is not the top face`).toBeGreaterThan(
          shape === 4 ? 0.3 : 0.9,
        );
      }
    }
  });

  it("puts the recorded face higher than every other face", () => {
    for (const shape of SHAPES) {
      const face = Math.min(3, shape);
      const roll = simulateRoll([{ shape, face }], { random: seededRandom(`highest-${shape}`) });
      const die = roll.dice[0] as PhysicsDie;
      const heights = faceNormalsOf(shape).map((normal) => recordedFaceHeights(die, normal));
      const highest = heights.indexOf(Math.max(...heights));
      expect(highest + 1, `d${shape} showed face ${highest + 1} instead of ${face}`).toBe(face);
    }
  });

  it("rolls every die of a whole roll onto its recorded face", () => {
    const engine = createDiceEngine({ random: createSeededRandomSource("table-42") });
    const record = engine.roll("4d6+2d20");
    const request = record.groups.flatMap((group) =>
      group.dice.map((die) => ({ shape: die.sides as ShapedDieSides, face: die.value })),
    );
    const roll = simulateRoll(request, { random: seededRandom("whole-roll") });

    expect(roll.dice).toHaveLength(6);
    roll.dice.forEach((die, index) => {
      const heights = faceNormalsOf(die.shape).map((normal) => recordedFaceHeights(die, normal));
      expect(heights.indexOf(Math.max(...heights)) + 1, `die ${index}`).toBe(die.face);
    });
  });

  it("keeps every die inside the tray, so a camera on it never moves", () => {
    const roll = simulateRoll(
      Array.from({ length: 10 }, () => ({ shape: 20 as ShapedDieSides, face: 7 })),
      { random: seededRandom("tray"), dieRadius: 1 },
    );
    for (const die of roll.dice) {
      for (const frame of die.frames) {
        const distance = Math.hypot(frame.position[0], frame.position[2]);
        // A die's centre can approach the wall to within its own radius.
        expect(distance).toBeLessThanOrEqual(roll.trayRadius + 1.001);
      }
    }
  });

  it("scales its output to the caller's units", () => {
    const request = [{ shape: 20 as ShapedDieSides, face: 1 }];
    const small = simulateRoll(request, { random: seededRandom("scale"), dieRadius: 1 });
    const large = simulateRoll(request, { random: seededRandom("scale"), dieRadius: 10 });

    expect(large.trayRadius).toBeCloseTo(small.trayRadius * 10, 6);
    const smallLast = small.dice[0]?.frames.at(-1);
    const largeLast = large.dice[0]?.frames.at(-1);
    expect(largeLast?.position[1]).toBeCloseTo((smallLast?.position[1] ?? 0) * 10, 6);
    // Orientation is unitless, so the same throw lands the same way at any size.
    expect(largeLast?.orientation).toEqual(smallLast?.orientation);
  });

  it("records a trajectory that starts in the air and ends at rest", () => {
    const roll = simulateRoll([{ shape: 6, face: 4 }], { random: seededRandom("arc") });
    const die = roll.dice[0] as PhysicsDie;
    const first = die.frames[0];
    const last = die.frames.at(-1);

    expect(die.frames.length).toBeGreaterThan(10);
    expect(first?.position[1]).toBeGreaterThan((last?.position[1] ?? 0) + 1);
    expect(roll.duration).toBeCloseTo((die.frames.length - 1) / roll.frameRate, 1);
  });

  it("takes the same throw to the same place, so a failure reproduces", () => {
    const request = [{ shape: 12 as ShapedDieSides, face: 9 }];
    const a = simulateRoll(request, { random: seededRandom("repeat") });
    const b = simulateRoll(request, { random: seededRandom("repeat") });
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
      const roll = simulateRoll([{ shape: 20, face: 11 }], {
        random: seededRandom(`seated-${trial}`),
      });
      return roll.dice[0]?.seated ?? 0;
    });
    const flat = seatings.filter((seated) => seated > 0.99).length;

    expect(Math.min(...seatings)).toBeGreaterThan(0.7);
    expect(flat / seatings.length).toBeGreaterThan(0.8);
  });
});

describe("symmetryTable", () => {
  it("carries any face onto any other for every shape", () => {
    for (const shape of SHAPES) {
      const table = symmetryTable(shape);
      expect(table).toHaveLength(shape);
      for (const row of table) expect(row).toHaveLength(shape);
    }
  });

  it("is the identity when a die already shows the recorded face", () => {
    const table = symmetryTable(6);
    for (let face = 0; face < 6; face++) {
      const row = table[face] as QuaternionTuple[];
      const [x, y, z, w] = row[face] as QuaternionTuple;
      expect(Math.hypot(x, y, z), `face ${face + 1}`).toBeLessThan(1e-6);
      expect(Math.abs(w)).toBeCloseTo(1, 6);
    }
  });
});
