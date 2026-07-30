import { forgeAssets } from "@diceforge-sdk/assets-forge";
import type {
  DiceEngine,
  InteractionEvent,
  InteractionPresenter,
  PresenterCapabilities,
} from "@diceforge-sdk/core";
import { createDiceEngine, createSeededRandomSource, DiceForgeError } from "@diceforge-sdk/core";
import { createPhysicsPresenter } from "@diceforge-sdk/presenter-physics";
import {
  createDicePresenter,
  forgeTheme,
  formatEventAnnouncement,
} from "@diceforge-sdk/renderer-web";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/** Which presenter draws the roll. Both satisfy the same core contract. */
type Backend = "webgl" | "physics";

/**
 * Owns a presenter for as long as the chosen backend stays the same. Creating
 * in the effect and disposing in its cleanup is the whole integration contract:
 * StrictMode's double-invoke simply creates and disposes twice, safely, and
 * changing backend disposes the old presenter before the new one is built.
 *
 * The abort controller is the other half. A presentation may still be running
 * when the effect is torn down — the player switched backend mid-roll, or
 * navigated away — and `present(event, { signal })` is how the contract says to
 * stop it (ADR-0008). Cancelling explicitly beats relying on `dispose()` to
 * clean up a presentation it was never told about.
 */
function usePresenter(
  backend: Backend,
  sound: boolean,
): {
  containerRef: React.RefObject<HTMLDivElement | null>;
  present: (event: InteractionEvent) => Promise<void>;
  capabilities: PresenterCapabilities | undefined;
} {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const presenterRef = useRef<InteractionPresenter | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [capabilities, setCapabilities] = useState<PresenterCapabilities | undefined>(undefined);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    // The installed die set is the whole 3D setup: no copying, no hosting, and
    // no paths to configure. Drop the theme and either presenter shows tiles.
    const theme = forgeTheme(forgeAssets({ color: "blue" }));
    // Dice tumble under simulation and still land on the resolved face, because
    // each one's mesh is rotated inside its collider first (ADR-0018). Coins and
    // unmodelled dice fall through to the renderer, so the buttons keep working.
    const presenter: InteractionPresenter =
      backend === "physics"
        ? // Knocks derived from the recording's own collisions (ADR-0020).
          createPhysicsPresenter({ container, theme, sound })
        : createDicePresenter({ container, theme });
    const controller = new AbortController();
    presenterRef.current = presenter;
    abortRef.current = controller;
    setCapabilities(presenter.capabilities);
    return () => {
      presenterRef.current = null;
      abortRef.current = null;
      controller.abort();
      presenter.dispose?.();
    };
  }, [backend, sound]);

  const present = useCallback(async (event: InteractionEvent): Promise<void> => {
    const presenter = presenterRef.current;
    const signal = abortRef.current?.signal;
    if (!presenter) return;
    try {
      await presenter.present(event, signal ? { signal } : {});
    } catch (error) {
      // The outcome was resolved and recorded before any of this ran, so an
      // interrupted presentation is not a failed roll — there is nothing to
      // report and nothing to retry.
      if ((error as Error).name !== "AbortError") throw error;
    }
  }, []);

  return { containerRef, present, capabilities };
}

/** Reads a presenter's own declaration rather than inferring it (ADR-0014). */
function describe(capabilities: PresenterCapabilities | undefined): string {
  if (!capabilities) return "";
  const { implementation, media, announces } = capabilities;
  const name = implementation.split("/").pop() ?? implementation;
  return `active: ${name} · draws ${media.join(", then ")}${
    announces ? " · announces results" : ""
  }`;
}

const FIELD = { display: "flex", flexDirection: "column", fontSize: "0.8rem", gap: 4 } as const;

/**
 * One-click stories: each button rolls a notation that shows something the
 * presenters do beyond landing numbers — rerolls re-toss the doomed die,
 * explosions celebrate and birth the die they earned, keep/drop dims.
 */
const EXAMPLES = [
  { notation: "4d6dl1", label: "4d6dl1 · drop" },
  { notation: "5d6r2", label: "5d6r2 · rerolls" },
  { notation: "4d6!", label: "4d6! · explosions" },
  { notation: "1d100", label: "1d100 · percentile" },
] as const;

export function App(): React.JSX.Element {
  const [notation, setNotation] = useState("2d20kh1+3");
  const [seed, setSeed] = useState("");
  const [backend, setBackend] = useState<Backend>("webgl");
  const [sound, setSound] = useState(false);
  const [message, setMessage] = useState("Roll to get started.");
  const [busy, setBusy] = useState(false);
  const { containerRef, present, capabilities } = usePresenter(backend, sound);

  // One engine per seed value: rolls advance the reproducible sequence, and
  // changing the seed restarts it. The engine is headless domain logic —
  // resolving outcomes never touches the presenter, so switching backend
  // mid-session leaves the sequence exactly where it was.
  const engine: DiceEngine = useMemo(
    () =>
      seed ? createDiceEngine({ random: createSeededRandomSource(seed) }) : createDiceEngine(),
    [seed],
  );

  async function show(event: InteractionEvent): Promise<void> {
    setBusy(true);
    setMessage(formatEventAnnouncement(event));
    try {
      await present(event);
    } finally {
      setBusy(false);
    }
  }

  async function rollNotation(expression: string): Promise<void> {
    try {
      await show(engine.roll(expression));
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
        a ref&apos;d container owned by an effect. Switching renderer swaps one presenter for
        another without the engine noticing. Rolls play as stories: a rerolled die lands, holds its
        doomed value, and re-tosses; a die that explodes celebrates while the die it earned drops
        in.
      </p>
      <div
        style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "end", marginBottom: 12 }}
      >
        <label style={FIELD}>
          Notation
          <input value={notation} onChange={(e) => setNotation(e.target.value)} size={14} />
        </label>
        <label style={FIELD}>
          Seed (optional)
          <input
            value={seed}
            onChange={(e) => setSeed(e.target.value)}
            placeholder="table-42"
            size={10}
          />
        </label>
        <label style={FIELD}>
          Renderer
          <select value={backend} onChange={(e) => setBackend(e.target.value as Backend)}>
            <option value="webgl">webgl</option>
            <option value="physics">physics</option>
          </select>
        </label>
        <label style={{ ...FIELD, flexDirection: "row", alignItems: "center" }}>
          <input type="checkbox" checked={sound} onChange={(e) => setSound(e.target.checked)} />
          Sound
        </label>
        <button type="button" onClick={() => void rollNotation(notation)} disabled={busy}>
          Roll
        </button>
        <button type="button" onClick={() => void show(engine.flipCoin())} disabled={busy}>
          Flip coin
        </button>
        <span style={{ fontSize: "0.8rem", opacity: 0.75 }} data-testid="capabilities">
          {describe(capabilities)}
        </span>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
        {EXAMPLES.map((example) => (
          <button
            key={example.notation}
            type="button"
            style={{ fontSize: "0.75rem" }}
            disabled={busy}
            onClick={() => {
              setNotation(example.notation);
              void rollNotation(example.notation);
            }}
          >
            {example.label}
          </button>
        ))}
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
