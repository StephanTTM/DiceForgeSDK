import type { VisualDie } from "@diceforge-sdk/renderer-web";
import { describe, expect, it } from "vitest";
import type { PhysicsFrame } from "./simulate.js";
import type { Recording, StoryRole } from "./story.js";
import { offsetImpacts, planStory, STORY, storyCast, storyPoseAt } from "./story.js";
import type { QuaternionTuple } from "./symmetry.js";
import { multiply } from "./symmetry.js";

const DIE_RADIUS = 1.05;

function role(overrides: Partial<StoryRole>): StoryRole {
  return { faces: [3], thrown: true, exploded: false, bornOf: -1, ...overrides };
}

/** A rotation about an axis, as the tuple convention the recordings use. */
function turned(axis: readonly [number, number, number], angle: number): QuaternionTuple {
  const norm = Math.hypot(axis[0], axis[1], axis[2]);
  const s = Math.sin(angle / 2) / norm;
  return [axis[0] * s, axis[1] * s, axis[2] * s, Math.cos(angle / 2)];
}

function sameRotation(a: QuaternionTuple, b: QuaternionTuple): boolean {
  return Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]) > 1 - 1e-9;
}

/** A recording at 1 fps, so frame indices read directly as seconds. */
function recording(
  frames: readonly PhysicsFrame[],
  remap: QuaternionTuple = [0, 0, 0, 1],
): Recording {
  return { frames, frameRate: 1, remap };
}

function frame(position: readonly [number, number, number], q: QuaternionTuple): PhysicsFrame {
  return { position, orientation: q };
}

describe("storyCast", () => {
  it("reads each stage die's faces and lineage from the visuals", () => {
    const dice = [
      { face: 4, kept: true },
      { face: 6, kept: true, rerolledFaces: [1, 2], exploded: true },
      { face: 3, kept: true, bornOf: 1 },
    ] as unknown as readonly VisualDie[];
    expect(storyCast(dice)).toEqual([
      { faces: [4], thrown: true, exploded: false, bornOf: -1 },
      { faces: [1, 2, 6], thrown: true, exploded: true, bornOf: -1 },
      { faces: [3], thrown: false, exploded: false, bornOf: 1 },
    ]);
  });
});

describe("planStory", () => {
  it("plays a storyless roll as one shared throw", () => {
    const plan = planStory([role({}), role({ faces: [5] })], [[1.2], [1.2]]);
    expect(plan.duration).toBe(1.2);
    for (const die of plan.dice) {
      expect(die.bornAt).toBe(0);
      expect(die.cues).toEqual([{ kind: "sim", sim: 0, start: 0, end: 1.2 }]);
    }
  });

  it("holds a doomed value, then picks the die up into its re-toss", () => {
    const plan = planStory([role({ faces: [1, 5] })], [[1.2, 0.8]]);
    const cues = plan.dice[0]?.cues ?? [];
    expect(cues[0]).toEqual({ kind: "sim", sim: 0, start: 0, end: 1.2 });
    expect(cues[1]).toEqual({
      kind: "pickup",
      sim: 1,
      start: 1.2 + STORY.hold,
      end: 1.2 + STORY.hold + STORY.pickup,
    });
    expect(cues[2]).toEqual({
      kind: "sim",
      sim: 1,
      start: 1.2 + STORY.hold + STORY.pickup,
      end: 1.2 + STORY.hold + STORY.pickup + 0.8,
    });
    expect(plan.duration).toBe(1.2 + STORY.hold + STORY.pickup + 0.8);
  });

  it("births an explosion-born die into its parent's celebration", () => {
    const plan = planStory(
      [role({ faces: [6], exploded: true }), role({ faces: [4], thrown: false, bornOf: 0 })],
      [[1.2], [0.9]],
    );
    const cheer = 1.2 + STORY.hold;
    expect(plan.dice[0]?.cues).toContainEqual({
      kind: "cheer",
      start: cheer,
      end: cheer + STORY.celebrate,
    });
    expect(plan.dice[1]?.bornAt).toBe(cheer + STORY.birth);
    expect(plan.dice[1]?.cues[0]).toEqual({
      kind: "sim",
      sim: 0,
      start: cheer + STORY.birth,
      end: cheer + STORY.birth + 0.9,
    });
    expect(plan.duration).toBe(cheer + STORY.birth + 0.9);
  });
});

