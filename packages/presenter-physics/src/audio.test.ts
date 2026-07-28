import { describe, expect, it } from "vitest";
import { createKnockPlayer, impactSchedule } from "./audio.js";
import type { PhysicsImpact } from "./simulate.js";

const impact = (overrides: Partial<PhysicsImpact>): PhysicsImpact => ({
  time: 0.5,
  body: 0,
  against: "felt",
  speed: 1,
  ...overrides,
});

describe("impactSchedule", () => {
  it("drops solver chatter below the audible floor", () => {
    const knocks = impactSchedule([
      impact({ speed: 0.05 }),
      impact({ speed: 0.11 }),
      impact({ time: 0.6, speed: 1.5 }),
    ]);
    expect(knocks).toHaveLength(1);
    expect(knocks[0]?.time).toBe(0.6);
  });

  it("merges one physical bounce reported across adjacent solver steps", () => {
    // The measured coin reports its first landing four times inside 40 ms.
    const bounce = [0.5, 0.508, 0.517, 0.525].map((time) => impact({ time, speed: 1.3 }));
    const later = impact({ time: 0.7, speed: 1.3 });
    expect(impactSchedule([...bounce, later])).toHaveLength(2);
  });

  it("keeps simultaneous knocks from different dice apart", () => {
    const knocks = impactSchedule([
      impact({ body: 0, speed: 1 }),
      impact({ body: 1, speed: 1 }),
      impact({ body: 2, speed: 1 }),
    ]);
    expect(knocks).toHaveLength(3);
  });

  it("shapes loudness by speed and material, inside [0, 1]", () => {
    const soft = impactSchedule([impact({ speed: 0.3 })])[0];
    const hard = impactSchedule([impact({ speed: 3 })])[0];
    expect(soft && hard && soft.gain < hard.gain).toBe(true);
    for (const knock of impactSchedule([
      impact({ speed: 99, against: "die" }),
      impact({ speed: 0.13, against: "felt" }),
    ])) {
      expect(knock.gain).toBeGreaterThan(0);
      expect(knock.gain).toBeLessThanOrEqual(1);
    }
  });

  it("gives each material its own voice", () => {
    const [felt, wall, die] = (["felt", "wall", "die"] as const).map(
      (against) => impactSchedule([impact({ against })])[0],
    );
    expect(felt && wall && die).toBeTruthy();
    expect(felt && felt.frequency < (wall?.frequency ?? 0)).toBe(true);
    expect(wall && wall.frequency < (die?.frequency ?? 0)).toBe(true);
    expect(felt && felt.decay > (die?.decay ?? 1)).toBe(true);
  });

  it("is deterministic: the same recording sounds the same", () => {
    const impacts = [
      impact({ time: 0.31, speed: 1.7, against: "wall" }),
      impact({ time: 0.44, body: 1, speed: 0.9 }),
      impact({ time: 0.61, body: 1, speed: 0.4, against: "die" }),
    ];
    expect(impactSchedule(impacts)).toEqual(impactSchedule(impacts));
  });
});

describe("createKnockPlayer", () => {
  it("is silent, not broken, where AudioContext does not exist", () => {
    // Sound is presentation, and presentation must never break the roll: a
    // jsdom test run and an old browser both land here.
    const player = createKnockPlayer({});
    const playback = player.play(impactSchedule([impact({ speed: 2 })]));
    expect(() => playback.stop()).not.toThrow();
    expect(() => player.dispose()).not.toThrow();
  });
});
