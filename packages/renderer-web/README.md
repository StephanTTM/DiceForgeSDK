# @diceforge-sdk/renderer-web

Browser presenter for DiceForge. Renders already-resolved `@diceforge-sdk/core` events as 3D dice (Three.js) or accessible DOM tiles — it never decides or modifies outcomes (ADR-0007).

Stability: **experimental (pre-1.0)** — minor versions may change APIs.

```bash
npm install @diceforge-sdk/renderer-web @diceforge-sdk/core
```

## Usage

```ts
import { createDiceEngine, createSeededRandomSource } from "@diceforge-sdk/core";
import { createDicePresenter } from "@diceforge-sdk/renderer-web";

const engine = createDiceEngine({ random: createSeededRandomSource("table-42") });
const presenter = createDicePresenter({ container: document.querySelector("#stage")! });

const roll = engine.roll("2d20kh1+3"); // resolved headlessly first
await presenter.present(roll);          // animation lands on the resolved faces
presenter.dispose();
```

`createDicePresenter` returns the core `InteractionPresenter` contract plus `mode` (the backend actually chosen) and `dispose()`.

## Options

| Option            | Type                                | Default  | Meaning                                                                 |
| ----------------- | ----------------------------------- | -------- | ----------------------------------------------------------------------- |
| `container`       | `HTMLElement`                       | required | Element the presenter renders into.                                     |
| `renderMode`      | `"auto" \| "webgl" \| "dom"`        | `"auto"` | `auto` uses WebGL when available, otherwise the DOM tile fallback.      |
| `reducedMotion`   | `"auto" \| "animate" \| "reduce"`   | `"auto"` | `auto` honors the platform's `prefers-reduced-motion`.                  |
| `announceResults` | `boolean`                           | `true`   | Maintain a visually hidden `aria-live` region announcing every result.  |
| `theme`           | `DiceTheme`                         | built-in | Colors plus optional 3D models (see Themes).                            |
| `colors`          | `{ die?: string; label?: string }`  | theme    | Color overrides; take precedence over the theme.                        |

`present(event, { signal })` accepts an `AbortSignal`; aborting rejects the promise with an `"AbortError"`-named error. A failed or aborted presentation never invalidates the resolved event.

## How outcomes stay authoritative

Every record is re-validated (`validateEventRecord`) before display. Die meshes are built from shared polyhedron data, and the tumble animation hands off to a rotation that ends **exactly** at the resolved face's orientation — the outcome is honored by construction, not by reading the physics. Presentation motion is intentionally non-deterministic (ARCHITECTURE.md permits this); the record is the replayable truth.

## Themes and 3D models (ADR-0010)

A theme is plain data: colors, plus an optional set of glTF model URLs with a **calibrated face-rotation table** that says which orientation shows which value. Models load lazily on first use and are cached.

```ts
import { createDicePresenter, forgeTheme } from "@diceforge-sdk/renderer-web";

const presenter = createDicePresenter({
  container,
  theme: forgeTheme({ baseUrl: "/dice-assets/forge", color: "blue" }),
});
```

Two themes ship with the package:

| Theme | Covers | Art |
| --- | --- | --- |
| `forgeTheme({ baseUrl, color })` | d4–d20 **and** a two-faced coin | first-party, MIT, in `assets/forge/` |
| `kayKitTheme({ baseUrl, color, d6Style })` | d4, d6, d8, d20 | KayKit Board Game Bits, CC0 |

`forgeTheme` colours are `ivory` (default), `red`, `blue`, `green` and `yellow`. One model per die serves every colour — the theme swaps the texture atlas rather than the mesh — so adding a palette costs a few PNGs, not another set of models.

**This package ships no art.** `baseUrl` points at wherever your app serves the model files from — copy them out of the repository's [`assets/`](../../assets) directory (or your own pack) and serve them statically. `forgeTheme` expects `assets/forge/` (models, plus `textures/<colour>/`); `kayKitTheme` expects the KayKit Board Game Bits files. Provenance and licences for both are in [`assets/LICENSES.md`](../../assets/LICENSES.md).

A themed coin is optional too: `DiceTheme.coin` names a model whose heads, tails and rim materials are textured separately, and the two rotations that turn each face up. Without one, coin flips use the built-in cylinder.

