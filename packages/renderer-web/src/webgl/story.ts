import { Quaternion, Vector3 } from "three";

/**
 * The story a roll's motion tells, as pure timeline math (ADR-0007's authored
 * motion, ADR-0016's record semantics): a die falls in and lands on the first
 * face its seat ever showed, re-tosses through every face it lost to rerolls,
 * and — when it rolled its highest face — celebrates while the die it earned
 * drops in beside it. Every leg is designed to end exactly on a calibrated
 * pose; nothing here decides an outcome.
 *
 * Deliberately free of scene state so it can be tested headlessly: the WebGL
 * backend feeds it orientations and a clock, and applies what comes back.
 */

/** Timing and shaping of the flight, milliseconds and scene units. */
export const STORY = {
  /** The initial fall, matching the pre-story tumble this replaces. */
  flyMs: 1000,
  /** Stagger between the dice of the original throw. */
  staggerMs: 80,
  /** How long a rerolled or exploded value stays readable before its consequence. */
  holdMs: 400,
  retossMs: 550,
  celebrateMs: 550,
  /** How far into the celebration the earned die is born — overlap reads as cause and effect. */
  birthMs: 300,
  spawnMs: 500,
  dropHeight: 5,
  retossHeight: 3.4,
  celebrateHop: 1.5,
  spawnHeight: 4.5,
  /** Peak of the celebration's size swell, as a scale factor above 1. */
  swell: 0.22,
  /** Portion of a fall or toss spent tumbling before easing into the pose. */
  tumblePortion: 0.62,
} as const;

/** One die's part in the story, orientations already resolved from its faces. */
export type FlightRequest = {
  /** Calibrated orientation of the recorded face. */
  readonly final: Quaternion;
  /** Orientations of the faces shown and lost to rerolls, oldest first. */
  readonly steps: readonly Quaternion[];
  /** True when this die rolled its highest face and earned the next one. */
  readonly exploded: boolean;
  /** Index of the die whose explosion earned this one, or -1 when thrown. */
  readonly bornOf: number;
};

type TumbleLeg = {
  readonly kind: "fall" | "toss";
  readonly start: number;
  readonly end: number;
  readonly from: Quaternion;
  readonly to: Quaternion;
  readonly axis: Vector3;
  /** Radians of free tumble across the leg, before the ease-in. */
  readonly spin: number;
  readonly height: number;
};

type CheerLeg = {
  readonly kind: "cheer";
  readonly start: number;
  readonly end: number;
  readonly at: Quaternion;
};

type Leg = TumbleLeg | CheerLeg;

export type DieFlight = {
  /** Nothing is shown before this — an explosion-born die does not exist yet. */
  readonly bornAt: number;
  readonly legs: readonly Leg[];
  /** When the last leg ends and the die rests for good. */
  readonly settleAt: number;
  readonly final: Quaternion;
};

/** What a die looks like at one instant, relative to its resting spot. */
export type StoryPose = {
  readonly visible: boolean;
  /** Height above the resting spot. */
  readonly lift: number;
  readonly orientation: Quaternion;
  /** Uniform scale factor — the celebration's swell, 1 at rest. */
  readonly swell: number;
};

function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

function clamp01(value: number): number {
  return Math.min(Math.max(value, 0), 1);
}

function randomUnitVector(random: () => number): Vector3 {
  const vector = new Vector3(random() * 2 - 1, random() * 2 - 1, random() * 2 - 1);
  return vector.lengthSq() < 1e-6 ? new Vector3(0, 1, 0) : vector.normalize();
}

function tumble(
  kind: "fall" | "toss",
  start: number,
  end: number,
  from: Quaternion,
  to: Quaternion,
  height: number,
  random: () => number,
): TumbleLeg {
  return {
    kind,
    start,
    end,
    from,
    to,
    axis: randomUnitVector(random),
    spin: 9 + random() * 5,
    height,
  };
}

/**
 * Builds every die's timeline. Requests must be in stage order — the order
 * `visualDiceForEvent` returns — so a `bornOf` always points backward at a
 * flight already built.
 */
