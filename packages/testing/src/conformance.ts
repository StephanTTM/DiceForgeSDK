import type {
  AbortSignalLike,
  DieSides,
  InteractionKind,
  InteractionPresenter,
} from "@diceforge-sdk/core";
import {
  createDiceEngine,
  createSeededRandomSource,
  DIE_SIDES,
  serializeEvent,
} from "@diceforge-sdk/core";

export type ConformanceStatus = "passed" | "failed" | "skipped";

export type ConformanceCheck = {
  /** Stable identifier, safe to allowlist or filter on. */
  readonly id: string;
  /** What the check asserts, in one line. */
  readonly title: string;
  readonly status: ConformanceStatus;
  /** Why it failed, or why it did not apply. */
  readonly detail?: string;
};

export type ConformanceReport = {
  /** As declared by the presenter under test. */
  readonly implementation: string;
  readonly passed: boolean;
  readonly checks: readonly ConformanceCheck[];
  readonly failures: readonly ConformanceCheck[];
};

/**
 * Builds a presenter to test. Called once per check and disposed afterwards,
 * so each check starts from a clean instance.
 *
 * Configure the presenter here as an application would — including anything
 * that makes it quick, such as reduced motion. The kit does not know your
 * options and will not guess at them.
 */
export type PresenterFactory = () => InteractionPresenter | Promise<InteractionPresenter>;

export type ConformanceOptions = {
  /** Seed for the events the kit rolls, so a failure reproduces. Default "conformance". */
  readonly seed?: string;
  /** Milliseconds a single presentation may take before it counts as hung. Default 10000. */
  readonly timeoutMs?: number;
};

/** A signal that is already aborted, without depending on a platform AbortController. */
const ABORTED: AbortSignalLike = {
  aborted: true,
  addEventListener: () => {},
  removeEventListener: () => {},
};

const KNOWN_KINDS: readonly InteractionKind[] = ["roll", "coin-flip"];
const KNOWN_MEDIA = ["3d", "2d", "none"];

function fail(id: string, title: string, detail: string): ConformanceCheck {
  return { id, title, status: "failed", detail };
}

function pass(id: string, title: string): ConformanceCheck {
  return { id, title, status: "passed" };
}

function skip(id: string, title: string, detail: string): ConformanceCheck {
  return { id, title, status: "skipped", detail };
}

function describeError(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return String(error);
}

/** Rejects rather than hanging forever on a presenter that never settles. */
async function within<T>(work: Promise<T>, timeoutMs: number, what: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`${what} did not settle in ${timeoutMs}ms`)),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/**
 * Runs `work` against a fresh presenter and disposes it afterwards, whatever
 * happens — a leaked WebGL context would poison every later check.
 */
async function withPresenter<T>(
  factory: PresenterFactory,
  work: (presenter: InteractionPresenter) => Promise<T>,
): Promise<T> {
  const presenter = await factory();
  try {
    return await work(presenter);
  } finally {
    try {
      presenter.dispose?.();
    } catch {
      // Cleanup is best-effort here. A dispose() that throws is a real defect,
      // but it belongs to the dispose check — letting it escape would blame
      // whichever check happened to run first, or abandon the run entirely.
    }
  }
}

function checkCapabilityShape(presenter: InteractionPresenter): ConformanceCheck[] {
  const id = "capabilities";
  const capabilities = presenter.capabilities;
  const checks: ConformanceCheck[] = [];

  const title = "declares a well-formed capability record";
  if (!capabilities || typeof capabilities !== "object") {
    return [fail(id, title, "presenter.capabilities is missing")];
  }
  const problems: string[] = [];
  if (typeof capabilities.implementation !== "string" || capabilities.implementation.length === 0) {
    problems.push("implementation must be a non-empty string");
  }
  for (const flag of ["cancellable", "announces", "honorsReducedMotion"] as const) {
    if (typeof capabilities[flag] !== "boolean") problems.push(`${flag} must be a boolean`);
  }
  checks.push(problems.length === 0 ? pass(id, title) : fail(id, title, problems.join("; ")));

  checks.push(
    listCheck(
      "capabilities-kinds",
      "declares at least one known event kind",
      capabilities.kinds,
      (kind) => (KNOWN_KINDS.includes(kind) ? undefined : `unknown kind ${JSON.stringify(kind)}`),
    ),
  );
  checks.push(
    listCheck(
      "capabilities-die-sides",
      "declares die sizes the core can resolve",
      capabilities.dieSides,
      (sides) =>
        DIE_SIDES.includes(sides) ? undefined : `d${sides} is not a size the core resolves`,
    ),
  );
  checks.push(
    listCheck(
      "capabilities-media",
      "declares at least one presentation medium",
      capabilities.media,
      (medium) =>
        KNOWN_MEDIA.includes(medium) ? undefined : `unknown medium ${JSON.stringify(medium)}`,
    ),
  );
  return checks;
}

/** Shared shape for the three list-valued capability fields. */
function listCheck<T>(
  id: string,
  title: string,
  values: readonly T[] | undefined,
  validate: (value: T) => string | undefined,
): ConformanceCheck {
  if (!Array.isArray(values) || values.length === 0) {
    return fail(id, title, "must be a non-empty array");
  }
  const problems = values
    .map(validate)
    .filter((problem): problem is string => problem !== undefined);
  if (new Set(values).size !== values.length) problems.push("contains duplicates");
  return problems.length === 0 ? pass(id, title) : fail(id, title, problems.join("; "));
}

