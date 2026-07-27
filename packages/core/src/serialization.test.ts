import { describe, expect, it } from "vitest";
import { DiceForgeError } from "./errors.js";
import { parseDiceNotation } from "./notation/parser.js";
import { EVENT_SCHEMA_VERSION } from "./records.js";
import { resolveCoinFlip } from "./resolve/coin.js";
import { resolveRoll } from "./resolve/roll.js";
import { createSeededRandomSource } from "./rng/seeded.js";
import { deserializeEvent, serializeEvent } from "./serialization.js";

function sampleRoll() {
  return resolveRoll(parseDiceNotation("2d20kh1+3-1d4"), createSeededRandomSource("serialize"));
}

function expectFailure(payload: string, code: string, pattern: RegExp): void {
  let caught: unknown;
  try {
    deserializeEvent(payload);
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(DiceForgeError);
  const forgeError = caught as DiceForgeError;
  expect(forgeError.code).toBe(code);
  expect(forgeError.message).toMatch(pattern);
}

describe("event serialization", () => {
  it("round-trips a roll record", () => {
    const original = sampleRoll();
    const restored = deserializeEvent(serializeEvent(original));
    expect(restored).toEqual(original);
  });

  it("round-trips a coin-flip record", () => {
    const original = resolveCoinFlip(createSeededRandomSource("flip"));
    const restored = deserializeEvent(serializeEvent(original));
    expect(restored).toEqual(original);
  });

  it("returns frozen records from deserialization", () => {
    const restored = deserializeEvent(serializeEvent(sampleRoll()));
    expect(Object.isFrozen(restored)).toBe(true);
    if (restored.kind === "roll") {
      expect(Object.isFrozen(restored.groups[0]?.dice[0])).toBe(true);
    }
  });

  it("drops unknown extra fields, producing a canonical record", () => {
    const raw = JSON.parse(serializeEvent(sampleRoll())) as Record<string, unknown>;
    raw.extra = "injected";
    const restored = deserializeEvent(JSON.stringify(raw));
    expect("extra" in restored).toBe(false);
  });

  it("rejects payloads that are not valid JSON", () => {
    expectFailure("not json {", "invalid-event", /not valid JSON/);
  });

  it("rejects unsupported schema versions", () => {
    const raw = JSON.parse(serializeEvent(sampleRoll())) as Record<string, unknown>;
    raw.schemaVersion = 999;
    expectFailure(
      JSON.stringify(raw),
      "unsupported-schema-version",
      /unsupported event schemaVersion 999/,
    );
  });

  /**
   * Records written by 0.3.0 and earlier must keep working: every version 1
   * record is already valid version 2 data, so reading one returns the same
   * numbers stamped with the current version (ADR-0015).
   */
  it("reads a version 1 record and returns it as the current version", () => {
    const legacy = {
      kind: "roll",
      schemaVersion: 1,
      expression: "2d20kh1+3",
      groups: [
        {
          notation: "2d20kh1",
          sign: 1,
          sides: 20,
          dice: [
            { sides: 20, value: 1, kept: false },
            { sides: 20, value: 19, kept: true },
          ],
          subtotal: 19,
        },
      ],
      modifier: 3,
      total: 22,
      provenance: { source: "seeded", seed: "table-42", algorithm: "xoshiro128**" },
    };
    const restored = deserializeEvent(JSON.stringify(legacy));

    expect(restored.schemaVersion).toBe(EVENT_SCHEMA_VERSION);
    expect(restored.kind === "roll" && restored.total).toBe(22);
    expect(restored.kind === "roll" && restored.groups[0]?.dice[1]?.value).toBe(19);
    // Nothing custom is invented on the way through.
    expect(restored.kind === "roll" && "die" in (restored.groups[0] ?? {})).toBe(false);
  });

  it("still rejects a version 1 record whose numbers do not add up", () => {
    const tampered = {
      kind: "coin-flip",
      schemaVersion: 1,
      outcome: "sideways",
      provenance: { source: "system", algorithm: "math-random" },
    };
    expectFailure(JSON.stringify(tampered), "invalid-event", /outcome must be/);
  });

  it("rejects unknown event kinds", () => {
    const raw = JSON.parse(serializeEvent(sampleRoll())) as Record<string, unknown>;
    raw.kind = "card-draw";
    expectFailure(JSON.stringify(raw), "invalid-event", /kind must be/);
  });

  it("rejects tampered totals", () => {
    const raw = JSON.parse(serializeEvent(sampleRoll())) as { total: number };
    raw.total += 5;
    expectFailure(JSON.stringify(raw), "invalid-event", /total .* does not equal/);
  });

  it("rejects tampered subtotals", () => {
    const raw = JSON.parse(serializeEvent(sampleRoll())) as {
      groups: Array<{ subtotal: number }>;
    };
    const group = raw.groups[0];
    if (!group) throw new Error("expected at least one group");
    group.subtotal += 1;
    expectFailure(JSON.stringify(raw), "invalid-event", /subtotal .* does not equal/);
  });

  it("rejects die values outside the die's face range", () => {
    const raw = JSON.parse(serializeEvent(sampleRoll())) as {
      groups: Array<{ dice: Array<{ value: number }> }>;
    };
    const die = raw.groups[0]?.dice[0];
    if (!die) throw new Error("expected at least one die");
    die.value = 21;
    expectFailure(JSON.stringify(raw), "invalid-event", /outside 1\.\.20|does not equal/);
  });

  it("rejects records with missing provenance", () => {
    const raw = JSON.parse(serializeEvent(sampleRoll())) as Record<string, unknown>;
    raw.provenance = undefined;
    expectFailure(JSON.stringify(raw), "invalid-event", /provenance must be an object/);
  });

  it("rejects malformed coin-flip outcomes", () => {
    const raw = JSON.parse(
      serializeEvent(resolveCoinFlip(createSeededRandomSource("flip"))),
    ) as Record<string, unknown>;
    raw.outcome = "edge";
    expectFailure(JSON.stringify(raw), "invalid-event", /outcome must be/);
  });
});
