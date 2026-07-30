import { createDiceEngine, createSeededRandomSource } from "@diceforge-sdk/core";
import { describe, expect, it } from "vitest";
import { formatEventAnnouncement } from "./announce.js";

function seededEngine(seed: string) {
  return createDiceEngine({ random: createSeededRandomSource(seed) });
}

describe("formatEventAnnouncement", () => {
  it("describes a roll with kept and dropped dice", () => {
    const roll = seededEngine("table-42").roll("2d20kh1+3");
    // Seed "table-42" rolls 1 (dropped) and 19 (kept) — locked by core golden tests.
    expect(formatEventAnnouncement(roll)).toBe(
      "Rolled 2d20kh1+3. 2d20kh1: 1 dropped, 19. Modifier +3. Total 22.",
    );
  });

  it("says a rerolled value was rerolled, not dropped", () => {
    const roll = seededEngine("reroll-1").roll("5d6r2");
    const message = formatEventAnnouncement(roll);
    // Seed "reroll-1" rerolls a 2 and a 1 — the same record the demos play.
    expect(message).toContain("2 rerolled");
    expect(message).toContain("1 rerolled");
    expect(message).not.toContain("dropped");
  });

  it("omits the modifier sentence when the modifier is zero", () => {
    const roll = seededEngine("table-42").roll("1d6");
    const message = formatEventAnnouncement(roll);
    expect(message).not.toContain("Modifier");
    expect(message).toMatch(/^Rolled 1d6\. 1d6: \d\. Total \d\.$/);
  });

  it("spells out negative modifiers", () => {
    const roll = seededEngine("neg").roll("1d6-2");
    expect(formatEventAnnouncement(roll)).toContain("Modifier -2.");
  });

  it("describes coin flips", () => {
    const flip = seededEngine("flip").flipCoin();
    expect(formatEventAnnouncement(flip)).toMatch(/^Coin flip: (heads|tails)\.$/);
  });
});
