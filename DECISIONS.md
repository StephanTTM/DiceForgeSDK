# Architecture Decision Records

This log records decisions that materially affect architecture, public contracts, compatibility, or contributor workflow. New records use the next sequential identifier. Do not edit accepted historical context; supersede it with a new record when direction changes.

## ADR-0001: Renderer-agnostic, headless core

- **Date:** 2026-07-25
- **Status:** Accepted
- **Decision:** The core resolves dice rolls and coin flips without importing rendering, physics, game-engine, UI, or networking dependencies.
- **Rationale:** A headless core enables web, server, Unity, Godot, test, and simulation use cases while keeping integration lightweight.
- **Consequences:** Visual adapters must consume core event records rather than decide outcomes. Additional contracts are needed between core and presentation layers.
- **Alternatives considered:** A browser-first Three.js implementation; separate implementations per platform.

## ADR-0002: Offline-first with optional transport

- **Date:** 2026-07-25
- **Status:** Accepted
- **Decision:** Local functionality requires no account, service, or network connection. Multiplayer/synchronization is an optional plugin category.
- **Rationale:** This keeps the SDK useful in games, prototypes, private tools, and disconnected environments.
- **Consequences:** Networked features must be additive and cannot be part of core correctness.
- **Alternatives considered:** A hosted synchronized dice service as a required backend.

## ADR-0003: Dice and coin flips are the initial scope

- **Date:** 2026-07-25
- **Status:** Accepted
- **Decision:** The initial SDK supports dice and coin flips only. Other tabletop interaction types are out of scope unless separately adopted.
- **Rationale:** A focused domain gives the project a coherent first release and protects integration quality.
- **Consequences:** Plugin architecture remains general, but no speculative support for cards, tiles, or spinners is built initially.
- **Alternatives considered:** A broad tabletop interaction engine from the outset.

## ADR-0004: npm workspaces, Vitest, Biome, and ESM-only tsc builds

- **Date:** 2026-07-25
- **Status:** Accepted
- **Decision:** The TypeScript monorepo uses npm workspaces (no separate monorepo task runner), Vitest for tests and coverage, Biome for linting and formatting, and plain `tsc` producing ESM-only output with type declarations. Supported runtime is Node.js >= 20 for tooling and any ES2022 JavaScript environment for the core package.
- **Rationale:** npm ships with Node, keeps contributor setup to `npm ci`, and its publish workflow is a plain `npm publish`. Unity and Godot adapters will not be npm packages, so a heavier monorepo tool buys nothing today. Vitest and Biome minimize configuration and dependencies while covering tests, coverage, lint, and format. ESM-only output matches modern bundlers and Node without dual-package complexity.
- **Consequences:** Contributors need no global tooling beyond Node and npm. If the workspace later gains many interdependent packages, a task runner (or pnpm) can be adopted via a superseding ADR. CommonJS consumers must use dynamic `import()` or a bundler.
- **Alternatives considered:** pnpm workspaces (stricter isolation but extra install step); Turborepo/Nx (premature for one package); ESLint + Prettier (more configuration and dependencies); dual CJS/ESM builds (complexity without a current consumer).

## ADR-0005: Seeded RNG algorithm and reproducibility guarantee

- **Date:** 2026-07-25
- **Status:** Accepted
- **Decision:** The seeded random source hashes the seed text with cyrb128 into the state of a xoshiro128\*\* generator, implemented with 32-bit integer operations only. Guarantee: the same seed produces the same sequence on every platform and every core release. Golden known-answer tests lock the sequences; changing the algorithm or constants is a breaking change requiring a superseding ADR. Die faces are derived from `nextUint32()` via rejection sampling so no face is biased. The system (non-seeded) source uses Web Crypto `getRandomValues` when present, falling back to `Math.random`, and is explicitly non-reproducible.
- **Rationale:** xoshiro128\*\* is a public-domain, well-studied generator that is fast and exactly reproducible in JavaScript's 32-bit integer semantics, unlike float-based approaches. cyrb128 turns human-friendly string seeds ("table-42") into well-mixed state. Rejection sampling removes modulo bias without floating-point involvement.
- **Consequences:** Replays, tests, and cross-device synchronization can rely on identical outcomes from identical seeds. Cryptographic unpredictability is explicitly **not** guaranteed for seeded sequences; provenance metadata records which source produced each result. Verifiable fairness remains future scope.
- **Alternatives considered:** `Math.random` with no seeding (not reproducible); PCG32 (needs 64-bit emulation in JS); Mersenne Twister (large state, slower); float-based mulberry32 pipelines (risk of cross-engine drift).

