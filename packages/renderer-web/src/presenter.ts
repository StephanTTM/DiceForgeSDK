import type { InteractionPresenter, PresentationOptions } from "@diceforge/core";
import { DiceForgeError, validateEventRecord } from "@diceforge/core";
import { createAnnouncer, formatEventAnnouncement } from "./announce.js";
import type { PresentContext } from "./backend.js";
import { visualDiceForEvent } from "./backend.js";
import type { MotionPreference, RenderMode, RenderModePreference } from "./capabilities.js";
import { resolveMotion, resolveRenderMode } from "./capabilities.js";
import { createDomBackend } from "./dom/backend.js";
import { createWebglBackend } from "./webgl/backend.js";

export type DicePresenterOptions = {
  /** Element the presenter renders into. */
  readonly container: HTMLElement;
  /** "auto" (default) picks WebGL when available, otherwise the DOM fallback. */
  readonly renderMode?: RenderModePreference;
  /** "auto" (default) honors the platform's prefers-reduced-motion setting. */
  readonly reducedMotion?: MotionPreference;
  /** Maintain an aria-live region announcing results. Default true. */
  readonly announceResults?: boolean;
  /** Presentation colors; sensible dark-die defaults apply. */
  readonly colors?: { readonly die?: string; readonly label?: string };
};

export type DicePresenter = InteractionPresenter & {
  /** The backend actually in use after capability detection. */
  readonly mode: RenderMode;
  dispose(): void;
};

/**
 * Creates a browser presenter for resolved DiceForge events. The presenter
 * validates each record, renders 3D dice (or labeled tiles without WebGL)
 * that always land on the recorded outcome, and announces results via an
 * aria-live region. It never modifies the event.
 */
export function createDicePresenter(options: DicePresenterOptions): DicePresenter {
  const container = options.container;
  if (!container || typeof container.appendChild !== "function") {
    throw new DiceForgeError("invalid-argument", "container must be an HTMLElement");
  }
  const doc = container.ownerDocument;
  const mode = resolveRenderMode(options.renderMode ?? "auto", doc);
  const dieColor = options.colors?.die ?? "#2b2d42";
  const labelColor = options.colors?.label ?? "#f8f9fa";
  const backend =
    mode === "webgl"
      ? createWebglBackend({ container, dieColor, labelColor })
      : createDomBackend({ container, dieColor, labelColor });
  const announcer = options.announceResults === false ? undefined : createAnnouncer(container);
  let disposed = false;
  return {
    mode,
    async present(event, presentationOptions?: PresentationOptions) {
      if (disposed) {
        throw new DiceForgeError("invalid-argument", "presenter has been disposed");
      }
      // Defensive validation keeps plain-JS consumers honest and guarantees
      // the record is internally consistent before it is shown.
      const record = validateEventRecord(event);
      const context: PresentContext = {
        motion: resolveMotion(options.reducedMotion ?? "auto", doc.defaultView ?? globalThis),
        signal: presentationOptions?.signal,
      };
      if (record.kind === "coin-flip") {
        await backend.presentCoin({ outcome: record.outcome }, context);
      } else {
        await backend.presentDice(visualDiceForEvent(record), context);
      }
      announcer?.announce(formatEventAnnouncement(record));
    },
    dispose() {
      disposed = true;
      backend.dispose();
      announcer?.dispose();
    },
  };
}
