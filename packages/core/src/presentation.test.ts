import { describe, expect, it } from "vitest";
import { createDiceEngine } from "./engine.js";
import type { PresenterCapabilities } from "./presentation.js";
import { presentationSupport } from "./presentation.js";
import { createSeededRandomSource } from "./rng/seeded.js";

const engine = createDiceEngine({ random: createSeededRandomSource("capabilities") });

/** A presenter that draws every shape flat and says nothing. */
const tiles: PresenterCapabilities = {
  implementation: "test/tiles",
  kinds: ["roll", "coin-flip"],
  dieSides: [4, 6, 8, 10, 12, 20, 100],
  media: ["2d"],
  cancellable: true,
  announces: false,
  honorsReducedMotion: false,
};

function withCapabilities(overrides: Partial<PresenterCapabilities>): PresenterCapabilities {
  return { ...tiles, ...overrides };
}

describe("presentationSupport", () => {
  it("accepts an event a presenter declares support for", () => {
    expect(presentationSupport(tiles, engine.roll("4d6dl1"))).toEqual({ supported: true });
    expect(presentationSupport(tiles, engine.flipCoin())).toEqual({ supported: true });
  });

  it("rejects a kind the presenter does not accept", () => {
    const diceOnly = withCapabilities({ kinds: ["roll"] });
    const result = presentationSupport(diceOnly, engine.flipCoin());

    expect(result.supported).toBe(false);
    if (result.supported) return;
    expect(result.reason).toBe("unsupported-kind");
    expect(result.message).toContain("test/tiles");
  });

  it("names every die size it cannot show, once each and in order", () => {
    const small = withCapabilities({ dieSides: [6] });
    const result = presentationSupport(small, engine.roll("2d20+d12+d20+3"));

    expect(result.supported).toBe(false);
    if (result.supported) return;
    expect(result.reason).toBe("unsupported-die-sides");
    // d20 appears in two groups but is reported once, and sizes read ascending.
    expect(result.dieSides).toEqual([12, 20]);
  });

  /**
   * Percentile is the case where a presenter's own shapes and the record's
   * die sizes come apart: a d100 is commonly shown as two d10s. What matters
   * is the size in the record, so a presenter that shows d100 must say so.
   */
  it("judges a percentile roll by the recorded d100, not by d10 support", () => {
    const withoutPercentile = withCapabilities({ dieSides: [4, 6, 8, 10, 12, 20] });
    expect(presentationSupport(withoutPercentile, engine.roll("d%")).supported).toBe(false);
    expect(presentationSupport(tiles, engine.roll("d%")).supported).toBe(true);
  });

  it("ignores modifiers, which have nothing to present", () => {
    const modifiersOnly = withCapabilities({ dieSides: [20] });
    expect(presentationSupport(modifiersOnly, engine.roll("d20+5-2")).supported).toBe(true);
  });

  /**
   * Capabilities describe an instance, not an implementation: the same
   * renderer with and without a 3D theme reports different media.
   */
  it("treats capabilities as plain data, so a caller can compare instances", () => {
    const flat = withCapabilities({ media: ["2d"] });
    const rich = withCapabilities({ media: ["3d", "2d"] });
    expect(rich.media.includes("3d")).toBe(true);
    expect(flat.media.includes("3d")).toBe(false);
    // Both still present the same events; the medium is not a support question.
    const event = engine.roll("2d20kh1");
    expect(presentationSupport(flat, event)).toEqual(presentationSupport(rich, event));
  });
});
