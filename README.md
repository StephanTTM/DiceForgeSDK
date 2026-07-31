# DiceForge for Godot

Deterministic dice for Godot 4 — the same seeds produce the same rolls here,
in the browser, and everywhere else DiceForge runs, verified bit-for-bit
against shared conformance vectors.

This bundle is the addon **and** the first-party dice in one install: unzip it
into your project (or install from the Asset Library) and roll.

```gdscript
const Forge := preload("res://addons/diceforge/dice_forge.gd")
const Presenter := preload("res://addons/diceforge/presenter_3d.gd")

func _ready() -> void:
    var forge := Forge.seeded("table-42")
    var presenter := Presenter.new()
    add_child(presenter)
    presenter.configure()                     # bundled dice, zero setup
    await presenter.present_animated(forge.roll("2d20kh1+3"))
```

Full notation support: `4d6dl1`, `2d20kh1+3`, `d%`, exploding `!`,
rerolls `r`/`ro`, any face count 2-1000, custom dice via `d{name}`, and
coin flips. Records are schema-versioned Dictionaries readable by every other
DiceForge platform.

Version 0.7.0. MIT licensed, art included (first-party, also MIT).
Source, conformance vectors and the rest of the SDK:
https://github.com/StephanTTM/DiceForgeSDK