## ADR-0006: Dice notation grammar v1 and event schema v1

- **Date:** 2026-07-25
- **Status:** Accepted
- **Decision:** Notation grammar v1 is `[sign] term { ("+"|"-") term }` where a term is an integer modifier or a dice group `[count]d(sides|%)` with optional `kh`/`kl`/`dh`/`dl` selection (count defaults to 1). It is case-insensitive and whitespace-tolerant; `d%` means d100; sides are restricted to {4, 6, 8, 10, 12, 20, 100}. Limits: 100 dice per group, 20 terms, modifiers up to 1,000,000, 500-character expressions, and at least one dice group per expression. Event records (`RollResult`, `CoinFlipResult`) carry `schemaVersion: 1`, are deeply frozen, preserve per-die rolled order with `kept` flags, and embed RNG provenance. Keep/drop ties are broken in favor of earlier-rolled dice. Serialization is canonical JSON; deserialization validates structure and internal consistency (subtotals and totals recomputed), drops unknown fields, and rejects unknown schema versions with a dedicated error code. Additive optional fields keep the version; renaming, removing, or re-meaning fields bumps `schemaVersion` with documented migration.
- **Rationale:** A small, unambiguous grammar covers the dominant tabletop cases (modifiers, advantage/disadvantage via `2d20kh1`/`2d20kl1`, ability-score `4d6dl1`, percentile) without committing to a full expression language. Consistency validation makes deserialized records trustworthy inputs for presenters and replay. Explicit limits bound memory and keep records renderable.
- **Consequences:** Exotic notation (exploding dice, rerolls, custom dice) requires grammar extensions in the 0.3.0 plugin/extension milestone, not silent core growth. Old cores reject records from future schema versions cleanly rather than mis-rendering them.
- **Alternatives considered:** Adopting a full existing dice-expression language (large surface, licensing/compatibility risk); arbitrary die sizes in v1 (blocks curated presentation and asset mapping); mutable result objects (invites presentation-layer outcome tampering).

## ADR-0007: Web presentation via Three.js with outcome-first scripted animation

