// @vitest-environment jsdom
import { assertPresenterConformance, formatConformanceReport } from "@diceforge-sdk/testing";
import { describe, expect, it } from "vitest";
import { createDicePresenter } from "./presenter.js";

/**
 * The web presenter run through the same conformance kit a third-party
 * renderer would use (ADR-0014). It is the kit's first real consumer: if the
 * checks are wrong, or the contract is not implementable, this is where that
 * shows up rather than in someone else's project.
 */
describe("@diceforge-sdk/renderer-web conformance", () => {
  function presenter() {
    const container = document.createElement("div");
    document.body.append(container);
    // Reduced motion keeps the suite quick; the contract is the same either way.
    return createDicePresenter({ container, reducedMotion: "reduce" });
  }

  it("honors the presenter contract it declares", async () => {
    const report = await assertPresenterConformance(presenter);
    expect(report.implementation).toBe("@diceforge-sdk/renderer-web");
    expect(report.checks.filter((check) => check.status === "failed")).toEqual([]);
  });

  it("passes every check rather than skipping its way to a pass", async () => {
    const report = await assertPresenterConformance(presenter);
    const skipped = report.checks.filter((check) => check.status === "skipped");
    expect(skipped, formatConformanceReport(report)).toEqual([]);
  });
});
