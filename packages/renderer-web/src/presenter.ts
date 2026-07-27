import type {
  InteractionPresenter,
  PresentationOptions,
  PresenterCapabilities,
} from "@diceforge-sdk/core";
import { DIE_SIDES, DiceForgeError, validateEventRecord } from "@diceforge-sdk/core";
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
   * Without one there is nothing to draw in 3D, so the presenter uses tiles
   * and reports `media: ["2d"]`.
   */
  readonly theme?: DiceTheme;
  /** Color overrides; take precedence over the theme's colors. */
  readonly colors?: { readonly die?: string; readonly label?: string };
};

export type DicePresenter = InteractionPresenter & {
  /**
   * The backend actually in use after capability detection. Browser-specific;
   * `capabilities.media` is the portable form of the same answer, and the one
   * to reach for in code that should work against any presenter.
   */
  readonly mode: RenderMode;
  dispose(): void;
};

/**
 * What this presenter can do, given the backend it settled on and whether it
 * announces (ADR-0014). Declared per instance, because the same code
 * configured differently is a different presenter to an application: without a
 * theme there is no 3D, and announcements can be turned off.
 *
 * Every die size is listed whichever mode is active. The tile backend can draw
 * all of them, and it is always available as a fallback — which is precisely
 * what makes a 3D roll safe to attempt. `media` carries the nuance: a WebGL
 * presenter may still show an individual event flat.
 *
 * Exported for tests: a WebGL backend cannot be constructed under jsdom, but
 * the declaration it produces can still be checked.
 */
export function describeCapabilities(mode: RenderMode, announces: boolean): PresenterCapabilities {
  return {
    implementation: "@diceforge-sdk/renderer-web",
    kinds: ["roll", "coin-flip"],
    dieSides: DIE_SIDES,
    media: mode === "webgl" ? ["3d", "2d"] : ["2d"],
    cancellable: true,
    announces,
    honorsReducedMotion: true,
  };
}

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
    capabilities: describeCapabilities(mode, announcer !== undefined),
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
