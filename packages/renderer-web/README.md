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

## Asking what it can do (ADR-0014)

`presenter.capabilities` describes **this instance**, so an application can ask instead of feature-detect:

```ts
import { presentationSupport } from "@diceforge-sdk/core";

presenter.capabilities;
// { implementation: "@diceforge-sdk/renderer-web",
//   kinds: ["roll", "coin-flip"], dieSides: [4, 6, 8, 10, 12, 20, 100],
//   media: ["3d", "2d"], cancellable: true, announces: true,
//   honorsReducedMotion: true }

if (presenter.capabilities.media.includes("3d")) showDiceTrayControls();

const check = presentationSupport(presenter.capabilities, roll);
if (!check.supported) console.warn(check.message);
```

`dieSides` is `"any"`: the tiles read whatever a face says, including a `d3`, a `d30`, or a custom die whose faces are symbols (ADR-0015). Such dice are never drawn with a 3D model — a numbered model cannot show a face the die does not have — so a roll containing one lands as tiles even with a theme selected.

`media` is `["3d", "2d"]` only when WebGL is available *and* a theme supplies models; otherwise it is `["2d"]`. Both entries are listed for a 3D presenter because tiles remain the fallback for a roll the theme cannot cover — which is also why `dieSides` lists every size the core resolves regardless of mode. `mode` is the browser-specific spelling of the same answer; `capabilities.media` is the portable one.

## Options

| Option            | Type                                | Default  | Meaning                                                                 |
| ----------------- | ----------------------------------- | -------- | ----------------------------------------------------------------------- |
| `container`       | `HTMLElement`                       | required | Element the presenter renders into.                                     |
| `renderMode`      | `"auto" \| "webgl" \| "dom"`        | `"auto"` | `auto` uses WebGL when it is available *and* a theme supplies models.   |
| `reducedMotion`   | `"auto" \| "animate" \| "reduce"`   | `"auto"` | `auto` honors the platform's `prefers-reduced-motion`.                  |
| `announceResults` | `boolean`                           | `true`   | Maintain a visually hidden `aria-live` region announcing every result.  |
| `theme`           | `DiceTheme`                         | none     | Colors plus the 3D models; required for WebGL (see Themes).             |
| `colors`          | `{ die?: string; label?: string }`  | theme    | Color overrides; take precedence over the theme.                        |

`present(event, { signal })` accepts an `AbortSignal`; aborting rejects the promise with an `"AbortError"`-named error. A failed or aborted presentation never invalidates the resolved event.

## How outcomes stay authoritative

Every record is re-validated (`validateEventRecord`) before display. The tumble animation hands off to a rotation that ends **exactly** at the resolved face's orientation — the outcome is honored by construction, not by reading the physics. Presentation motion is intentionally non-deterministic (ARCHITECTURE.md permits this); the record is the replayable truth.

## Themes and 3D models (ADR-0010, ADR-0013)

A theme is plain data: colors, plus an optional set of glTF model URLs with a **calibrated face-rotation table** that says which orientation shows which value. Models load lazily on first use and are cached.

```ts
import { forgeAssets } from "@diceforge-sdk/assets-forge";
import { createDicePresenter, forgeTheme } from "@diceforge-sdk/renderer-web";

const presenter = createDicePresenter({
  container,
  theme: forgeTheme(forgeAssets({ color: "blue" })),
});
```

`forgeTheme` covers d4–d20 plus a two-faced coin, in `ivory` (default), `red`, `blue`, `green` and `yellow`. One model per die serves every colour — the theme swaps the texture atlas rather than the mesh — so adding a palette costs a few PNGs, not another set of models.

**A theme is required for 3D.** Without one — or for a roll a theme cannot cover — the presenter uses the DOM tiles instead (ADR-0012). `createDicePresenter({ container })` with no theme reports `mode: "dom"`.

**This package ships no art.** The dice live in [`@diceforge-sdk/assets-forge`](../assets-forge/README.md), an optional install whose URLs your bundler emits (ADR-0013). To serve the files yourself instead — a CDN, a `public/` directory, your own pack — give `forgeTheme` a directory rather than URLs:

```ts
forgeTheme({ baseUrl: "/dice-assets/forge", color: "blue" });
```

Both forms produce the same theme. Licences and provenance are in [`assets/LICENSES.md`](../../assets/LICENSES.md).

