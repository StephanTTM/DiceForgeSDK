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

/**
 * Contract every presentation plugin implements (ADR-0008). A presenter maps
 * an already-resolved event record to visuals, motion, audio, or haptics. It
 * must never decide or modify the outcome: the record is the authority, and a
 * failed or cancelled presentation does not invalidate the resolved event.
 *
 * This contract is type-only in the core; implementations live in renderer
 * and adapter packages such as `@diceforge-sdk/renderer-web`.
 */
export interface InteractionPresenter {
  /** Resolves when the presentation has finished (or been skipped). */
  present(event: InteractionEvent, options?: PresentationOptions): Promise<void>;
  /** Releases any resources the presenter holds (DOM nodes, GPU contexts). */
  dispose?(): void;
}
