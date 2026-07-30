import { Quaternion, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import type { FlightRequest } from "./story.js";
import { buildFlights, STORY, storyPose } from "./story.js";

/** Two quaternions describing the same rotation, either cover. */
function sameRotation(a: Quaternion, b: Quaternion): boolean {
  return Math.abs(a.dot(b)) > 1 - 1e-9;
}

function turned(axis: Vector3, angle: number): Quaternion {
  return new Quaternion().setFromAxisAngle(axis.clone().normalize(), angle);
}

/** Deterministic uniform source, so a flight can be replayed in a test. */
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

const FACE_A = turned(new Vector3(1, 0, 0), 0.4);
const FACE_B = turned(new Vector3(0, 0, 1), 1.1);
const FACE_C = turned(new Vector3(1, 2, 0), 2.0);

function request(overrides: Partial<FlightRequest>): FlightRequest {
  return { final: FACE_A, steps: [], exploded: false, bornOf: -1, ...overrides };
}

describe("buildFlights", () => {
  it("staggers the original throw and settles each die on its face", () => {
    const flights = buildFlights([request({}), request({ final: FACE_B })], seeded(1));
    expect(flights[0]?.legs[0]?.start).toBe(0);
    expect(flights[1]?.legs[0]?.start).toBe(STORY.staggerMs);
    for (const flight of flights) {
      const landed = storyPose(flight, flight.settleAt);
      expect(landed.visible).toBe(true);
      expect(landed.lift).toBe(0);
      expect(sameRotation(landed.orientation, flight.final)).toBe(true);
    }
  });

  it("lands a rerolled seat on each lost face before re-tossing to the next", () => {
    const [flight] = buildFlights([request({ steps: [FACE_B, FACE_C], final: FACE_A })], seeded(2));
    if (!flight) throw new Error("no flight built");
    // Fall, then one hold + toss per remaining face.
    expect(flight.settleAt).toBe(STORY.flyMs + 2 * (STORY.holdMs + STORY.retossMs));
    const afterFall = storyPose(flight, STORY.flyMs);
    expect(sameRotation(afterFall.orientation, FACE_B)).toBe(true);
    // Readable through the hold: the doomed value rests on the table.
    const midHold = storyPose(flight, STORY.flyMs + STORY.holdMs / 2);
    expect(midHold.lift).toBe(0);
    expect(sameRotation(midHold.orientation, FACE_B)).toBe(true);
    const afterFirstToss = storyPose(flight, STORY.flyMs + STORY.holdMs + STORY.retossMs);
    expect(sameRotation(afterFirstToss.orientation, FACE_C)).toBe(true);
    expect(sameRotation(storyPose(flight, flight.settleAt).orientation, FACE_A)).toBe(true);
  });

  it("celebrates without ever changing which face is up", () => {
    const [flight] = buildFlights([request({ exploded: true, final: FACE_C })], seeded(3));
    if (!flight) throw new Error("no flight built");
    const cheerStart = STORY.flyMs + STORY.holdMs;
    expect(flight.settleAt).toBe(cheerStart + STORY.celebrateMs);
    // The face that is up is the body direction mapping to world-up — the
    // inverse rotation applied to UP. A world turn about UP cannot change it.
    const restingUpFace = new Vector3(0, 1, 0).applyQuaternion(FACE_C.clone().invert());
    for (const portion of [0.1, 0.25, 0.5, 0.75, 0.9]) {
      const pose = storyPose(flight, cheerStart + portion * STORY.celebrateMs);
      const upFace = new Vector3(0, 1, 0).applyQuaternion(pose.orientation.clone().invert());
      expect(upFace.distanceTo(restingUpFace)).toBeLessThan(1e-9);
    }
    const peak = storyPose(flight, cheerStart + STORY.celebrateMs / 2);
    expect(peak.lift).toBeGreaterThan(0);
    expect(peak.swell).toBeGreaterThan(1);
    const settled = storyPose(flight, flight.settleAt);
    expect(sameRotation(settled.orientation, FACE_C)).toBe(true);
    expect(settled.swell).toBe(1);
  });

  it("births an explosion-born die mid-celebration, invisible before", () => {
    const flights = buildFlights(
      [request({ exploded: true, final: FACE_A }), request({ bornOf: 0, final: FACE_B })],
      seeded(4),
    );
    const child = flights[1];
    if (!child) throw new Error("no child flight");
    const parentCheer = STORY.flyMs + STORY.holdMs;
    expect(child.bornAt).toBe(parentCheer + STORY.birthMs);
    expect(storyPose(child, child.bornAt - 1).visible).toBe(false);
    expect(storyPose(child, child.bornAt + 1).visible).toBe(true);
    expect(child.settleAt).toBe(child.bornAt + STORY.spawnMs);
    expect(sameRotation(storyPose(child, child.settleAt).orientation, FACE_B)).toBe(true);
  });

  it("chains: each earned die celebrates in turn and births the next", () => {
    const flights = buildFlights(
      [
        request({ exploded: true, final: FACE_A }),
        request({ bornOf: 0, exploded: true, final: FACE_B }),
        request({ bornOf: 1, final: FACE_C }),
      ],
      seeded(5),
    );
    const [, middle, last] = flights;
    if (!middle || !last) throw new Error("chain not built");
    const middleLanded = middle.bornAt + STORY.spawnMs;
    expect(last.bornAt).toBe(middleLanded + STORY.holdMs + STORY.birthMs);
    expect(last.bornAt).toBeGreaterThan(middle.bornAt);
  });
});
