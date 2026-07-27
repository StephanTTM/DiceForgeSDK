import type {
  InteractionEvent,
  InteractionPresenter,
  PresenterCapabilities,
} from "@diceforge-sdk/core";
import { describe, expect, it } from "vitest";
import {
  assertPresenterConformance,
  checkPresenterConformance,
  formatConformanceReport,
} from "./index.js";

const CAPABLE: PresenterCapabilities = {
  implementation: "test/well-behaved",
  kinds: ["roll", "coin-flip"],
  dieSides: [4, 6, 8, 10, 12, 20, 100],
  media: ["2d"],
  cancellable: true,
  announces: false,
  honorsReducedMotion: false,
};

type StubOptions = {
  readonly capabilities?: Partial<PresenterCapabilities>;
  /** Called instead of the well-behaved present(). */
  readonly present?: (event: InteractionEvent) => Promise<void>;
  readonly dispose?: (() => void) | null;
};

/** A presenter that honors everything it declares, unless told otherwise. */
function stub(options: StubOptions = {}): InteractionPresenter {
  const capabilities = { ...CAPABLE, ...options.capabilities };
  const presenter: InteractionPresenter = {
    capabilities,
    async present(event, presentationOptions) {
      if (options.present) return options.present(event);
      if (presentationOptions?.signal?.aborted) {
        const error = new Error("aborted");
        error.name = "AbortError";
        throw error;
      }
    },
  };
  if (options.dispose === null) return presenter;
  return { ...presenter, dispose: options.dispose ?? (() => {}) };
}

function checkById(report: Awaited<ReturnType<typeof checkPresenterConformance>>, id: string) {
  const check = report.checks.find((candidate) => candidate.id === id);
  if (!check)
    throw new Error(`no check with id ${id}; got ${report.checks.map((c) => c.id).join(", ")}`);
  return check;
}

describe("checkPresenterConformance", () => {
  it("passes a presenter that honors what it declares", async () => {
    const report = await checkPresenterConformance(() => stub());
    expect(report.failures, formatConformanceReport(report)).toEqual([]);
    expect(report.passed).toBe(true);
    expect(report.implementation).toBe("test/well-behaved");
  });

  it("builds a fresh presenter for every check", async () => {
    let built = 0;
    await checkPresenterConformance(() => {
      built += 1;
      return stub();
    });
    // Exact count is not the contract; independence is.
    expect(built).toBeGreaterThan(1);
  });

  /**
   * The kit is only worth having if it catches violations, so each of these
   * breaks one promise and expects that promise's check to fail.
   */
  it("catches a die size that is declared but cannot be presented", async () => {
    const report = await checkPresenterConformance(() =>
      stub({
        present: async (event) => {
          if (event.kind === "roll" && event.groups.some((group) => group.sides === 12)) {
            throw new Error("no d12 model");
          }
        },
      }),
    );
    const check = checkById(report, "presents-declared-die-sides");
    expect(check.status).toBe("failed");
    expect(check.detail).toContain("d12");
    expect(report.passed).toBe(false);
  });

  it("catches a presenter that edits the record it was given", async () => {
    const report = await checkPresenterConformance(() =>
      stub({
        present: async (event) => {
          // The one thing presentation may never do (architecture rule 5).
          (event as { total: number }).total = 999;
        },
      }),
    );
    const check = checkById(report, "leaves-the-record-unchanged");
    expect(check.status).toBe("failed");
    expect(check.detail).toMatch(/record changed|read only|Cannot assign/i);
  });

  it("catches a presenter that claims cancellation it does not implement", async () => {
    const report = await checkPresenterConformance(() => stub({ present: async () => {} }));
    const check = checkById(report, "cancels-when-declared");
    expect(check.status).toBe("failed");
    expect(check.detail).toContain("aborted signal");
  });

  it("skips cancellation when the presenter does not claim it", async () => {
    const report = await checkPresenterConformance(() =>
      stub({ capabilities: { cancellable: false }, present: async () => {} }),
    );
    expect(checkById(report, "cancels-when-declared").status).toBe("skipped");
    expect(report.passed).toBe(true);
  });

  it("catches a malformed capability record", async () => {
    const report = await checkPresenterConformance(() =>
      stub({ capabilities: { implementation: "", media: [], dieSides: [4, 4] } }),
    );
    expect(checkById(report, "capabilities").status).toBe("failed");
    expect(checkById(report, "capabilities-media").detail).toContain("non-empty");
    expect(checkById(report, "capabilities-die-sides").detail).toContain("duplicates");
  });

  it("catches a die size the core cannot resolve", async () => {
    const report = await checkPresenterConformance(() =>
      stub({ capabilities: { dieSides: [7 as 6] } }),
    );
    expect(checkById(report, "capabilities-die-sides").detail).toContain("d7");
  });

  it("skips the dispose check for a presenter that has none", async () => {
    const report = await checkPresenterConformance(() => stub({ dispose: null }));
    expect(checkById(report, "dispose-is-idempotent").status).toBe("skipped");
    expect(report.passed).toBe(true);
  });

  it("catches a dispose that cannot be called twice", async () => {
    const report = await checkPresenterConformance(() => {
      let disposed = false; // per instance, as a real presenter's would be
      return stub({
        dispose: () => {
          if (disposed) throw new Error("already disposed");
          disposed = true;
        },
      });
    });
    expect(checkById(report, "dispose-is-idempotent").status).toBe("failed");
    expect(checkById(report, "dispose-is-idempotent").detail).toContain("already disposed");
  });

  /**
   * Cleanup runs after every check, so a dispose() that always throws must not
   * take the run down with it — the failure belongs to the dispose check.
   */
  it("still reports when dispose always throws", async () => {
    const report = await checkPresenterConformance(() =>
      stub({
        dispose: () => {
          throw new Error("dispose is broken");
        },
      }),
    );
    expect(checkById(report, "dispose-is-idempotent").status).toBe("failed");
    expect(checkById(report, "presents-roll").status).toBe("passed");
    expect(checkById(report, "leaves-the-record-unchanged").status).toBe("passed");
  });

  it("fails a presentation that never settles instead of hanging", async () => {
    const report = await checkPresenterConformance(
      () => stub({ present: () => new Promise(() => {}) }),
      {
        timeoutMs: 25,
      },
    );
    expect(report.passed).toBe(false);
    expect(checkById(report, "presents-roll").detail).toContain("did not settle");
  });
});

describe("assertPresenterConformance", () => {
  it("returns the report when everything passes", async () => {
    const report = await assertPresenterConformance(() => stub());
    expect(report.passed).toBe(true);
  });

  it("throws a readable summary when something fails", async () => {
    await expect(
      assertPresenterConformance(() => stub({ capabilities: { implementation: "" } })),
    ).rejects.toThrowError(/well-formed capability record/);
  });
});

describe("formatConformanceReport", () => {
  it("names the implementation and marks every check", async () => {
    const report = await checkPresenterConformance(() =>
      stub({ capabilities: { cancellable: false } }),
    );
    const text = formatConformanceReport(report);
    expect(text).toContain("test/well-behaved: conforms to the presenter contract");
    expect(text).toContain("PASS");
    expect(text).toContain("SKIP");
  });
});
