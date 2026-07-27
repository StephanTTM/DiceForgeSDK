# Visual regression suite

Renders a fixed set of rolls through the real presenter and compares each frame to a committed PNG.

```bash
npm run vrt          # check every scene against its baseline
npm run vrt:update   # accept the current output as the new baseline
node tools/vrt/run.mjs --only=coin   # just the scenes whose name matches
```

A changed scene writes `<name>.actual.png` and a `<name>.diff.png` into `tools/vrt/output/` (git-ignored), with the differing pixels marked in red.

## Why this exists

Nearly every renderer bug this project has had was invisible to unit tests and found by a person squinting at a screenshot: dropped dice rendering see-through, half of the d10's triangles wound inward, a theme change repainting only one shape, dice sized so unevenly the set looked mismatched. All of those change pixels, and all of them would have been caught here.

The suite is not a substitute for the unit tests. Those assert things that must be *true* — a value's face lands on top, a rotation table matches its manifest. This asserts only that the picture has not changed without someone deciding it should.

## How a scene is captured

Each scene is a URL into `examples/web-demo/devtools.html`, which renders one seeded roll through `createDicePresenter` and publishes the frame on `window.__diceforge`. Two things make the capture deterministic:

- **A fixed seed**, so the dice values are the same every run.
- **Reduced motion**, which makes the presenter draw synchronously — the captured frame is the settled result, not an arbitrary point in an animation.

WebGL scenes read the canvas back as a PNG, keeping the alpha channel so a die's exact silhouette is compared. The DOM fallback scene draws no canvas, so it is screenshotted instead.

## Baselines are tied to the browser that drew them

Rendering is deterministic for a given browser and driver, not across them: the same scene drawn by another GPU or another Chromium build will differ in a few pixels of anti-aliasing. Baselines are therefore generated with Playwright's bundled headless Chromium, which draws through SwiftShader in software rather than on the local GPU. On this setup repeated runs differ by **zero** pixels.

That is also why the suite is **not** wired into CI: baselines committed from one platform would fail on a CI runner for reasons that have nothing to do with the renderer. Running it in CI needs baselines generated inside the same container image CI uses — worth doing, and tracked in `TASKS.md`, but a change of its own.

A small tolerance is applied anyway (`TOLERANCE`, `PIXEL_THRESHOLD` in `run.mjs`) so that a stray anti-aliased pixel does not fail a run.

## Adding a scene

Add an entry to `scenes.mjs` with a `why` explaining what it protects — a scene nobody can justify is a scene nobody will maintain — then run `npm run vrt` to create its baseline and commit the PNG alongside the code.

## Physics scenes

`physics=1` drives `@diceforge-sdk/presenter-physics` instead of the renderer, with a seeded throw (`throw=…`) so a simulated roll is as repeatable as a scripted one. Measured: identical to the pixel across runs, like every other scene.

The four physics scenes were checked by breaking the thing they exist to watch — replacing the symmetry remap with the identity, so dice land on whatever the simulation chose rather than the recorded face. The three that render dice all caught it (0.38–0.77% of pixels); `physics-delegates-unmodelled`, which never uses the remap, correctly did not, and neither did any renderer-web scene.

## Sensitivity

A regression has to move more than `TOLERANCE` (0.1%) of the pixels to fail a scene, and dice occupy a modest share of a frame. In `physics-d20-pair` one wrong die is about 0.39% — caught comfortably. In a five-dice scene one wrong die is nearer 0.08%, which would slip through.

So the scenes with **few, large dice** are the sensitive ones, and the crowded scenes are there for layout and framing rather than for face correctness. Face correctness is pinned exactly, and per die, by the unit tests in `packages/presenter-physics`.