Coverage is per shape. The DiceForge set covers everything; KayKit provides d4, d6, d8 and d20, so a d10, d12 or percentile die in the same roll renders with the built-in procedural geometry in the theme's colours — mixed presentation is expected, not an error.

The d6 comes in three styles — `numerals` (default), `pips-a`, and `pips-b` — selected with `kayKitTheme({ baseUrl, color, d6Style })`. The pip dice take their color from the pack's shared palette texture, so all four colors need `boardgame_bits_texture.png` present alongside the models.

Custom model sets implement `DieModelSet`. A model is used only when its shape has both a URL **and** a rotation table of exactly `shape` entries; anything else falls back to procedural dice, as does any load or parse failure. That rule is what keeps a model from ever showing a face the core did not resolve. To calibrate a new pack, use the maintainer tool at `examples/web-demo/calibrate.html` — it derives the table from the mesh, and `?verify=1` re-renders straight from the shipped table so each cell can be checked against its expected value.

## How a roll is presented

Dice tumble in, then settle into the orientation that shows each resolved face. The camera frames the whole layout automatically and looks down from a steep angle, so the face that counts is the one facing the viewer. A roll made entirely of d4s is the exception: those are read from the side, so they get a lower, angled view.

Dice are sized so each covers the same area of screen, rather than sharing a bounding box — a compact solid fills more of its box, so a d6 would otherwise dwarf a d8. The measurement is taken from the camera's angle (a die's height counts towards what you see) and averaged over the poses that die can land in. For themed models it is measured from the loaded mesh, so rounding the edges of a sharp-cornered solid is accounted for rather than assumed.

A percentile roll is shown as the classic pair of d10s. The tens die reads 00–90, so a theme can give it its own atlas via `DieModelSet.tensTextureUrl`; `forgeTheme` does. Without one, both dice fall back to the plain 0–9 atlas.

A coin is not rolled but tossed: it rests flat, is thrown into the air spinning end over end, and drops back onto the same spot. The number of half turns is chosen by parity so the toss lands on the resolved face without any mid-air correction.

**Dropped dice are revealed only after the roll lands.** Every die looks identical while it is in motion; once all of them have settled, a short pause passes and then dice excluded by a keep/drop selection darken and shrink slightly. They stay on the table, fully opaque, so the whole roll can still be read — nothing disappears, nothing turns see-through, and nothing gives the outcome away early. Under reduced motion there is no animation at all: the final state, dimming included, appears immediately.

## Fallback tiers

1. **WebGL** — Three.js dice with numbered faces; dropped dice render dimmed; d100 appears as the classic percentile pair (tens + units d10, `100` = `00` + `0`).
2. **DOM** — without WebGL (or with `renderMode: "dom"`), dice render as labeled tiles with the same kept/dropped states.
3. **Reduced motion** — animations are skipped and results appear immediately; announcements still fire.

In a hidden tab, browsers pause `requestAnimationFrame`, so an animated WebGL presentation completes when the tab becomes visible again (the animation is time-based and finishes immediately on resume).

## Accessibility

A `role="status"` / `aria-live="polite"` region announces results in plain language (e.g. "Rolled 2d20kh1+3. 2d20kh1: 1 dropped, 19. Modifier +3. Total 22."). The same wording is exported as `formatEventAnnouncement(event)`.

## Known presentation limitations (v0.2 scope)

- Dice are stylized rather than physically simulated: they tumble toward the resolved face instead of bouncing to it (a physics presenter is a future plugin category).
- Built-in procedural dice have sharp edges — no bevels or rounded corners. They are meant as a clean, dependency-free default and as the fallback for shapes a theme does not cover; a model set looks better where one exists.
- Procedural dice use the classic 1/6-opposite layout on the d6 only; other shapes number faces in construction order.
- Labels on non-top faces may appear rotated; only the landing face is yawed to read upright.
- A roll mixing d4s with other shapes uses the top-down camera, which is the harder angle for reading a d4.
- Die sizes match to within about 1%, except the d6, which renders roughly 6% large. The camera is a perspective one, and a cube carries most of its silhouette in the top face nearest the lens; a narrow field of view reduces the effect but cannot remove it without going orthographic.

## Compatibility

ESM-only. Requires a DOM; WebGL is optional (see fallbacks). Depends on `three` (MIT) internally — no Three.js types appear in the public API, per the core boundary rules. The published package contains code only; art is never bundled (ADR-0010).
