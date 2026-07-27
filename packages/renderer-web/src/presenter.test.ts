// @vitest-environment jsdom
import type { RollResult } from "@diceforge-sdk/core";
import {
  createDiceEngine,
  createSeededRandomSource,
  DIE_SIDES,
  DiceForgeError,
  defineDie,
  presentationSupport,
} from "@diceforge-sdk/core";
import { afterEach, describe, expect, it } from "vitest";
import { visualDiceForEvent } from "./backend.js";
import { createDicePresenter, describeCapabilities } from "./presenter.js";

function makeContainer(): HTMLElement {
  const container = document.createElement("div");
  document.body.append(container);
  return container;
}

function percentileRoll(value: number): RollResult {
  return {
    kind: "roll",
    schemaVersion: 1,
    expression: "1d100",
    groups: [
      {
        notation: "1d100",
        sign: 1,
        sides: 100,
        dice: [{ sides: 100, value, kept: true }],
        subtotal: value,
      },
    ],
    modifier: 0,
    total: value,
    provenance: { source: "system", algorithm: "math-random" },
  };
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("createDicePresenter (DOM backend)", () => {
  it("falls back to DOM mode automatically without WebGL (jsdom)", () => {
    const presenter = createDicePresenter({ container: makeContainer() });
    expect(presenter.mode).toBe("dom");
    presenter.dispose();
  });

  it("renders every die of a roll with kept and dropped state", async () => {
    const container = makeContainer();
    const presenter = createDicePresenter({ container, reducedMotion: "reduce" });
    const engine = createDiceEngine({ random: createSeededRandomSource("table-42") });
    // Seed "table-42": 2d20kh1 rolls 1 (dropped) and 19 (kept).
    await presenter.present(engine.roll("2d20kh1+3"));
    const tiles = [...container.querySelectorAll('[data-diceforge="die"]')];
    expect(tiles).toHaveLength(2);
    const values = tiles.map(
      (tile) => tile.querySelector('[data-diceforge="die-value"]')?.textContent,
    );
    expect(values).toEqual(["1", "19"]);
    expect(tiles[0]?.getAttribute("data-dropped")).toBe("true");
    expect(tiles[1]?.getAttribute("data-dropped")).toBeNull();
    presenter.dispose();
  });

  it("announces results through the aria-live region", async () => {
    const container = makeContainer();
    const presenter = createDicePresenter({ container, reducedMotion: "reduce" });
    const engine = createDiceEngine({ random: createSeededRandomSource("table-42") });
    await presenter.present(engine.roll("2d20kh1+3"));
    const region = container.querySelector('[data-diceforge="announcer"]');
    expect(region?.textContent).toBe(
      "Rolled 2d20kh1+3. 2d20kh1: 1 dropped, 19. Modifier +3. Total 22.",
    );
    presenter.dispose();
  });

  it("presents a d100 as the classic percentile pair", async () => {
    const container = makeContainer();
    const presenter = createDicePresenter({ container, reducedMotion: "reduce" });
    await presenter.present(percentileRoll(42));
    const values = [...container.querySelectorAll('[data-diceforge="die-value"]')].map(
      (node) => node.textContent,
    );
    expect(values).toEqual(["40", "2"]);
    presenter.dispose();
  });

  it("labels a percentile pair as tens and units", async () => {
    const container = makeContainer();
    const presenter = createDicePresenter({ container, reducedMotion: "reduce" });
    await presenter.present(percentileRoll(42));
    const values = [...container.querySelectorAll('[data-diceforge="die-value"]')].map(
      (node) => node.textContent,
    );
    // The tens die reads 40, not 4 — that is what the dedicated atlas exists for.
    expect(values).toEqual(["40", "2"]);
    presenter.dispose();
  });

  it("presents coin flips", async () => {
    const container = makeContainer();
    const presenter = createDicePresenter({ container, reducedMotion: "reduce" });
    const engine = createDiceEngine({ random: createSeededRandomSource("flip") });
    const flip = engine.flipCoin();
    await presenter.present(flip);
    const value = container.querySelector('[data-diceforge="die-value"]')?.textContent;
    expect(value).toBe(flip.outcome === "heads" ? "H" : "T");
    presenter.dispose();
  });

  it("does not mark dropped dice until the roll has landed", async () => {
    const container = makeContainer();
    const presenter = createDicePresenter({ container, reducedMotion: "animate" });
    const engine = createDiceEngine({ random: createSeededRandomSource("table-42") });
    const pending = presenter.present(engine.roll("2d20kh1"));
    // Mid-flight: both dice are on screen and look identical, so the outcome
    // is not given away before they settle.
    await new Promise((resolve) => setTimeout(resolve, 120));
    const midFlight = [...container.querySelectorAll<HTMLElement>('[data-diceforge="die"]')];
    expect(midFlight).toHaveLength(2);
    expect(midFlight.map((tile) => tile.style.opacity)).toEqual(["", ""]);
    expect(midFlight.map((tile) => tile.style.filter)).toEqual(["", ""]);
    await pending;
    const settled = [...container.querySelectorAll<HTMLElement>('[data-diceforge="die"]')];
    const dropped = settled.find((tile) => tile.dataset.dropped === "true");
    const kept = settled.find((tile) => tile.dataset.dropped !== "true");
    expect(dropped?.style.opacity).toBe("0.55");
    expect(dropped?.style.filter).toContain("brightness");
    expect(kept?.style.opacity).toBe("");
    presenter.dispose();
  });

  it("shows the dropped state immediately under reduced motion", async () => {
    const container = makeContainer();
    const presenter = createDicePresenter({ container, reducedMotion: "reduce" });
    const engine = createDiceEngine({ random: createSeededRandomSource("table-42") });
    await presenter.present(engine.roll("2d20kh1"));
    const dropped = container.querySelector<HTMLElement>('[data-dropped="true"]');
    expect(dropped?.style.opacity).toBe("0.55");
    expect(dropped?.style.transition).toBe("");
    presenter.dispose();
  });

  it("plays the entry animation when motion is allowed", async () => {
    const container = makeContainer();
    const presenter = createDicePresenter({ container, reducedMotion: "animate" });
    const engine = createDiceEngine({ random: createSeededRandomSource("anim") });
    await presenter.present(engine.roll("1d6"));
    const tile = container.querySelector<HTMLElement>('[data-diceforge="die"]');
    expect(tile?.style.transform).toBe("scale(1)");
    presenter.dispose();
  });

  it("rejects when the abort signal is already aborted", async () => {
    const container = makeContainer();
    const presenter = createDicePresenter({ container, reducedMotion: "reduce" });
    const engine = createDiceEngine({ random: createSeededRandomSource("abort") });
    const controller = new AbortController();
    controller.abort();
    await expect(
      presenter.present(engine.roll("1d6"), { signal: controller.signal }),
    ).rejects.toMatchObject({ name: "AbortError" });
    presenter.dispose();
  });

  it("rejects tampered records instead of presenting them", async () => {
    const container = makeContainer();
    const presenter = createDicePresenter({ container, reducedMotion: "reduce" });
    const tampered = { ...percentileRoll(42), total: 99 };
    await expect(presenter.present(tampered)).rejects.toThrowError(DiceForgeError);
    presenter.dispose();
  });

  it("refuses invalid containers and disposed presenters", async () => {
    expect(() =>
      createDicePresenter({ container: undefined as unknown as HTMLElement }),
    ).toThrowError(/container must be an HTMLElement/);
    const presenter = createDicePresenter({ container: makeContainer(), reducedMotion: "reduce" });
    presenter.dispose();
    const engine = createDiceEngine({ random: createSeededRandomSource("x") });
    await expect(presenter.present(engine.roll("1d6"))).rejects.toThrowError(/disposed/);
  });

  /**
   * The point of declaring capabilities is that an application can trust the
   * declaration instead of feature-detecting. These check the declaration
   * against what the presenter actually does (ADR-0014).
   */
  describe("declared capabilities", () => {
    it("describes this instance, not the package", () => {
      const quiet = createDicePresenter({
        container: makeContainer(),
        announceResults: false,
      });
      const loud = createDicePresenter({ container: makeContainer() });

      expect(quiet.capabilities.announces).toBe(false);
      expect(loud.capabilities.announces).toBe(true);
      expect(loud.capabilities.implementation).toBe("@diceforge-sdk/renderer-web");
      quiet.dispose();
      loud.dispose();
    });

    it("reports 2D only without a theme, matching the mode it chose", () => {
      const presenter = createDicePresenter({ container: makeContainer() });
      expect(presenter.mode).toBe("dom");
      expect(presenter.capabilities.media).toEqual(["2d"]);
      presenter.dispose();
    });

    /**
     * jsdom has no WebGL, so the 3D presenter cannot be constructed here — but
     * what it would declare is a pure function of its mode, and that can be.
     */
    it("adds 3D to the media a WebGL instance offers, keeping 2D as the fallback", () => {
      expect(describeCapabilities("webgl", true).media).toEqual(["3d", "2d"]);
      expect(describeCapabilities("dom", true).media).toEqual(["2d"]);
      // Falling back is not a loss of support: both draw every size.
      expect(describeCapabilities("webgl", true).dieSides).toEqual(
        describeCapabilities("dom", true).dieSides,
      );
    });

    it("claims every die size the core can resolve, and presents them", async () => {
      const container = makeContainer();
      const presenter = createDicePresenter({ container, reducedMotion: "reduce" });
      const engine = createDiceEngine({ random: createSeededRandomSource("every-shape") });

      // Tiles read whatever a face says, so no face count is out of reach.
      expect(presenter.capabilities.dieSides).toBe("any");
      for (const sides of DIE_SIDES) {
        const event = engine.roll(`1d${sides}`);
        expect(presentationSupport(presenter.capabilities, event)).toEqual({ supported: true });
        await presenter.present(event);
        // A d100 is drawn as a percentile pair, every other size as one die.
        const drawn = container.querySelectorAll('[data-diceforge="die"]');
        expect(drawn.length, `d${sides}`).toBe(sides === 100 ? 2 : 1);
      }
      presenter.dispose();
    });

    it("accepts both event kinds it declares", async () => {
      const container = makeContainer();
      const presenter = createDicePresenter({ container, reducedMotion: "reduce" });
      const engine = createDiceEngine({ random: createSeededRandomSource("kinds") });

      expect([...presenter.capabilities.kinds].sort()).toEqual(["coin-flip", "roll"]);
      const flip = engine.flipCoin();
      expect(presentationSupport(presenter.capabilities, flip)).toEqual({ supported: true });
      await presenter.present(flip);
      expect(container.querySelector('[data-diceforge="die-value"]')?.textContent).toBe(
        flip.outcome === "heads" ? "H" : "T",
      );
      presenter.dispose();
    });

    it("cancels when it says it cancels", async () => {
      const presenter = createDicePresenter({
        container: makeContainer(),
        reducedMotion: "reduce",
      });
      const engine = createDiceEngine({ random: createSeededRandomSource("cancel") });
      const controller = new AbortController();
      controller.abort();

      expect(presenter.capabilities.cancellable).toBe(true);
      await expect(
        presenter.present(engine.roll("1d6"), { signal: controller.signal }),
      ).rejects.toMatchObject({ name: "AbortError" });
      presenter.dispose();
    });
  });

  it("cleans up its DOM on dispose", () => {
    const container = makeContainer();
    const presenter = createDicePresenter({ container });
    expect(container.children.length).toBeGreaterThan(0);
    presenter.dispose();
    expect(container.querySelector('[data-diceforge="dom-presenter"]')).toBeNull();
    expect(container.querySelector('[data-diceforge="announcer"]')).toBeNull();
  });
});

describe("custom dice (ADR-0015)", () => {
  const fate = defineDie({
    id: "fate",
    faces: [
      { value: -1, label: "-" },
      { value: 0, label: " " },
      { value: 1, label: "+" },
    ],
  });

  function customEngine(seed: string) {
    return createDiceEngine({ random: createSeededRandomSource(seed), dice: [fate] });
  }

  it("renders a die with an unusual face count", async () => {
    const container = makeContainer();
    const presenter = createDicePresenter({ container, reducedMotion: "reduce" });
    const engine = createDiceEngine({ random: createSeededRandomSource("d3") });
    const roll = engine.roll("2d3");

    expect(presentationSupport(presenter.capabilities, roll)).toEqual({ supported: true });
    await presenter.present(roll);
    const shown = [...container.querySelectorAll('[data-diceforge="die-value"]')].map(
      (node) => node.textContent,
    );
    expect(shown).toEqual(roll.groups[0]?.dice.map((die) => String(die.value)));
    presenter.dispose();
  });

  it("shows a custom face by its label, not its value", async () => {
    const container = makeContainer();
    const presenter = createDicePresenter({ container, reducedMotion: "reduce" });
    const roll = customEngine("labels").roll("4d{fate}");

    await presenter.present(roll);
    const shown = [...container.querySelectorAll('[data-diceforge="die-value"]')].map(
      (node) => node.textContent,
    );
    expect(shown).toEqual(roll.groups[0]?.dice.map((die) => die.label));
    // A "-1" that reads "-" is the whole point of a label.
    expect(shown.every((text) => ["-", " ", "+"].includes(text ?? ""))).toBe(true);
    presenter.dispose();
  });

  /**
   * The correctness rule behind the fallback: a custom d6 whose faces read
   * 2,3,3,4,4,5 must never be drawn with a model numbered 1-6, which would put
   * a numeral on screen that the die does not have.
   */
  it("gives a custom die no 3D shape, whatever its face count", () => {
    const sicherman = defineDie({ id: "sicherman", faces: [1, 2, 2, 3, 3, 4] });
    const roll = createDiceEngine({
      random: createSeededRandomSource("sicherman"),
      dice: [sicherman],
    }).roll("2d{sicherman}");

    const visuals = visualDiceForEvent(roll);
    expect(visuals).toHaveLength(2);
    for (const visual of visuals) {
      expect(visual.shape, "a custom die must not borrow a numbered model").toBeUndefined();
      expect(visual.name).toBe("d{sicherman}");
    }
  });

  it("keeps a 3D shape for the plain sizes that have one", () => {
    const roll = createDiceEngine({ random: createSeededRandomSource("shapes") }).roll("1d20+1d7");
    const [d20, d7] = visualDiceForEvent(roll);
    expect(d20?.shape).toBe(20);
    expect(d7?.shape).toBeUndefined();
  });
});