A themed coin is optional too: `DiceTheme.coin` names a model whose heads, tails and rim materials are textured separately, and the two rotations that turn each face up. Without one, coin flips use the built-in cylinder.

Coverage is per shape, and it has to be complete: if a theme cannot draw every die in a roll, the presenter falls back to tiles for that whole roll rather than mixing art styles. The first-party set covers every shape the core resolves.

Custom model sets implement `DieModelSet`. A model is used only when its shape has both a URL **and** a rotation table of exactly `shape` entries; anything less, or a load failure, drops the roll to tiles. That rule is what keeps a model from ever showing a face the core did not resolve. `examples/web-demo/devtools.html?forge=d20` checks a pack's models against their table.

## How a roll is presented

Dice tumble in, then settle into the orientation that shows each resolved face. The camera frames the whole layout automatically and looks down from a steep angle, so the face that counts is the one facing the viewer. A roll made entirely of d4s is the exception: those are read from the side, so they get a lower, angled view.

Dice are sized so each covers the same area of screen, rather than sharing a bounding box — a compact solid fills more of its box, so a d6 would otherwise dwarf a d8. The measurement is taken from the camera's angle (a die's height counts towards what you see) and averaged over the poses that die can land in. For themed models it is measured from the loaded mesh, so rounding the edges of a sharp-cornered solid is accounted for rather than assumed.

A percentile roll is shown as the classic pair of d10s. The tens die reads 00–90, so a theme can give it its own atlas via `DieModelSet.tensTextureUrl`; `forgeTheme` does. Without one, both dice fall back to the plain 0–9 atlas.

A coin is not rolled but tossed: it rests flat, is thrown into the air spinning end over end, and drops back onto the same spot. The number of half turns is chosen by parity so the toss lands on the resolved face without any mid-air correction.

**Dropped dice are revealed only after the roll lands.** Every die looks identical while it is in motion; once all of them have settled, a short pause passes and then dice excluded by a keep/drop selection darken and shrink slightly. They stay on the table, fully opaque, so the whole roll can still be read — nothing disappears, nothing turns see-through, and nothing gives the outcome away early. Under reduced motion there is no animation at all: the final state, dimming included, appears immediately.

**Rerolls and explosions play as stories** (ADR-0016). A die whose value was rerolled away lands showing the doomed value, holds it long enough to read, and re-tosses to its replacement — the lost value never lingers on the table looking dropped. A die that rolled its highest face on an exploding roll celebrates — a hop with a full vertical turn and a slight swell, which cannot change the face that is up — while the bonus die it earned drops in beside it; chains repeat, each earned die celebrating in turn. The settled stage holds every die that exists when the story ends, so the faces on the table always sum to the record's total. `visualDiceForEvent(event)` exposes the reconstruction (`rerolledFaces`, `exploded`, `bornOf` on each `VisualDie`), and it is the same story the Godot presenter plays. Under reduced motion the settled stage appears immediately.

## Fallback tiers

1. **WebGL** — themed 3D dice; dropped dice render dimmed; d100 appears as the classic percentile pair (tens + units d10, `100` = `00` + `0`).
2. **DOM** — without WebGL, without a theme, or with `renderMode: "dom"`, dice render as labeled tiles with the same kept/dropped states.
3. **Reduced motion** — animations are skipped and results appear immediately; announcements still fire.

In a hidden tab, browsers pause `requestAnimationFrame`, so an animated WebGL presentation completes when the tab becomes visible again (the animation is time-based and finishes immediately on resume).

## Accessibility

A `role="status"` / `aria-live="polite"` region announces results in plain language (e.g. "Rolled 2d20kh1+3. 2d20kh1: 1 dropped, 19. Modifier +3. Total 22."). The same wording is exported as `formatEventAnnouncement(event)`.

## Known presentation limitations (v0.2 scope)

- Dice are stylized rather than physically simulated: they tumble toward the resolved face instead of bouncing to it (a physics presenter is a future plugin category).
- A roll mixing d4s with other shapes uses the top-down camera, which is the harder angle for reading a d4.
- Die sizes match to within about 1%, except the d6, which renders roughly 6% large. The camera is a perspective one, and a cube carries most of its silhouette in the top face nearest the lens; a narrow field of view reduces the effect but cannot remove it without going orthographic.

## Compatibility

ESM-only. Requires a DOM; WebGL is optional (see fallbacks). Depends on `three` (MIT) internally — no Three.js types appear in the public API, per the core boundary rules. The published package contains code only; art is never bundled (ADR-0010).
