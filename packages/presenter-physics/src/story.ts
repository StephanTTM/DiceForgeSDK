import type { VisualDie } from "@diceforge-sdk/renderer-web";
import type { PhysicsFrame, PhysicsImpact } from "./simulate.js";
import type { QuaternionTuple } from "./symmetry.js";
import { multiply } from "./symmetry.js";

/**
 * The story a simulated roll tells (ADR-0016, ADR-0018): each recording is a
 * real throw that already lands the face it must, and this module only decides
 * *when* each one plays. A die that rerolled rests on its doomed value, is
 * picked up, and its next recording plays as the re-toss; a die that exploded
 * celebrates over its rest pose — a hop with a full vertical turn, which
 * cannot change the face that is up — while the die it earned plays its own
 * throw, born mid-celebration. Pure timeline math, tested headlessly; the
 * presenter feeds it recordings and a clock.
 */

/** Timing and shaping, in seconds and die radii. */
export const STORY = {
  /** How long a doomed or exploded value stays readable before its consequence. */
  hold: 0.4,
  /** The bridge from a rest pose into the next recording's first frame. */
  pickup: 0.18,
  celebrate: 0.55,
  /** How far into the celebration the earned die is born. */
  birth: 0.3,
  /** Celebration hop height, in die radii. */
  hopRadii: 1.4,
  /** Peak of the celebration's size swell, above 1. */
  swell: 0.22,
} as const;

/** One die's part: which faces its recordings must land, and its lineage. */
export type StoryRole = {
  /** Faces to land in order: each face lost to a reroll, then the recorded one. */
  readonly faces: readonly number[];
  /** True when part of the original shared throw (not explosion-born). */
  readonly thrown: boolean;
  readonly exploded: boolean;
  /** Index of the die whose explosion earned this one, or -1. */
  readonly bornOf: number;
};

/** Reads each stage die's part from what `visualDiceForEvent` reconstructed. */
export function storyCast(dice: readonly VisualDie[]): StoryRole[] {
  return dice.map((die) => ({
    faces: [...(die.rerolledFaces ?? []), die.face],
    thrown: die.bornOf === undefined,
    exploded: die.exploded === true,
    bornOf: die.bornOf ?? -1,
  }));
}

export type DieCue =
  | { readonly kind: "sim"; readonly sim: number; readonly start: number; readonly end: number }
  | { readonly kind: "pickup"; readonly sim: number; readonly start: number; readonly end: number }
  | { readonly kind: "cheer"; readonly start: number; readonly end: number };

export type DieTimeline = {
  /** Nothing is shown before this — an explosion-born die does not exist yet. */
  readonly bornAt: number;
  readonly cues: readonly DieCue[];
  /** When the last cue ends and the die rests for good. */
  readonly settleAt: number;
};

export type StoryPlan = {
  readonly dice: readonly DieTimeline[];
  /** When the whole stage has stopped moving. */
  readonly duration: number;
};

/**
 * Times every die's cues. `simDurations[die][k]` is the length in seconds of
 * that die's k-th recording — for a thrown die, recording 0 is the shared
 * throw. Roles must be in stage order so `bornOf` points backward.
 */
export function planStory(
  roles: readonly StoryRole[],
  simDurations: ReadonlyArray<readonly number[]>,
): StoryPlan {
  const dice: DieTimeline[] = [];
  /** When each die's celebration starts, for timing the dice it births. */
  const cheersAt: number[] = [];
  roles.forEach((role, index) => {
    const durations = simDurations[index] ?? [];
    const cues: DieCue[] = [];
    let bornAt = 0;
    if (!role.thrown && role.bornOf >= 0 && role.bornOf < index) {
      const parent = role.bornOf;
      // A malformed record without a celebrating parent still gets a birth —
      // it just waits for the parent to settle.
      bornAt = (cheersAt[parent] ?? (dice[parent] as DieTimeline).settleAt) + STORY.birth;
    }
    let at = bornAt;
    durations.forEach((duration, sim) => {
      if (sim > 0) {
        // Rest on the doomed value, then be picked up into the next throw.
        cues.push({
          kind: "pickup",
          sim,
          start: at + STORY.hold,
          end: at + STORY.hold + STORY.pickup,
        });
        at += STORY.hold + STORY.pickup;
      }
      cues.push({ kind: "sim", sim, start: at, end: at + duration });
      at += duration;
    });
    if (role.exploded) {
      const cheer = at + STORY.hold;
      cheersAt[index] = cheer;
      cues.push({ kind: "cheer", start: cheer, end: cheer + STORY.celebrate });
      at = cheer + STORY.celebrate;
    }
    dice.push({ bornAt, cues, settleAt: at });
  });
  return {
    dice,
    duration: dice.reduce((latest, timeline) => Math.max(latest, timeline.settleAt), 0),
  };
}

/** One recording a die plays: its frames, and the remap that makes it honest. */
export type Recording = {
  readonly frames: readonly PhysicsFrame[];
  readonly frameRate: number;
  /** Mesh-in-collider rotation for this recording's landing (ADR-0018). */
  readonly remap: QuaternionTuple;
};

/** What a die looks like at one instant of the story. */
export type StagePose = {
  readonly visible: boolean;
  readonly position: readonly [number, number, number];
  /** The wrapper's orientation — the recording's body pose, bridged between throws. */
  readonly orientation: QuaternionTuple;
  /** Which recording's remap the mesh inside must wear right now. */
  readonly sim: number;
  /** Uniform scale factor — the celebration's swell, 1 at rest. */
  readonly swell: number;
};

