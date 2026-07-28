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

Copy `addons/diceforge/` into your project. The scripts reference each other by
`preload`, so they work without an editor import pass; the `class_name`
declarations additionally register `DiceForge` and friends globally once the
editor has imported the project.

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

First slice: settled poses for d4-d20 and the coin. Percentile pairs, custom
dice tiles, and rolling motion are future work; `present` returns `false` for
a record it cannot show, so a caller can fall back to text.

## Licence

MIT, as the rest of DiceForge.
