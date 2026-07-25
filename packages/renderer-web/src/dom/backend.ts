import type { PresentContext, PresenterBackend, VisualCoin, VisualDie } from "../backend.js";
import { topLabel } from "../backend.js";

export type DomBackendOptions = {
  readonly container: HTMLElement;
  readonly dieColor: string;
  readonly labelColor: string;
};

const ENTER_MS = 320;

function abortError(): Error {
  const error = new Error("presentation aborted");
  error.name = "AbortError";
  return error;
}

/**
 * No-WebGL fallback: renders each die as a labeled tile. Fully functional in
 * any DOM environment, honors reduced motion by skipping the entry
 * transition, and keeps dropped dice visible but dimmed.
 */
export function createDomBackend(options: DomBackendOptions): PresenterBackend {
  const { container, dieColor, labelColor } = options;
  const doc = container.ownerDocument;
  const root = doc.createElement("div");
  root.dataset.diceforge = "dom-presenter";
  Object.assign(root.style, {
    display: "flex",
    flexWrap: "wrap",
    gap: "12px",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "120px",
    padding: "16px",
  });
  container.append(root);

  function makeTile(label: string, caption: string, kept: boolean, round: boolean): HTMLElement {
    const tile = doc.createElement("div");
    tile.dataset.diceforge = "die";
    if (!kept) {
      tile.dataset.dropped = "true";
      tile.title = "dropped";
    }
    Object.assign(tile.style, {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      width: "64px",
      height: "64px",
      borderRadius: round ? "50%" : "14px",
      background: dieColor,
      color: labelColor,
      fontFamily: "system-ui, sans-serif",
      fontWeight: "700",
      opacity: kept ? "1" : "0.4",
    });
    const value = doc.createElement("div");
    value.dataset.diceforge = "die-value";
    value.textContent = label;
    value.style.fontSize = "22px";
    const kind = doc.createElement("div");
    kind.dataset.diceforge = "die-kind";
    kind.textContent = caption;
    kind.style.fontSize = "10px";
    kind.style.opacity = "0.75";
    tile.append(value, kind);
    return tile;
  }

  async function show(tiles: readonly HTMLElement[], context: PresentContext): Promise<void> {
    if (context.signal?.aborted) throw abortError();
    root.replaceChildren(...tiles);
    if (context.motion === "animate") {
      for (const tile of tiles) {
        tile.style.transition = `transform ${ENTER_MS}ms ease-out, opacity ${ENTER_MS}ms ease-out`;
        tile.style.transform = "scale(0.4)";
      }
      // Next macrotask lets the initial transform apply before transitioning.
      await new Promise((resolve) => setTimeout(resolve, 20));
      for (const tile of tiles) {
        tile.style.transform = "scale(1)";
      }
      await new Promise((resolve) => setTimeout(resolve, ENTER_MS));
    }
    if (context.signal?.aborted) throw abortError();
  }

  return {
    presentDice(dice, context) {
      const tiles = dice.map((die: VisualDie) =>
        makeTile(topLabel(die), `d${die.shape}`, die.kept, false),
      );
      return show(tiles, context);
    },
    presentCoin(coin: VisualCoin, context) {
      return show([makeTile(coin.outcome === "heads" ? "H" : "T", "coin", true, true)], context);
    },
    dispose() {
      root.remove();
    },
  };
}