function conjugate(q: QuaternionTuple): QuaternionTuple {
  return [-q[0], -q[1], -q[2], q[3]];
}

function slerp(a: QuaternionTuple, b: QuaternionTuple, t: number): QuaternionTuple {
  let dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  // The double cover: interpolate the short way round.
  const to: QuaternionTuple = dot < 0 ? [-b[0], -b[1], -b[2], -b[3]] : b;
  dot = Math.abs(dot);
  if (dot > 0.9995) {
    const lerped: QuaternionTuple = [
      a[0] + (to[0] - a[0]) * t,
      a[1] + (to[1] - a[1]) * t,
      a[2] + (to[2] - a[2]) * t,
      a[3] + (to[3] - a[3]) * t,
    ];
    const norm = Math.hypot(lerped[0], lerped[1], lerped[2], lerped[3]);
    return [lerped[0] / norm, lerped[1] / norm, lerped[2] / norm, lerped[3] / norm];
  }
  const theta = Math.acos(dot);
  const wa = Math.sin((1 - t) * theta) / Math.sin(theta);
  const wb = Math.sin(t * theta) / Math.sin(theta);
  return [
    a[0] * wa + to[0] * wb,
    a[1] * wa + to[1] * wb,
    a[2] * wa + to[2] * wb,
    a[3] * wa + to[3] * wb,
  ];
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

function frameAt(recording: Recording, seconds: number): PhysicsFrame {
  const index = Math.min(
    recording.frames.length - 1,
    Math.max(0, Math.floor(seconds * recording.frameRate)),
  );
  return recording.frames[index] as PhysicsFrame;
}

function lastFrame(recording: Recording): PhysicsFrame {
  return recording.frames[recording.frames.length - 1] as PhysicsFrame;
}

/**
 * Where a die's story is at `time`. Pure — the same inputs always pose alike.
 *
 * The wrapper plays each recording's body orientation while the mesh inside
 * wears that recording's remap. Consecutive recordings have different remaps,
 * so the pickup bridge starts from the *composed* pose — rest ⊗ old remap ⊗
 * new remap⁻¹ — which keeps the mesh's world orientation continuous while the
 * remap changes underneath it.
 */
export function storyPoseAt(
  timeline: DieTimeline,
  recordings: readonly Recording[],
  time: number,
  dieRadius: number,
): StagePose {
  const first = recordings[0] as Recording;
  if (time < timeline.bornAt) {
    const opening = frameAt(first, 0);
    return {
      visible: false,
      position: opening.position,
      orientation: opening.orientation,
      sim: 0,
      swell: 1,
    };
  }
  /** The recording the die last rested from, for holds, cheers, and the end. */
  let restedSim = 0;
  for (const cue of timeline.cues) {
    if (cue.start > time) break;
    if (time < cue.end) {
      if (cue.kind === "sim") {
        const frame = frameAt(recordings[cue.sim] as Recording, time - cue.start);
        return {
          visible: true,
          position: frame.position,
          orientation: frame.orientation,
          sim: cue.sim,
          swell: 1,
        };
      }
      if (cue.kind === "pickup") {
        const previous = recordings[cue.sim - 1] as Recording;
        const next = recordings[cue.sim] as Recording;
        const rest = lastFrame(previous);
        const opening = frameAt(next, 0);
        // Wearing the next remap already; start composed so nothing snaps.
        const from = multiply(multiply(rest.orientation, previous.remap), conjugate(next.remap));
        const u = smoothstep((time - cue.start) / (cue.end - cue.start));
        return {
          visible: true,
          position: [
            rest.position[0] + (opening.position[0] - rest.position[0]) * u,
            rest.position[1] + (opening.position[1] - rest.position[1]) * u,
            rest.position[2] + (opening.position[2] - rest.position[2]) * u,
          ],
          orientation: slerp(from, opening.orientation, u),
          sim: cue.sim,
          swell: 1,
        };
      }
      // The cheer: a hop with a full vertical turn and a swell over the rest
      // pose. A whole turn about UP is the identity, and no vertical rotation
      // can change which face is up, so the celebration cannot lie.
      const rest = lastFrame(recordings[restedSim] as Recording);
      const u = (time - cue.start) / (cue.end - cue.start);
      const half = Math.PI * smoothstep(u);
      const turn: QuaternionTuple = [0, Math.sin(half), 0, Math.cos(half)];
      return {
        visible: true,
        position: [
          rest.position[0],
          rest.position[1] + STORY.hopRadii * dieRadius * Math.sin(Math.PI * u),
          rest.position[2],
        ],
        orientation: multiply(turn, rest.orientation),
        sim: restedSim,
        swell: 1 + STORY.swell * Math.sin(Math.PI * u),
      };
    }
    if (cue.kind === "sim") restedSim = cue.sim;
  }
  // Resting: between cues, or settled for good.
  const rest = lastFrame(recordings[restedSim] as Recording);
  return {
    visible: true,
    position: rest.position,
    orientation: rest.orientation,
    sim: restedSim,
    swell: 1,
  };
}

/** A recording's impacts shifted onto the master clock, re-owned by one die. */
export function offsetImpacts(
  impacts: readonly PhysicsImpact[],
  seconds: number,
  body: number,
): PhysicsImpact[] {
  return impacts.map((impact) => ({ ...impact, time: impact.time + seconds, body }));
}
