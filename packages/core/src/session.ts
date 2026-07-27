import { DiceForgeError } from "./errors.js";
import type { AbortSignalLike, InteractionPresenter } from "./presentation.js";
import type { InteractionEvent } from "./records.js";
import { deepFreeze, EVENT_SCHEMA_VERSION } from "./records.js";
import { validateEventRecord } from "./serialization.js";

/**
 * An ordered log of resolved events — a table's history as one artifact
 * (ADR-0017).
 *
 * A session carries the same schema version as the records inside it, and
 * nothing else: no timestamps, no seeds, no presentation. What a replay
 * reproduces is the outcomes; when they happened and how they were shown are
 * the application's business.
 */
export type SessionRecord = {
  readonly kind: "session";
  readonly schemaVersion: number;
  /** Events in the order they were resolved. */
  readonly events: readonly InteractionEvent[];
};

/** Most events one session may hold. */
export const MAX_SESSION_EVENTS = 10_000;

function fail(message: string): never {
  throw new DiceForgeError("invalid-event", `invalid session record: ${message}`);
}

/**
 * Collects resolved events into a frozen, serializable session.
 *
 * The engine does not record anything itself — it holds no state beyond its
 * random source, and that is worth keeping. An application already has each
 * result; this turns the list it kept into an artifact with a version on it.
 *
 * ```ts
 * const log: InteractionEvent[] = [];
 * log.push(engine.roll("2d20kh1+3"));
 * log.push(engine.flipCoin());
 * localStorage.setItem("table", serializeSession(createSession(log)));
 * ```
 */
export function createSession(events: readonly InteractionEvent[]): SessionRecord {
  if (!Array.isArray(events)) fail("events must be an array");
  if (events.length > MAX_SESSION_EVENTS) {
    fail(`a session may not hold more than ${MAX_SESSION_EVENTS} events`);
  }
  return deepFreeze({
    kind: "session",
    schemaVersion: EVENT_SCHEMA_VERSION,
    // Each event is revalidated on the way in, so a session cannot be the
    // place an inconsistent record slips through.
    events: events.map((event) => validateEventRecord(event)),
  });
}

/**
 * Structurally validates an unknown value as a session and returns a frozen
 * canonical copy. Every event inside is validated in turn, so a session is
 * exactly as trustworthy as a single record; events from an older schema
 * version are read and returned at the current one.
 */
export function validateSessionRecord(value: unknown): SessionRecord {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    fail("session must be an object");
  }
  const record = value as Record<string, unknown>;
  if (record.kind !== "session") fail('kind must be "session"');
  if (typeof record.schemaVersion !== "number") fail("schemaVersion must be a number");
  if (!Array.isArray(record.events)) fail("events must be an array");
  if (record.events.length > MAX_SESSION_EVENTS) {
    fail(`a session may not hold more than ${MAX_SESSION_EVENTS} events`);
  }
  return deepFreeze({
    kind: "session",
    schemaVersion: EVENT_SCHEMA_VERSION,
    events: record.events.map(validateSessionEvent),
  });
}

/** Validates one stored event, saying which one it was when it fails. */
function validateSessionEvent(event: unknown, index: number): InteractionEvent {
  try {
    return validateEventRecord(event);
  } catch (error) {
    // Say which event, or a long session gives the reader nothing to go on.
    const reason = error instanceof Error ? error.message : String(error);
    fail(`events[${index}] is not a valid event record: ${reason}`);
  }
}

/** Serializes a session to canonical JSON, validating it first. */
export function serializeSession(session: SessionRecord): string {
  return JSON.stringify(validateSessionRecord(session));
}

/** Parses and validates a session produced by `serializeSession`. */
export function deserializeSession(json: string): SessionRecord {
  if (typeof json !== "string") {
    throw new DiceForgeError("invalid-argument", "session payload must be a string");
  }
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch (error) {
    fail(`payload is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  return validateSessionRecord(raw);
}

export type ReplayOptions = {
  /** Abort to stop the replay; the presentation in flight rejects. */
  readonly signal?: AbortSignalLike;
  /**
   * Called before each event is presented — for a progress counter, or to
   * know how far a failed replay got.
   */
  readonly onEvent?: (event: InteractionEvent, index: number) => void;
};

/**
 * Presents stored events in order, without resolving anything (ADR-0017).
 *
 * Replay consumes no randomness: it shows outcomes that were decided when they
 * were rolled, so replaying a session leaves a seeded engine's stream exactly
 * where it was. What it reproduces is the results, not the show — motion,
 * timing and even which medium the presenter uses are free to differ.
 *
 * Errors propagate unchanged, so an aborted replay still rejects with an
 * `AbortError`; `onEvent` tells you which event was in flight.
 */
export async function replaySession(
  session: SessionRecord | readonly InteractionEvent[],
  presenter: InteractionPresenter,
  options: ReplayOptions = {},
): Promise<void> {
  const events = Array.isArray(session)
    ? (session as readonly InteractionEvent[])
    : (session as SessionRecord).events;
  if (!presenter || typeof presenter.present !== "function") {
    throw new DiceForgeError("invalid-argument", "presenter must implement present()");
  }
  for (const [index, event] of events.entries()) {
    // Checked between events as well as inside them, so a cancelled replay
    // stops at the next boundary rather than playing to the end.
    if (options.signal?.aborted) {
      const error = new Error("replay aborted");
      error.name = "AbortError";
      throw error;
    }
    options.onEvent?.(event, index);
    await presenter.present(event, options.signal ? { signal: options.signal } : {});
  }
}
