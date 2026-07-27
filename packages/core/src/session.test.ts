import { describe, expect, it } from "vitest";
import { createDiceEngine } from "./engine.js";
import { DiceForgeError } from "./errors.js";
import type {
  AbortSignalLike,
  InteractionPresenter,
  PresenterCapabilities,
} from "./presentation.js";
import type { InteractionEvent } from "./records.js";
import { EVENT_SCHEMA_VERSION } from "./records.js";
import { createSeededRandomSource } from "./rng/seeded.js";
import type { RandomSource } from "./rng/types.js";
import { serializeEvent } from "./serialization.js";
import {
  createSession,
  deserializeSession,
  replaySession,
  serializeSession,
  validateSessionRecord,
} from "./session.js";

const CAPABILITIES: PresenterCapabilities = {
  implementation: "test/recorder",
  kinds: ["roll", "coin-flip"],
  dieSides: "any",
  media: ["none"],
  cancellable: true,
  announces: false,
  honorsReducedMotion: false,
};

/** A presenter that just remembers what it was asked to show. */
function recorder(): InteractionPresenter & { readonly shown: InteractionEvent[] } {
  const shown: InteractionEvent[] = [];
  return {
    shown,
    capabilities: CAPABILITIES,
    async present(event, options) {
      if (options?.signal?.aborted) {
        const error = new Error("aborted");
        error.name = "AbortError";
        throw error;
      }
      shown.push(event);
    },
  };
}

function sampleEvents(): InteractionEvent[] {
  const engine = createDiceEngine({ random: createSeededRandomSource("session") });
  return [engine.roll("2d20kh1+3"), engine.flipCoin(), engine.roll("4d6dl1")];
}

describe("createSession", () => {
  it("stamps the current schema version and freezes the log", () => {
    const session = createSession(sampleEvents());
    expect(session.kind).toBe("session");
    expect(session.schemaVersion).toBe(EVENT_SCHEMA_VERSION);
    expect(session.events).toHaveLength(3);
    expect(Object.isFrozen(session)).toBe(true);
    expect(Object.isFrozen(session.events)).toBe(true);
  });

  it("holds an empty log, because a table with no rolls yet is a real state", () => {
    expect(createSession([]).events).toEqual([]);
  });

  it("refuses an event that does not add up, rather than storing it", () => {
    const [roll] = sampleEvents();
    if (roll?.kind !== "roll") throw new Error("expected a roll");
    expect(() => createSession([{ ...roll, total: roll.total + 1 }])).toThrowError(DiceForgeError);
  });
});

describe("session serialization", () => {
  it("round-trips", () => {
    const session = createSession(sampleEvents());
    expect(deserializeSession(serializeSession(session))).toEqual(session);
  });

  it("names the event at fault instead of failing anonymously", () => {
    const session = createSession(sampleEvents());
    const raw = JSON.parse(serializeSession(session)) as { events: { total?: number }[] };
    const second = raw.events[2];
    if (!second) throw new Error("expected a third event");
    second.total = 999;
    expect(() => deserializeSession(JSON.stringify(raw))).toThrowError(/events\[2\]/);
  });

  it("reads a session whose events come from an older schema version", () => {
    // Version 1 records are valid version 2 data, so a session of them upgrades
    // event by event (ADR-0015, ADR-0017).
    const legacy = {
      kind: "session",
      schemaVersion: 1,
      events: [
        {
          kind: "coin-flip",
          schemaVersion: 1,
          outcome: "heads",
          provenance: { source: "system", algorithm: "math-random" },
        },
      ],
    };
    const restored = deserializeSession(JSON.stringify(legacy));
    expect(restored.schemaVersion).toBe(EVENT_SCHEMA_VERSION);
    expect(restored.events[0]?.schemaVersion).toBe(EVENT_SCHEMA_VERSION);
  });

  it("rejects payloads that are not sessions", () => {
    expect(() => deserializeSession("not json")).toThrowError(/not valid JSON/);
    expect(() => deserializeSession(JSON.stringify({ kind: "roll" }))).toThrowError(/kind must be/);
    expect(() => validateSessionRecord({ kind: "session", schemaVersion: 2 })).toThrowError(
      /events must be an array/,
    );
  });
});

describe("replaySession", () => {
  it("presents every event, in order", async () => {
    const events = sampleEvents();
    const presenter = recorder();
    await replaySession(createSession(events), presenter);
    expect(presenter.shown.map((event) => serializeEvent(event))).toEqual(
      events.map((event) => serializeEvent(event)),
    );
  });

  it("accepts a bare array as well as a session", async () => {
    const presenter = recorder();
    await replaySession(sampleEvents(), presenter);
    expect(presenter.shown).toHaveLength(3);
  });

  /**
   * The whole point of replay: it shows outcomes that were already decided. A
   * replay that drew a random number would advance a seeded engine's stream and
   * quietly change what the next real roll produces (ADR-0017).
   */
  it("consumes no randomness", async () => {
    const events = sampleEvents();
    const forbidden: RandomSource = {
      nextUint32() {
        throw new Error("replay must not roll anything");
      },
      provenance: () => ({ source: "system", algorithm: "math-random" }) as const,
    };
    const engine = createDiceEngine({ random: forbidden });
    await replaySession(events, recorder());
    // The engine sharing the source is untouched, and still refuses to roll.
    expect(() => engine.roll("1d6")).toThrowError(/must not roll anything/);
  });

  it("leaves a seeded engine's next roll unchanged", async () => {
    const engine = createDiceEngine({ random: createSeededRandomSource("continuity") });
    const first = engine.roll("1d20");
    await replaySession([first], recorder());
    const second = engine.roll("1d20");

    const fresh = createDiceEngine({ random: createSeededRandomSource("continuity") });
    fresh.roll("1d20");
    expect(serializeEvent(second)).toBe(serializeEvent(fresh.roll("1d20")));
  });

  it("reports progress, so a caller knows how far it got", async () => {
    const seen: number[] = [];
    await replaySession(sampleEvents(), recorder(), {
      onEvent: (_event, index) => seen.push(index),
    });
    expect(seen).toEqual([0, 1, 2]);
  });

  it("stops at the next event when aborted, and still rejects as an AbortError", async () => {
    const presenter = recorder();
    // A structural signal, not a platform AbortController: the core's types are
    // deliberately free of the DOM, and its tests should be too.
    const signal: AbortSignalLike & { aborted: boolean } = {
      aborted: false,
      addEventListener: () => {},
      removeEventListener: () => {},
    };
    let started = 0;
    await expect(
      replaySession(sampleEvents(), presenter, {
        signal,
        onEvent: () => {
          started += 1;
          if (started === 2) signal.aborted = true;
        },
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
    // The first event was shown; the second was in flight when it was cancelled.
    expect(presenter.shown).toHaveLength(1);
  });

  it("refuses something that is not a presenter", async () => {
    await expect(
      replaySession(sampleEvents(), undefined as unknown as InteractionPresenter),
    ).rejects.toThrowError(/must implement present/);
  });
});
