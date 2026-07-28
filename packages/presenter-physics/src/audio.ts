import type { PhysicsImpact } from "./simulate.js";

/**
 * Sound for a recorded roll, derived from its own collisions (ADR-0020).
 *
 * The recording says when each die struck the felt, a wall or a neighbour, and
 * how hard — so audio is scheduled from the same data the animation plays,
 * never on a timer that merely resembles it. Every knock is synthesized from
 * filtered noise at play time: there are no audio assets to ship, source, or
 * license, and nothing to load before the roll can be heard.
 */

/** One knock to synthesize: when, how loud, and what it should sound like. */
export type Knock = {
  /** Seconds from the start of the recording. */
  readonly time: number;
  /** 0..1, already shaped by impact speed and material. */
  readonly gain: number;
  /** Bandpass centre, Hz — the material's voice. */
  readonly frequency: number;
  /** Envelope decay, seconds. */
  readonly decay: number;
};

/**
 * Below this, a contact is solver chatter rather than a hit anyone would hear.
 * Measured: a tenth of recorded impacts sit under 0.05 m/s while real bounces
 * run 0.3-3 m/s.
 */
const MIN_SPEED = 0.12;
/**
 * One physical bounce surfaces as several contacts across adjacent solver
 * steps — the measured coin reports its first landing four times inside 40 ms.
 * Knocks from the same body inside this window are one sound.
 */
const COOLDOWN = 0.055;
/** Speed at which a knock reaches full loudness, m/s. Measured p95 is ~2.1. */
const FULL_SPEED = 2.2;

/**
 * The material's voice: felt is a dull low thump, a wooden wall knocks, and
 * die-on-die is the bright clack. Values tuned by ear against the measured
 * speed range, not derived — the physics owns *when* and *how hard*, and only
 * that.
 */
const MATERIALS = {
  felt: { frequency: 950, decay: 0.035, loudness: 0.55 },
  wall: { frequency: 2100, decay: 0.02, loudness: 0.8 },
  die: { frequency: 3100, decay: 0.014, loudness: 1 },
} as const;

/**
 * A knock's small random-sounding variation, derived from the impact itself so
 * the same recording always sounds the same (the project's determinism rule
 * applies to presentation where practical, and here it is free).
 */
function detune(impact: PhysicsImpact): number {
  const raw = Math.sin(impact.time * 971.3 + impact.body * 37.7 + impact.speed * 13.1) * 43758.55;
  return 1 + 0.12 * (raw - Math.floor(raw) - 0.5);
}

/**
 * Turns a recording's impacts into the knocks worth hearing.
 *
 * Pure and deterministic, so it is tested headlessly and the Web Audio layer
 * stays a thin scheduler with nothing of its own to get wrong.
 */
export function impactSchedule(impacts: readonly PhysicsImpact[]): Knock[] {
  const lastHeard = new Map<number, number>();
  const knocks: Knock[] = [];
  for (const impact of impacts) {
    if (impact.speed < MIN_SPEED) continue;
    const previous = lastHeard.get(impact.body);
    if (previous !== undefined && impact.time - previous < COOLDOWN) continue;
    lastHeard.set(impact.body, impact.time);
    const material = MATERIALS[impact.against];
    const gain = Math.min(1, impact.speed / FULL_SPEED) * material.loudness;
    knocks.push({
      time: impact.time,
      gain,
      frequency: material.frequency * detune(impact),
      decay: material.decay,
    });
  }
  return knocks;
}

/** What playback needs from the player; `stop` is safe after natural end. */
export type KnockPlayback = { readonly stop: () => void };

export type KnockPlayer = {
  /** Schedules every knock, now. Resolves audio policy quietly: no context, no sound. */
  readonly play: (knocks: readonly Knock[]) => KnockPlayback;
  readonly dispose: () => void;
};

type AudioContextLike = AudioContext;

/**
 * The Web Audio half: one shared noise buffer, and per knock a bandpass filter
 * and a gain envelope. The context is created lazily inside the first `play`,
 * which runs in the click's call stack — the moment autoplay policy allows it.
 * An environment without `AudioContext` (jsdom, very old browsers) gets a
 * silent player rather than an error: sound is presentation, and presentation
 * must never break the roll.
 */
export function createKnockPlayer(view: unknown): KnockPlayer {
  let context: AudioContextLike | undefined;
  let noise: AudioBuffer | undefined;

  const contextOf = (): AudioContextLike | undefined => {
    if (context) return context;
    const host = view as { AudioContext?: new () => AudioContextLike };
    if (typeof host.AudioContext !== "function") return undefined;
    context = new host.AudioContext();
    return context;
  };

  const noiseOf = (ctx: AudioContextLike): AudioBuffer => {
    if (noise) return noise;
    // 100 ms of white noise, reused by every knock; the envelope and filter do
    // the shaping. Deterministic content is pointless here — the filter output
    // is what reads as the knock, not the sample values.
    const length = Math.floor(ctx.sampleRate * 0.1);
    noise = ctx.createBuffer(1, length, ctx.sampleRate);
    const channel = noise.getChannelData(0);
    for (let i = 0; i < length; i++) channel[i] = Math.random() * 2 - 1;
    return noise;
  };

  return {
    play(knocks) {
      const ctx = contextOf();
      if (!ctx || knocks.length === 0) return { stop: () => {} };
      if (ctx.state === "suspended") void ctx.resume();
      const started: AudioBufferSourceNode[] = [];
      const t0 = ctx.currentTime + 0.02;
      for (const knock of knocks) {
        const source = ctx.createBufferSource();
        source.buffer = noiseOf(ctx);
        const filter = ctx.createBiquadFilter();
        filter.type = "bandpass";
        filter.frequency.value = knock.frequency;
        filter.Q.value = 1.4;
        const envelope = ctx.createGain();
        const at = t0 + knock.time;
        envelope.gain.setValueAtTime(knock.gain * 0.4, at);
        envelope.gain.exponentialRampToValueAtTime(0.001, at + knock.decay * 4);
        source.connect(filter);
        filter.connect(envelope);
        envelope.connect(ctx.destination);
        source.start(at);
        source.stop(at + knock.decay * 4 + 0.05);
        started.push(source);
      }
      return {
        stop() {
          // An aborted presentation goes quiet with its animation; stopping an
          // already-ended source is specified as a no-op.
          for (const source of started) {
            try {
              source.stop();
            } catch {
              // Never started or already stopped - either way, silent.
            }
          }
        },
      };
    },
    dispose() {
      void context?.close();
      context = undefined;
      noise = undefined;
    },
  };
}
