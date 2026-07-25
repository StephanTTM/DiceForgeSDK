import { describe, expect, it } from "vitest";
import { DiceForgeError } from "./errors.js";
import { parseDiceNotation } from "./notation/parser.js";
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
