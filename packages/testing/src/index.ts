/**
 * Conformance tests for DiceForge plugins.
 *
 * A presenter promises things about itself — the event kinds it accepts, the
 * die sizes it can show, whether it cancels (ADR-0014). This package checks
 * those promises against the implementation, so a third-party renderer can
 * prove it honors the contract instead of hoping it does.
 *
 * It is runner-agnostic: the checks return data, and you assert on it with
 * whatever test framework you already use.
 */

export type {
  ConformanceCheck,
  ConformanceOptions,
  ConformanceReport,
  ConformanceStatus,
  PresenterFactory,
} from "./conformance.js";
export {
  assertPresenterConformance,
  checkPresenterConformance,
  formatConformanceReport,
} from "./conformance.js";