export function buildFlights(
  requests: readonly FlightRequest[],
  random: () => number = Math.random,
): DieFlight[] {
  const flights: DieFlight[] = [];
  /** When each die's celebration starts, for timing the dice it births. */
  const cheersAt: number[] = [];
  let thrown = 0;
  requests.forEach((request, index) => {
    const parent = request.bornOf >= 0 && request.bornOf < index ? request.bornOf : -1;
    const targets = [...request.steps, request.final];
    const first = targets[0] as Quaternion;
    const legs: Leg[] = [];
    let bornAt = 0;
    if (parent < 0) {
      const start = thrown * STORY.staggerMs;
      thrown += 1;
      const from = new Quaternion().setFromAxisAngle(
        randomUnitVector(random),
        random() * 2 * Math.PI,
      );
      legs.push(tumble("fall", start, start + STORY.flyMs, from, first, STORY.dropHeight, random));
    } else {
      // Born of the parent's celebration, dropping in on its own seat. A
      // malformed record without a celebrating parent still gets a flight —
      // it just falls once the parent has settled.
      bornAt = (cheersAt[parent] ?? (flights[parent] as DieFlight).settleAt) + STORY.birthMs;
      const from = new Quaternion().setFromAxisAngle(
        randomUnitVector(random),
        random() * 2 * Math.PI,
      );
      legs.push(
        tumble("fall", bornAt, bornAt + STORY.spawnMs, from, first, STORY.spawnHeight, random),
      );
    }
    for (let step = 1; step < targets.length; step += 1) {
      const rested = (legs[legs.length - 1] as Leg).end + STORY.holdMs;
      legs.push(
        tumble(
          "toss",
          rested,
          rested + STORY.retossMs,
          targets[step - 1] as Quaternion,
          targets[step] as Quaternion,
          STORY.retossHeight,
          random,
        ),
      );
    }
    if (request.exploded) {
      const cheer = (legs[legs.length - 1] as Leg).end + STORY.holdMs;
      cheersAt[index] = cheer;
      legs.push({ kind: "cheer", start: cheer, end: cheer + STORY.celebrateMs, at: request.final });
    }
    flights.push({
      bornAt,
      legs,
      settleAt: (legs[legs.length - 1] as Leg).end,
      final: request.final,
    });
  });
  return flights;
}

/** Orientation through a fall or toss: free tumble easing into the pose. */
function tumbleOrientation(leg: TumbleLeg, u: number): Quaternion {
  if (u < STORY.tumblePortion) {
    return new Quaternion().setFromAxisAngle(leg.axis, leg.spin * u).multiply(leg.from);
  }
  const handoff = new Quaternion()
    .setFromAxisAngle(leg.axis, leg.spin * STORY.tumblePortion)
    .multiply(leg.from);
  const t = easeOutCubic((u - STORY.tumblePortion) / (1 - STORY.tumblePortion));
  return handoff.slerp(leg.to, t);
}

/** Where a flight is at `elapsedMs`. Pure: the same inputs always pose alike. */
export function storyPose(flight: DieFlight, elapsedMs: number): StoryPose {
  const rest = { visible: true, lift: 0, swell: 1 };
  if (elapsedMs < flight.bornAt) {
    return { visible: false, lift: STORY.spawnHeight, orientation: flight.final, swell: 1 };
  }
  let latest: Leg | undefined;
  for (const leg of flight.legs) {
    if (leg.start <= elapsedMs) latest = leg;
    else break;
  }
  if (!latest) {
    // Waiting on the stagger: hanging at the top of the fall, mid-tumble pose.
    const first = flight.legs[0] as TumbleLeg;
    return { ...rest, lift: first.height, orientation: tumbleOrientation(first, 0) };
  }
  if (elapsedMs >= latest.end) {
    // Resting between legs, or settled: exactly the pose the leg landed.
    return { ...rest, orientation: latest.kind === "cheer" ? latest.at : latest.to };
  }
  const u = clamp01((elapsedMs - latest.start) / (latest.end - latest.start));
  if (latest.kind === "cheer") {
    // A hop with a full vertical turn and a swell. A whole turn about UP is
    // the identity, and no vertical rotation can change which face is up, so
    // the celebration can never misreport the roll.
    const turn = new Quaternion().setFromAxisAngle(
      new Vector3(0, 1, 0),
      2 * Math.PI * smoothstep(u),
    );
    return {
      visible: true,
      lift: STORY.celebrateHop * Math.sin(Math.PI * u),
      orientation: turn.multiply(latest.at),
      swell: 1 + STORY.swell * Math.sin(Math.PI * u),
    };
  }
  const lift =
    latest.kind === "fall"
      ? latest.height * (1 - easeOutCubic(u))
      : latest.height * Math.sin(Math.PI * u);
  return { ...rest, lift, orientation: tumbleOrientation(latest, u) };
}
