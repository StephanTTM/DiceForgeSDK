# DiceForge for Unity

The DiceForge engine as plain C#: dice notation, seeded rolls, custom dice and
coin flips, resolved into the same records every other DiceForge platform
produces.

```csharp
using DiceForge;

var forge = DiceForgeEngine.Seeded("table-42");
RollResult roll = forge.Roll("2d20kh1+3");
Debug.Log($"{roll.Expression} = {roll.Total}");
```

The same seed produces the same rolls here as in the TypeScript core and the
Godot addon — **verified, not asserted**: the port is held to conformance
vectors exported from the core and passes all 57 checks bit for bit (ADR-0021).

## Status

Engine only, and not yet published as a UPM package. What works today is
everything headless: grammar v1.2 in full, custom dice, coin flips,
position-exact notation errors, and schema v2 records. Presentation — dice in a
scene, the forge models, themes — is future work, as is the package layout and
an end-to-end sample scene.

## Installing

Copy `Runtime/` into your project (anywhere under `Assets/`) and use the
`DiceForge` namespace. There is nothing to configure and no dependency to add:
the engine is pure C# with no `UnityEngine` types anywhere, which is the same
rule the core follows on every platform (ADR-0003).

That also means it compiles and runs outside Unity — which is how it is tested.

## Running the conformance suite

Needs the [.NET SDK](https://dotnet.microsoft.com/download); no Unity install
and no licence required, because nothing here references Unity.

```bash
cd adapters/unity/Tests/Conformance
dotnet run
```

Prints `CONFORMANCE PASS: 57 checks, 0 failures` and exits nonzero on any
mismatch, so CI can gate on it. The runner links the same `Runtime/*.cs` files
Unity compiles rather than copying them, so there is exactly one copy of the
port in the repository and no build artifact that can drift.

The gate is real, not decorative: changing one rotate constant in
`SeededRandom` fails every RNG vector, and reversing the keep/drop tie-break —
a one-character change, in the only place ties are decided — fails the single
record vector that contains a tie.

## What the port had to get exactly right

Written down because the next port will meet the same things.

- **`Math.imul` is a 32-bit multiply.** C# `uint` arithmetic wraps at 32 bits in
  an unchecked context, which is the same operation, so the seed hash is a
  direct transcription. The GDScript port could not do this — its integers are
  64-bit and overflow silently — and had to multiply in 16-bit halves.
- **`charCodeAt` walks UTF-16 code units, and so does C#.** A C# `string` is
  UTF-16 exactly like JavaScript's, so `text[i]` is the same code unit and
  astral characters split into surrogate pairs by themselves. GDScript strings
  are code points, so that port splits them by hand.
- **ASCII digits only.** `char.IsDigit` accepts fullwidth and other Unicode
  digits, which would make `４d６` legal here and illegal in the core. The
  parser tests `c >= '0' && c <= '9'`, and a vector pins it.
- **Keep/drop needs no stable sort.** The comparator is total — value, then roll
  order — which is precisely why the core was written that way. `List.Sort` is
  not stable and does not need to be.
- **Optional record fields are omitted, not null.** `ToJson` writes schema v2
  exactly, so a record serialized here is readable by every other platform.
