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
face count 2-1000, and custom dice. Presentation -- 3D dice inside Godot -- is
future work; this addon is the engine only.

## Licence

MIT, as the rest of DiceForge.
