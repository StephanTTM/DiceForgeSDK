import type { InteractionPresenter, PresentationOptions } from "@diceforge-sdk/core";
import { DiceForgeError, validateEventRecord } from "@diceforge-sdk/core";
import { createAnnouncer, formatEventAnnouncement } from "./announce.js";
import type { PresentContext, PresenterBackend } from "./backend.js";
import { visualDiceForEvent } from "./backend.js";
import type { MotionPreference, RenderMode, RenderModePreference } from "./capabilities.js";
import { resolveMotion, resolveRenderMode } from "./capabilities.js";
import { createDomBackend } from "./dom/backend.js";
import type { DiceTheme } from "./theme.js";
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
  /**
   * Theme: colors plus optional lazily-loaded 3D models (WebGL mode only).
   * Shapes without a calibrated model always render procedurally.
   */
  readonly theme?: DiceTheme;
  /** Color overrides; take precedence over the theme's colors. */
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
  // 3D needs both WebGL and a theme to draw with: this package ships code, not
  // art (ADR-0010), so without a theme there is nothing to render in 3D.
  const wanted = resolveRenderMode(options.renderMode ?? "auto", doc);
  const mode: RenderMode = wanted === "webgl" && options.theme?.models ? "webgl" : "dom";
  // Light body with dark numerals: the classic dice look, and legible small.
  const dieColor = options.colors?.die ?? options.theme?.colors.die ?? "#edf0f5";
  const labelColor = options.colors?.label ?? options.theme?.colors.label ?? "#1d2230";

  const webgl =
    mode === "webgl"
      ? createWebglBackend({
          container,
          models: options.theme?.models,
          coin: options.theme?.coin,
        })
      : undefined;
  // Created on demand: it is the fallback when the theme cannot draw a roll.
  let dom: PresenterBackend | undefined =
    mode === "dom" ? createDomBackend({ container, dieColor, labelColor }) : undefined;
  const tiles = (): PresenterBackend => {
    dom ??= createDomBackend({ container, dieColor, labelColor });
    return dom;
  };

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
      const draw = (backend: PresenterBackend): Promise<boolean> =>
        record.kind === "coin-flip"
          ? backend.presentCoin({ outcome: record.outcome }, context)
          : backend.presentDice(visualDiceForEvent(record), context);

      // A themed roll the models cannot cover falls back to tiles for the whole
      // event, so a resolved die is never simply missing from the table.
      let drawn = webgl ? await draw(webgl) : false;
      if (drawn) {
        dom?.setVisible(false);
      } else {
        const fallback = tiles();
        webgl?.setVisible(false);
        fallback.setVisible(true);
        drawn = await draw(fallback);
      }
      announcer?.announce(formatEventAnnouncement(record));
    },
    dispose() {
      disposed = true;
      webgl?.dispose();
      dom?.dispose();
      announcer?.dispose();
    },
  };
}
