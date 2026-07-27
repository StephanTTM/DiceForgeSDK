import type { InteractionEvent } from "./records.js";

/**
 * Structural stand-in for the platform `AbortSignal`. Declared locally so the
 * core's type surface needs no DOM or Node library; any real `AbortSignal`
 * satisfies it.
 */
export type AbortSignalLike = {
  readonly aborted: boolean;
  addEventListener(type: "abort", listener: () => void): void;
  removeEventListener(type: "abort", listener: () => void): void;
};

export type PresentationOptions = {
  /** Abort to cancel an in-progress presentation; `present` then rejects. */
  readonly signal?: AbortSignalLike;
};

/** The kinds of event a presenter may be asked to show. */
export type InteractionKind = InteractionEvent["kind"];

/**
 * How an outcome reaches the person: rendered in three dimensions, drawn flat,
 * or not shown at all — `"none"` covers presenters that speak, log, or vibrate
 * rather than draw.
 */
export type PresentationMedium = "3d" | "2d" | "none";

/**
 * What a presenter can do, declared as stable domain data (ADR-0014).
 *
 * Capability discovery exists so an application can ask instead of guess. The
 * alternative is feature-detection against a specific implementation's
 * internals, which turns every renderer into a special case and breaks the
 * moment a second one exists.
 *
 * This describes what the presenter accepts, not what any single event will
 * look like: a presenter may still degrade an individual presentation — to a
 * simpler medium, or after an asset fails to load — as long as it shows the
 * resolved outcome. `media` names every medium it may use for that reason.
 */
export type PresenterCapabilities = {
  /** Stable identifier of the implementation, e.g. `"@diceforge-sdk/renderer-web"`. */
  readonly implementation: string;
  /** Event kinds it accepts. A presenter may support rolls but not coin flips. */
  readonly kinds: readonly InteractionKind[];
  /**
   * Die sizes it can show, in any medium, or `"any"` for a presenter that can
   * show a die of any face count — which a renderer that falls back to text
   * can honestly claim, and a renderer with a fixed set of models cannot
   * (ADR-0015).
   */
  readonly dieSides: readonly number[] | "any";
  /** Media it may use, richest first. Never empty. */
  readonly media: readonly PresentationMedium[];
  /** Honors `PresentationOptions.signal`: an aborted presentation rejects. */
  readonly cancellable: boolean;
  /** Announces outcomes to assistive technology. */
  readonly announces: boolean;
  /** Adapts to a platform reduced-motion preference. */
  readonly honorsReducedMotion: boolean;
};

/** Why a presenter cannot show an event. */
export type PresentationUnsupportedReason = "unsupported-kind" | "unsupported-die-sides";

export type PresentationSupport =
  | { readonly supported: true }
  | {
      readonly supported: false;
      readonly reason: PresentationUnsupportedReason;
      /** Human-readable explanation; wording is not API. */
      readonly message: string;
      /** The sizes at fault, when the reason is `"unsupported-die-sides"`. */
      readonly dieSides?: readonly number[];
    };

/**
 * Answers whether a presenter's declared capabilities cover an event, using
 * only domain data — no renderer, no DOM, no I/O. An application can call it
 * before presenting; a conformance suite can call it to check that a plugin's
 * declaration matches its behavior.
 *
 * A `true` answer means the presenter accepts the event, not that the result
 * will be drawn in the richest medium: declared support is a floor, and
 * runtime conditions may still push a presentation to a simpler one.
 */
export function presentationSupport(
  capabilities: PresenterCapabilities,
  event: InteractionEvent,
): PresentationSupport {
  if (!capabilities.kinds.includes(event.kind)) {
    return {
      supported: false,
      reason: "unsupported-kind",
      message: `${capabilities.implementation} cannot present a ${event.kind} event`,
    };
  }
  const shown = capabilities.dieSides;
  if (event.kind === "roll" && shown !== "any") {
    const missing = new Set<number>();
    for (const group of event.groups) {
      if (!shown.includes(group.sides)) missing.add(group.sides);
    }
    if (missing.size > 0) {
      const sides = [...missing].sort((a, b) => a - b);
      return {
        supported: false,
        reason: "unsupported-die-sides",
        message: `${capabilities.implementation} cannot present d${sides.join(", d")}`,
        dieSides: sides,
      };
    }
  }
  return { supported: true };
}

/**
 * Contract every presentation plugin implements (ADR-0008, ADR-0014). A
 * presenter maps an already-resolved event record to visuals, motion, audio,
 * or haptics. It must never decide or modify the outcome: the record is the
 * authority, and a failed or cancelled presentation does not invalidate the
 * resolved event.
 *
 * Implementations live in renderer and adapter packages such as
 * `@diceforge-sdk/renderer-web`; the core holds only the contract and the pure
 * checks over it, so it stays platform-free.
 */
export interface InteractionPresenter {
  /**
   * What this instance can do. Declared per instance, not per implementation:
   * the same renderer configured differently — no 3D theme, announcements
   * turned off — reports different capabilities.
   */
  readonly capabilities: PresenterCapabilities;
  /** Resolves when the presentation has finished (or been skipped). */
  present(event: InteractionEvent, options?: PresentationOptions): Promise<void>;
  /** Releases any resources the presenter holds (DOM nodes, GPU contexts). */
  dispose?(): void;
}