/**
 * Checks a presenter against the `InteractionPresenter` contract (ADR-0008,
 * ADR-0014). It verifies the promises a presenter makes about itself: that its
 * declared kinds and die sizes really present, that presenting leaves the
 * resolved record untouched, and that it cancels if it says it cancels.
 *
 * It cannot check what only a human can see — whether the die that landed
 * shows the recorded face, or whether motion honors a reduced-motion setting.
 * Those stay the implementation's own tests; this covers the contract.
 */
export async function checkPresenterConformance(
  factory: PresenterFactory,
  options: ConformanceOptions = {},
): Promise<ConformanceReport> {
  const timeoutMs = options.timeoutMs ?? 10_000;
  const seed = options.seed ?? "conformance";
  const newEngine = () => createDiceEngine({ random: createSeededRandomSource(seed) });

  const capabilities = await withPresenter(factory, async (presenter) => presenter.capabilities);
  const checks: ConformanceCheck[] = await withPresenter(factory, async (presenter) =>
    checkCapabilityShape(presenter),
  );

  const kinds: readonly InteractionKind[] = Array.isArray(capabilities?.kinds)
    ? capabilities.kinds
    : [];
  const dieSides: readonly DieSides[] = Array.isArray(capabilities?.dieSides)
    ? capabilities.dieSides
    : [];

  // Every declared kind must actually present. A declaration is a promise.
  for (const kind of kinds) {
    const id = `presents-${kind}`;
    const title = `presents the ${kind} events it declares`;
    try {
      await withPresenter(factory, async (presenter) => {
        const engine = newEngine();
        const event =
          kind === "coin-flip" ? engine.flipCoin() : engine.roll(`1d${dieSides[0] ?? 20}`);
        await within(presenter.present(event), timeoutMs, `present(${kind})`);
      });
      checks.push(pass(id, title));
    } catch (error) {
      checks.push(fail(id, title, describeError(error)));
    }
  }

  if (kinds.includes("roll")) {
    const id = "presents-declared-die-sides";
    const title = "presents every die size it declares";
    const broken: string[] = [];
    for (const sides of dieSides) {
      try {
        await withPresenter(factory, async (presenter) => {
          await within(
            presenter.present(newEngine().roll(`1d${sides}`)),
            timeoutMs,
            `present(d${sides})`,
          );
        });
      } catch (error) {
        broken.push(`d${sides}: ${describeError(error)}`);
      }
    }
    checks.push(broken.length === 0 ? pass(id, title) : fail(id, title, broken.join("; ")));
  }

  // The rule the whole architecture rests on: presentation consumes the
  // outcome, it never decides or edits it.
  {
    const id = "leaves-the-record-unchanged";
    const title = "does not modify the event it is given";
    try {
      await withPresenter(factory, async (presenter) => {
        const event = kinds.includes("roll")
          ? newEngine().roll(`2d${dieSides[0] ?? 20}kh1`)
          : newEngine().flipCoin();
        const before = serializeEvent(event);
        await within(presenter.present(event), timeoutMs, "present");
        const after = serializeEvent(event);
        if (before !== after) {
          throw new Error(
            `record changed during presentation:\n  before ${before}\n  after  ${after}`,
          );
        }
      });
      checks.push(pass(id, title));
    } catch (error) {
      checks.push(fail(id, title, describeError(error)));
    }
  }

  {
    const id = "cancels-when-declared";
    const title = "rejects an already-aborted presentation";
    if (!capabilities?.cancellable) {
      checks.push(skip(id, title, "capabilities.cancellable is false"));
    } else {
      try {
        await withPresenter(factory, async (presenter) => {
          const event = kinds.includes("roll") ? newEngine().roll("1d6") : newEngine().flipCoin();
          const result = await within(
            presenter.present(event, { signal: ABORTED }).then(
              () => "resolved" as const,
              () => "rejected" as const,
            ),
            timeoutMs,
            "present(aborted)",
          );
          if (result === "resolved") {
            throw new Error("present() resolved despite an aborted signal");
          }
        });
        checks.push(pass(id, title));
      } catch (error) {
        checks.push(fail(id, title, describeError(error)));
      }
    }
  }

  {
    const id = "dispose-is-idempotent";
    const title = "can be disposed twice without throwing";
    const presenter = await factory();
    if (!presenter.dispose) {
      checks.push(skip(id, title, "presenter does not implement dispose()"));
    } else {
      try {
        presenter.dispose();
        presenter.dispose();
        checks.push(pass(id, title));
      } catch (error) {
        checks.push(fail(id, title, describeError(error)));
      }
    }
  }

  const failures = checks.filter((check) => check.status === "failed");
  return {
    implementation: capabilities?.implementation ?? "unknown presenter",
    passed: failures.length === 0,
    checks,
    failures,
  };
}

/** Renders a report for a test runner's output or a CI log. */
export function formatConformanceReport(report: ConformanceReport): string {
  const mark = { passed: "PASS", failed: "FAIL", skipped: "SKIP" } as const;
  const lines = report.checks.map((check) => {
    const head = `  ${mark[check.status]}  ${check.title}`;
    return check.detail ? `${head}\n        ${check.detail}` : head;
  });
  const summary = report.passed
    ? "conforms to the presenter contract"
    : `${report.failures.length} contract failure(s)`;
  return [`${report.implementation}: ${summary}`, ...lines].join("\n");
}

/**
 * Runs the suite and throws a formatted error if anything failed, so a single
 * line is enough in whatever test runner you use:
 *
 * ```ts
 * it("conforms to the presenter contract", async () => {
 *   await assertPresenterConformance(() => createMyPresenter({ container }));
 * });
 * ```
 */
export async function assertPresenterConformance(
  factory: PresenterFactory,
  options: ConformanceOptions = {},
): Promise<ConformanceReport> {
  const report = await checkPresenterConformance(factory, options);
  if (!report.passed) throw new Error(formatConformanceReport(report));
  return report;
}