- **Date:** 2026-07-25
- **Status:** Accepted
- **Decision:** The first renderer is `@diceforge/renderer-web`: Three.js (MIT) renders 3D dice, and a procedural tumble animation is constructed backward from the core-resolved outcome so every die always lands showing its recorded face. No physics engine is added; physics-based presentation remains a future plugin category. The package serves as both the first renderer plugin and the browser adapter until a split is justified. It ships graceful fallback tiers: WebGL 3D → DOM/2D rendering when WebGL is unavailable → instant results plus text announcements under reduced motion, with aria-live announcements always available.
- **Rationale:** Animating toward a known outcome honors the architecture rule that presentation never decides results, by construction rather than by correction. Skipping a physics dependency keeps the first web integration small, deterministic to verify, and light for adopters. Three.js is the most widely adopted MIT web 3D library, kept strictly internal to the package (no Three types in public contracts).
- **Consequences:** Dice motion is stylized rather than physically simulated; a future physics presenter plugin can offer realism behind the same `InteractionPresenter` contract. Splitting adapter and renderer into separate packages later requires only package reshuffling, not contract changes.
- **Alternatives considered:** cannon-es/Rapier physics with final-orientation correction (heavier, corrective rather than constructive); Babylon.js (larger engine footprint); CSS/2D-only presentation (defers the SDK's 3D promise).

## ADR-0008: Presenter contract lives in the core as type-only exports

- **Date:** 2026-07-25
- **Status:** Accepted
- **Decision:** `InteractionPresenter`, `PresentationOptions`, and `AbortSignalLike` are defined in `@diceforge/core` as pure type exports (`packages/core/src/presentation.ts`). The core declares a structural `AbortSignalLike` instead of referencing the DOM `AbortSignal` so its type surface stays platform-free. A dedicated `@diceforge/plugin-contracts` package is created only when multiple plugin categories (physics, themes, audio, transport) need shared contracts.
- **Rationale:** ARCHITECTURE.md places plugin contracts behind core-defined interfaces. A single small interface does not justify a new package (per the "no empty packages" rule), and type-only exports add zero runtime weight or dependencies to the core.
- **Consequences:** Renderer packages depend on `@diceforge/core` for the contract, which they already need for event record types. If contracts grow, moving them to `@diceforge/plugin-contracts` is a re-export away and will be recorded in a superseding ADR.
- **Alternatives considered:** A `plugin-contracts` package now (premature); defining the contract in each renderer (fragments the ecosystem); referencing DOM `AbortSignal` directly (drags platform libs into the core's types).

## ADR-0009: npm scope @diceforge-sdk and tag-driven release pipeline

- **Date:** 2026-07-25
- **Status:** Accepted
- **Decision:** Packages publish under the npm scope `@diceforge-sdk` (`@diceforge-sdk/core`, `@diceforge-sdk/renderer-web`) because the `diceforge` org name was already taken when the org was registered. All packages are public (`publishConfig.access: "public"`) and version-locked: they release together with the same version number. Releases are driven by version tags (`v*`): a GitHub Actions release workflow re-runs every quality gate and publishes both packages with npm provenance. The first publish of each package happens from a maintainer machine (npm requires interactive 2FA before automation exists); afterwards, npm trusted publishing (OIDC) is configured so CI publishes without long-lived tokens. Earlier documents referencing `@diceforge/...` describe the same packages under their pre-publish working name.
- **Rationale:** The scope mirrors the project name (DiceForge SDK) while staying available. Version-locking sidesteps a compatibility matrix while both packages are pre-1.0 and co-developed. Tag-driven CI releases keep publishes reproducible and reviewed; provenance links every artifact to its source commit and workflow.
- **Consequences:** A version bump releases both packages even if one is unchanged — acceptable at this stage, revisit via ADR if the package count grows. Renaming the scope later would be a breaking change for consumers and would require a superseding ADR with migration notes.
- **Alternatives considered:** Unscoped names like `diceforge-core` (no namespace ownership, squat-prone); a different scope such as `@diceforgejs` (weaker match to the project name); independent per-package versioning (premature bookkeeping); publishing manually forever (unreproducible, no provenance).

## ADR-0010: Themes are data; asset packs stay outside published packages

- **Date:** 2026-07-25
- **Status:** Accepted
- **Decision:** A `DiceTheme` is plain data — colors plus an optional `DieModelSet` of glTF URLs and a calibrated face-rotation table per shape. Themes never ship binary assets: published npm packages contain code only, and asset files live in the repository's `assets/` directory, served by the host application at a `baseUrl` the theme is given. A model is used only when its shape has **both** a URL and a complete rotation table (`hasCalibratedModel`); otherwise, and on any load failure, that die falls back to the built-in procedural geometry. Third-party assets require a license permitting redistribution, recorded in `assets/LICENSES.md` with author, source URL, retrieval date, and any conditions. The first bundled theme uses KayKit Board Game Bits (CC0, Kay Lousberg).
- **Rationale:** Keeping assets out of the tarball keeps installs small and licensing auditable, and lets applications host, cache, or CDN their art as they choose. Requiring a calibrated table is what preserves architecture rule 5: a model may only present an outcome when we can prove which orientation shows which value, so presentation can never imply a face the core did not resolve. Per-shape granularity lets a partial pack (KayKit has no d10 or d12) coexist with procedural dice in the same roll.
- **Consequences:** Theme authors must calibrate any new model set; the maintainer tool at `examples/web-demo/calibrate.html` derives the tables and re-renders from the shipped table to verify them, and unit tests assert each table maps every value to a distinct upward direction. Applications must serve the asset directory themselves — documented in the renderer README. Asset-bearing themes cannot be installed with `npm install` alone; if that becomes a burden, a separate opt-in asset package would need its own ADR.
- **Alternatives considered:** Bundling models into `@diceforge-sdk/renderer-web` (bloats every install, entangles code and art licensing); auto-detecting face orientation at load time (unreliable — numerals live in textures, and a wrong guess would misreport an outcome); a texture-only theming system (cannot express real dice shapes); refusing to render shapes the pack lacks (worse than mixed presentation).

## ADR-0011: First-party dice generated by a committed Blender pipeline

- **Date:** 2026-07-26
- **Status:** Accepted
- **Decision:** The project authors its own die set — d4, d6, d8, d10, d12, d20 and a two-faced coin — with a committed, headless Blender script (`tools/blender/build_dice.py`) that outputs the die models plus a `face-rotations.json` manifest. The solids are built in Python from the same math as `packages/renderer-web/src/math/geometry.ts`; a "DiceForge Finish" geometry node group normalizes size; a Bevel modifier rounds edges. Face values are assigned so opposite faces sum to *N+1*, which makes the face-up rotation table exact by construction rather than measured. Generated models are MIT, like the rest of the repository, and live in `packages/assets-forge/forge/` (originally `assets/forge/`; moved by ADR-0013) to stay separate from third-party packs. Blender is a **maintainer-only** dependency: the generated artifacts are committed, so building or consuming the SDK never requires it.
- **Rationale:** The KayKit pack (ADR-0010) has no d10 or d12 and no coin, so a themed roll could never cover everything the core resolves. Owning the geometry also removes the manual calibration step that third-party models require — the single largest source of error in theming, since a wrong table silently misreports an outcome. Reusing the renderer's tested solid math means the models and the built-in procedural dice are the same shapes. A pure geometry-node graph was not possible: Blender 5.1 has no bevel node and no way to author arbitrary faces, so a dodecahedron and the d10's pentagonal trapezohedron cannot be built in nodes.
- **Consequences:** Contributors who want to change the geometry need Blender 5.1+; everyone else consumes the committed `.glb` files. The manifest's UV atlas and per-face `fit` values define the contract a texture generator must follow, which is the next step before a `forgeTheme()` can ship. Regenerating changes binary assets, so geometry changes should be deliberate and reviewed. If Blender later gains the missing nodes, the script can move further into the node group without changing any output contract.
- **Alternatives considered:** Commissioning or sourcing another third-party pack (same calibration risk, another license to track, still may not cover every shape); modelling by hand in the Blender GUI (not reproducible, not reviewable in a diff); generating meshes at runtime in the renderer instead of shipping models (that is what the procedural dice already do — the point here is higher-quality art); a pure geometry-node graph (impossible for d10/d12, as verified above).

## ADR-0012: 3D presentation requires a theme; procedural dice and the KayKit pack retired

- **Date:** 2026-07-26
- **Status:** Accepted (supersedes the fallback behaviour in ADR-0007 and ADR-0010)
- **Decision:** The WebGL backend no longer generates dice meshes at runtime, and the vendored KayKit pack is removed. 3D presentation now requires a theme whose models cover the roll. When there is no theme, a shape it does not cover, or an asset that fails to load, the presenter falls back to the DOM tile backend **for the whole event** rather than mixing art styles. `createDicePresenter({ container })` with no theme reports `mode: "dom"`. `kayKitTheme`, the KayKit rotation tables, and the procedural mesh, label-texture and face-triangulation code are deleted, along with `assets/*.gltf|bin|png` (about 1.1 MB).
- **Rationale:** The first-party set (ADR-0011) covers every shape the core resolves plus a coin, so the procedural dice were no longer a fallback for uncovered shapes — only a second, visibly poorer art style to maintain, and the source of a run of presentation bugs (inverted winding, mismatched sizes, labels off-face). KayKit was likewise superseded: it never covered the d10, d12 or coin, and keeping two packs meant two calibration stories and a third-party licence to track. Removing both deletes roughly 700 lines of renderer and test code whose only job was to look worse than the models.
- **Consequences:** A consumer who installs the package and passes no theme gets 2D tiles, not 3D. That is a real reduction in the out-of-the-box experience and follows directly from ADR-0010 keeping art out of the npm package: the two decisions should be revisited together if adoption friction shows up. Themes are now load-bearing rather than optional decoration, and a theme that covers only some shapes downgrades the whole roll to tiles. The DOM backend keeps a working zero-asset path, so no configuration is ever unable to show a result.
- **Alternatives considered:** Keeping the procedural dice as a no-asset 3D default (preserves the out-of-the-box experience, but means maintaining two art paths indefinitely and shipping a look the project is not happy with); keeping KayKit as a second theme (no coverage benefit now, ongoing licence and calibration cost); rendering uncovered shapes as untextured solids (a die with no numerals cannot show its resolved value, which architecture rule 5 forbids).

## ADR-0013: The first-party dice ship as an optional package

- **Date:** 2026-07-26
- **Status:** Accepted (amends ADR-0010; relaxes the consequence recorded in ADR-0012)
- **Decision:** The first-party die set is published as `@diceforge-sdk/assets-forge`, a separate, optional package that carries the `.glb` models, the texture atlases, and the generator's `face-rotations.json`. `packages/assets-forge/forge/` is now the canonical home of that art — the Blender pipeline writes there, and the repository's `assets/` directory keeps only the licensing record. The package has no dependencies and no renderer code: it exports `forgeAssets({ color })`, whose URLs come from literal `new URL("...", import.meta.url)` expressions so that Vite, webpack and Rollup emit the files and rewrite the paths. `forgeTheme()` in `@diceforge-sdk/renderer-web` accepts either those URLs (`{ urls, color }`) or a directory the application serves itself (`{ baseUrl, color }`); the two produce identical themes. The code packages still bundle no art, and the renderer does not depend on the asset package — it matches the URL shape structurally, and a test in the asset package fails if the two drift apart. The asset package joins the version-locked release train (ADR-0009).
- **Rationale:** ADR-0010 kept art out of the tarball and named the cost it accepted: "Asset-bearing themes cannot be installed with `npm install` alone; if that becomes a burden, a separate opt-in asset package would need its own ADR." ADR-0012 then made themes load-bearing — without one there is no 3D at all — which turned that cost into the first thing a new user hits: install both packages, then discover the dice must be copied out of a Git repository by hand. A separate package removes the copying without reintroducing what ADR-0010 was protecting: installs of `core` and `renderer-web` are unchanged, and art and code stay separately licensable and separately versioned. Per-file URLs rather than a base directory are what make it work under a bundler, which hashes and relocates each file; a single directory URL would resolve correctly in dev and silently break in a production build.
- **Consequences:** The default 3D path is now `npm install @diceforge-sdk/assets-forge` and `forgeTheme(forgeAssets({ color }))`; `baseUrl` remains fully supported for apps that serve their own copy, and is still the only option for a custom pack. A bundler emits every colour's atlas (~1.6 MB total) because the URL table is static — an application that needs less can import single files through the `./forge/*` subpath or serve the directory itself. Releases now publish three packages at one version, and the first publish of the new name has to come from a maintainer machine, since npm cannot attach a trusted publisher to a package that does not exist yet. Third-party art is unaffected: ADR-0010's licensing rules still govern anything not first-party, and nothing may be bundled into `core` or `renderer-web`.
- **Alternatives considered:** Leaving assets repository-only (keeps the install story broken for the common case, which is what ADR-0012 made worse); bundling the art into `@diceforge-sdk/renderer-web` (every consumer pays for art they may not use, and entangles code and art licensing — the option ADR-0010 rejected, and still rejected); hosting the set on a CDN and defaulting `baseUrl` to it (an offline-first SDK that silently phones out is a contradiction, ADR-0002); shipping a copy CLI instead of URL exports (adds a build step to every project and does not help bundler users); exporting one directory URL instead of per-file URLs (works in development, then breaks in production builds — the failure mode is a 404 at roll time, which is the worst possible moment).

## ADR template

```md
## ADR-XXXX: Short title

- **Date:** YYYY-MM-DD
- **Status:** Proposed | Accepted | Superseded
- **Decision:**
- **Rationale:**
- **Consequences:**
- **Alternatives considered:**
```
