// @vitest-environment jsdom
import type { RollResult } from "@diceforge/core";
import { createDiceEngine, createSeededRandomSource, DiceForgeError } from "@diceforge/core";
import { afterEach, describe, expect, it } from "vitest";
import { createDicePresenter } from "./presenter.js";

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

  it("cleans up its DOM on dispose", () => {
    const container = makeContainer();
    const presenter = createDicePresenter({ container });
    expect(container.children.length).toBeGreaterThan(0);
    presenter.dispose();
    expect(container.querySelector('[data-diceforge="dom-presenter"]')).toBeNull();
    expect(container.querySelector('[data-diceforge="announcer"]')).toBeNull();
  });
});
