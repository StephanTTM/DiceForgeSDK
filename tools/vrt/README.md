# Visual regression suite

Renders a fixed set of rolls through the real presenter and compares each frame to a committed PNG.

```bash
npm run vrt                  # check every scene against its baseline
npm run vrt:docker           # the same, in the container CI uses — authoritative
npm run vrt:docker -- --update   # redraw the baselines
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

Rendering is deterministic for a given browser and driver, not across them: the same scene drawn by another GPU or another Chromium build will differ in a few pixels of anti-aliasing. Playwright's bundled headless Chromium draws through SwiftShader in software rather than on the local GPU, so repeated runs on one machine differ by **zero** pixels — but two machines still disagree.

So a baseline is only meaningful next to the environment that drew it, and that environment is a pinned container: `mcr.microsoft.com/playwright:v<version>-noble`. CI compares inside it, and `npm run vrt:docker` puts you in the same one. The tag is derived from the Playwright pinned in `package.json` — the image ships the browser build that version expects, so the two move together, and `tools/vrt/environment.mjs` fails the job if a version bump leaves the workflow behind.

`baselines/environment.json` records what drew the committed PNGs. A run from anywhere else says so and reports what changed **without failing**, because it genuinely cannot tell a regression from another Chromium's anti-aliasing:

```
Baselines were drawn in mcr.microsoft.com/playwright:v1.62.0-noble, playwright 1.62.0.
This run is win32 (no container), playwright 1.62.0, so differences below may be
anti-aliasing rather than regressions, and will not fail the build.
```

That keeps a bare `npm run vrt` useful for a quick look — a 40% diff is obviously real whatever drew it — without training anyone to ignore a red suite. The authoritative answer comes from CI, or from `vrt:docker` if you have Docker.

A small tolerance is applied anyway (`TOLERANCE`, `PIXEL_THRESHOLD` in `run.mjs`) so that a stray anti-aliased pixel does not fail a run.

## Updating baselines

A changed baseline is a claim that the new pixels are correct, so nothing regenerates them automatically — a suite that updates its own expectations cannot fail. Redraw them deliberately, in the container:

```bash
npm run vrt:docker -- --update
```

Without Docker, run the **VRT baselines** workflow from the Actions tab. It redraws them in the same image and uploads them as an artifact to download and commit; it has no write access to the repository, so the PNGs still go through review like any other change.

## Adding a scene

Add an entry to `scenes.mjs` with a `why` explaining what it protects — a scene nobody can justify is a scene nobody will maintain — then run `npm run vrt` to create its baseline and commit the PNG alongside the code.

## Physics scenes

`physics=1` drives `@diceforge-sdk/presenter-physics` instead of the renderer, with a seeded throw (`throw=…`) so a simulated roll is as repeatable as a scripted one. Measured: identical to the pixel across runs, like every other scene.

The four physics scenes were checked by breaking the thing they exist to watch — replacing the symmetry remap with the identity, so dice land on whatever the simulation chose rather than the recorded face. The three that render dice all caught it (0.38–0.77% of pixels); `physics-delegates-unmodelled`, which never uses the remap, correctly did not, and neither did any renderer-web scene.

## Sensitivity

A regression has to move more than `TOLERANCE` (0.1%) of the pixels to fail a scene, and dice occupy a modest share of a frame. In `physics-d20-pair` one wrong die is about 0.39% — caught comfortably. In a five-dice scene one wrong die is nearer 0.08%, which would slip through.

So the scenes with **few, large dice** are the sensitive ones, and the crowded scenes are there for layout and framing rather than for face correctness. Face correctness is pinned exactly, and per die, by the unit tests in `packages/presenter-physics`.