describe("storyPoseAt", () => {
  const restA = turned([1, 0, 0], 0.6);
  const restB = turned([0, 0, 1], 1.3);
  const first = recording(
    [frame([0, 5, 0], turned([1, 1, 0], 2)), frame([1, 0, 1], restA)],
    turned([0, 1, 0], 0.5),
  );
  const second = recording(
    [frame([-2, 4, 0], turned([0, 1, 1], 1)), frame([-1, 0, 2], restB)],
    turned([1, 0, 0], 1.2),
  );

  it("plays each recording's frames on its cue, resting between", () => {
    const plan = planStory([role({ faces: [2, 5] })], [[1, 1]]);
    const timeline = plan.dice[0];
    if (!timeline) throw new Error("no timeline");
    const recordings = [first, second];
    const inFlight = storyPoseAt(timeline, recordings, 0, DIE_RADIUS);
    expect(inFlight.position).toEqual([0, 5, 0]);
    expect(inFlight.sim).toBe(0);
    // Resting on the doomed value through the hold.
    const holding = storyPoseAt(timeline, recordings, 1 + STORY.hold / 2, DIE_RADIUS);
    expect(holding.position).toEqual([1, 0, 1]);
    expect(holding.sim).toBe(0);
    // Settled for good on the re-toss's landing.
    const settled = storyPoseAt(timeline, recordings, plan.duration + 1, DIE_RADIUS);
    expect(settled.position).toEqual([-1, 0, 2]);
    expect(settled.sim).toBe(1);
  });

  it("keeps the mesh's world pose continuous across the pickup's remap swap", () => {
    const plan = planStory([role({ faces: [2, 5] })], [[1, 1]]);
    const timeline = plan.dice[0];
    if (!timeline) throw new Error("no timeline");
    const pickupStart = 1 + STORY.hold;
    const pose = storyPoseAt(timeline, [first, second], pickupStart, DIE_RADIUS);
    // Already wearing the next recording's remap...
    expect(pose.sim).toBe(1);
    // ...but composed so the mesh's world orientation has not moved: the
    // wrapper ⊗ new remap must equal the rest pose ⊗ old remap.
    const world = multiply(pose.orientation, second.remap);
    const rested = multiply(restA, first.remap);
    expect(sameRotation(world, rested)).toBe(true);
    // And by the end of the bridge it has arrived at the next throw's opening.
    const landedIn = storyPoseAt(
      timeline,
      [first, second],
      pickupStart + STORY.pickup - 1e-6,
      DIE_RADIUS,
    );
    expect(
      sameRotation(landedIn.orientation, second.frames[0]?.orientation as QuaternionTuple),
    ).toBe(true);
  });

  it("celebrates over the rest pose without changing which face is up", () => {
    const plan = planStory([role({ faces: [5], exploded: true })], [[1]]);
    const timeline = plan.dice[0];
    if (!timeline) throw new Error("no timeline");
    const rest = recording([frame([2, 0, -1], restA)]);
    const cheerStart = 1 + STORY.hold;
    // The face that is up is the body direction mapping to world-up — the
    // inverse rotation applied to UP. A world turn about UP cannot change it.
    const upFace = (q: QuaternionTuple): readonly [number, number, number] => {
      const [x, y, z, w] = [-q[0], -q[1], -q[2], q[3]];
      return [2 * (x * y - w * z), 1 - 2 * (x * x + z * z), 2 * (y * z + w * x)];
    };
    for (const portion of [0.2, 0.5, 0.8]) {
      const pose = storyPoseAt(
        timeline,
        [rest],
        cheerStart + portion * STORY.celebrate,
        DIE_RADIUS,
      );
      expect(pose.visible).toBe(true);
      expect(pose.position[1]).toBeGreaterThan(0);
      const [ax, ay, az] = upFace(pose.orientation);
      const [bx, by, bz] = upFace(restA);
      expect(Math.hypot(ax - bx, ay - by, az - bz)).toBeLessThan(1e-9);
    }
    const peak = storyPoseAt(timeline, [rest], cheerStart + STORY.celebrate / 2, DIE_RADIUS);
    expect(peak.swell).toBeCloseTo(1 + STORY.swell, 5);
    const after = storyPoseAt(timeline, [rest], plan.duration, DIE_RADIUS);
    expect(sameRotation(after.orientation, restA)).toBe(true);
    expect(after.swell).toBe(1);
  });

  it("keeps an explosion-born die invisible until its birth", () => {
    const plan = planStory(
      [role({ faces: [6], exploded: true }), role({ faces: [4], thrown: false, bornOf: 0 })],
      [[1], [1]],
    );
    const child = plan.dice[1];
    if (!child) throw new Error("no child timeline");
    expect(storyPoseAt(child, [first], child.bornAt - 0.01, DIE_RADIUS).visible).toBe(false);
    expect(storyPoseAt(child, [first], child.bornAt + 0.01, DIE_RADIUS).visible).toBe(true);
  });
});

describe("offsetImpacts", () => {
  it("shifts a recording's knocks onto the master clock, re-owned", () => {
    expect(offsetImpacts([{ time: 0.2, body: 0, against: "felt", speed: 1.5 }], 2.3, 4)).toEqual([
      { time: 2.5, body: 4, against: "felt", speed: 1.5 },
    ]);
  });
});
