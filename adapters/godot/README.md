# DiceForge for Godot

The headless DiceForge engine as a Godot 4 addon, in GDScript. The same
contract as [`@diceforge-sdk/core`](../../packages/core/README.md): outcomes
resolve with no renderer or network in sight, and **a seeded engine produces
the same records as the TypeScript core, bit for bit** (ADR-0021).

```gdscript
const Forge := preload("res://addons/diceforge/dice_forge.gd")

var forge := Forge.seeded("table-42")
var record = forge.roll("2d20kh1+3")
if record.has("error"):
    print(record["error"]["message"])   # position-exact notation errors
else:
    print(record["total"])              # 22 -- here, in the browser, everywhere

forge.define_die("fate", [
    {"value": -1, "label": "-"}, {"value": -1, "label": "-"},
    {"value": 0, "label": " "}, {"value": 0, "label": " "},
    {"value": 1, "label": "+"}, {"value": 1, "label": "+"},
])
forge.roll("4d{fate}")
forge.flip_coin()
```

Records are Dictionaries shaped exactly like the core's schema v2 JSON --
`JSON.stringify(record)` is readable by every other DiceForge platform.
`Forge.system()` gives a non-reproducible engine.

## Install

The easiest path is the **bundle** — addon and dice in one download, so the
presenter needs no configuring at all. Grab it from the
[`godot-asset` branch](https://github.com/StephanTTM/DiceForgeSDK/tree/godot-asset)
(Code → Download ZIP) or build it yourself with `npm run godot:bundle`, unzip
into your project, and roll:

```gdscript
presenter.configure()   # no path: finds the bundled dice beside the scripts
```

Asset Library listing: pending submission — the bundle branch is exactly the
layout it will serve.

Working from this repository instead, copy the `addons/diceforge/` folder into
your project — **anywhere you like, but exactly once** — and pass
`configure()` the path to a forge asset directory.

- *Anywhere*: the scripts reference each other by script-relative `preload`,
  so the folder works at `res://addons/diceforge`, `res://vendor/dice`, or
  wherever your project keeps things. Keep the files together.
- *Exactly once*: the `class_name` declarations register `DiceForge` and
  friends globally, so a second copy collides — that is the
  `Class "DiceForge" hides a global script class` error. Move the folder,
  don't duplicate it; if you genuinely need to vendor a second embedded copy,
  delete the `class_name` lines from it (`tests/relocation.gd` does exactly
  this, and proves the scripts still work).

No editor import pass is needed, and no plugin has to be enabled. A
`plugin.cfg` ships anyway so DiceForge shows up in **Project Settings →
Plugins** the way addons usually do; enabling it changes nothing, because
there is nothing editor-side to install.

## Why a port, and why you can trust it

Godot does not run TypeScript, and a dice SDK should not ship a JavaScript
runtime to fix that. So the core is ported -- and held to **conformance
vectors** exported from the TypeScript core
([`packages/testing/vectors/core-vectors.json`](../../packages/testing/vectors/core-vectors.json)):
seeded RNG streams, normalized parses, error positions, and fully resolved
records, all compared bit for bit. The test host project in this directory
runs them; its main scene prints `CONFORMANCE PASS: 48 checks, 0 failures`
and exits nonzero on any mismatch. Run it from the repo with:

```bash
godot --path adapters/godot
```

Grammar v1.2 is supported in full: keep/drop, `d%`, exploding, rerolls, any
face count 2-1000, and custom dice.

## Presentation

`presenter_3d.gd` shows a resolved record with the forge models, loaded at
runtime from an `@diceforge-sdk/assets-forge` directory -- the same doctrine as
every DiceForge presenter (rule 5): the record is the authority, and each die
is posed by the calibrated rotation that brings its recorded value to the top,
from the same manifest that drives the web renderer.

```gdscript
var presenter := DiceForgePresenter3D.new()
add_child(presenter)
presenter.configure("path/to/assets-forge/forge", "red")
presenter.present(forge.roll("4d6dl1"))   # dropped dice darkened and shrunk
```

`face_up(sides, pose)` reports which face a pose shows, so a test can prove
the presentation matches the record rather than eyeballing it -- the demo scene
(`demo/dice_demo.tscn`) does exactly that, then saves viewport captures:

```bash
godot --path adapters/godot res://demo/dice_demo.tscn
```

Rolling motion ships as an **authored tumble** (the web renderer's ADR-0007
approach): dice drop in, bounce, and tumble freely, easing into exactly the
calibrated pose — the animation is designed to end on the recorded face, so
nothing is simulated and nothing is corrected. Dropped dice dim once the roll
has landed. Motion takes an optional seed so tests and screenshots reproduce:

```gdscript
await presenter.present_animated(record)        # rolls in, ~1s
presenter.present(record)                       # settled instantly (reduced motion)
```

Presenting again while a roll is still in flight — a reroll button, say —
simply supersedes it: the old animation stands down at its next frame and its
`present_animated` returns `false`, while the new roll takes the stage. No
guarding needed on the caller's side.

Two dials worth knowing. `presenter.scatter = true` strews the dice about the
stage with random headings instead of the tidy reading grid — resting spots
are sampled collision-free, a heading about the vertical cannot change which
face is up, and it applies to posed and animated presentations alike. (Flights
cross and jostle visually; true rigid-body contact between dice waits on the
engine exposing physics stepping.) And the throw's feel is tuned against real
gravity — honest gravity at die scale lands in ~90 ms, unreadably fast, so the
arc runs at roughly 4x slow motion of the real thing; the timing constants sit
at the top of `presenter_3d.gd` if your game wants it snappier or lazier.

Why not real physics? Measured, not assumed: Godot exposes no manual physics
stepping to scripts (`tests/capability.gd` asks the engine directly), so the
record-then-replay technique the web physics presenter uses (ADR-0018) cannot
be implemented in GDScript today. If the engine ever exposes stepping — or a
GDExtension supplies it — the symmetry-remap approach ports directly.

Still future: percentile pairs and custom dice tiles; `present` returns
`false` for a record it cannot show, so a caller can fall back to text.

The smallest complete setup is `demo/minimal.tscn`: a Node3D with the script
above, a Camera3D, and a DirectionalLight3D — three nodes, eight lines of
integration. Run it with:

```bash
godot --path adapters/godot res://demo/minimal.tscn
```

## Shipping a game with it

Two things to know before exporting. The presenter loads `.glb` and `.png`
files at runtime, so if you put the forge assets inside `res://`, add
`*.glb,*.png,*.json` to the export preset's non-resource filters — Godot's
normal import pipeline converts images and would otherwise strip the raw
files. And the assets themselves come from `@diceforge-sdk/assets-forge`;
without npm, copy the `forge/` directory out of this repository or the
published tarball. Bundling addon and assets into one Asset Library package
is planned.

## Licence

MIT, as the rest of DiceForge.
