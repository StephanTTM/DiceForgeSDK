# @diceforge-sdk/testing

Conformance tests for DiceForge plugins — and, read top to bottom, the guide to writing one.

A presenter makes promises about itself: which events it accepts, which die sizes it can show, whether it cancels. This package checks those promises against your implementation, so you can prove your renderer honors the contract instead of hoping it does.

```bash
npm install --save-dev @diceforge-sdk/testing
```

Runner-agnostic: the checks return data. Assert on it with Vitest, Jest, `node:test`, or whatever you already use.

## Writing a presenter

A presenter turns an **already-resolved** event into something a person can perceive. Three rules matter more than the types:

1. **The record is the authority.** The engine decided the outcome before you were called. Show it; never change it, and never let the animation choose the face. A die's tumble should *end* at the resolved face by construction rather than be corrected into place.
2. **Failing to present is not failing to roll.** If you throw, or the user aborts, the roll still happened. Say so clearly and leave the record alone.
3. **Declare what you do.** Capabilities are a contract, not a hint. If you say you show a d12, a d12 must present.

The whole interface:

```ts
import type { InteractionPresenter } from "@diceforge-sdk/core";

export function createConsolePresenter(): InteractionPresenter {
  return {
    capabilities: {
      implementation: "example/console",
      kinds: ["roll", "coin-flip"],
      dieSides: [4, 6, 8, 10, 12, 20, 100],
      media: ["none"], // it prints; it does not draw
      cancellable: true,
      announces: false,
      honorsReducedMotion: false,
    },
    async present(event, options) {
      if (options?.signal?.aborted) {
        const error = new Error("presentation aborted");
        error.name = "AbortError";
        throw error;
      }
      console.log(event.kind === "roll" ? `${event.expression} = ${event.total}` : event.outcome);
    },
    dispose() {},
  };
}
```

`media: "none"` is a real answer — audio, haptics, and logging presenters are presenters. Applications read `media` to decide what to offer, not to decide whether you count.

## Running the checks

```ts
import { assertPresenterConformance } from "@diceforge-sdk/testing";

it("honors the presenter contract", async () => {
  await assertPresenterConformance(() => createConsolePresenter());
});
```

The factory is called **once per check** and disposed afterwards, so every check starts clean. Configure the presenter there exactly as an application would — including anything that makes it quick, such as reduced motion. The kit does not know your options and will not guess at them.

For a report instead of an exception:

```ts
import { checkPresenterConformance, formatConformanceReport } from "@diceforge-sdk/testing";

const report = await checkPresenterConformance(factory, { seed: "ci", timeoutMs: 30_000 });
console.log(formatConformanceReport(report));
expect(report.failures).toEqual([]);
```

Each check carries a stable `id`, a one-line `title`, a `status` of `"passed" | "failed" | "skipped"`, and a `detail` explaining a failure or why a check did not apply.

## What is checked

| Check | Asserts |
| --- | --- |
| `capabilities` | The record exists and its fields have the right types |
| `capabilities-kinds` | At least one kind, all of them known, no duplicates |
| `capabilities-die-sides` | At least one size, each a possible face count, no duplicates — or `"any"` |
| `capabilities-media` | At least one medium, all known, no duplicates |
| `presents-roll` / `presents-coin-flip` | Each declared kind actually presents |
| `presents-declared-die-sides` | Every declared size actually presents; `"any"` is sampled, unusual sizes included |
| `leaves-the-record-unchanged` | The event serializes identically after presenting |
| `cancels-when-declared` | An already-aborted presentation rejects (skipped unless `cancellable`) |
| `dispose-is-idempotent` | `dispose()` twice does not throw (skipped if not implemented) |

A presentation that never settles fails on a timeout rather than hanging the suite.

## What is not checked, and why

The kit checks the contract, not the craft. It cannot see your screen, so it cannot tell you:

- whether the die that landed is showing the face the record holds — the thing that matters most, and the reason a renderer needs its own tests (`@diceforge-sdk/renderer-web` uses a [visual regression suite](../../tools/vrt/README.md) for it);
- whether motion actually reduces when the platform asks;
- whether announcements are useful to someone using a screen reader.

Declaring `honorsReducedMotion: true` is checked for *type*, not for truth. Those claims are yours to keep and yours to test.

The kit also does not require a presenter to reject events it did not declare. Refusing is reasonable, and so is showing them anyway — a declaration is a floor, and a presenter that quietly copes with more is not breaking a promise.

## Compatibility

Released in lockstep with `@diceforge-sdk/core` at a matching version (ADR-0009), and takes core as a peer dependency so your version is the one under test. New checks may be added in a minor release before 1.0: a passing suite can start failing when you upgrade, which is the point — the contract is the same, the coverage is better.

## Licence

MIT.
