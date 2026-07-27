// @vitest-environment jsdom
import { createDiceEngine, createSeededRandomSource } from "@diceforge-sdk/core";
import { assertPresenterConformance, formatConformanceReport } from "@diceforge-sdk/testing";
import { describe, expect, it } from "vitest";
import { createPhysicsPresenter } from "./playback.js";

/**
 * The physics presenter run through the same conformance suite a third-party
 * renderer would use — and the first time that suite has been pointed at
 * something it was not designed around (ADR-0014).
 *
 * jsdom has no WebGL, so everything here goes down the delegation path. That
 * is the point: a presenter must honour its contract even when it cannot do
 * the thing it exists for.
 */
describe("@diceforge-sdk/presenter-physics conformance", () => {
  function presenter() {
    const container = document.createElement("div");
    document.body.append(container);
    return createPhysicsPresenter({ container, reducedMotion: "reduce" });
  }

  it("honours the presenter contract", async () => {
    const report = await assertPresenterConformance(presenter);
    expect(report.implementation).toBe("@diceforge-sdk/presenter-physics");
    expect(report.checks.filter((check) => check.status === "failed")).toEqual([]);
  });

  it("passes every check rather than skipping its way to a pass", async () => {
    const report = await assertPresenterConformance(presenter);
    expect(
      report.checks.filter((c) => c.status === "skipped"),
      formatConformanceReport(report),
    ).toEqual([]);
  });

  it("delegates to tiles without WebGL, and says so", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const physics = createPhysicsPresenter({ container, reducedMotion: "reduce" });
    const engine = createDiceEngine({ random: createSeededRandomSource("fallback") });

    expect(physics.capabilities.media).toEqual(["2d"]);
    await physics.present(engine.roll("2d20kh1"));
    const tiles = container.querySelectorAll('[data-diceforge="die-value"]');
    expect(tiles).toHaveLength(2);
    physics.dispose();
  });

  it("announces the result exactly once, however it was drawn", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const physics = createPhysicsPresenter({ container, reducedMotion: "reduce" });
    const engine = createDiceEngine({ random: createSeededRandomSource("table-42") });

    await physics.present(engine.roll("2d20kh1+3"));
    const regions = [...container.querySelectorAll("[aria-live]")].filter(
      (node) => (node.textContent ?? "").length > 0,
    );
    expect(regions).toHaveLength(1);
    expect(regions[0]?.textContent).toBe(
      "Rolled 2d20kh1+3. 2d20kh1: 1 dropped, 19. Modifier +3. Total 22.",
    );
    physics.dispose();
  });

  it("cleans up both its own output and the delegate's", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const physics = createPhysicsPresenter({ container });
    physics.dispose();
    expect(container.querySelector('[data-diceforge="physics-presenter"]')).toBeNull();
    expect(container.querySelector('[data-diceforge="physics-announcer"]')).toBeNull();
    expect(container.querySelector('[data-diceforge="dom-presenter"]')).toBeNull();
  });
});
