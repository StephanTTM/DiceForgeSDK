import { FORGE_FACE_ROTATIONS } from "@diceforge-sdk/renderer-web";
import { describe, expect, it } from "vitest";
import { simulateCoinFlip, simulateRoll } from "./simulate.js";
import { faceDirections } from "./solid.js";
import type { QuaternionTuple } from "./symmetry.js";
import { multiply, rotate } from "./symmetry.js";

/**
 * The fallback pose: what `simulateRoll` returns when all six throws were
 * rejected (ADR-0019's retry loop). It used to hand back whichever attempt
 * seated best, which could still be a die propped on an edge — and there the
 * recorded face is highest by less than the calibrated table's own precision,
 * so anything measuring "which face is up" is deciding a coin flip. That
 * produced a one-in-three-hundred CI flake in the release smoke test.
 *
 * The tray here is far too small for the dice in it, which is how the fallback
 * is reached on purpose instead of by soaking for the tail.
 */

const CRAMPED = { dieRadius: 1.05, trayRadius: 1.45, maxDuration: 2.5 } as const;
const SHAPES = [4, 6, 8, 10, 12, 20] as const;

/** A cheap reproducible source; the fallback is about poses, not draws. */
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

/** How much higher the highest face sits than its nearest rival. */
function upwardMargin(normals: readonly [number, number, number][], pose: QuaternionTuple): number {
  const heights = normals.map((normal) => rotate(normal, pose)[1]).sort((a, b) => b - a);
  return (heights[0] as number) - (heights[1] as number);
}

describe("the six-times-rejected fallback", () => {
  it("lands every die flat, however cramped the tray", { timeout: 120_000 }, () => {
    for (const shape of SHAPES) {
      const faceRotations = FORGE_FACE_ROTATIONS[shape] as readonly QuaternionTuple[];
      for (let trial = 0; trial < 6; trial++) {
        const face = (trial % shape) + 1;
        const roll = simulateRoll(
          Array.from({ length: 3 }, () => ({ shape, face, faceRotations })),
          { ...CRAMPED, random: seeded(shape * 100 + trial) },
        );
        for (const die of roll.dice) {
          // Every die is seated, whether it settled there or was laid down.
          expect(die.seated, `d${shape} trial ${trial}`).toBeGreaterThanOrEqual(0.9995);
        }
      }
    }
  });

  /**
   * The defect itself. A margin under the calibrated table's ~1e-5 precision
   * is a pose where an independent observer — the smoke test, a conformance
   * check, a player — can read the neighbouring face.
   */
  it("leaves no die resting between two faces", { timeout: 120_000 }, () => {
    let worst = Number.POSITIVE_INFINITY;
    for (const shape of SHAPES) {
      const faceRotations = FORGE_FACE_ROTATIONS[shape] as readonly QuaternionTuple[];
      const normals = faceDirections(faceRotations) as [number, number, number][];
      for (let trial = 0; trial < 6; trial++) {
        const face = (trial % shape) + 1;
        const roll = simulateRoll(
          Array.from({ length: 3 }, () => ({ shape, face, faceRotations })),
          { ...CRAMPED, random: seeded(shape * 100 + trial) },
        );
        for (const die of roll.dice) {
          const last = die.frames[die.frames.length - 1];
          if (!last) throw new Error("a recording with no frames");
          // A d4 is a tetrahedron: resting on a face leaves three faces at the
          // same height by symmetry, so it has no meaningful upward margin to
          // measure. Its reading is a separate question (TASKS).
          if (shape === 4) continue;
          worst = Math.min(worst, upwardMargin(normals, last.orientation));
        }
      }
    }
    // Before the fix this measured 7.6e-6 — below the calibrated table's own
    // 1e-6 precision. After it, the worst case measures 0.238; the bar sits
    // far above the table's precision and far below what was measured, so it
    // fails on a regression rather than on physics having a slow day.
    expect(worst).toBeGreaterThan(0.05);
  });

  it("still shows the recorded numeral after being laid down", { timeout: 120_000 }, () => {
    for (const shape of SHAPES) {
      const faceRotations = FORGE_FACE_ROTATIONS[shape] as readonly QuaternionTuple[];
      const normals = faceDirections(faceRotations) as [number, number, number][];
      for (let trial = 0; trial < 4; trial++) {
        const face = (trial % shape) + 1;
        const roll = simulateRoll([{ shape, face, faceRotations }], {
          ...CRAMPED,
          random: seeded(shape * 7 + trial),
        });
        const die = roll.dice[0];
        if (!die) throw new Error("no die");
        const last = die.frames[die.frames.length - 1];
        if (!last) throw new Error("no frames");
        // What the player sees: the recording's pose with the mesh's remap.
        const drawn = multiply(last.orientation, die.remap);
        const heights = normals.map((normal) => rotate(normal, drawn)[1]);
        const shown = heights.indexOf(Math.max(...heights)) + 1;
        expect(shown, `d${shape} face ${face}`).toBe(face);
      }
    }
  });

  it("never leaves the coin on its rim", { timeout: 60_000 }, () => {
    const rotations = [
      [0, 0, 0, 1],
      [1, 0, 0, 0],
    ] as [QuaternionTuple, QuaternionTuple];
    for (const outcome of ["heads", "tails"] as const) {
      for (let trial = 0; trial < 4; trial++) {
        const flip = simulateCoinFlip(
          { outcome, rotations, radius: 1.0346, thickness: 0.231 },
          { dieRadius: 1.05, trayRadius: 1.2, maxDuration: 2, random: seeded(trial + 1) },
        );
        expect(flip.coin.seated, `${outcome} trial ${trial}`).toBeGreaterThanOrEqual(0.9995);
      }
    }
  });

  /**
   * The settle is authored motion, so it must not teleport: the die is already
   * nearly where it ends up, and the correction eases in over the last frames.
   */
  it("eases the correction in rather than snapping on the last frame", { timeout: 60_000 }, () => {
    const faceRotations = FORGE_FACE_ROTATIONS[20] as readonly QuaternionTuple[];
    const roll = simulateRoll(
      Array.from({ length: 3 }, () => ({ shape: 20 as const, face: 7, faceRotations })),
      { ...CRAMPED, random: seeded(4242) },
    );
    for (const die of roll.dice) {
      const frames = die.frames;
      let biggest = 0;
      for (let index = 1; index < frames.length; index++) {
        const a = frames[index - 1]?.orientation as QuaternionTuple;
        const b = frames[index]?.orientation as QuaternionTuple;
        // Angle between consecutive poses, via the quaternion dot product.
        const dot = Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]);
        biggest = Math.max(biggest, 2 * Math.acos(Math.min(1, dot)));
      }
      // A tumbling die turns plenty between frames; what must not appear is a
      // discontinuity at the very end, so the last step is the one measured.
      const last = frames[frames.length - 1]?.orientation as QuaternionTuple;
      const previous = frames[frames.length - 2]?.orientation as QuaternionTuple;
      const dot = Math.abs(
        last[0] * previous[0] +
          last[1] * previous[1] +
          last[2] * previous[2] +
          last[3] * previous[3],
      );
      const finalStep = 2 * Math.acos(Math.min(1, dot));
      expect(finalStep).toBeLessThanOrEqual(biggest);
      // And in absolute terms it is a settle, not a flip: under ten degrees.
      expect(finalStep).toBeLessThan(Math.PI / 18);
    }
  });
});
