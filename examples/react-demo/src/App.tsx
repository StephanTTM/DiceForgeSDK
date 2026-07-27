import { forgeAssets } from "@diceforge-sdk/assets-forge";
import type { DiceEngine, InteractionEvent } from "@diceforge-sdk/core";
import { createDiceEngine, createSeededRandomSource, DiceForgeError } from "@diceforge-sdk/core";
import type { DicePresenter } from "@diceforge-sdk/renderer-web";
import {
  createDicePresenter,
  forgeTheme,
  formatEventAnnouncement,
} from "@diceforge-sdk/renderer-web";
import { useEffect, useMemo, useRef, useState } from "react";

/**
 * Owns a DicePresenter for the lifetime of the component. Creating in the
 * effect and disposing in its cleanup is the whole integration contract —
 * StrictMode's double-invoke simply creates and disposes twice, safely.
 */
function useDicePresenter(): {
  containerRef: React.RefObject<HTMLDivElement | null>;
  presenterRef: React.RefObject<DicePresenter | null>;
} {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const presenterRef = useRef<DicePresenter | null>(null);
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    // The installed die set is the whole 3D setup: no copying, no hosting, and
    // no paths to configure. Drop the theme and the presenter shows 2D tiles.
    const presenter = createDicePresenter({
      container,
      theme: forgeTheme(forgeAssets({ color: "blue" })),
    });
    presenterRef.current = presenter;
    return () => {
      presenterRef.current = null;
      presenter.dispose();
    };
  }, []);
  return { containerRef, presenterRef };
}

export function App(): React.JSX.Element {
  const [notation, setNotation] = useState("2d20kh1+3");
  const [seed, setSeed] = useState("");
  const [message, setMessage] = useState("Roll to get started.");
  const [busy, setBusy] = useState(false);
  const { containerRef, presenterRef } = useDicePresenter();

  // One engine per seed value: rolls advance the reproducible sequence, and
  // changing the seed restarts it. The engine is headless domain logic —
  // resolving outcomes never touches the presenter.
  const engine: DiceEngine = useMemo(
    () =>
      seed ? createDiceEngine({ random: createSeededRandomSource(seed) }) : createDiceEngine(),
    [seed],
  );

  async function present(event: InteractionEvent): Promise<void> {
    setBusy(true);
    setMessage(formatEventAnnouncement(event));
    try {
      await presenterRef.current?.present(event);
    } finally {
      setBusy(false);
    }
  }

  async function handleRoll(): Promise<void> {
    try {
      await present(engine.roll(notation));
    } catch (error) {
      if (error instanceof DiceForgeError) setMessage(error.message);
      else throw error;
    }
  }

  return (
    <main>
      <h1 style={{ fontSize: "1.4rem" }}>DiceForge + React</h1>
      <p style={{ fontSize: "0.85rem", opacity: 0.75 }}>
        The core resolves each outcome headlessly; the presenter animates the resolved record inside
        a ref&apos;d container owned by an effect.
      </p>
      <div
        style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "end", marginBottom: 12 }}
      >
        <label style={{ display: "flex", flexDirection: "column", fontSize: "0.8rem", gap: 4 }}>
          Notation
          <input value={notation} onChange={(e) => setNotation(e.target.value)} size={14} />
        </label>
        <label style={{ display: "flex", flexDirection: "column", fontSize: "0.8rem", gap: 4 }}>
          Seed (optional)
          <input
            value={seed}
            onChange={(e) => setSeed(e.target.value)}
            placeholder="table-42"
            size={10}
          />
        </label>
        <button type="button" onClick={() => void handleRoll()} disabled={busy}>
          Roll
        </button>
        <button type="button" onClick={() => void present(engine.flipCoin())} disabled={busy}>
          Flip coin
        </button>
      </div>
      <div
        ref={containerRef}
        style={{
          position: "relative",
          height: 320,
          border: "1px solid color-mix(in srgb, currentColor 25%, transparent)",
          borderRadius: 12,
          overflow: "hidden",
        }}
      />
      <p style={{ minHeight: "1.5em", fontWeight: 600 }} data-testid="status">
        {message}
      </p>
    </main>
  );
}
